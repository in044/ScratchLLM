import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape, defineMessages} from 'react-intl';
import VM from '@scratch/scratch-vm';

import randomizeSpritePosition from '../lib/randomize-sprite-position';
import spriteTags from '../lib/libraries/sprite-tags';
import {buildDisplaySpriteLibrary} from '../lib/automatic-sprite-selection';

import LibraryComponent from '../components/library/library.jsx';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Sprite',
        description: 'Heading for the sprite library',
        id: 'gui.spriteLibrary.chooseASprite'
    }
});

class SpriteLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
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
            const displayName = item.name;
            if (
                item.libraryName &&
                displayName !== item.libraryName &&
                this.props.vm.editingTarget
            ) {
                this.props.vm.renameSprite(this.props.vm.editingTarget.id, displayName);
            }
            this.props.onActivateBlocksTab();
        });
    }
    render () {
        return (
            <LibraryComponent
                data={buildDisplaySpriteLibrary()}
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
