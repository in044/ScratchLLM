import ScratchTextCompiler from '../../../src/lib/scratch-text-compiler';

const getBlocksByOpcode = (project, opcode) => Object.values(project.targets[0].blocks)
    .filter(block => block.opcode === opcode);

test('extracts ScratchBlocks code fences and ignores explanation', () => {
    const response = [
        'このプログラムに変えます。',
        '```scratch',
        '⚑ が押されたとき',
        '(10) 歩動かす',
        '```'
    ].join('\n');

    expect(ScratchTextCompiler.extractScratchBlocks(response)).toBe([
        '⚑ が押されたとき',
        '(10) 歩動かす'
    ].join('\n'));
});

test('compiles nested ScratchBlocks into Scratch 3 project JSON', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        'ずっと',
        '  (10) 歩動かす',
        '  もし <マウスが押された> なら',
        '    [押したよ] と (1) 秒言う',
        '  end',
        'end'
    ].join('\n'));

    const hats = getBlocksByOpcode(project, 'event_whenflagclicked');
    const foreverBlocks = getBlocksByOpcode(project, 'control_forever');
    const conditions = getBlocksByOpcode(project, 'control_if');
    const mouseReporters = getBlocksByOpcode(project, 'sensing_mousedown');

    expect(hats).toHaveLength(1);
    expect(foreverBlocks).toHaveLength(1);
    expect(conditions).toHaveLength(1);
    expect(mouseReporters).toHaveLength(1);
    const mouseReporterId = Object.keys(project.targets[0].blocks)
        .find(id => project.targets[0].blocks[id] === mouseReporters[0]);
    const conditionId = Object.keys(project.targets[0].blocks)
        .find(id => project.targets[0].blocks[id] === conditions[0]);
    expect(conditions[0].inputs.CONDITION[1]).toBe(mouseReporterId);
    expect(mouseReporters[0].parent).toBe(conditionId);
});

test('compiles comparison and nested logical conditions as Boolean blocks', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        'もし <<(10) > (5)> かつ <マウスが押された>> なら',
        '[true] と言う',
        'end'
    ].join('\n'));
    const blocks = project.targets[0].blocks;
    const condition = getBlocksByOpcode(project, 'control_if')[0];
    const andBlock = getBlocksByOpcode(project, 'operator_and')[0];
    const greaterThanBlock = getBlocksByOpcode(project, 'operator_gt')[0];
    const mouseBlock = getBlocksByOpcode(project, 'sensing_mousedown')[0];
    const andId = Object.keys(blocks).find(id => blocks[id] === andBlock);

    expect(condition.inputs.CONDITION).toEqual([2, andId]);
    expect(andBlock.parent).toBe(Object.keys(blocks).find(id => blocks[id] === condition));
    expect(greaterThanBlock.parent).toBe(andId);
    expect(mouseBlock.parent).toBe(andId);
});

test('repairs extra round brackets around comparison expressions', () => {
    const project = ScratchTextCompiler.compile([
        'もし <((x座標) > (240))> なら',
        '[端です] と言う',
        'end'
    ].join('\n'));
    const greaterThan = getBlocksByOpcode(project, 'operator_gt')[0];
    const leftId = greaterThan.inputs.OPERAND1[1];

    expect(project.targets[0].blocks[leftId].opcode).toBe('motion_xposition');
    expect(greaterThan.inputs.OPERAND2).toEqual([1, [4, '240']]);
    expect(getBlocksByOpcode(project, 'data_variable')).toHaveLength(0);
    expect(project.targets[0].variables).toEqual({});
});

