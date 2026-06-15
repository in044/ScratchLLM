import React from 'react';
import {shallow} from 'enzyme';

import ScratchBlockRenderer, {
    applyCustomArgumentColors,
    applyCustomBlockOverrides,
    extractCustomBlockSignatures
} from '../../../src/components/chat/scratch-block-renderer.jsx';
import {
    buildLlmRequestPayload,
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

    test('applies Scratch custom block colors to argument reporters', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const argument = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        argument.setAttribute('class', 'sb3-custom-arg');
        svg.appendChild(argument);

        applyCustomArgumentColors(svg);

        expect(argument.style.fill).toBe('#ff6680');
        expect(argument.style.stroke).toBe('#ff3355');
    });

    test('marks custom block calls defined in another explanatory Scratch fence', () => {
        const signatures = extractCustomBlockSignatures(
            '```scratch\n重力を設定する (10)\n```\n```scratch\n定義 重力を設定する (重力)\n```'
        );

        expect(applyCustomBlockOverrides('⚑ が押されたとき\n重力を設定する (10)', signatures))
            .toBe('⚑ が押されたとき\n重力を設定する (10) :: custom');
        expect(applyCustomBlockOverrides('定義 重力を設定する (重力)', signatures))
            .toBe('定義 重力を設定する (重力)');
    });
});

describe('LLM request payload', () => {
    test('sends data inputs without protected prompts or model settings', () => {
        const payload = buildLlmRequestPayload({
            userInput: '初期化を追加して',
            currentProgram: '# Stage\n# ブロックなし',
            history: [{role: 'user', content: '前の依頼'}],
            explanationLength: 'short'
        });

        expect(payload).toEqual({
            userInput: '初期化を追加して',
            currentProgram: '# Stage\n# ブロックなし',
            history: [{role: 'user', content: '前の依頼'}],
            explanationLength: 'short'
        });
        expect(payload.messages).toBeUndefined();
        expect(payload.model).toBeUndefined();
        expect(payload.systemPrompt).toBeUndefined();
    });
});
