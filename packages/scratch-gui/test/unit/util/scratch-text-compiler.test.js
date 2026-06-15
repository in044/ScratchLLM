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

test('extracts only the final project while ignoring explanatory Scratch snippets', () => {
    const response = [
        'この部分で値を設定します。',
        '```scratch',
        '[値 v] を (0) にする',
        '```',
        '完成したプログラムです。',
        '```scratch-project',
        '# Stage',
        '# ブロックなし',
        '',
        '# Sprite1',
        '⚑ が押されたとき',
        '[値 v] を (0) にする',
        '```'
    ].join('\n');

    expect(ScratchTextCompiler.extractScratchBlocks(response)).toBe([
        '# Stage',
        '# ブロックなし',
        '',
        '# Sprite1',
        '⚑ が押されたとき',
        '[値 v] を (0) にする'
    ].join('\n'));
});

test('uses the last legacy Scratch fence instead of joining explanatory snippets', () => {
    const response = [
        '```scratch',
        '[説明用 v] を (1) にする',
        '```',
        '```scratch',
        '# Sprite1',
        '⚑ が押されたとき',
        '```'
    ].join('\n');

    expect(ScratchTextCompiler.extractScratchBlocks(response)).toBe([
        '# Sprite1',
        '⚑ が押されたとき'
    ].join('\n'));
});

test('extracts an unfenced target program as a tolerant fallback', () => {
    const response = '変更しました。\n# Stage\n⚑ が押されたとき\n背景を (背景1 v) にする';

    expect(ScratchTextCompiler.extractScratchBlocks(response)).toBe(
        '# Stage\n⚑ が押されたとき\n背景を (背景1 v) にする'
    );
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
    expect(opcodes.filter(opcode => opcode === 'data_variable')).toHaveLength(2);
    expect(addBlocks).toHaveLength(1);
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

test('normalizes self-add assignment into change-variable-by', () => {
    const project = ScratchTextCompiler.compile(
        '[ジャンプ力 v] を ((ジャンプ力) + (重力)) にする'
    );
    const change = getBlocksByOpcode(project, 'data_changevariableby')[0];
    const value = project.targets[0].blocks[change.inputs.VALUE[1]];

    expect(getBlocksByOpcode(project, 'data_setvariableto')).toHaveLength(0);
    expect(value.opcode).toBe('data_variable');
    expect(value.fields.VARIABLE[0]).toBe('重力');
    expect(ScratchTextCompiler.projectToScratchBlocks(project))
        .toContain('[ジャンプ力 v] を (重力) ずつ変える');
});

test('normalizes self-subtract assignment into negative change-variable-by', () => {
    const project = ScratchTextCompiler.compile(
        '[残り時間 v] を ((残り時間) - (経過時間)) にする'
    );
    const change = getBlocksByOpcode(project, 'data_changevariableby')[0];
    const value = project.targets[0].blocks[change.inputs.VALUE[1]];

    expect(value.opcode).toBe('operator_subtract');
    expect(ScratchTextCompiler.projectToScratchBlocks(project))
        .toContain('[残り時間 v] を ((0) - (経過時間)) ずつ変える');
});

test('normalizes x and y self-updates into coordinate change blocks', () => {
    const project = ScratchTextCompiler.compile([
        'x座標を ((x座標) + (x速度)) にする',
        'y座標を ((y座標) - (落下量)) にする'
    ].join('\n'));
    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project);

    expect(getBlocksByOpcode(project, 'motion_setx')).toHaveLength(0);
    expect(getBlocksByOpcode(project, 'motion_sety')).toHaveLength(0);
    expect(getBlocksByOpcode(project, 'motion_changexby')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'motion_changeyby')).toHaveLength(1);
    expect(scratchBlocks).toContain('x座標を (x速度) ずつ変える');
    expect(scratchBlocks).toContain('y座標を ((0) - (落下量)) ずつ変える');
});

test('applies target sections after normalizing coordinate self-updates', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき'), isStage: false, name: 'Sprite1'}
        ]
    };
    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        'x座標を ((x座標) + (x速度)) にする',
        'y座標を ((y座標) - (落下量)) にする'
    ].join('\n'), baseProject);

    expect(getBlocksByOpcode(project, 'motion_changexby')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'motion_changeyby')).toHaveLength(1);
    expect(ScratchTextCompiler.getDiagnostics()).toEqual([]);
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