test('compiles variables and arithmetic reporters inside value inputs', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        '[重力 v] を (-1) にする',
        '[ジャンプ力 v] を (0) にする',
        'ずっと',
        'もし <(y座標) = (-120)> なら',
        '[ジャンプ力 v] を (15) にする',
        'end',
        'y座標を (ジャンプ力 + 0) ずつ変える',
        '[ジャンプ力 v] を (ジャンプ力 + 重力) にする',
        'end'
    ].join('\n'));
    const opcodes = Object.values(project.targets[0].blocks).map(block => block.opcode);
    const changeY = getBlocksByOpcode(project, 'motion_changeyby')[0];
    const addBlocks = getBlocksByOpcode(project, 'operator_add');

    expect(opcodes).toContain('motion_yposition');
    expect(opcodes.filter(opcode => opcode === 'data_variable')).toHaveLength(3);
    expect(addBlocks).toHaveLength(2);
    expect(typeof changeY.inputs.DY[1]).toBe('string');
    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain(
        'y座標を ((ジャンプ力) + (0)) ずつ変える'
    );
});

test('removes the current variable from an incorrectly compounded change-by value', () => {
    const project = ScratchTextCompiler.compile([
        '[重力 v] を (-1) にする',
        '[ジャンプ力 v] を (0) にする',
        '[ジャンプ力 v] を ((ジャンプ力) + (重力)) ずつ変える'
    ].join('\n'));
    const change = getBlocksByOpcode(project, 'data_changevariableby')[0];
    const valueId = change.inputs.VALUE[1];
    const valueBlock = project.targets[0].blocks[valueId];

    expect(valueBlock.opcode).toBe('data_variable');
    expect(valueBlock.fields.VARIABLE[0]).toBe('重力');
    expect(getBlocksByOpcode(project, 'operator_add')).toHaveLength(0);
});

test('replaces malformed Boolean input with a valid false Boolean block', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        'もし 条件 なら',
        '[実行] と言う',
        'end'
    ].join('\n'));
    const condition = getBlocksByOpcode(project, 'control_if')[0];
    const fallback = getBlocksByOpcode(project, 'operator_equals')[0];
    const fallbackId = Object.keys(project.targets[0].blocks)
        .find(id => project.targets[0].blocks[id] === fallback);

    expect(condition.inputs.CONDITION).toEqual([2, fallbackId]);
    expect(fallback.inputs.OPERAND1).toEqual([1, [10, '1']]);
    expect(fallback.inputs.OPERAND2).toEqual([1, [10, '0']]);
});

test('ignores unknown prose lines while keeping supported blocks', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        'これは説明文です',
        '(10) 歩動かす'
    ].join('\n'));

    expect(getBlocksByOpcode(project, 'event_whenflagclicked')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'motion_movesteps')).toHaveLength(1);
});

test('normalizes common ScratchBlocks formatting mistakes', () => {
    const project = ScratchTextCompiler.compile([
        '- ⚑ が押されたとき',
        '* ずっと；',
        '  - （10） 歩動かす',
        '終了'
    ].join('\n'));

    expect(getBlocksByOpcode(project, 'event_whenflagclicked')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'control_forever')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'motion_movesteps')).toHaveLength(1);
});

test('keeps multiple hat scripts as separate top-level stacks', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        '(10) 歩動かす',
        'このスプライトが押されたとき',
        '[クリックされたよ] と言う'
    ].join('\n'));
    const blocks = Object.values(project.targets[0].blocks);
    const hats = blocks.filter(block => block.topLevel);

    expect(hats).toHaveLength(2);
    expect(hats.map(block => block.opcode)).toEqual([
        'event_whenflagclicked',
        'event_whenthisspriteclicked'
    ]);
});

test('merges compiled blocks into the current target without replacing assets', () => {
    const baseProject = {
        targets: [
            {
                id: 'stage-id',
                isStage: true,
                name: 'Stage',
                blocks: {},
                variables: {},
                costumes: [{name: 'backdrop1'}],
                sounds: []
            },
            {
                id: 'sprite-id',
                isStage: false,
                name: 'Sprite1',
                blocks: {},
                variables: {},
                costumes: [{name: 'costume1'}],
                sounds: [{name: 'Meow'}]
            }
        ]
    };

    const project = ScratchTextCompiler.compile('⚑ が押されたとき\n(10) 歩動かす', baseProject, 'sprite-id');
    const sprite = project.targets[1];

    expect(sprite.costumes).toEqual([{name: 'costume1'}]);
    expect(sprite.sounds).toEqual([{name: 'Meow'}]);
    expect(Object.values(sprite.blocks).map(block => block.opcode)).toContain('motion_movesteps');
});

