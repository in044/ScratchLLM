import React from 'react';
import {shallow} from 'enzyme';
import VM from '@scratch/scratch-vm';

jest.mock('@scratch/scratch-vm', () => function MockVM () {});
jest.mock('../../../src/components/library/library.jsx', () => function MockLibrary () {
    return null;
});

import {SoundLibrary} from '../../../src/containers/sound-library.jsx';
import LibraryComponent from '../../../src/components/library/library.jsx';

describe('Sound library language switch', () => {
    let store;
    const intl = {
        formatMessage: message => message.defaultMessage
    };

    beforeEach(() => {
        store = {};
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: jest.fn(key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
                setItem: jest.fn((key, value) => {
                    store[key] = String(value);
                })
            }
        });
    });

    test('shows Japanese by default and switches to English', () => {
        const wrapper = shallow(
            <SoundLibrary intl={intl} vm={new VM()} onNewSound={jest.fn()} />,
            {disableLifecycleMethods: true}
        );

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Bark').name)
            .toBe('イヌの鳴き声');

        wrapper.instance().handleUseEnglishNames();
        wrapper.update();

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Bark').name)
            .toBe('Bark');
        expect(store['scratch-llm.soundLibraryLanguage']).toBe('false');
    });

    test('adds the displayed Japanese sound name to Scratch', async () => {
        const vm = new VM();
        vm.addSound = jest.fn(() => Promise.resolve());
        const onNewSound = jest.fn();
        const wrapper = shallow(
            <SoundLibrary intl={intl} vm={vm} onNewSound={onNewSound} />,
            {disableLifecycleMethods: true}
        );
        const sound = wrapper.find(LibraryComponent).prop('data')
            .find(item => item.libraryName === 'Bark');

        wrapper.instance().handleItemSelected(sound);
        await Promise.resolve();

        expect(vm.addSound).toHaveBeenCalledWith(expect.objectContaining({name: 'イヌの鳴き声'}));
        expect(onNewSound).toHaveBeenCalled();
    });
});
