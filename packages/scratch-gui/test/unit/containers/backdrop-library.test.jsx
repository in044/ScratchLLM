import React from 'react';
import {shallow} from 'enzyme';
import VM from '@scratch/scratch-vm';

jest.mock('@scratch/scratch-vm', () => function MockVM () {});
jest.mock('../../../src/components/library/library.jsx', () => function MockLibrary () {
    return null;
});

import {BackdropLibrary} from '../../../src/containers/backdrop-library.jsx';
import LibraryComponent from '../../../src/components/library/library.jsx';

describe('Backdrop library language switch', () => {
    let store;
    const intl = {
        formatDate: jest.fn(),
        formatHTMLMessage: jest.fn(),
        formatMessage: message => message.defaultMessage,
        formatNumber: jest.fn(),
        formatPlural: jest.fn(),
        formatRelative: jest.fn(),
        formatTime: jest.fn(),
        now: jest.fn()
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
            <BackdropLibrary
                intl={intl}
                vm={new VM()}
            />
        );

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Galaxy').name)
            .toBe('銀河');

        wrapper.instance().handleUseEnglishNames();
        wrapper.update();

        expect(wrapper.find(LibraryComponent).prop('data').find(item => item.libraryName === 'Galaxy').name)
            .toBe('Galaxy');
        expect(store['scratch-llm.backdropLibraryLanguage']).toBe('false');
    });

    test('adds the displayed Japanese name to Scratch', () => {
        const addBackdrop = jest.fn();
        const vm = new VM();
        vm.addBackdrop = addBackdrop;
        const wrapper = shallow(
            <BackdropLibrary
                intl={intl}
                vm={vm}
            />
        );
        const galaxy = wrapper.find(LibraryComponent).prop('data')
            .find(item => item.libraryName === 'Galaxy');

        wrapper.instance().handleItemSelect(galaxy);

        expect(addBackdrop).toHaveBeenCalledWith(
            galaxy.md5ext,
            expect.objectContaining({name: '銀河'})
        );
    });
});