test('repairs a close ScratchBlocks phrase using edit distance while preserving inputs', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };
    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        'x座標を (0) にし、y座標を (-120) にする'
    ].join('\n'), baseProject);
    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project);

    expect(getBlocksByOpcode(project, 'motion_gotoxy')).toHaveLength(1);
    expect(scratchBlocks).toContain('x座標を (0)、y座標を (-120) にする');
    expect(scratchBlocks).not.toContain('[keep] と言う');
    expect(ScratchTextCompiler.getDiagnostics()).toEqual([]);
});

test('can disable edit-distance repair before an external syntax repair attempt', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };
    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        'x座標を (0) にし、y座標を (-120) にする'
    ].join('\n'), baseProject, null, {useFuzzyRepair: false});

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
    expect(ScratchTextCompiler.getDiagnostics().join('\n'))
        .toContain('x座標を (0) にし、y座標を (-120) にする');
});

test('does not repair an ambiguous phrase to the nearest semantic block', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };
    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        'x座標を (10) 変える'
    ].join('\n'), baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
    expect(ScratchTextCompiler.getDiagnostics().join('\n')).toContain('x座標を (10) 変える');
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

test('applies an if-else target section after official AST completeness checking', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[old] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };
    const text = [
        '# Sprite1',
        '⚑ が押されたとき',
        'もし <マウスが押された> なら',
        '[yes] と言う',
        'でなければ',
        '[no] と言う',
        'end'
    ].join('\n');

    const project = ScratchTextCompiler.compile(text, baseProject);
    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project);

    expect(getBlocksByOpcode(project, 'control_if_else')).toHaveLength(1);
    expect(scratchBlocks).toContain('でなければ');
    expect(scratchBlocks).not.toContain('[old] と言う');
});

test('applies a target section containing nested variable reporters', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[old] と言う'), isStage: false, name: 'スプライト1'}
        ]
    };
    const text = [
        '# スプライト1',
        '⚑ が押されたとき',
        '[重力 v] を (-1) にする',
        '[yの速さ v] を (0) にする',
        'ずっと',
        '[yの速さ v] を ((yの速さ) + (重力)) にする',
        'y座標を (yの速さ) ずつ変える',
        'end'
    ].join('\n');

    const project = ScratchTextCompiler.compile(text, baseProject);
    const scratchBlocks = ScratchTextCompiler.projectToScratchBlocks(project);

    expect(scratchBlocks).toContain('[yの速さ v] を (重力) ずつ変える');
    expect(scratchBlocks).not.toContain('[old] と言う');
    expect(ScratchTextCompiler.getDiagnostics()).toEqual([]);
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

test('accepts an empty section when the target already has no program', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget(''), isStage: true, name: 'Stage'},
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき'), isStage: false, name: 'スプライト1'}
        ]
    };

    const project = ScratchTextCompiler.compile([
        '# Stage',
        '',
        '# スプライト1',
        '⚑ が押されたとき',
        '(10) 歩動かす'
    ].join('\n'), baseProject);

    expect(Object.keys(project.targets[0].blocks)).toHaveLength(0);
    expect(ScratchTextCompiler.getDiagnostics()).toEqual([]);
});

test('does not clear a nonempty target when its section is accidentally empty', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: true, name: 'Stage'}
        ]
    };

    const project = ScratchTextCompiler.compile('# Stage\n', baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
    expect(ScratchTextCompiler.getDiagnostics().join('\n')).toContain('変更しませんでした');
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

test('does not partially replace a target containing both valid and unknown syntax', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };

    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        '(10) 歩動かす',
        'これは未知のブロック'
    ].join('\n'), baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('[keep] と言う');
    expect(ScratchTextCompiler.projectToScratchBlocks(project)).not.toContain('(10) 歩動かす');
    expect(ScratchTextCompiler.getDiagnostics().join('\n')).toContain('これは未知のブロック');
});

