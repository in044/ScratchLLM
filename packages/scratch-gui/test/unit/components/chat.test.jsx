import React from 'react';
import {shallow} from 'enzyme';

import ScratchBlockRenderer, {
    applyCustomArgumentColors,
    applyCustomBlockOverrides,
    extractCustomBlockSignatures
} from '../../../src/components/chat/scratch-block-renderer.jsx';
import {
    ChatComponent,
    buildLlmRequestPayload,
    buildSpriteAddedMessage,
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

describe('Automatic sprite notification', () => {
    test('builds a bot message after library sprites are added', () => {
        expect(buildSpriteAddedMessage(['Butterfly 2', 'Bat'])).toEqual({
            text: 'Butterfly 2、Batを追加しました。',
            sender: 'bot'
        });
    });
});

describe('LLM request payload', () => {
    test('sends data inputs without protected prompts or model settings', () => {
        const payload = buildLlmRequestPayload({
            userInput: '初期化を追加して',
            currentProgram: '# Stage\n# ブロックなし',
            currentAssets: {targets: []},
            history: [{role: 'user', content: '前の依頼'}],
            explanationLength: 'short'
        });

        expect(payload).toEqual({
            userInput: '初期化を追加して',
            currentProgram: '# Stage\n# ブロックなし',
            currentAssets: {targets: []},
            history: [{role: 'user', content: '前の依頼'}],
            explanationLength: 'short'
        });
        expect(payload.messages).toBeUndefined();
        expect(payload.model).toBeUndefined();
        expect(payload.systemPrompt).toBeUndefined();
    });
});

describe('Chat request lifecycle', () => {
    const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
    let originalFetch;
    let originalEventSource;

    const makeChatWrapper = ({
        onAddMessage = jest.fn(),
        onSetIsLoading = jest.fn(),
        onSetPendingRequestId = jest.fn(),
        projectJson = {
            targets: [{
                isStage: true,
                name: 'Stage',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [],
                sounds: []
            }]
        }
    } = {}) => shallow(
        <ChatComponent
            explanationLength="normal"
            hasConsented
            isLoading={false}
            messages={[]}
            pendingRequestId={null}
            vm={{
                editingTarget: {id: 'stage'},
                loadProject: jest.fn(() => Promise.resolve()),
                refreshWorkspace: jest.fn(),
                toJSON: jest.fn(() => projectJson)
            }}
            onAddMessage={onAddMessage}
            onClearHistory={jest.fn()}
            onClose={jest.fn()}
            onSetExplanationLength={jest.fn()}
            onSetHasConsented={jest.fn()}
            onSetIsLoading={onSetIsLoading}
            onSetPendingRequestId={onSetPendingRequestId}
        />
    );

    beforeEach(() => {
        originalFetch = global.fetch;
        originalEventSource = global.EventSource;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        global.EventSource = originalEventSource;
        jest.restoreAllMocks();
    });

    test('keeps processing a reply after the chat component unmounts', async () => {
        const onAddMessage = jest.fn();
        const onSetIsLoading = jest.fn();
        const resolveSpriteSelection = jest.fn();
        const spriteSelectionPromise = new Promise(resolve => {
            resolveSpriteSelection.mockImplementation(() => resolve({
                addedSpriteNames: [],
                reusedSpriteNames: []
            }));
        });

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                choices: [{
                    message: {
                        content: '返答です。'
                    }
                }]
            })
        }));

        const wrapper = makeChatWrapper({onAddMessage, onSetIsLoading});
        const instance = wrapper.instance();
        instance._addRequestedLibrarySprites = jest.fn(() => spriteSelectionPromise);
        wrapper.setState({inputValue: 'こんにちは'});

        const sendPromise = instance.handleSend();
        wrapper.unmount();
        resolveSpriteSelection();

        await sendPromise;
        await flushPromises();
        await flushPromises();

        expect(onAddMessage).toHaveBeenCalledWith({
            text: 'こんにちは',
            sender: 'user'
        });
        expect(onAddMessage).toHaveBeenCalledWith({
            text: '返答です。',
            sender: 'bot'
        });
        expect(onSetIsLoading).toHaveBeenCalledWith(true);
        expect(onSetIsLoading).toHaveBeenCalledWith(false);
    });

    test('keeps processing an approved SSE reply after the chat component unmounts', async () => {
        const onAddMessage = jest.fn();
        const onSetIsLoading = jest.fn();
        const onSetPendingRequestId = jest.fn();
        const eventListeners = {};
        const close = jest.fn();

        global.EventSource = jest.fn(() => ({
            addEventListener: (name, handler) => {
                eventListeners[name] = handler;
            },
            close
        }));
        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                pending: true,
                request_id: 'request-1'
            })
        }));

        const wrapper = makeChatWrapper({
            onAddMessage,
            onSetIsLoading,
            onSetPendingRequestId
        });
        const instance = wrapper.instance();
        instance._addRequestedLibrarySprites = jest.fn(() => Promise.resolve({
            addedSpriteNames: [],
            reusedSpriteNames: []
        }));
        wrapper.setState({inputValue: '承認して'});

        const sendPromise = instance.handleSend();
        wrapper.unmount();

        await sendPromise;
        await flushPromises();
        eventListeners.approved({
            data: JSON.stringify({
                response: '承認済み返答です。'
            })
        });
        await flushPromises();

        expect(close).toHaveBeenCalled();
        expect(onSetPendingRequestId).toHaveBeenCalledWith('request-1');
        expect(onSetPendingRequestId).toHaveBeenCalledWith(null);
        expect(onSetIsLoading).toHaveBeenCalledWith(false);
        expect(onAddMessage).toHaveBeenCalledWith({
            text: '承認済み返答です。',
            sender: 'bot'
        });
    });

    test('keeps surfacing request errors after the chat component unmounts', async () => {
        const onAddMessage = jest.fn();
        const onSetIsLoading = jest.fn();
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = jest.fn(() => Promise.reject(new Error('network failed')));

        const wrapper = makeChatWrapper({onAddMessage, onSetIsLoading});
        const instance = wrapper.instance();
        instance._addRequestedLibrarySprites = jest.fn(() => Promise.resolve({
            addedSpriteNames: [],
            reusedSpriteNames: []
        }));
        wrapper.setState({inputValue: '失敗テスト'});

        const sendPromise = instance.handleSend();
        wrapper.unmount();

        await sendPromise;
        await flushPromises();

        expect(onAddMessage).toHaveBeenCalledWith({
            text: 'An error occurred while contacting the AI.',
            sender: 'bot'
        });
        expect(onSetIsLoading).toHaveBeenCalledWith(false);
    });
});
