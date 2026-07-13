import backdropLibraryContent from '../../../src/lib/libraries/backdrops.json';
import backdropJapaneseNames from '../../../src/lib/libraries/backdrop-japanese-names';
import {
    addLibraryBackdrop,
    buildBackdropCatalog,
    buildDisplayBackdropLibrary,
    buildExistingBackdropNames,
    findExistingLibraryBackdropName,
    findLibraryBackdrop,
    isAutomaticBackdropAddEnabled,
    isBackdropJapaneseNamesEnabled
} from '../../../src/lib/automatic-backdrop-selection';

afterEach(() => {
    delete process.env.REACT_APP_BACKDROP_JAPANESE_NAMES_ENABLED;
    delete process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED;
});

test('can disable automatic backdrop addition independently', () => {
    process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED = 'off';
    expect(isAutomaticBackdropAddEnabled()).toBe(false);
    delete process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED;
    expect(isAutomaticBackdropAddEnabled()).toBe(true);
});

test('has a hand-maintained Japanese name for every library backdrop', () => {
    const libraryNames = backdropLibraryContent.map(backdrop => backdrop.name.trim());

    expect(Object.keys(backdropJapaneseNames).sort()).toEqual(libraryNames.sort());
    expect(Object.values(backdropJapaneseNames).every(name => typeof name === 'string' && name.length > 0)).toBe(true);
});

test('builds compact bilingual catalog entries without image payloads', () => {
    const galaxy = buildBackdropCatalog().find(backdrop => backdrop.name === 'Galaxy');

    expect(galaxy).toEqual({
        name: 'Galaxy',
        displayName: '銀河（Galaxy）',
        japaneseName: '銀河',
        aliases: ['銀河'],
        tags: expect.any(Array)
    });
    expect(galaxy.assetId).toBeUndefined();
    expect(galaxy.md5ext).toBeUndefined();
});

test('switches backdrop library names between Japanese and English', () => {
    expect(buildDisplayBackdropLibrary(true).find(backdrop => backdrop.libraryName === 'Galaxy').name).toBe('銀河');
    expect(buildDisplayBackdropLibrary(false).find(backdrop => backdrop.libraryName === 'Galaxy').name).toBe('Galaxy');
});

test('can disable Japanese backdrop names from the environment', () => {
    process.env.REACT_APP_BACKDROP_JAPANESE_NAMES_ENABLED = 'off';

    expect(isBackdropJapaneseNamesEnabled()).toBe(false);
    expect(buildBackdropCatalog().find(backdrop => backdrop.name === 'Galaxy').japaneseName).toBe('');
    expect(buildDisplayBackdropLibrary(true).find(backdrop => backdrop.libraryName === 'Galaxy').name).toBe('Galaxy');
});

test('finds library and existing backdrop names by canonical asset', () => {
    const galaxy = findLibraryBackdrop('Galaxy');
    const project = {
        targets: [{
            isStage: true,
            costumes: [{name: '銀河', assetId: galaxy.assetId}]
        }]
    };

    expect(findLibraryBackdrop(' Galaxy ')).toBe(galaxy);
    expect(findExistingLibraryBackdropName(project, 'Galaxy')).toBe('銀河');
    expect(buildExistingBackdropNames(project)).toEqual(['銀河']);
});

test('adds a Japanese backdrop and reports its actual Scratch name', async () => {
    const project = {
        targets: [{isStage: true, costumes: [{name: '背景1', assetId: 'existing'}]}]
    };
    const vm = {
        toJSON: jest.fn(() => project),
        addBackdrop: jest.fn((md5ext, backdrop) => {
            project.targets[0].costumes.push({
                ...backdrop,
                assetId: md5ext.split('.')[0]
            });
            return Promise.resolve();
        })
    };

    await expect(addLibraryBackdrop(vm, 'Galaxy', true)).resolves.toEqual({
        backdropName: '銀河',
        sourceBackdropName: 'Galaxy',
        added: true
    });
    expect(vm.addBackdrop).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({name: '銀河'})
    );

    await expect(addLibraryBackdrop(vm, 'Galaxy', true)).resolves.toEqual({
        backdropName: '銀河',
        sourceBackdropName: 'Galaxy',
        added: false
    });
    expect(vm.addBackdrop).toHaveBeenCalledTimes(1);
});

test('adds an English backdrop when English names are selected', async () => {
    const project = {targets: [{isStage: true, costumes: []}]};
    const vm = {
        toJSON: () => project,
        addBackdrop: jest.fn((md5ext, backdrop) => {
            project.targets[0].costumes.push({...backdrop, assetId: md5ext.split('.')[0]});
            return Promise.resolve();
        })
    };

    await expect(addLibraryBackdrop(vm, 'Galaxy', false)).resolves.toMatchObject({
        backdropName: 'Galaxy',
        added: true
    });
});
