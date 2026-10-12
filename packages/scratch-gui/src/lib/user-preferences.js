const EXPLANATION_LENGTH_KEY = 's-llm.explanationLength';
const SPRITE_LIBRARY_LANGUAGE_KEY = 's-llm.spriteLibraryLanguage';
const BACKDROP_LIBRARY_LANGUAGE_KEY = 's-llm.backdropLibraryLanguage';
const COSTUME_LIBRARY_LANGUAGE_KEY = 's-llm.costumeLibraryLanguage';
const SOUND_LIBRARY_LANGUAGE_KEY = 's-llm.soundLibraryLanguage';
const SPRITE_AUTO_ADD_KEY = 's-llm.spriteAutoAddEnabled';
const BACKDROP_AUTO_ADD_KEY = 's-llm.backdropAutoAddEnabled';
const COSTUME_AUTO_ADD_KEY = 's-llm.costumeAutoAddEnabled';
const SOUND_AUTO_ADD_KEY = 's-llm.soundAutoAddEnabled';

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
        const value = storage.getItem(key);
        if (value !== null) return value;
        const legacyKey = key.replace(/^s-llm\./, 'scratch-llm.');
        const legacyValue = storage.getItem(legacyKey);
        if (legacyValue === null) return null;
        // Preserve existing preferences when upgrading to S-LLM.
        try {
            storage.setItem(key, legacyValue);
            storage.removeItem(legacyKey);
        } catch (error) {
            // Keep using the saved preference even if migration is unavailable.
        }
        return legacyValue;
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

const getCostumeLibraryUseJapanesePreference = () => (
    readBoolean(COSTUME_LIBRARY_LANGUAGE_KEY, true)
);

const setCostumeLibraryUseJapanesePreference = useJapaneseNames => {
    writeValue(COSTUME_LIBRARY_LANGUAGE_KEY, String(useJapaneseNames === true));
};

const getSoundLibraryUseJapanesePreference = () => (
    readBoolean(SOUND_LIBRARY_LANGUAGE_KEY, true)
);

const setSoundLibraryUseJapanesePreference = useJapaneseNames => {
    writeValue(SOUND_LIBRARY_LANGUAGE_KEY, String(useJapaneseNames === true));
};

const getBackdropAutoAddPreference = () => (
    readBoolean(BACKDROP_AUTO_ADD_KEY, false)
);

const setBackdropAutoAddPreference = enabled => {
    writeValue(BACKDROP_AUTO_ADD_KEY, String(enabled === true));
};

const getCostumeAutoAddPreference = () => (
    readBoolean(COSTUME_AUTO_ADD_KEY, false)
);

const setCostumeAutoAddPreference = enabled => {
    writeValue(COSTUME_AUTO_ADD_KEY, String(enabled === true));
};

const getSoundAutoAddPreference = () => (
    readBoolean(SOUND_AUTO_ADD_KEY, false)
);

const setSoundAutoAddPreference = enabled => {
    writeValue(SOUND_AUTO_ADD_KEY, String(enabled === true));
};

const getSpriteAutoAddPreference = () => (
    readBoolean(SPRITE_AUTO_ADD_KEY, true)
);

const setSpriteAutoAddPreference = enabled => {
    writeValue(SPRITE_AUTO_ADD_KEY, String(enabled === true));
};

export {
    getBackdropAutoAddPreference,
    getCostumeAutoAddPreference,
    getCostumeLibraryUseJapanesePreference,
    getExplanationLengthPreference,
    getBackdropLibraryUseJapanesePreference,
    getSpriteAutoAddPreference,
    getSpriteLibraryUseJapanesePreference,
    getSoundAutoAddPreference,
    getSoundLibraryUseJapanesePreference,
    setExplanationLengthPreference,
    setBackdropLibraryUseJapanesePreference,
    setBackdropAutoAddPreference,
    setCostumeAutoAddPreference,
    setCostumeLibraryUseJapanesePreference,
    setSpriteAutoAddPreference,
    setSpriteLibraryUseJapanesePreference,
    setSoundAutoAddPreference,
    setSoundLibraryUseJapanesePreference
};
