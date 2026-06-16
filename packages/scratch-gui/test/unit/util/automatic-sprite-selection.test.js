import {
    addLibrarySprite,
    buildDisplaySpriteLibrary,
    buildExistingSpriteNames,
    buildProjectAssetSummary,
    buildSpriteCatalog,
    formatLibrarySpriteName,
    getTargetDisplayName,
    isDefaultScratchCatTarget,
    findLibrarySprite
} from '../../../src/lib/automatic-sprite-selection';

test('builds a compact sprite catalog without asset data', () => {
    const catalog = buildSpriteCatalog();

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toEqual({
        name: expect.any(String),
        displayName: expect.any(String),
        japaneseName: expect.any(String),
        aliases: expect.any(Array),
        tags: expect.any(Array)
    });
    expect(catalog[0].costumes).toBeUndefined();
});

test('builds display names for the sprite library while preserving the original library name', () => {
    const cat = buildDisplaySpriteLibrary().find(sprite => sprite.libraryName === 'Cat');

    expect(cat.name).toBe('ネコ');
    expect(cat.libraryName).toBe('Cat');
});

test('generates Japanese display names for every sprite from the sprite JSON', () => {
    const catalog = buildSpriteCatalog();

    expect(catalog.every(sprite => sprite.japaneseName)).toBe(true);
    expect(catalog.every(sprite => sprite.displayName.includes(sprite.name))).toBe(true);
    expect(catalog.find(sprite => sprite.name === 'Cat').aliases).toEqual(
        ['ネコ（Cat）']
    );
});

test('finds and adds an exact library sprite name', async () => {
    const sprite = findLibrarySprite('Cat');
    const vm = {
        addSprite: jest.fn(() => Promise.resolve()),
        renameSprite: jest.fn((id, name) => {
            vm.editingTarget.name = name;
        }),
        editingTarget: {
            id: 'cat-id',
            name: 'Cat',
            getName: () => vm.editingTarget.name
        }
    };

    expect(sprite.name).toBe('Cat');
    await expect(addLibrarySprite(vm, 'Cat', 'ネコ')).resolves.toBe('ネコ');
    expect(JSON.parse(vm.addSprite.mock.calls[0][0]).name).toBe('Cat');
    expect(vm.renameSprite).toHaveBeenCalledWith('cat-id', 'ネコ');
});

test('formats added library sprite names for Japanese display', () => {
    expect(formatLibrarySpriteName('Cat', 'ネコ')).toBe('ネコ');
    expect(formatLibrarySpriteName('Cat', 'ネコ（Cat）')).toBe('ネコ');
    expect(formatLibrarySpriteName('Cat', '')).toBe('ネコ');
    expect(formatLibrarySpriteName('Unknown Sprite', '')).toBe('Unknown Sprite');
});

test('summarizes existing sprite names for duplicate detection', () => {
    expect(buildExistingSpriteNames({
        targets: [
            {isStage: true, name: 'Stage'},
            {isStage: false, name: 'ネコ'},
            {isStage: false, name: 'Bat'}
        ]
    })).toEqual(['ネコ', 'Bat']);
});

test('recognizes the default Scratch cat even when it is named Sprite1', () => {
    const defaultCat = {
        isStage: false,
        name: 'Sprite1',
        costumes: [
            {assetId: 'bcf454acf82e4504149f7ffe07081dbc'},
            {assetId: '0fb9be3e8397c983338cb71dc84d0b25'}
        ],
        sounds: [{name: 'Meow'}]
    };

    expect(isDefaultScratchCatTarget(defaultCat)).toBe(true);
    expect(getTargetDisplayName(defaultCat)).toBe('ネコ');
    expect(buildExistingSpriteNames({targets: [defaultCat]})).toEqual(['ネコ', 'Sprite1']);
    expect(buildProjectAssetSummary({targets: [defaultCat]}).targets[0].name).toBe('ネコ');
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
