import React from 'react';
import {shallow} from 'enzyme';

import ScratchBlockRenderer from '../../../src/components/chat/scratch-block-renderer.jsx';
import {
    EXPLANATION_LENGTH_PROMPTS,
    getSystemPrompt,
    markdownToSafeHtml,
    renderMessageContent
} from '../../../src/components/chat/chat.jsx';

describe('Chat message rendering', () => {
    test('renders Markdown and removes unsafe HTML', () => {
        const html = markdownToSafeHtml(
            '# Heading\n\n**bold** <script>alert("x")</script><span style="color:red">text</span>'
        );

        expect(html).toContain('<h1>Heading</h1>');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('style=');
    });

    test('keeps Scratch fences as Scratch blocks', () => {
        const component = shallow(
            <div>{renderMessageContent('説明\n```scratch\n⚑ が押されたとき\n```')}</div>
        );

        expect(component.find(ScratchBlockRenderer)).toHaveLength(1);
    });
});

describe('Chat explanation length prompts', () => {
    ['long', 'normal', 'short'].forEach(length => {
        test(`adds the ${length} instruction to the system prompt`, () => {
            expect(getSystemPrompt(length)).toContain(EXPLANATION_LENGTH_PROMPTS[length]);
        });
    });

    test('falls back to the normal instruction', () => {
        expect(getSystemPrompt('unknown')).toContain(EXPLANATION_LENGTH_PROMPTS.normal);
    });
});
