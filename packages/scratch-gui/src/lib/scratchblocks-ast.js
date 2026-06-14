import ja from 'scratchblocks/locales/ja.json';
import scratchblocks from 'scratchblocks';

const parser = scratchblocks && scratchblocks.parse ? scratchblocks : window.scratchblocks;
parser.loadLanguages({ja});

const inferredBlockIds = {
    readVariable: 'DATA_VARIABLE'
};

const visitBlock = (block, result) => {
    if (!block || !block.info) return;
    // ScratchBlocks intentionally gives variable reporters no command ID even
    // though `(variable)` is valid Scratch syntax. Infer the VM-compatible ID
    // from its stable official selector so completeness checks accept it.
    const id = block.info.id || inferredBlockIds[block.info.selector] || null;
    const isKnown = Boolean(id);
    if (isKnown) result.knownBlockIds.push(id);
    else result.unknownBlocks.push(block.stringify ? block.stringify() : id || 'unknown');

    (block.children || []).forEach(child => {
        if (child.isBlock) visitBlock(child, result);
        if (child.isScript) {
            (child.blocks || []).forEach(scriptBlock => visitBlock(scriptBlock, result));
        }
    });
};

const analyzeScratchBlocks = code => {
    const result = {
        knownBlockIds: [],
        unknownBlocks: [],
        scriptCount: 0
    };
    const document = parser.parse(code, {languages: ['ja', 'en']});
    result.scriptCount = document.scripts.filter(script => !script.isEmpty).length;
    document.scripts.forEach(script => {
        (script.blocks || []).forEach(block => visitBlock(block, result));
    });
    return result;
};

export default analyzeScratchBlocks;
