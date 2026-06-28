import spriteLibraryContent from './libraries/sprites.json';
import costumeLibraryContent from './libraries/costumes.json';
import soundLibraryContent from './libraries/sounds.json';
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
            tags: sprite.tags || [],
            costumes: (sprite.costumes || []).map(costume => costume.name).filter(Boolean),
            sounds: (sprite.sounds || []).map(sound => sound.name).filter(Boolean)
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

export const inferRequiredSpriteAssets = (userInput, project) => {
    const input = String(userInput || '');
    const normalizedInput = normalizeSpriteName(input);
    const currentSounds = new Set(
        getProjectTargets(project)
            .flatMap(target => target.sounds || [])
            .map(sound => normalizeSpriteName(sound && sound.name))
            .filter(Boolean)
    );

    const requiredAssets = [];
    const asksForSound = /音|鳴|なら|流|sound|play/iu.test(input);
    const asksForDog = /犬|いぬ|イヌ|子犬|dog|puppy|bark|吠/iu.test(input);
    const hasDogSound = ['dog1', 'dog2', 'bark'].some(sound => currentSounds.has(sound));
    if (asksForSound && asksForDog && !hasDogSound) {
        requiredAssets.push('犬の音');
    }

    for (const sprite of spriteLibraryContent) {
        for (const sound of sprite.sounds || []) {
            const soundName = normalizeSpriteName(sound.name);
            if (soundName && normalizedInput.includes(soundName) && !currentSounds.has(soundName)) {
                requiredAssets.push(`${sound.name} の音`);
            }
        }
    }

    return Array.from(new Set(requiredAssets));
};

export const inferDirectLibraryCostumes = (userInput, project) => {
    const input = String(userInput || '');
    const normalizedInput = normalizeSpriteName(input);
    const currentCostumes = new Set(
        getProjectTargets(project)
            .flatMap(target => target.costumes || [])
            .map(costume => normalizeSpriteName(costume && costume.name))
            .filter(Boolean)
    );

    const asksForCostume = /コスチューム|見た目|姿|衣装|変身|変化|変える|costume|look|transform/iu.test(input);
    const asksForDog = /犬|いぬ|イヌ|子犬|dog|puppy/iu.test(input);
    const costumes = [];
    if (asksForCostume && asksForDog) {
        costumes.push('Dog1-a', 'Dog1-b');
    }

    for (const costume of costumeLibraryContent) {
        const costumeName = normalizeSpriteName(costume.name);
        if (costumeName && normalizedInput.includes(costumeName) && !currentCostumes.has(costumeName)) {
            costumes.push(costume.name);
        }
    }

    return Array.from(new Set(
        costumes.filter(costume => !currentCostumes.has(normalizeSpriteName(costume)))
    ));
};

const findLibraryCostume = name => (
    costumeLibraryContent.find(costume => costume.name === name) || null
);

const findLibrarySound = name => (
    soundLibraryContent.find(sound => sound.name === name) || null
);

export const addLibraryCostumeToEditingTarget = async (vm, costumeName) => {
    const source = findLibraryCostume(costumeName);
    if (!source || !vm || !vm.editingTarget || typeof vm.addCostume !== 'function') {
        return null;
    }

    const targetId = vm.editingTarget.id;
    const project = typeof vm.toJSON === 'function' ? vm.toJSON() : null;
    const target = targetId ?
        getProjectTargets(project).find(candidate => candidate && candidate.id === targetId) :
        null;
    const existingCostumeIds = targetAssetIds(target && target.costumes);
    const existingCostumeNames = targetAssetNames(target && target.costumes);
    const sourceId = assetIdForLibraryMatch(source);
    const sourceName = normalizeSpriteName(source.name);
    if ((sourceId && existingCostumeIds.has(sourceId)) || (sourceName && existingCostumeNames.has(sourceName))) {
        return null;
    }

    await vm.addCostume(source.md5ext, {
        name: source.name,
        md5: source.md5ext,
        rotationCenterX: source.rotationCenterX,
        rotationCenterY: source.rotationCenterY,
        bitmapResolution: source.bitmapResolution,
        skinId: null
    }, targetId, 2);

    const updatedProject = typeof vm.toJSON === 'function' ? vm.toJSON() : null;
    const updatedTarget = findTargetById(updatedProject, targetId);
    const addedCostumeName = findAddedAssetName(
        target && target.costumes,
        updatedTarget && updatedTarget.costumes,
        source,
        source.name
    );
    const targetName = target ?
        getTargetDisplayName(target) :
        (typeof vm.editingTarget.getName === 'function' ? vm.editingTarget.getName() : vm.editingTarget.name);
    return {
        targetName,
        costumeName: addedCostumeName,
        sourceCostumeName: source.name
    };
};

export const addLibrarySoundToEditingTarget = async (vm, soundName) => {
    const source = findLibrarySound(soundName);
    if (!source || !vm || !vm.editingTarget || typeof vm.addSound !== 'function') {
        return null;
    }

    const targetId = vm.editingTarget.id;
    const project = typeof vm.toJSON === 'function' ? vm.toJSON() : null;
    const target = targetId ?
        getProjectTargets(project).find(candidate => candidate && candidate.id === targetId) :
        null;
    const existingSoundIds = targetAssetIds(target && target.sounds);
    const existingSoundNames = targetAssetNames(target && target.sounds);
    const sourceId = assetIdForLibraryMatch(source);
    const sourceName = normalizeSpriteName(source.name);
    if ((sourceId && existingSoundIds.has(sourceId)) || (sourceName && existingSoundNames.has(sourceName))) {
        return null;
    }

    await vm.addSound({
        format: source.dataFormat,
        md5: source.md5ext,
        rate: source.rate,
        sampleCount: source.sampleCount,
        name: source.name
    }, targetId);

    const targetName = target ?
        getTargetDisplayName(target) :
        (typeof vm.editingTarget.getName === 'function' ? vm.editingTarget.getName() : vm.editingTarget.name);
    return {
        targetName,
        soundName: source.name
    };
};

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

