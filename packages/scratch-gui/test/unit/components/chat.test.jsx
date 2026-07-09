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
    buildSpriteAssetsAddedMessage,
    buildSpriteAddedMessage,
    getApiErrorMessage,
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

    test('keeps ScratchBlocks fences as Scratch blocks', () => {
        const component = shallow(
            <div>{renderMessageContent('説明\n```scratchblocks\n⚑ が押されたとき\n```')}</div>
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

    test('builds a bot message after library sprite assets are added', () => {
        expect(buildSpriteAssetsAddedMessage([{
            targetName: 'ネコ',
            costumes: ['cat-b'],
            sounds: ['Meow']
        }])).toEqual({
            text: 'ネコにcat-bのコスチュームを追加しました。ネコにMeowの音を追加しました。',
            sender: 'bot'
        });
    });

    test('keeps source names when Scratch renames added costumes', () => {
        expect(buildSpriteAssetsAddedMessage([{
            targetName: 'ネコ',
            costumes: [{name: 'コスチューム2', sourceName: 'Dog1-a'}],
            sounds: []
        }])).toEqual({
            text: 'ネコにコスチューム2（Dog1-a）のコスチュームを追加しました。',
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

describe('API error messages', () => {
    test('shows a friendly message for rate limits', () => {
        expect(getApiErrorMessage({
            code: 'rate_limited',
            message: 'raw provider message'
        })).toBe('OpenAI APIの利用上限に達しました。少し時間をおいてから、もう一度試してください。');
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
        vmOverrides = {},
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
                toJSON: jest.fn(() => projectJson),
                ...vmOverrides
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
        const resolveSpritePlanning = jest.fn();
        const spritePlanningPromise = new Promise(resolve => {
            resolveSpritePlanning.mockImplementation(() => resolve({
                addedSpriteNames: [],
                reusedSpriteNames: [],
                addedAssetSummaries: []
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
        instance._applyPlannedSpriteAssets = jest.fn(() => spritePlanningPromise);
        wrapper.setState({inputValue: 'こんにちは'});

        const sendPromise = instance.handleSend();
        wrapper.unmount();
        resolveSpritePlanning();

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
        instance._applyPlannedSpriteAssets = jest.fn(() => Promise.resolve({
            addedSpriteNames: [],
            reusedSpriteNames: [],
            addedAssetSummaries: []
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
        instance._applyPlannedSpriteAssets = jest.fn(() => Promise.resolve({
            addedSpriteNames: [],
            reusedSpriteNames: [],
            addedAssetSummaries: []
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

    test('skips sprite planning when server-side automatic sprite add is off', async () => {
        const onAddMessage = jest.fn();

        global.fetch = jest.fn(url => {
            if (String(url).includes('/api/status')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({sprite_auto_add_enabled: false})
                });
            }
            return Promise.resolve({
                json: () => Promise.resolve({
                    choices: [{
                        message: {
                            content: '返答です。'
                        }
                    }]
                })
            });
        });

        const wrapper = makeChatWrapper({onAddMessage});
        const instance = wrapper.instance();
        wrapper.setState({inputValue: '敵を追加して'});

        await instance.handleSend();
        await flushPromises();

        expect(global.fetch.mock.calls.map(call => call[0]).some(url => (
            String(url).includes('/api/plan-sprites')
        ))).toBe(false);
        expect(global.fetch.mock.calls.map(call => call[0]).some(url => (
            String(url).includes('/api/llm')
        ))).toBe(true);
        expect(onAddMessage).toHaveBeenCalledWith({
            text: '返答です。',
            sender: 'bot'
        });
    });

    test('does not request a dog sprite after directly adding a dog sound', async () => {
        const onAddMessage = jest.fn();
        const addSound = jest.fn(() => Promise.resolve());
        const projectJson = {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [{name: 'cat-a'}],
                sounds: [{name: 'Meow'}]
            }]
        };

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                choices: [{
                    message: {
                        content: '返答です。'
                    }
                }]
            })
        }));

        const wrapper = makeChatWrapper({
            onAddMessage,
            projectJson,
            vmOverrides: {
                editingTarget: {id: 'cat-id', name: 'ネコ'},
                addSound
            }
        });
        const instance = wrapper.instance();
        instance._planRequiredSprites = jest.fn(() => Promise.resolve({
            requiredSprites: ['犬の音'],
            existingSpritesToReuse: [],
            forbiddenSpriteAdditions: [],
            reason: ''
        }));
        wrapper.setState({inputValue: 'スペースキーを押したら犬の音が流れるようにして'});

        await instance.handleSend();
        await flushPromises();

        expect(addSound).toHaveBeenCalledWith(
            expect.objectContaining({name: 'Dog1'}),
            'cat-id'
        );
        expect(onAddMessage).toHaveBeenCalledWith({
            text: 'ネコにDog1の音を追加しました。',
            sender: 'bot'
        });
    });

    test('does not request a dog sprite after directly adding dog costumes', async () => {
        const onAddMessage = jest.fn();
        const addCostume = jest.fn(() => Promise.resolve());
        const projectJson = {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [{name: 'cat-a'}],
                sounds: []
            }]
        };

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                choices: [{
                    message: {
                        content: '返答です。'
                    }
                }]
            })
        }));

        const wrapper = makeChatWrapper({
            onAddMessage,
            projectJson,
            vmOverrides: {
                editingTarget: {id: 'cat-id', name: 'ネコ'},
                addCostume
            }
        });
        const instance = wrapper.instance();
        instance._planRequiredSprites = jest.fn(() => Promise.resolve({
            requiredSprites: ['犬のコスチューム'],
            existingSpritesToReuse: [],
            forbiddenSpriteAdditions: [],
            reason: ''
        }));
        wrapper.setState({inputValue: 'ネコに犬のコスチュームを追加して'});

        await instance.handleSend();
        await flushPromises();

        expect(addCostume).toHaveBeenCalledWith(
            '35cd78a8a71546a16c530d0b2d7d5a7f.svg',
            expect.objectContaining({name: 'Dog1-a'}),
            'cat-id',
            2
        );
        expect(addCostume).toHaveBeenCalledWith(
            'd5a72e1eb23a91df4b53c0b16493d1e6.svg',
            expect.objectContaining({name: 'Dog1-b'}),
            'cat-id',
            2
        );
        expect(onAddMessage).toHaveBeenCalledWith({
            text: 'ネコにDog1-aのコスチュームを追加しました。ネコにDog1-bのコスチュームを追加しました。',
            sender: 'bot'
        });
    });

    test('passes renamed added costume context to the program LLM', async () => {
        const onAddMessage = jest.fn();
        const addCostume = jest.fn(() => Promise.resolve());
        const beforeProjectJson = {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [{name: 'cat-a'}],
                sounds: []
            }]
        };
        const afterProjectJson = {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [
                    {name: 'cat-a'},
                    {
                        name: 'コスチューム2',
                        md5ext: '35cd78a8a71546a16c530d0b2d7d5a7f.svg'
                    }
                ],
                sounds: []
            }]
        };
        const toJSON = jest.fn()
            .mockReturnValueOnce(beforeProjectJson)
            .mockReturnValueOnce(beforeProjectJson)
            .mockReturnValueOnce(afterProjectJson)
            .mockReturnValue(afterProjectJson);

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                choices: [{
                    message: {
                        content: '返答です。'
                    }
                }]
            })
        }));

        const wrapper = makeChatWrapper({
            onAddMessage,
            vmOverrides: {
                editingTarget: {id: 'cat-id', name: 'ネコ'},
                addCostume,
                toJSON
            }
        });
        const instance = wrapper.instance();
        instance._planRequiredSprites = jest.fn(() => Promise.resolve({
            requiredSprites: ['犬のコスチューム'],
            existingSpritesToReuse: [],
            forbiddenSpriteAdditions: [],
            reason: ''
        }));
        wrapper.setState({inputValue: 'スペースキーで犬に変身して'});

        await instance.handleSend();
        await flushPromises();

        const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(payload.userInput).toContain('追加済みコスチューム');
        expect(payload.userInput).toContain('「コスチューム2」');
        expect(payload.userInput).toContain('Dog1-a');
        expect(payload.currentAssets.targets[0].costumes).toContain('コスチューム2');
    });

    test('applies planner asset additions without legacy sprite selection', async () => {
        const onAddMessage = jest.fn();
        const addSound = jest.fn(() => Promise.resolve());
        const projectJson = {
            targets: [{
                id: 'cat-id',
                isStage: false,
                name: 'ネコ',
                variables: {},
                lists: {},
                blocks: {},
                comments: {},
                costumes: [{name: 'cat-a'}],
                sounds: [{name: 'Meow'}]
            }]
        };

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({
                choices: [{
                    message: {
                        content: '返答です。'
                    }
                }]
            })
        }));

        const wrapper = makeChatWrapper({
            onAddMessage,
            projectJson,
            vmOverrides: {
                editingTarget: {id: 'cat-id', name: 'ネコ'},
                addSound
            }
        });
        const instance = wrapper.instance();
        instance._planRequiredSprites = jest.fn(() => Promise.resolve({
            requiredSprites: ['犬の音'],
            sprites: [],
            assetAdditions: [{
                targetName: 'ネコ',
                sourceSpriteName: 'Dog1',
                costumeNames: [],
                soundNames: ['dog1']
            }],
            existingSpritesToReuse: [],
            forbiddenSpriteAdditions: [],
            reason: ''
        }));
        wrapper.setState({inputValue: 'ネコにライブラリの音を追加して'});

        await instance.handleSend();
        await flushPromises();

        expect(addSound).toHaveBeenCalledWith(
            expect.objectContaining({name: 'dog1'}),
            'cat-id'
        );
        expect(onAddMessage).toHaveBeenCalledWith({
            text: 'ネコにdog1の音を追加しました。',
            sender: 'bot'
        });
    });

    test('reuses the imported program repair for the matching explanatory Scratch fence', async () => {
        const onAddMessage = jest.fn();
        const onSetIsLoading = jest.fn();
        const sourceCode = '[右向き v] キーが押されたとき\nx座標を (10) ずつ変える';

        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                enabled: true,
                repaired: true,
                code: '[右向き矢印 v] キーが押されたとき\nx座標を (10) ずつ変える'
            })
        }));

        const wrapper = makeChatWrapper({onAddMessage, onSetIsLoading});
        const instance = wrapper.instance();

        await instance._handleScratchBlocksResponse([
            '説明です。',
            '```scratch',
            sourceCode,
            '```',
            '```scratch-project',
            sourceCode,
            '```'
        ].join('\n'), instance.props.vm.toJSON(), true);

        expect(onAddMessage).toHaveBeenCalledWith({
            text: [
                '説明です。',
                '```scratch',
                '[右向き矢印 v] キーが押されたとき',
                'x座標を (10) ずつ変える',
                '```'
            ].join('\n'),
            sender: 'bot'
        });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(onSetIsLoading).toHaveBeenCalledWith(false);
    });
});
