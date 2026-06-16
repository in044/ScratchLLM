import spriteLibraryContent from './libraries/sprites.json';
import {getSpriteDisplayName, getSpriteJapaneseName} from './libraries/sprite-display-names';
import randomizeSpritePosition from './randomize-sprite-position';

export const buildSpriteCatalog = () => spriteLibraryContent.map(sprite => ({
    name: sprite.name,
    displayName: getSpriteDisplayName(sprite.name),
    japaneseName: getSpriteJapaneseName(sprite.name),
    aliases: [
        getSpriteDisplayName(sprite.name)
    ].filter(Boolean),
    tags: sprite.tags || []
}));

export const buildDisplaySpriteLibrary = () => spriteLibraryContent.map(sprite => ({
    ...sprite,
    libraryName: sprite.name,
    name: getSpriteJapaneseName(sprite.name) || sprite.name
}));

export const buildProjectAssetSummary = project => ({
    targets: (project.targets || []).map(target => ({
        name: getTargetDisplayName(target),
        costumes: (target.costumes || []).map(costume => costume.name),
        sounds: (target.sounds || []).map(sound => sound.name)
    }))
});

export const isDefaultScratchCatTarget = target => {
    if (!target || target.isStage) return false;
    const costumeAssetIds = (target.costumes || []).map(costume => costume.assetId || costume.md5ext);
    return costumeAssetIds.includes('bcf454acf82e4504149f7ffe07081dbc') &&
        costumeAssetIds.includes('0fb9be3e8397c983338cb71dc84d0b25');
};

export const getTargetDisplayName = target => {
    if (!target) return '';
    if (target.isStage) return 'Stage';
    if (isDefaultScratchCatTarget(target)) return getSpriteJapaneseName('Cat');
    return target.name;
};

export const buildExistingSpriteNames = project => (
    (project.targets || [])
        .filter(target => !target.isStage)
        .flatMap(target => {
            const displayName = getTargetDisplayName(target);
            return displayName && displayName !== target.name ?
                [displayName, target.name] :
                [target.name];
        })
        .filter(Boolean)
);

export const formatLibrarySpriteName = (libraryName, japaneseName = '') => {
    const generatedJapaneseName = spriteLibraryContent.some(sprite => sprite.name === libraryName) ?
        getSpriteJapaneseName(libraryName) :
        '';
    const trimmedJapaneseName = String(japaneseName || generatedJapaneseName || '').trim();
    if (!trimmedJapaneseName) return libraryName;
    const escapedLibraryName = libraryName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return trimmedJapaneseName.replace(new RegExp(`\\s*（${escapedLibraryName}）\\s*`, 'gu'), '');
};

export const findLibrarySprite = name => (
    spriteLibraryContent.find(sprite => sprite.name === name) || null
);

export const addLibrarySprite = (vm, name, japaneseName = '') => {
    const source = findLibrarySprite(name);
    if (!source) return Promise.resolve(null);

    const sprite = JSON.parse(JSON.stringify(source));
    randomizeSpritePosition(sprite);
    return vm.addSprite(JSON.stringify(sprite)).then(() => {
        if (!vm.editingTarget) return name;
        const displayName = formatLibrarySpriteName(name, japaneseName);
        if (displayName !== name && typeof vm.renameSprite === 'function') {
            vm.renameSprite(vm.editingTarget.id, displayName);
        }
        return typeof vm.editingTarget.getName === 'function' ?
            vm.editingTarget.getName() :
            displayName;
    });
};
