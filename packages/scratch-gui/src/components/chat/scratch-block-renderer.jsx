import React from 'react';
import PropTypes from 'prop-types';
import scratchblocks from 'scratchblocks';
import ja from 'scratchblocks/locales/ja.json';

// Initialize scratchblocks languages
if (scratchblocks && scratchblocks.loadLanguages) {
    scratchblocks.loadLanguages({ ja });
}

class ScratchBlockRenderer extends React.Component {
    componentDidMount() {
        this.renderBlocks();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.code !== this.props.code) {
            this.renderBlocks();
        }
    }

    renderBlocks() {
        if (!this.container || !this.props.code) return;
        this.container.innerHTML = '';

        // Check if scratchblocks is available
        // Fallback to window.scratchblocks if the import didn't work as expected
        const sb = scratchblocks || window.scratchblocks;
        if (!sb) {
            this.container.innerText = this.props.code;
            return;
        }

        try {
            const doc = sb.parse(this.props.code, {
                languages: ['ja', 'en'] // Prioritize Japanese
            });
            const svg = sb.render(doc, {
                style: 'scratch3',
                scale: 0.6 // Scale down a bit to fit chat
            });
            this.container.appendChild(svg);
        } catch (e) {
            console.error('Error rendering scratch blocks:', e);
            this.container.innerText = this.props.code;
        }
    }

    render() {
        return (
            <div
                className="scratchblocks-container chat-scratchblocks-container"
                ref={el => {
                    this.container = el;
                }}
            />
        );
    }
}

ScratchBlockRenderer.propTypes = {
    code: PropTypes.string
};

export default ScratchBlockRenderer;
