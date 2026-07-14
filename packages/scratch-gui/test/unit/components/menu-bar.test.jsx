import React from 'react';
import {mountWithIntl} from '../../helpers/intl-helpers';
import MenuBar from '../../../src/components/menu-bar/menu-bar';
import {menuInitialState} from '../../../src/reducers/menus';
import {LoadingState} from '../../../src/reducers/project-state';
import {DEFAULT_THEME} from '../../../src/lib/themes';

import {PLATFORM} from '../../../src/lib/platform';

import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import VM from '@scratch/scratch-vm';

describe('MenuBar Component', () => {
    const store = configureStore()({
        locales: {
            isRtl: false,
            locale: 'en-US'
        },
        scratchGui: {
            menus: menuInitialState,
            projectState: {
                loadingState: LoadingState.NOT_LOADED
            },
            theme: {
                theme: DEFAULT_THEME
            },
            timeTravel: {
                year: 'NOW'
            },
            vm: new VM(),
            platform: {
                platform: PLATFORM.WEB
            },
            chatHistory: {
                explanationLength: 'normal'
            }
        }
    });

    const getComponent = function (props = {}) {
        return <Provider store={store}><MenuBar {...props} /></Provider>;
    };

    test('menu bar with no About handler has no About button', () => {
        const menuBar = mountWithIntl(getComponent());
        const button = menuBar.find('AboutButton');
        expect(button.exists()).toBe(false);
    });

    test('menu bar with an About handler has an About button', () => {
        const onClickAbout = jest.fn();
        const menuBar = mountWithIntl(getComponent({onClickAbout}));
        const button = menuBar.find('AboutButton');
        expect(button.exists()).toBe(true);
    });

    test('clicking on About button calls the handler', () => {
        const onClickAbout = jest.fn();
        const menuBar = mountWithIntl(getComponent({onClickAbout}));
        const button = menuBar.find('AboutButton');
        expect(onClickAbout).toHaveBeenCalledTimes(0);
        button.simulate('click');
        expect(onClickAbout).toHaveBeenCalledTimes(1);
    });

    test('groups automatic addition controls in one submenu', () => {
        store.getState().scratchGui.menus.aiMenu = true;
        const menuBar = mountWithIntl(getComponent());
        const autoAddSubmenu = menuBar.find('Submenu').filterWhere(submenu => (
            submenu.text().includes('スプライト') &&
            submenu.text().includes('背景') &&
            submenu.text().includes('コスチューム') &&
            submenu.text().includes('音')
        )).first();

        expect(menuBar.text()).toContain('自動追加');
        expect(autoAddSubmenu.exists()).toBe(true);
        expect(autoAddSubmenu.text()).toContain('スプライト');
        expect(autoAddSubmenu.text()).toContain('背景');
        expect(autoAddSubmenu.text()).toContain('コスチューム');
        expect(autoAddSubmenu.text()).toContain('音');
        store.getState().scratchGui.menus.aiMenu = false;
    });

    test('labels the GitHub link as source code', () => {
        const menuBar = mountWithIntl(getComponent());

        expect(menuBar.text()).toContain('ソースコード（GitHub）');
    });
});
