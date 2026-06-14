import analyzeScratchBlocks from '../../../src/lib/scratchblocks-ast';

test('recognizes Japanese ScratchBlocks with nested reporters and C blocks', () => {
    const analysis = analyzeScratchBlocks([
        '⚑ が押されたとき',
        'もし <(x座標) > (240)> なら',
        '[ok] と言う',
        'end'
    ].join('\n'));

    expect(analysis.knownBlockIds).toEqual(expect.arrayContaining([
        'EVENT_WHENFLAGCLICKED',
        'CONTROL_IF',
        'OPERATORS_GT',
        'SENSING_OF_XPOSITION',
        'LOOKS_SAY'
    ]));
    expect(analysis.scriptCount).toBe(1);
});

test('recognizes variable and list blocks without treating them as unknown prose', () => {
    const analysis = analyzeScratchBlocks([
        '[score v] を ((score) + (1)) にする',
        '[thing] を [items v] に追加する',
        'もし <[items v] に [thing] が含まれる> なら',
        'end'
    ].join('\n'));

    expect(analysis.unknownBlocks).toEqual([]);
    expect(analysis.knownBlockIds).toEqual(expect.arrayContaining([
        'DATA_SETVARIABLETO',
        'DATA_ADDTOLIST',
        'DATA_LISTCONTAINSITEM',
        'DATA_VARIABLE'
    ]));
});

test('recognizes nested variable reporters as official variable blocks', () => {
    const analysis = analyzeScratchBlocks(
        '[yの速さ v] を ((yの速さ) + (重力)) にする'
    );

    expect(analysis.unknownBlocks).toEqual([]);
    expect(analysis.knownBlockIds.filter(id => id === 'DATA_VARIABLE')).toHaveLength(2);
});
