import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import VM from '@scratch/scratch-vm';

import backdropTags from '../lib/libraries/backdrop-tags';
import {
    buildDisplayBackdropLibrary,
    isBackdropJapaneseNamesEnabled
} from '../lib/automatic-backdrop-selection';
import {
    getBackdropLibraryUseJapanesePreference,
    setBackdropLibraryUseJapanesePreference
} from '../lib/user-preferences';
import LibraryComponent from '../components/library/library.jsx';
import styles from './sprite-library.css';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Backdrop',
        description: 'Heading for the backdrop library',
        id: 'gui.costumeLibrary.chooseABackdrop'
    },
    languageToggleLabel: {
        defaultMessage: 'Backdrop names',
        description: 'Label for switching backdrop library name language',
        id: 'gui.backdropLibrary.languageToggleLabel'
    },
    languageJapanese: {
        defaultMessage: '日本語',
        description: 'Japanese option for backdrop library name language',
        id: 'gui.backdropLibrary.languageJapanese'
    },
    languageEnglish: {
        defaultMessage: 'English',
        description: 'English option for backdrop library name language',
        id: 'gui.backdropLibrary.languageEnglish'
    }
});


export class BackdropLibrary extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleUseEnglishNames',
            'handleUseJapaneseNames'
        ]);
        this.state = {
            useJapaneseNames: isBackdropJapaneseNamesEnabled() &&
                getBackdropLibraryUseJapanesePreference()
        };
    }
    handleItemSelect (item) {
        const vmBackdrop = {
            name: item.name,
            rotationCenterX: item.rotationCenterX,
            rotationCenterY: item.rotationCenterY,
            bitmapResolution: item.bitmapResolution,
            skinId: null
        };
        // Do not switch to stage, just add the backdrop
        this.props.vm.addBackdrop(item.md5ext, vmBackdrop);
    }
    handleUseJapaneseNames () {
        setBackdropLibraryUseJapanesePreference(true);
        this.setState({useJapaneseNames: true});
    }
    handleUseEnglishNames () {
        setBackdropLibraryUseJapanesePreference(false);
        this.setState({useJapaneseNames: false});
    }
    renderLanguageToggle () {
        if (!isBackdropJapaneseNamesEnabled()) return null;
        const label = this.props.intl.formatMessage(messages.languageToggleLabel);
        const japaneseLabel = this.props.intl.formatMessage(messages.languageJapanese);
        const englishLabel = this.props.intl.formatMessage(messages.languageEnglish);
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
                        {japaneseLabel}
                    </button>
                    <button
                        aria-pressed={!this.state.useJapaneseNames}
                        className={this.state.useJapaneseNames ? null : styles.active}
                        type="button"
                        onClick={this.handleUseEnglishNames}
                    >
                        {englishLabel}
                    </button>
                </div>
            </div>
        );
    }
    render () {
        return (
            <LibraryComponent
                data={buildDisplayBackdropLibrary(this.state.useJapaneseNames)}
                filterBarControls={this.renderLanguageToggle()}
                id="backdropLibrary"
                tags={backdropTags}
                title={this.props.intl.formatMessage(messages.libraryTitle)}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

BackdropLibrary.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(BackdropLibrary);
