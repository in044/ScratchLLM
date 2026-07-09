import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape, defineMessages} from 'react-intl';
import VM from '@scratch/scratch-vm';

import randomizeSpritePosition from '../lib/randomize-sprite-position';
import spriteTags from '../lib/libraries/sprite-tags';
import {buildDisplaySpriteLibrary, isSpriteJapaneseNamesEnabled} from '../lib/automatic-sprite-selection';

import LibraryComponent from '../components/library/library.jsx';
import styles from './sprite-library.css';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Sprite',
        description: 'Heading for the sprite library',
        id: 'gui.spriteLibrary.chooseASprite'
    },
    languageToggleLabel: {
        defaultMessage: 'Sprite names',
        description: 'Label for switching sprite library name language',
        id: 'gui.spriteLibrary.languageToggleLabel'
    },
    languageJapanese: {
        defaultMessage: '日本語',
        description: 'Japanese option for sprite library name language',
        id: 'gui.spriteLibrary.languageJapanese'
    },
    languageEnglish: {
        defaultMessage: 'English',
        description: 'English option for sprite library name language',
        id: 'gui.spriteLibrary.languageEnglish'
    }
});

class SpriteLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleUseEnglishNames',
            'handleUseJapaneseNames'
        ]);
        this.state = {
            useJapaneseNames: isSpriteJapaneseNamesEnabled()
        };
    }
    handleItemSelect (item) {
        // Randomize position of library sprite
        const sprite = {
            ...item,
            name: item.libraryName || item.name
        };
        delete sprite.libraryName;
        randomizeSpritePosition(sprite);
        this.props.vm.addSprite(JSON.stringify(sprite)).then(() => {
            if (
                this.state.useJapaneseNames &&
                item.libraryName &&
                item.name !== item.libraryName &&
                this.props.vm.editingTarget &&
                typeof this.props.vm.renameSprite === 'function'
            ) {
                this.props.vm.renameSprite(this.props.vm.editingTarget.id, item.name);
            }
            this.props.onActivateBlocksTab();
        });
    }
    handleUseJapaneseNames () {
        this.setState({useJapaneseNames: true});
    }
    handleUseEnglishNames () {
        this.setState({useJapaneseNames: false});
    }
    renderLanguageToggle () {
        if (!isSpriteJapaneseNamesEnabled()) return null;
        const japaneseLabel = this.props.intl.formatMessage(messages.languageJapanese);
        const englishLabel = this.props.intl.formatMessage(messages.languageEnglish);
        const japaneseClassName = this.state.useJapaneseNames ? styles.active : null;
        const englishClassName = this.state.useJapaneseNames ? null : styles.active;
        return (
            <div className={styles.languageToggle}>
                <span className={styles.languageToggleLabel}>
                    {this.props.intl.formatMessage(messages.languageToggleLabel)}
                </span>
                <div
                    aria-label={this.props.intl.formatMessage(messages.languageToggleLabel)}
                    className={classNames(styles.languageToggleOptions, {
                        [styles.languageToggleOptionsJapanese]: this.state.useJapaneseNames,
                        [styles.languageToggleOptionsEnglish]: !this.state.useJapaneseNames
                    })}
                    role="group"
                >
                    <button
                        aria-pressed={this.state.useJapaneseNames}
                        className={japaneseClassName}
                        type="button"
                        onClick={this.handleUseJapaneseNames}
                    >
                        {japaneseLabel}
                    </button>
                    <button
                        aria-pressed={!this.state.useJapaneseNames}
                        className={englishClassName}
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
                data={buildDisplaySpriteLibrary(this.state.useJapaneseNames)}
                filterBarControls={this.renderLanguageToggle()}
                id="spriteLibrary"
                tags={spriteTags}
                title={this.props.intl.formatMessage(messages.libraryTitle)}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

SpriteLibrary.propTypes = {
    intl: intlShape.isRequired,
    onActivateBlocksTab: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(SpriteLibrary);
