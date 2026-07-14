import React from 'react';
import {shallow} from 'enzyme';
import VM from '@scratch/scratch-vm';

jest.mock('@scratch/scratch-vm', () => function MockVM () {});
jest.mock('../../../src/components/library/library.jsx', () => function MockLibrary () {
    return null;
});

import {CostumeLibrary} from '../../../src/containers/costume-library.jsx';
import LibraryComponent from '../../../src/components/library/library.jsx';

describe('Costume library language switch', () => {
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
        const wrapper = shallow(<CostumeLibrary intl={intl} vm={new VM()} />);

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Dog1-a').name)
            .toBe('イヌ1 1');

        wrapper.instance().handleUseEnglishNames();
        wrapper.update();

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Dog1-a').name)
            .toBe('Dog1-a');
        expect(store['scratch-llm.costumeLibraryLanguage']).toBe('false');
    });

    test('adds the displayed Japanese costume name to Scratch', () => {
        const vm = new VM();
        vm.addCostumeFromLibrary = jest.fn();
        const wrapper = shallow(<CostumeLibrary intl={intl} vm={vm} />);
        const costume = wrapper.find(LibraryComponent).prop('data')
            .find(item => item.libraryName === 'Dog1-a');

        wrapper.instance().handleItemSelected(costume);

        expect(vm.addCostumeFromLibrary).toHaveBeenCalledWith(
            costume.md5ext,
            expect.objectContaining({name: 'イヌ1 1'})
        );
    });
});
