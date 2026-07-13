import {
    addLibraryCostumeToEditingTarget,
    addLibrarySoundToEditingTarget,
    addMissingLibrarySpriteAssets,
    addLibrarySprite,
    buildDisplaySpriteLibrary,
    buildExistingSpriteNames,
    buildProjectAssetSummary,
    buildSpriteCatalog,
    findExistingLibrarySpriteName,
    formatLibrarySpriteName,
    getTargetDisplayName,
    inferDirectLibraryCostumes,
    inferRequiredSpriteAssets,
    isAutomaticSpriteAddEnabled,
    isSpriteJapaneseNamesEnabled,
    isDefaultScratchCatTarget,
    findLibrarySprite
} from '../../../src/lib/automatic-sprite-selection';

afterEach(() => {
    delete process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED;
    delete process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED;
});

test('builds a compact sprite catalog with asset names but without asset payloads', () => {
    const catalog = buildSpriteCatalog();

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        englishName: expect.any(String),
        displayName: expect.any(String),
        japaneseName: expect.any(String),
        aliases: expect.any(Array),
        tags: expect.any(Array),
        costumes: expect.any(Array),
        sounds: expect.any(Array)
    });
    expect(catalog[0].costumes.every(costume => typeof costume === 'string')).toBe(true);
    expect(catalog[0].assetId).toBeUndefined();
});

test('builds display names for the sprite library while preserving the original library name', () => {
    const cat = buildDisplaySpriteLibrary().find(sprite => sprite.libraryName === 'Cat');

    expect(cat.name).toBe('ネコ');
    expect(cat.libraryName).toBe('Cat');
});

test('can disable sprite Japanese names from the environment', async () => {
    process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED = 'false';
    const catalogCat = buildSpriteCatalog().find(sprite => sprite.name === 'Cat');
    const displayCat = buildDisplaySpriteLibrary().find(sprite => sprite.libraryName === 'Cat');
    const vm = {
        addSprite: jest.fn(() => Promise.resolve()),
        renameSprite: jest.fn(),
        editingTarget: {
            id: 'cat-id',
            name: 'Cat',
            getName: () => 'Cat'
        }
    };

    expect(isSpriteJapaneseNamesEnabled()).toBe(false);
    expect(catalogCat).toMatchObject({
        name: 'Cat',
        displayName: 'Cat',
        japaneseName: ''
    });
    expect(displayCat.name).toBe('Cat');
    expect(formatLibrarySpriteName('Cat', 'ネコ')).toBe('Cat');
    await expect(addLibrarySprite(vm, 'Cat', 'ネコ')).resolves.toBe('Cat');
    expect(vm.renameSprite).not.toHaveBeenCalled();

    delete process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED;
});

test('can disable automatic sprite addition from the environment', () => {
    process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED = 'off';
    expect(isAutomaticSpriteAddEnabled()).toBe(false);
    delete process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED;
    expect(isAutomaticSpriteAddEnabled()).toBe(true);
});

