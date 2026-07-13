const EXPLANATION_LENGTH_KEY = 'scratch-llm.explanationLength';
const SPRITE_LIBRARY_LANGUAGE_KEY = 'scratch-llm.spriteLibraryLanguage';
const BACKDROP_LIBRARY_LANGUAGE_KEY = 'scratch-llm.backdropLibraryLanguage';
const SPRITE_AUTO_ADD_KEY = 'scratch-llm.spriteAutoAddEnabled';
const BACKDROP_AUTO_ADD_KEY = 'scratch-llm.backdropAutoAddEnabled';

const EXPLANATION_LENGTHS = ['long', 'normal', 'short'];

const getLocalStorage = () => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch (error) {
        return null;
    }
};

const readValue = key => {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
        return storage.getItem(key);
    } catch (error) {
        return null;
    }
};

const writeValue = (key, value) => {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
        storage.setItem(key, value);
    } catch (error) {
        // Ignore storage failures; preferences are a convenience.
    }
};

const readBoolean = (key, defaultValue) => {
    const value = readValue(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return defaultValue;
};

const getExplanationLengthPreference = () => {
    const value = readValue(EXPLANATION_LENGTH_KEY);
    return EXPLANATION_LENGTHS.indexOf(value) >= 0 ? value : 'normal';
};

const setExplanationLengthPreference = explanationLength => {
    const value = EXPLANATION_LENGTHS.indexOf(explanationLength) >= 0 ?
        explanationLength :
        'normal';
    writeValue(EXPLANATION_LENGTH_KEY, value);
};

const getSpriteLibraryUseJapanesePreference = () => (
    readBoolean(SPRITE_LIBRARY_LANGUAGE_KEY, true)
);

const setSpriteLibraryUseJapanesePreference = useJapaneseNames => {
    writeValue(SPRITE_LIBRARY_LANGUAGE_KEY, String(useJapaneseNames === true));
};

const getBackdropLibraryUseJapanesePreference = () => (
    readBoolean(BACKDROP_LIBRARY_LANGUAGE_KEY, true)
);

const setBackdropLibraryUseJapanesePreference = useJapaneseNames => {
    writeValue(BACKDROP_LIBRARY_LANGUAGE_KEY, String(useJapaneseNames === true));
};

const getBackdropAutoAddPreference = () => (
    readBoolean(BACKDROP_AUTO_ADD_KEY, true)
);

const setBackdropAutoAddPreference = enabled => {
    writeValue(BACKDROP_AUTO_ADD_KEY, String(enabled === true));
};

const getSpriteAutoAddPreference = () => (
    readBoolean(SPRITE_AUTO_ADD_KEY, true)
);

const setSpriteAutoAddPreference = enabled => {
    writeValue(SPRITE_AUTO_ADD_KEY, String(enabled === true));
};

export {
    getBackdropAutoAddPreference,
    getExplanationLengthPreference,
    getBackdropLibraryUseJapanesePreference,
    getSpriteAutoAddPreference,
    getSpriteLibraryUseJapanesePreference,
    setExplanationLengthPreference,
    setBackdropLibraryUseJapanesePreference,
    setBackdropAutoAddPreference,
    setSpriteAutoAddPreference,
    setSpriteLibraryUseJapanesePreference
};
