import validateScratchProject from '../../../src/lib/scratch-project-validator';
import ScratchTextCompiler from '../../../src/lib/scratch-text-compiler';

test('accepts a structurally valid compiled project', () => {
    const project = ScratchTextCompiler.compile([
        '⚑ が押されたとき',
        'もし <マウスが押された> なら',
        '[ok] と言う',
        'end'
    ].join('\n'));

    expect(validateScratchProject(project)).toEqual({valid: true, errors: []});
});

test('rejects a String primitive connected to a Boolean input', () => {
    const project = ScratchTextCompiler.compile('もし <マウスが押された> なら\nend');
    const condition = Object.values(project.targets[0].blocks)
        .find(block => block.opcode === 'control_if');
    condition.inputs.CONDITION = [2, [10, 'not boolean']];

    const result = validateScratchProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('control_if.CONDITION にはBooleanブロックが必要です');
});

test('rejects missing child references and invalid parent links', () => {
    const project = ScratchTextCompiler.compile('⚑ が押されたとき\n(10) 歩動かす');
    const move = Object.values(project.targets[0].blocks)
        .find(block => block.opcode === 'motion_movesteps');
    move.inputs.STEPS = [2, 'missing-child'];

    const result = validateScratchProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('子ブロックが存在しません');
});

test('accepts project JSON strings', () => {
    const project = ScratchTextCompiler.compile('⚑ が押されたとき');

    expect(validateScratchProject(JSON.stringify(project)).valid).toBe(true);
});

test('rejects missing shadow references and broken next parent links', () => {
    const project = ScratchTextCompiler.compile('⚑ が押されたとき\n(どこかの場所 v) へ行く\n(10) 歩動かす');
    const blocks = project.targets[0].blocks;
    const goTo = Object.values(blocks).find(block => block.opcode === 'motion_goto');
    const move = Object.values(blocks).find(block => block.opcode === 'motion_movesteps');
    goTo.inputs.TO = [3, goTo.inputs.TO[1], 'missing-shadow'];
    move.parent = null;

    const result = validateScratchProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('missing-shadow');
    expect(result.errors.join('\n')).toContain('nextブロック');
});