test('generates Japanese display names for every sprite from the sprite JSON', () => {
    const catalog = buildSpriteCatalog();

    expect(catalog.every(sprite => sprite.japaneseName)).toBe(true);
    expect(catalog.every(sprite => sprite.displayName.includes(sprite.name))).toBe(true);
    expect(catalog.find(sprite => sprite.name === 'Cat').aliases).toEqual(
        expect.arrayContaining(['ネコ（Cat）', 'ネコ'])
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

test('summarizes existing sprite names from VM JSON strings', () => {
    const projectJson = JSON.stringify({
        targets: [
            {isStage: true, name: 'Stage'},
            {isStage: false, name: 'ネコ'},
            {isStage: false, name: 'りんご'}
        ]
    });

    expect(buildExistingSpriteNames(projectJson)).toEqual(['ネコ', 'りんご']);
    expect(findExistingLibrarySpriteName(projectJson, 'Cat', 'ネコ')).toBe('ネコ');
    expect(buildProjectAssetSummary(projectJson).targets.map(target => target.name))
        .toEqual(['Stage', 'ネコ', 'りんご']);
});

test('finds an existing library sprite by localized and library names', () => {
    expect(findExistingLibrarySpriteName({
        targets: [
            {isStage: false, name: 'ネコ'},
            {isStage: false, name: 'りんご'}
        ]
    }, 'Cat', 'ネコ')).toBe('ネコ');

    expect(findExistingLibrarySpriteName({
        targets: [
            {isStage: false, name: 'りんご'}
        ]
    }, 'Apple', 'りんご')).toBe('りんご');

    expect(findExistingLibrarySpriteName({
        targets: [
            {isStage: false, name: 'Apple'}
        ]
    }, 'Apple', 'りんご')).toBe('Apple');
});

test('finds an existing library sprite by costume assets after rename', () => {
    expect(findExistingLibrarySpriteName({
        targets: [{
            isStage: false,
            name: 'ごほうび',
            costumes: [{assetId: '3826a4091a33e4d26f87a2fac7cf796b'}]
        }]
    }, 'Apple', 'りんご')).toBe('ごほうび');
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

test('infers missing dog sound requests for automatic asset selection', () => {
    expect(inferRequiredSpriteAssets(
        'スペースキーを押したら犬の音が流れるようにして',
        {
            targets: [{
                name: 'Cat',
                isStage: false,
                costumes: [{name: 'cat-a'}],
                sounds: [{name: 'Meow'}]
            }]
        }
    )).toEqual(['犬の音']);
});

test('does not infer dog sound requests when a dog sound already exists', () => {
    expect(inferRequiredSpriteAssets(
        'スペースキーを押したら犬の音が流れるようにして',
        {
            targets: [{
                name: 'Cat',
                isStage: false,
                sounds: [{name: 'dog1'}]
            }]
        }
    )).toEqual([]);
});

test('infers dog costume requests for direct costume addition', () => {
    expect(inferDirectLibraryCostumes(
        'ネコに犬のコスチュームを追加して',
        {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                costumes: [{name: 'cat-a'}]
            }]
        }
    )).toEqual(['Dog1-a', 'Dog1-b']);
    expect(inferDirectLibraryCostumes(
        'スペースキーを押したら犬に変身して',
        {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                costumes: [{name: 'cat-a'}]
            }]
        }
    )).toEqual(['Dog1-a', 'Dog1-b']);
});

test('adds a library costume to the editing target', async () => {
    const vm = {
        editingTarget: {
            id: 'cat-id',
            name: 'ネコ',
            getName: () => 'ネコ'
        },
        toJSON: jest.fn(() => ({
            targets: [{
                id: 'cat-id',
                name: 'ネコ',
                isStage: false,
                costumes: [{name: 'cat-a'}]
            }]
        })),
        addCostume: jest.fn(() => Promise.resolve())
    };

    await expect(addLibraryCostumeToEditingTarget(vm, 'Dog1-a')).resolves.toEqual({
        targetName: 'ネコ',
        costumeName: 'Dog1-a',
        sourceCostumeName: 'Dog1-a'
    });
    expect(vm.addCostume).toHaveBeenCalledWith(
        '35cd78a8a71546a16c530d0b2d7d5a7f.svg',
        expect.objectContaining({
            name: 'Dog1-a',
            md5: '35cd78a8a71546a16c530d0b2d7d5a7f.svg'
        }),
        'cat-id',
        2
    );
});

test('returns the actual costume name when Scratch renames an added library costume', async () => {
    const beforeProject = {
        targets: [{
            id: 'cat-id',
            name: 'ネコ',
            isStage: false,
            costumes: [{name: 'cat-a'}]
        }]
    };
    const afterProject = {
        targets: [{
            id: 'cat-id',
            name: 'ネコ',
            isStage: false,
            costumes: [
                {name: 'cat-a'},
                {
                    name: 'コスチューム2',
                    md5ext: '35cd78a8a71546a16c530d0b2d7d5a7f.svg'
                }
            ]
        }]
    };
    const vm = {
        editingTarget: {
            id: 'cat-id',
            name: 'ネコ',
            getName: () => 'ネコ'
        },
        toJSON: jest.fn()
            .mockReturnValueOnce(beforeProject)
            .mockReturnValueOnce(afterProject),
        addCostume: jest.fn(() => Promise.resolve())
    };

    await expect(addLibraryCostumeToEditingTarget(vm, 'Dog1-a')).resolves.toEqual({
        targetName: 'ネコ',
        costumeName: 'コスチューム2',
        sourceCostumeName: 'Dog1-a'
    });
});

test('adds a library sound to the editing target', async () => {
    const vm = {
        editingTarget: {
            id: 'cat-id',
            name: 'ネコ',
            getName: () => 'ネコ'
        },
        toJSON: jest.fn(() => ({
            targets: [{
                id: 'cat-id',
                name: 'ネコ',
                isStage: false,
                sounds: [{name: 'Meow'}]
            }]
        })),
        addSound: jest.fn(() => Promise.resolve())
    };

    await expect(addLibrarySoundToEditingTarget(vm, 'Dog1')).resolves.toEqual({
        targetName: 'ネコ',
        soundName: 'Dog1'
    });
    expect(vm.addSound).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'Dog1',
            md5: 'b15adefc3c12f758b6dc6a045362532f.wav'
        }),
        'cat-id'
    );
});

test('does not add a sprite outside the library', async () => {
    const vm = {addSprite: jest.fn(() => Promise.resolve())};

    await expect(addLibrarySprite(vm, 'Not in library')).resolves.toBeNull();
    expect(vm.addSprite).not.toHaveBeenCalled();
});

test('adds missing costumes and sounds from a reused library sprite', async () => {
    const vm = {
        toJSON: jest.fn(() => ({
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                costumes: [{name: 'cat-a', assetId: 'bcf454acf82e4504149f7ffe07081dbc'}],
                sounds: []
            }]
        })),
        addCostume: jest.fn(() => Promise.resolve()),
        addSound: jest.fn(() => Promise.resolve())
    };

    await expect(addMissingLibrarySpriteAssets(vm, 'ネコ', 'Cat', 'ネコ')).resolves.toEqual({
        costumes: ['cat-b'],
        sounds: ['Meow']
    });
    expect(vm.addCostume).toHaveBeenCalledWith(
        '0fb9be3e8397c983338cb71dc84d0b25.svg',
        expect.objectContaining({name: 'cat-b'}),
        'cat-id',
        2
    );
    expect(vm.addSound).toHaveBeenCalledWith(
        expect.objectContaining({name: 'Meow', md5: '83c36d806dc92327b9e7049a565c6bff.wav'}),
        'cat-id'
    );
});
