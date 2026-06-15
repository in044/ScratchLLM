import {
    addLibrarySprite,
    buildProjectAssetSummary,
    buildSpriteCatalog,
    findLibrarySprite
} from '../../../src/lib/automatic-sprite-selection';

test('builds a compact sprite catalog without asset data', () => {
    const catalog = buildSpriteCatalog();

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toEqual({
        name: expect.any(String),
        tags: expect.any(Array)
    });
    expect(catalog[0].costumes).toBeUndefined();
});

test('finds and adds an exact library sprite name', async () => {
    const sprite = findLibrarySprite('Cat');
    const vm = {
        addSprite: jest.fn(() => Promise.resolve()),
        editingTarget: {getName: () => 'Cat2'}
    };

    expect(sprite.name).toBe('Cat');
    await expect(addLibrarySprite(vm, 'Cat')).resolves.toBe('Cat2');
    expect(JSON.parse(vm.addSprite.mock.calls[0][0]).name).toBe('Cat');
});

test('summarizes only project asset names for the main LLM', () => {
    const summary = buildProjectAssetSummary({
        targets: [{
            name: 'Cat',
            isStage: false,
            costumes: [{name: 'cat-a', assetId: 'secret'}],
            sounds: [{name: 'Meow', assetId: 'secret'}]
        }]
    });

    expect(summary).toEqual({
        targets: [{
            name: 'Cat',
            costumes: ['cat-a'],
            sounds: ['Meow']
        }]
    });
});

test('does not add a sprite outside the library', async () => {
    const vm = {addSprite: jest.fn(() => Promise.resolve())};

    await expect(addLibrarySprite(vm, 'Not in library')).resolves.toBeNull();
    expect(vm.addSprite).not.toHaveBeenCalled();
});
