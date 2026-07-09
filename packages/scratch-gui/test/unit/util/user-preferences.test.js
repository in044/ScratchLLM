import {
    getExplanationLengthPreference,
    getSpriteAutoAddPreference,
    getSpriteLibraryUseJapanesePreference,
    setExplanationLengthPreference,
    setSpriteAutoAddPreference,
    setSpriteLibraryUseJapanesePreference
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
        expect(getSpriteLibraryUseJapanesePreference()).toBe(true);
        expect(getExplanationLengthPreference()).toBe('normal');
        expect(getSpriteAutoAddPreference()).toBe(true);
    });

    test('persists sprite library language', () => {
        setSpriteLibraryUseJapanesePreference(false);

        expect(getSpriteLibraryUseJapanesePreference()).toBe(false);
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
});