test('compiles timer reset instead of preserving the old target', () => {
    const baseProject = {
        targets: [
            {...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[keep] と言う'), isStage: false, name: 'Sprite1'}
        ]
    };

    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '⚑ が押されたとき',
        'タイマーをリセット'
    ].join('\n'), baseProject);

    expect(ScratchTextCompiler.projectToScratchBlocks(project)).toContain('タイマーをリセット');
    expect(ScratchTextCompiler.projectToScratchBlocks(project)).not.toContain('[keep] と言う');
});

test('round-trips representative blocks from every core category', () => {
    const source = [
        '⚑ が押されたとき',
        '(1) 秒で (どこかの場所 v) へ行く',
        'コスチュームを (costume1 v) にする',
        '[ピッチ v] の効果を (10) ずつ変える',
        'タイマーをリセット',
        '((1) から (10) までの乱数) 歩動かす',
        '[thing] を [my list v] に追加する',
        'もし <[my list v] に [thing] が含まれる> なら',
        '背景を (背景1 v) にして待つ',
        'end'
    ].join('\n');

    const first = ScratchTextCompiler.compile(source);
    const serialized = ScratchTextCompiler.projectToScratchBlocks(first);
    expect(serialized).toContain('<[my list v] に');
    const second = ScratchTextCompiler.compile(serialized);
    const opcodes = Object.values(second.targets[0].blocks).map(block => block.opcode);

    expect(opcodes).toEqual(expect.arrayContaining([
        'motion_glideto',
        'looks_switchcostumeto',
        'sound_changeeffectby',
        'sensing_resettimer',
        'operator_random',
        'data_addtolist',
        'data_listcontainsitem',
        'looks_switchbackdroptoandwait'
    ]));
    expect(second.targets[0].lists['list_my list']).toEqual(['my list', []]);
});

test('compiles list contains as a Boolean reporter', () => {
    const project = ScratchTextCompiler.compile('もし <[my list v] に [thing] が含まれる> なら\nend');

    expect(getBlocksByOpcode(project, 'data_listcontainsitem')).toHaveLength(1);
    expect(getBlocksByOpcode(project, 'operator_equals')).toHaveLength(0);
});

test('preserves target assets and target properties when compiling all target sections', () => {
    const baseProject = {
        targets: [{
            ...ScratchTextCompiler.compileTarget('⚑ が押されたとき\n[old] と言う'),
            id: 'sprite-id',
            name: 'Sprite1',
            isStage: false,
            x: 42,
            y: -18,
            visible: false,
            costumes: [{name: 'costume1'}],
            sounds: [{name: 'Meow'}]
        }],
        monitors: [{id: 'monitor'}],
        extensions: ['pen'],
        meta: {semver: '3.0.0'}
    };

    const project = ScratchTextCompiler.compile('# Sprite1\n⚑ が押されたとき\n(10) 歩動かす', baseProject);

    expect(project.targets[0]).toMatchObject({
        id: 'sprite-id',
        x: 42,
        y: -18,
        visible: false,
        costumes: [{name: 'costume1'}],
        sounds: [{name: 'Meow'}]
    });
    expect(project.monitors).toEqual([{id: 'monitor'}]);
    expect(project.extensions).toEqual(['pen']);
});

test('reuses existing variable and list IDs by name', () => {
    const baseTarget = ScratchTextCompiler.compileTarget('⚑ が押されたとき');
    baseTarget.id = 'sprite-id';
    baseTarget.name = 'Sprite1';
    baseTarget.variables = {existingVariable: ['score', 5]};
    baseTarget.lists = {existingList: ['items', ['old']]};

    const project = ScratchTextCompiler.compile([
        '# Sprite1',
        '[score v] を (10) にする',
        '[new] を [items v] に追加する'
    ].join('\n'), {targets: [baseTarget]});
    const blocks = Object.values(project.targets[0].blocks);

    expect(project.targets[0].variables).toEqual({existingVariable: ['score', 5]});
    expect(project.targets[0].lists).toEqual({existingList: ['items', ['old']]});
    expect(blocks.find(block => block.opcode === 'data_setvariableto').fields.VARIABLE[1])
        .toBe('existingVariable');
    expect(blocks.find(block => block.opcode === 'data_addtolist').fields.LIST[1])
        .toBe('existingList');
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
    expect(ScratchTextCompiler.getDiagnostics().join('\n')).toContain('変更しませんでした');
});
