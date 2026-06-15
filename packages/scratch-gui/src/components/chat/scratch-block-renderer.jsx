import React from 'react';
import PropTypes from 'prop-types';
import scratchblocks from 'scratchblocks';
import ja from 'scratchblocks/locales/ja.json';

const CUSTOM_ARGUMENT_PRIMARY = '#ff6680';
const CUSTOM_ARGUMENT_TERTIARY = '#ff3355';
const CUSTOM_DEFINITION_PREFIX = /^定義\s+/u;
const CUSTOM_OVERRIDE_SUFFIX = /\s*::\s*custom\s*$/u;

// Initialize scratchblocks languages
if (scratchblocks && scratchblocks.loadLanguages) {
    scratchblocks.loadLanguages({ja});
}

export const applyCustomArgumentColors = svg => {
    svg.querySelectorAll('.sb3-custom-arg').forEach(element => {
        element.style.fill = CUSTOM_ARGUMENT_PRIMARY;
        element.style.stroke = CUSTOM_ARGUMENT_TERTIARY;
    });
};

const customBlockSignature = line => {
    const source = line.replace(CUSTOM_DEFINITION_PREFIX, '').trim();
    const parts = [];
    let literal = '';
    let index = 0;

    while (index < source.length) {
        const opening = source[index];
        const closing = opening === '(' ? ')' : opening === '[' ? ']' : opening === '<' ? '>' : null;
        if (!closing) {
            literal += source[index++];
            continue;
        }
        if (literal.trim()) parts.push(literal.trim());
        literal = '';
        let depth = 1;
        index++;
        while (index < source.length && depth > 0) {
            if (source[index] === opening) depth++;
            if (source[index] === closing) depth--;
            index++;
        }
        if (depth !== 0) return null;
        parts.push(opening === '<' ? '%b' : '%r');
    }
    if (literal.trim()) parts.push(literal.trim());
    return parts.join(' ');
};

export const extractCustomBlockSignatures = text => {
    const signatures = new Set();
    text.split(/\r?\n/gu).forEach(line => {
        if (!CUSTOM_DEFINITION_PREFIX.test(line.trim())) return;
        const signature = customBlockSignature(line);
        if (signature) signatures.add(signature);
    });
    return signatures;
};

export const applyCustomBlockOverrides = (code, customBlockSignatures) => code
    .split(/\r?\n/gu)
    .map(line => {
        const trimmed = line.trim();
        if (!trimmed || CUSTOM_DEFINITION_PREFIX.test(trimmed) || CUSTOM_OVERRIDE_SUFFIX.test(trimmed)) {
            return line;
        }
        return customBlockSignatures.has(customBlockSignature(trimmed)) ? `${line} :: custom` : line;
    })
    .join('\n');

class ScratchBlockRenderer extends React.Component {
    componentDidMount () {
        this.renderBlocks();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.code !== this.props.code) {
            this.renderBlocks();
        }
    }

    renderBlocks () {
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
            const code = applyCustomBlockOverrides(this.props.code, this.props.customBlockSignatures);
            const doc = sb.parse(code, {
                languages: ['ja', 'en'] // Prioritize Japanese
            });
            const svg = sb.render(doc, {
                style: 'scratch3',
                scale: 0.6 // Scale down a bit to fit chat
            });
            applyCustomArgumentColors(svg);
            this.container.appendChild(svg);
        } catch (e) {
            console.error('Error rendering scratch blocks:', e);
            this.container.innerText = this.props.code;
        }
    }

    render () {
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
    code: PropTypes.string,
    customBlockSignatures: PropTypes.instanceOf(Set)
};

ScratchBlockRenderer.defaultProps = {
    customBlockSignatures: new Set()
};

export default ScratchBlockRenderer;