test('converts project JSON back to ScratchBlocks notation', () => {
    const project = ScratchTextCompiler.compile('⚑ が押されたとき\n(10) 歩動かす');

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain([
        '⚑ が押されたとき',
        '(10) 歩動かす'
    ].join('\n'));
});

test('converts only the requested target to ScratchBlocks notation', () => {
    const project = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n(10) 歩動かす'), id: 'first', name: 'First'},
            {...ScratchTextCompiler.compileTarget('このスプライトが押されたとき\n[Second] と言う'), id: 'second', name: 'Second'}
        ]
    };

    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project, 'second');

    expect(scratchBlocks).toContain('# Second');
    expect(scratchBlocks).toContain('[Second] と言う');
    expect(scratchBlocks).not.toContain('# First');
});

test('compiles target sections back into every sprite and stage without indentation', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[old stage] と言う'), isStage: true, name: 'Stage'},
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[old sprite] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };
    const text = [
        '# Stage',
        '# ブロックなし',
        '',
        '# Sprite1',
        '⚑ が押されたとき',
        'ずっと',
        '(10) 歩動かす',
        'end'
    ].join('\n');

    const project = ScratchTextCompiler.compile(text, baseProject);
    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project);

    expect(Object.keys(project.targets[0].blocks)).toHaveLength(0);
    expect(scratchBlocks).toContain([
        'ずっと',
        '(10) 歩動かす',
        'end'
    ].join('\n'));
    expect(scratchBlocks).not.toContain('  (10) 歩動かす');
});

test('preserves omitted targets and uses the last duplicate target section', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき'), isStage: true, name: 'Stage'},
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき'), isStage: false, name: 'Sprite1'}
        ]
    };

    const omitted = ScratchTextCompiler.compile('#Stage:\n# ブロックなし', baseProject);
    expect(Object.values(omitted.targets[1].blocks).map(block => block.opcode))
        .toContain('event_whenflagclicked');

    const duplicated = ScratchTextCompiler.compile([
        '# Stage',
        '# ブロックなし',
        '# Sprite1',
        '[first] と言う',
        '## Sprite1:',
        '[last] と言う'
    ].join('\n'), baseProject);
    expect(ScratchTextCompiler.projectToScratchBlocks(duplicated)).toContain('[last] と言う');
    expect(ScratchTextCompiler.projectToScratchBlocks(duplicated)).not.toContain('[first] と言う');
});

test('removes malformed variables previously generated from loose comparison brackets', () => {
    const baseProject = {
        targets: [{
            ...ScratchTextCompiler.compileTarget('⚑ が押されたとき'),
            isStage: false,
            name: 'Sprite1',
            variables: {
                'var_(x座標': ['(x座標', 0],
                'var_240)': ['240)', 0],
                userVariableId: ['user variable', 0]
            }
        }]
    };

    const project = ScratchTextCompiler.compile('# Sprite1\n⚑ が押されたとき', baseProject);

    expect(project.targets[0].variables).toEqual({userVariableId: ['user variable', 0]});
});

test('preserves existing target code when a section has only unsupported syntax', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: true, name: 'Stage'}
        ]
    };

    const project = ScratchTextCompiler.compile('# Stage\n未対応だが正しいかもしれないブロック', baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
});

test('preserves existing target code when its target section is empty', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };

    const project = ScratchTextCompiler.compile('# Sprite1\n', baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
});

test('clears existing target code only with an explicit empty marker', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[remove] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };

    const project = ScratchTextCompiler.compile('# Sprite1\n# ブロックなし', baseProject);

    expect(Object.keys(project.targets[0].blocks)).toHaveLength(0);
});

test('preserves the current target when a response has no supported blocks', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };

    const project = ScratchTextCompiler.compile('未対応だが正しいかもしれないブロック', baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
});
