import backdropLibraryContent from './libraries/backdrops.json';
import backdropJapaneseNames from './libraries/backdrop-japanese-names';

const isEnvFlagEnabled = (value, defaultValue = true) => {
    if (typeof value === 'undefined') return defaultValue;
    return !['0', 'false', 'no', 'off'].includes(String(value)
        .trim()
        .toLowerCase());
};

const parseProject = project => {
    if (typeof project !== 'string') return project || {};
    try {
        return JSON.parse(project);
    } catch (e) {
        return {};
    }
};

const normalizeName = value => String(value || '').trim()
    .toLocaleLowerCase();
const englishName = backdrop => String((backdrop && backdrop.name) || '').trim();
const assetId = asset => {
    if (!asset) return '';
    if (asset.assetId) return asset.assetId;
    if (asset.md5ext) return String(asset.md5ext).split('.')[0];
    if (asset.md5) return String(asset.md5).split('.')[0];
    return '';
};

const projectTargets = project => {
    const parsed = parseProject(project);
    return Array.isArray(parsed.targets) ? parsed.targets : [];
};

const stageTarget = project => projectTargets(project).find(target => target && target.isStage) ||
    projectTargets(project)[0] || null;

export const isBackdropJapaneseNamesEnabled = () => isEnvFlagEnabled(
    typeof process === 'undefined' ?
        '' :
        process.env.REACT_APP_BACKDROP_JAPANESE_NAMES_ENABLED,
    true
);

export const isAutomaticBackdropAddEnabled = () => isEnvFlagEnabled(
    typeof process === 'undefined' ?
        '' :
        process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED,
    true
);

export const getBackdropJapaneseName = name => backdropJapaneseNames[String(name || '').trim()] || '';

export const buildBackdropCatalog = () => backdropLibraryContent.map(backdrop => {
    const name = englishName(backdrop);
    const japaneseName = isBackdropJapaneseNamesEnabled() ? getBackdropJapaneseName(name) : '';
    return {
        name,
        displayName: japaneseName ? `${japaneseName}（${name}）` : name,
        japaneseName,
        aliases: japaneseName ? [japaneseName] : [],
        tags: backdrop.tags || []
    };
});

export const buildDisplayBackdropLibrary = (
    useJapaneseNames = isBackdropJapaneseNamesEnabled()
) => backdropLibraryContent.map(backdrop => {
    const libraryName = englishName(backdrop);
    const japaneseName = getBackdropJapaneseName(libraryName);
    return {
        ...backdrop,
        libraryName,
        name: useJapaneseNames && isBackdropJapaneseNamesEnabled() && japaneseName ?
            japaneseName :
            libraryName
    };
});

export const findLibraryBackdrop = name => {
    const normalized = normalizeName(name);
    return backdropLibraryContent.find(backdrop => normalizeName(englishName(backdrop)) === normalized) || null;
};

const findMatchingStageBackdrop = (project, source) => {
    const stage = stageTarget(project);
    if (!stage) return null;
    const sourceId = assetId(source);
    const sourceNames = new Set([
        englishName(source),
        getBackdropJapaneseName(englishName(source))
    ].map(normalizeName).filter(Boolean));
    return (stage.costumes || []).find(backdrop => (
        (sourceId && assetId(backdrop) === sourceId) ||
        sourceNames.has(normalizeName(backdrop && backdrop.name))
    )) || null;
};

export const findExistingLibraryBackdropName = (project, libraryName) => {
    const source = findLibraryBackdrop(libraryName);
    if (!source) return '';
    const existing = findMatchingStageBackdrop(project, source);
    return existing && existing.name ? existing.name : '';
};

export const buildExistingBackdropNames = project => {
    const stage = stageTarget(project);
    return stage ? (stage.costumes || []).map(backdrop => backdrop.name).filter(Boolean) : [];
};

export const addLibraryBackdrop = async (vm, name, useJapaneseNames = true) => {
    const source = findLibraryBackdrop(name);
    if (!source || !vm || typeof vm.addBackdrop !== 'function') return null;

    const beforeProject = typeof vm.toJSON === 'function' ? vm.toJSON() : {};
    const existing = findMatchingStageBackdrop(beforeProject, source);
    if (existing) {
        return {
            backdropName: existing.name,
            sourceBackdropName: englishName(source),
            added: false
        };
    }

    const sourceName = englishName(source);
    const japaneseName = getBackdropJapaneseName(sourceName);
    const requestedName = useJapaneseNames && isBackdropJapaneseNamesEnabled() && japaneseName ?
        japaneseName :
        sourceName;
    await vm.addBackdrop(source.md5ext, {
        name: requestedName,
        md5: source.md5ext,
        rotationCenterX: source.rotationCenterX,
        rotationCenterY: source.rotationCenterY,
        bitmapResolution: source.bitmapResolution,
        skinId: null
    });

    const afterProject = typeof vm.toJSON === 'function' ? vm.toJSON() : {};
    const added = findMatchingStageBackdrop(afterProject, source);
    return {
        backdropName: added && added.name ? added.name : requestedName,
        sourceBackdropName: sourceName,
        added: true
    };
};
