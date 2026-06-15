/* eslint-disable max-len */
const booleanOpcodes = new Set([
    'operator_and',
    'operator_or',
    'operator_not',
    'operator_gt',
    'operator_lt',
    'operator_equals',
    'operator_contains',
    'sensing_touchingobject',
    'sensing_touchingcolor',
    'sensing_coloristouchingcolor',
    'sensing_keypressed',
    'sensing_mousedown',
    'sensing_loud',
    'data_listcontainsitem',
    'argument_reporter_boolean'
]);

const booleanInputs = {
    control_if: ['CONDITION'],
    control_if_else: ['CONDITION'],
    control_wait_until: ['CONDITION'],
    control_repeat_until: ['CONDITION'],
    operator_and: ['OPERAND1', 'OPERAND2'],
    operator_or: ['OPERAND1', 'OPERAND2'],
    operator_not: ['OPERAND']
};

const childIdFromInput = input => (
    Array.isArray(input) && typeof input[1] === 'string' ? input[1] : null
);

const blockIdsFromInput = input => (
    Array.isArray(input) ? input.slice(1).filter(value => typeof value === 'string') : []
);

const validateTarget = target => {
    const errors = [];
    const blocks = target.blocks || {};
    const targetName = target.isStage ? 'Stage' : target.name || target.id || 'unknown target';

    Object.keys(blocks).forEach(id => {
        const block = blocks[id];
        if (!block || Array.isArray(block)) return;

        if (block.next && !blocks[block.next]) {
            errors.push(`${targetName}: ${id} の next が存在しません: ${block.next}`);
        }
        if (block.next && blocks[block.next] && blocks[block.next].parent !== id) {
            errors.push(`${targetName}: nextブロック ${block.next} の parent が ${id} ではありません。`);
        }
        if (block.parent && !blocks[block.parent]) {
            errors.push(`${targetName}: ${id} の parent が存在しません: ${block.parent}`);
        }
        if (block.topLevel && block.parent) {
            errors.push(`${targetName}: トップレベルブロック ${id} に parent があります。`);
        }

        Object.keys(block.inputs || {}).forEach(inputName => {
            blockIdsFromInput(block.inputs[inputName]).forEach(childId => {
                const child = blocks[childId];
                if (!child) {
                    errors.push(`${targetName}: ${block.opcode}.${inputName} の子ブロックが存在しません: ${childId}`);
                    return;
                }
                if (!Array.isArray(child) && child.parent !== id) {
                    errors.push(`${targetName}: ${childId} の parent が ${id} ではありません。`);
                }
            });
        });

        (booleanInputs[block.opcode] || []).forEach(inputName => {
            const input = block.inputs && block.inputs[inputName];
            const childId = childIdFromInput(input);
            const child = childId && blocks[childId];
            if (!child || Array.isArray(child) || !booleanOpcodes.has(child.opcode)) {
                errors.push(`${targetName}: ${block.opcode}.${inputName} にはBooleanブロックが必要です。`);
            }
        });
    });

    return errors;
};

const validateProject = projectJson => {
    let project;
    try {
        project = typeof projectJson === 'string' ? JSON.parse(projectJson) : projectJson;
    } catch (error) {
        return {valid: false, errors: [`プロジェクトJSONを解析できません: ${error.message}`]};
    }

    if (!project || !Array.isArray(project.targets)) {
        return {valid: false, errors: ['プロジェクトにtargets配列がありません。']};
    }

    const errors = project.targets.reduce((allErrors, target) => (
        allErrors.concat(validateTarget(target))
    ), []);
    return {valid: errors.length === 0, errors};
};

export default validateProject;
