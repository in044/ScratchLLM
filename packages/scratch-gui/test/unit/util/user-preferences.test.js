import {
    getBackdropAutoAddPreference,
    getBackdropLibraryUseJapanesePreference,
    getCostumeAutoAddPreference,
    getCostumeLibraryUseJapanesePreference,
    getExplanationLengthPreference,
    getSpriteAutoAddPreference,
    getSpriteLibraryUseJapanesePreference,
    getSoundAutoAddPreference,
    getSoundLibraryUseJapanesePreference,
    setExplanationLengthPreference,
    setBackdropLibraryUseJapanesePreference,
    setBackdropAutoAddPreference,
    setCostumeAutoAddPreference,
    setCostumeLibraryUseJapanesePreference,
    setSoundAutoAddPreference,
    setSpriteAutoAddPreference,
    setSpriteLibraryUseJapanesePreference,
    setSoundLibraryUseJapanesePreference
} from '../../../src/lib/user-preferences';

describe('user preferences', () => {
    let store;

    beforeEach(() => {
        store = {};
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                clear: jest.fn(() => {
                    store = {};
                }),
                getItem: jest.fn(key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
                removeItem: jest.fn(key => {
                    delete store[key];
                }),
                setItem: jest.fn((key, value) => {
                    store[key] = String(value);
                })
            }
        });
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    test('uses the requested defaults', () => {
        expect(getBackdropLibraryUseJapanesePreference()).toBe(true);
        expect(getBackdropAutoAddPreference()).toBe(false);
        expect(getSpriteLibraryUseJapanesePreference()).toBe(true);
        expect(getExplanationLengthPreference()).toBe('normal');
        expect(getSpriteAutoAddPreference()).toBe(true);
        expect(getCostumeAutoAddPreference()).toBe(false);
        expect(getSoundAutoAddPreference()).toBe(false);
        expect(getCostumeLibraryUseJapanesePreference()).toBe(true);
        expect(getSoundLibraryUseJapanesePreference()).toBe(true);
    });

    test('migrates existing preferences to S-LLM without resetting them', () => {
        window.localStorage.setItem('scratch-llm.spriteAutoAddEnabled', 'false');
        window.localStorage.setItem('scratch-llm.backdropAutoAddEnabled', 'true');
        window.localStorage.setItem('scratch-llm.explanationLength', 'short');

        expect(getSpriteAutoAddPreference()).toBe(false);
        expect(getBackdropAutoAddPreference()).toBe(true);
        expect(getExplanationLengthPreference()).toBe('short');
        expect(store['s-llm.spriteAutoAddEnabled']).toBe('false');
        expect(store['s-llm.backdropAutoAddEnabled']).toBe('true');
        expect(store['s-llm.explanationLength']).toBe('short');
        expect(window.localStorage.getItem('scratch-llm.spriteAutoAddEnabled')).toBe(null);
        expect(window.localStorage.getItem('scratch-llm.backdropAutoAddEnabled')).toBe(null);
        expect(window.localStorage.getItem('scratch-llm.explanationLength')).toBe(null);
    });

    test('prefers new settings over legacy settings', () => {
        window.localStorage.setItem('scratch-llm.explanationLength', 'short');
        setExplanationLengthPreference('long');

        expect(getExplanationLengthPreference()).toBe('long');
    });

    test('preserves legacy settings when migration cannot write to storage', () => {
        window.localStorage.setItem('scratch-llm.explanationLength', 'short');
        window.localStorage.setItem.mockImplementation(() => {
            throw new Error('Storage unavailable');
        });

        expect(getExplanationLengthPreference()).toBe('short');
        expect(store['scratch-llm.explanationLength']).toBe('short');
        expect(window.localStorage.removeItem).not.toHaveBeenCalled();
    });

    test('persists sprite library language', () => {
        setSpriteLibraryUseJapanesePreference(false);

        expect(getSpriteLibraryUseJapanesePreference()).toBe(false);
    });

    test('persists backdrop library language', () => {
        setBackdropLibraryUseJapanesePreference(false);

        expect(getBackdropLibraryUseJapanesePreference()).toBe(false);
    });

    test('persists costume and sound library languages independently', () => {
        setCostumeLibraryUseJapanesePreference(false);
        setSoundLibraryUseJapanesePreference(false);

        expect(getCostumeLibraryUseJapanesePreference()).toBe(false);
        expect(getSoundLibraryUseJapanesePreference()).toBe(false);
        expect(getSpriteLibraryUseJapanesePreference()).toBe(true);
        expect(getBackdropLibraryUseJapanesePreference()).toBe(true);
    });

    test('persists automatic backdrop add state independently', () => {
        setBackdropAutoAddPreference(true);

        expect(getBackdropAutoAddPreference()).toBe(true);
        expect(getSpriteAutoAddPreference()).toBe(true);
    });

    test('persists explanation length', () => {
        setExplanationLengthPreference('short');

        expect(getExplanationLengthPreference()).toBe('short');
    });

    test('falls back to normal for unknown explanation length', () => {
        setExplanationLengthPreference('tiny');

        expect(getExplanationLengthPreference()).toBe('normal');
    });

    test('persists automatic sprite add state', () => {
        setSpriteAutoAddPreference(false);

        expect(getSpriteAutoAddPreference()).toBe(false);
    });

    test('persists automatic costume and sound states independently', () => {
        setCostumeAutoAddPreference(true);
        setSoundAutoAddPreference(true);

        expect(getCostumeAutoAddPreference()).toBe(true);
        expect(getSoundAutoAddPreference()).toBe(true);
        expect(getSpriteAutoAddPreference()).toBe(true);
        expect(getBackdropAutoAddPreference()).toBe(false);
    });
});
