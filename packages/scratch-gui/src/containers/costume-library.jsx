import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import VM from '@scratch/scratch-vm';

import spriteTags from '../lib/libraries/sprite-tags';
import {
    buildDisplayCostumeLibrary,
    isCostumeJapaneseNamesEnabled
} from '../lib/automatic-sprite-selection';
import {
    getCostumeLibraryUseJapanesePreference,
    setCostumeLibraryUseJapanesePreference
} from '../lib/user-preferences';
import LibraryComponent from '../components/library/library.jsx';
import styles from './sprite-library.css';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Costume',
        description: 'Heading for the costume library',
        id: 'gui.costumeLibrary.chooseACostume'
    },
    languageToggleLabel: {
        defaultMessage: 'Costume names',
        description: 'Label for switching costume library name language',
        id: 'gui.costumeLibrary.languageToggleLabel'
    },
    languageJapanese: {
        defaultMessage: '日本語',
        description: 'Japanese option for costume library name language',
        id: 'gui.costumeLibrary.languageJapanese'
    },
    languageEnglish: {
        defaultMessage: 'English',
        description: 'English option for costume library name language',
        id: 'gui.costumeLibrary.languageEnglish'
    }
});


export class CostumeLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelected',
            'handleUseEnglishNames',
            'handleUseJapaneseNames'
        ]);
        this.state = {
            useJapaneseNames: isCostumeJapaneseNamesEnabled() &&
                getCostumeLibraryUseJapanesePreference()
        };
    }
    handleItemSelected (item) {
        const vmCostume = {
            name: item.name,
            rotationCenterX: item.rotationCenterX,
            rotationCenterY: item.rotationCenterY,
            bitmapResolution: item.bitmapResolution,
            skinId: null
        };
        this.props.vm.addCostumeFromLibrary(item.md5ext, vmCostume);
    }
    handleUseJapaneseNames () {
        setCostumeLibraryUseJapanesePreference(true);
        this.setState({useJapaneseNames: true});
    }
    handleUseEnglishNames () {
        setCostumeLibraryUseJapanesePreference(false);
        this.setState({useJapaneseNames: false});
    }
    renderLanguageToggle () {
        if (!isCostumeJapaneseNamesEnabled()) return null;
        const label = this.props.intl.formatMessage(messages.languageToggleLabel);
        return (
            <div className={styles.languageToggle}>
                <span className={styles.languageToggleLabel}>{label}</span>
                <div
                    aria-label={label}
                    className={classNames(styles.languageToggleOptions, {
                        [styles.languageToggleOptionsJapanese]: this.state.useJapaneseNames,
                        [styles.languageToggleOptionsEnglish]: !this.state.useJapaneseNames
                    })}
                    role="group"
                >
                    <button
                        aria-pressed={this.state.useJapaneseNames}
                        className={this.state.useJapaneseNames ? styles.active : null}
                        type="button"
                        onClick={this.handleUseJapaneseNames}
                    >
                        {this.props.intl.formatMessage(messages.languageJapanese)}
                    </button>
                    <button
                        aria-pressed={!this.state.useJapaneseNames}
                        className={this.state.useJapaneseNames ? null : styles.active}
                        type="button"
                        onClick={this.handleUseEnglishNames}
                    >
                        {this.props.intl.formatMessage(messages.languageEnglish)}
                    </button>
                </div>
            </div>
        );
    }
    render () {
        return (
            <LibraryComponent
                data={buildDisplayCostumeLibrary(this.state.useJapaneseNames)}
                filterBarControls={this.renderLanguageToggle()}
                id="costumeLibrary"
                tags={spriteTags}
                title={this.props.intl.formatMessage(messages.libraryTitle)}
                onItemSelected={this.handleItemSelected}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

CostumeLibrary.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(CostumeLibrary);
