import spriteLibraryContent from './libraries/sprites.json';
import {getSpriteDisplayName, getSpriteJapaneseName} from './libraries/sprite-display-names';
import randomizeSpritePosition from './randomize-sprite-position';

const isEnvFlagEnabled = (value, defaultValue = true) => {
    if (typeof value === 'undefined') return defaultValue;
    return !['0', 'false', 'no', 'off'].includes(String(value)
        .trim()
        .toLowerCase());
};

export const isSpriteJapaneseNamesEnabled = () => isEnvFlagEnabled(
    process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED,
    true
);

export const isAutomaticSpriteAddEnabled = () => isEnvFlagEnabled(
    process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED,
    true
);

const parseProject = project => {
    if (typeof project !== 'string') return project || {};
    try {
        return JSON.parse(project);
    } catch (e) {
        return {};
    }
};

const getProjectTargets = project => {
    const parsedProject = parseProject(project);
    return Array.isArray(parsedProject.targets) ? parsedProject.targets : [];
};

export const buildSpriteCatalog = () => {
    const useJapaneseNames = isSpriteJapaneseNamesEnabled();
    return spriteLibraryContent.map(sprite => {
        const displayName = useJapaneseNames ? getSpriteDisplayName(sprite.name) : sprite.name;
        return {
            name: sprite.name,
            displayName,
            japaneseName: useJapaneseNames ? getSpriteJapaneseName(sprite.name) : '',
            aliases: [
                displayName
            ].filter(Boolean),
            tags: sprite.tags || []
        };
    });
};

export const buildDisplaySpriteLibrary = () => spriteLibraryContent.map(sprite => ({
    ...sprite,
    libraryName: sprite.name,
    name: isSpriteJapaneseNamesEnabled() ? getSpriteJapaneseName(sprite.name) || sprite.name : sprite.name
}));

export const buildProjectAssetSummary = project => ({
    targets: getProjectTargets(project).map(target => ({
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
    if (isSpriteJapaneseNamesEnabled() && isDefaultScratchCatTarget(target)) return getSpriteJapaneseName('Cat');
    return target.name;
};

const normalizeSpriteName = value => String(value || '')
    .trim()
    .toLocaleLowerCase();

const assetIdForLibraryMatch = asset => {
    if (!asset) return '';
    if (asset.assetId) return asset.assetId;
    if (asset.md5ext) return String(asset.md5ext).split('.')[0];
    return '';
};

const targetHasLibrarySpriteAssets = (target, librarySprite) => {
    const libraryCostumeIds = (librarySprite.costumes || [])
        .map(assetIdForLibraryMatch)
        .filter(Boolean);
    if (libraryCostumeIds.length === 0) return false;

    const targetCostumeIds = new Set((target.costumes || [])
        .map(assetIdForLibraryMatch)
        .filter(Boolean));

    return libraryCostumeIds.every(id => targetCostumeIds.has(id));
};

export const findExistingLibrarySpriteName = (project, libraryName, japaneseName = '') => {
    const librarySprite = findLibrarySprite(libraryName);
    if (!librarySprite) return '';

    const expectedNames = new Set([
        libraryName,
        getSpriteDisplayName(libraryName),
        getSpriteJapaneseName(libraryName),
        japaneseName,
        formatLibrarySpriteName(libraryName, japaneseName)
    ].map(normalizeSpriteName).filter(Boolean));

    const targets = getProjectTargets(project);
    for (const target of targets) {
        if (!target || target.isStage) continue;

        const displayName = getTargetDisplayName(target);
        const targetNames = [
            target.name,
            displayName
        ].map(normalizeSpriteName).filter(Boolean);

        if (targetNames.some(name => expectedNames.has(name)) ||
                targetHasLibrarySpriteAssets(target, librarySprite)) {
            return displayName || target.name;
        }
    }
    return '';
};

export const buildExistingSpriteNames = project => (
    getProjectTargets(project)
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
    if (!isSpriteJapaneseNamesEnabled()) return libraryName;
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