export const findProjectTargetByDisplayName = (project, targetName) => {
    const normalizedTargetName = normalizeSpriteName(targetName);
    if (!normalizedTargetName) return null;
    return getProjectTargets(project).find(target => {
        if (!target || target.isStage) return false;
        return [
            target.name,
            getTargetDisplayName(target)
        ].map(normalizeSpriteName)
            .filter(Boolean)
            .includes(normalizedTargetName);
    }) || null;
};

const targetAssetIds = (assets = []) => new Set(
    (assets || []).map(assetIdForLibraryMatch).filter(Boolean)
);

const targetAssetNames = (assets = []) => new Set(
    (assets || []).map(asset => normalizeSpriteName(asset && asset.name)).filter(Boolean)
);

const findTargetById = (project, targetId) => (
    getProjectTargets(project).find(candidate => candidate && candidate.id === targetId) || null
);

const findAddedAssetName = (beforeAssets, afterAssets, sourceAsset, fallbackName) => {
    const beforeIds = targetAssetIds(beforeAssets);
    const beforeNames = targetAssetNames(beforeAssets);
    const sourceId = assetIdForLibraryMatch(sourceAsset);
    const sourceName = normalizeSpriteName(sourceAsset && sourceAsset.name);
    const added = (afterAssets || []).find(asset => {
        const assetId = assetIdForLibraryMatch(asset);
        const assetName = normalizeSpriteName(asset && asset.name);
        if (assetId && beforeIds.has(assetId)) return false;
        if (assetName && beforeNames.has(assetName)) return false;
        return (sourceId && assetId === sourceId) || (sourceName && assetName === sourceName);
    });
    return added && added.name ? added.name : fallbackName;
};

export const addMissingLibrarySpriteAssets = async (
    vm,
    targetName,
    libraryName,
    japaneseName = '',
    assetFilter = {}
) => {
    const source = findLibrarySprite(libraryName);
    if (!source || !vm || typeof vm.toJSON !== 'function') {
        return {costumes: [], sounds: []};
    }

    const project = vm.toJSON();
    const target = findProjectTargetByDisplayName(project, targetName) ||
        findProjectTargetByDisplayName(project, findExistingLibrarySpriteName(project, libraryName, japaneseName));
    if (!target || !target.id) return {costumes: [], sounds: []};

    const existingCostumeIds = targetAssetIds(target.costumes);
    const existingCostumeNames = targetAssetNames(target.costumes);
    const hasCostumeFilter = Array.isArray(assetFilter.costumes);
    const requestedCostumes = new Set((assetFilter.costumes || []).map(normalizeSpriteName).filter(Boolean));
    const addedCostumes = [];
    for (const costume of source.costumes || []) {
        if (hasCostumeFilter && !requestedCostumes.has(normalizeSpriteName(costume.name))) {
            continue;
        }
        const assetId = assetIdForLibraryMatch(costume);
        const assetName = normalizeSpriteName(costume.name);
        if ((assetId && existingCostumeIds.has(assetId)) || (assetName && existingCostumeNames.has(assetName))) {
            continue;
        }
        const vmCostume = {
            name: costume.name,
            md5: costume.md5ext,
            rotationCenterX: costume.rotationCenterX,
            rotationCenterY: costume.rotationCenterY,
            bitmapResolution: costume.bitmapResolution,
            skinId: null
        };
        await vm.addCostume(costume.md5ext, vmCostume, target.id, 2);
        addedCostumes.push(costume.name);
        if (assetId) existingCostumeIds.add(assetId);
        if (assetName) existingCostumeNames.add(assetName);
    }

    const existingSoundIds = targetAssetIds(target.sounds);
    const existingSoundNames = targetAssetNames(target.sounds);
    const hasSoundFilter = Array.isArray(assetFilter.sounds);
    const requestedSounds = new Set((assetFilter.sounds || []).map(normalizeSpriteName).filter(Boolean));
    const addedSounds = [];
    for (const sound of source.sounds || []) {
        if (hasSoundFilter && !requestedSounds.has(normalizeSpriteName(sound.name))) {
            continue;
        }
        const assetId = assetIdForLibraryMatch(sound);
        const assetName = normalizeSpriteName(sound.name);
        if ((assetId && existingSoundIds.has(assetId)) || (assetName && existingSoundNames.has(assetName))) {
            continue;
        }
        await vm.addSound({
            format: sound.format || sound.dataFormat,
            md5: sound.md5ext,
            rate: sound.rate,
            sampleCount: sound.sampleCount,
            name: sound.name
        }, target.id);
        addedSounds.push(sound.name);
        if (assetId) existingSoundIds.add(assetId);
        if (assetName) existingSoundNames.add(assetName);
    }

    return {costumes: addedCostumes, sounds: addedSounds};
};

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
