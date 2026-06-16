import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import { FormattedMessage } from 'react-intl';
import classNames from 'classnames';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import styles from './chat.css';
import sendIcon from './icon--send.svg';
import trashIcon from './icon--trash.svg';
import chatCloseIcon from './icon--chat-close.svg';
import {
    closeChat
} from '../../reducers/modals';
import {
    addMessage,
    clearHistory,
    setExplanationLength,
    setHasConsented,
    setIsLoading,
    setPendingRequestId
} from '../../reducers/chat-history';

import ScratchBlockRenderer, {
    extractCustomBlockSignatures
} from './scratch-block-renderer.jsx';
import ScratchTextCompiler from '../../lib/scratch-text-compiler';
import validateScratchProject from '../../lib/scratch-project-validator';
import {
    addLibrarySprite,
    buildExistingSpriteNames,
    buildProjectAssetSummary,
    buildSpriteCatalog
} from '../../lib/automatic-sprite-selection';

export const markdownToSafeHtml = text => DOMPurify.sanitize(
    marked.parse(text, {
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    }),
    {
        ALLOWED_ATTR: ['href', 'title'],
        ALLOWED_TAGS: [
            'a', 'blockquote', 'br', 'code', 'del', 'em',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
            'li', 'ol', 'p', 'pre', 'strong',
            'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul'
        ]
    }
);

/* eslint-disable react/no-danger */
export const renderMessageContent = text => {
    // Only explanatory snippets render in chat. The scratch-project fence is
    // machine-readable output used to update the VM and is hidden from users.
    const visibleText = text.replace(/```scratch-project\s*[\s\S]*?```/giu, '');
    const customBlockSignatures = extractCustomBlockSignatures(visibleText);
    const parts = visibleText.split(/(```scratch[ \t]*\r?\n[\s\S]*?```)/gu);
    return parts.map((part, index) => {
        if (/^```scratch[ \t]*\r?\n/u.test(part)) {
            // Remove the markers
            const code = part.replace(/^```scratch[ \t]*\r?\n|```$/gu, '');
            return (<ScratchBlockRenderer
                key={index}
                code={code}
                customBlockSignatures={customBlockSignatures}
            />);
        }
        if (!part) return null;
        return (
            <div
                key={index}
                className={styles.markdownContent}
                dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(part) }}
            />
        );
    });
};
/* eslint-enable react/no-danger */

// API base URL is loaded from the .env file via REACT_APP_API_BASE_URL.
// Create a .env file in packages/scratch-gui/ with:
//   REACT_APP_API_BASE_URL=https://your-domain.example.com
const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/llm`;
const SYNTAX_REPAIR_URL = `${process.env.REACT_APP_API_BASE_URL}/api/repair-scratch`;
const SPRITE_SELECTION_URL = `${process.env.REACT_APP_API_BASE_URL}/api/select-sprite`;

export const buildLlmRequestPayload = ({
    userInput,
    currentProgram,
    currentAssets,
    history,
    explanationLength
}) => ({
    userInput,
    currentProgram,
    currentAssets,
    history,
    explanationLength
});

export const buildSpriteAddedMessage = spriteNames => ({
    text: `${(Array.isArray(spriteNames) ? spriteNames : [spriteNames]).join('、')}を追加しました。`,
    sender: 'bot'
});

export class ChatComponent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            inputValue: '',
            disclaimerTooltip: null,
            disclaimerTooltipVisible: false
        };
        this.textareaRef = React.createRef();
        this.disclaimerInfoRef = React.createRef();
        this.handleSend = this.handleSend.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleClearHistory = this.handleClearHistory.bind(this);
        this.handleShowDisclaimerTooltip = this.handleShowDisclaimerTooltip.bind(this);
        this.handleHideDisclaimerTooltip = this.handleHideDisclaimerTooltip.bind(this);
    }

    componentDidMount() {
        this._isMounted = true;
    }

    componentWillUnmount() {
        this._isMounted = false;
        clearTimeout(this.disclaimerTooltipTimer);
    }

    handleClearHistory() {
        this.props.onClearHistory();
    }

    handleShowDisclaimerTooltip() {
        if (!this.disclaimerInfoRef.current) return;

        clearTimeout(this.disclaimerTooltipTimer);
        const iconRect = this.disclaimerInfoRef.current.getBoundingClientRect();
        const tooltipWidth = 260;
        const tooltipHeight = 58;
        const viewportMargin = 8;
        const left = Math.max(
            viewportMargin,
            Math.min(
                window.innerWidth - tooltipWidth - viewportMargin,
                iconRect.left + (iconRect.width / 2) - (tooltipWidth / 2)
            )
        );
        const showAbove = iconRect.bottom + viewportMargin + tooltipHeight > window.innerHeight;

        this.setState({
            disclaimerTooltip: {
                left,
                top: showAbove ? iconRect.top - viewportMargin : iconRect.bottom + viewportMargin,
                showAbove
            },
            disclaimerTooltipVisible: true
        });
    }

    handleHideDisclaimerTooltip() {
        this.setState({ disclaimerTooltipVisible: false });
        clearTimeout(this.disclaimerTooltipTimer);
        this.disclaimerTooltipTimer = setTimeout(() => {
            if (this._isMounted) this.setState({ disclaimerTooltip: null });
        }, 160);
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.handleSend();
        }
    }

    handleInputChange(e) {
        const textarea = e.target;
        this.setState({ inputValue: textarea.value });

        // 高さを一度リセット
        textarea.style.height = '30px';

        // スクロール量を反映。ただし最小30px、最大300pxに制限
        const newHeight = Math.max(30, Math.min(textarea.scrollHeight, 150));
        textarea.style.height = `${newHeight}px`;
    }

    async _addRequestedLibrarySprites (userInput) {
        try {
            const project = this.props.vm.toJSON();
            const response = await fetch(SPRITE_SELECTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify({
                    userInput,
                    spriteCatalog: buildSpriteCatalog(),
                    existingSprites: buildExistingSpriteNames(project)
                })
            });
            if (!response.ok) throw new Error(`Sprite selection returned ${response.status}.`);
            const data = await response.json();
            const spriteSelections = Array.isArray(data.sprites) ?
                data.sprites :
                (Array.isArray(data.spriteNames) ? data.spriteNames.map(spriteName => ({spriteName})) : []);
            const addedSpriteNames = [];
            const reusedSpriteNames = [];
            for (const selection of spriteSelections) {
                if (!selection) continue;
                if (selection.existingTargetName) {
                    reusedSpriteNames.push(selection.existingTargetName);
                    continue;
                }
                // Add sequentially so VM target updates do not race each other.
                const addedSpriteName = await addLibrarySprite(
                    this.props.vm,
                    selection.spriteName,
                    selection.japaneseName
                );
                if (addedSpriteName) addedSpriteNames.push(addedSpriteName);
            }

            return {addedSpriteNames, reusedSpriteNames};
        } catch (error) {
            console.warn('Automatic sprite selection was unavailable:', error);
            return {addedSpriteNames: [], reusedSpriteNames: []};
        }
    }

    async handleSend() {
        const { inputValue } = this.state;
        if (inputValue.trim() === '' || this.props.isLoading) return;

        const userMessage = { text: inputValue, sender: 'user' };
        this.props.onAddMessage(userMessage);

        this.setState({ inputValue: '' });
        this.props.onSetIsLoading(true);

        if (this.textareaRef.current) {
            this.textareaRef.current.style.height = '30px';
        }

        const {addedSpriteNames, reusedSpriteNames} = await this._addRequestedLibrarySprites(inputValue);
        if (!this._isMounted) return;
        if (addedSpriteNames.length > 0) {
            this.props.vm.refreshWorkspace();
            this.props.onAddMessage(buildSpriteAddedMessage(addedSpriteNames));
        }
        const selectedSpriteContext = [
            addedSpriteNames.length > 0 ?
                `追加済みスプライト: ${addedSpriteNames.join('、')}` :
                '',
            reusedSpriteNames.length > 0 ?
                `既存スプライトを再利用: ${reusedSpriteNames.join('、')}` :
                ''
        ].filter(Boolean).join('\n');
        const llmUserInput = selectedSpriteContext ?
            `${inputValue}\n\n${selectedSpriteContext}` :
            inputValue;

        const projectJson = this.props.vm.toJSON();
        const projectScratchBlocks = ScratchTextCompiler.projectToScratchBlocks(projectJson);
        const history = this.props.messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));

        fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(buildLlmRequestPayload({
                userInput: llmUserInput,
                currentProgram: projectScratchBlocks,
                currentAssets: buildProjectAssetSummary(projectJson),
                history,
                explanationLength: this.props.explanationLength
            }))
        })
            .then(response => response.json())
            .then(data => {
                if (!this._isMounted) return;

                // ── AI機能が無効の場合 ──
                if (data.disabled) {
                    const botMessage = { text: '【お知らせ】AI機能は現在先生によって停止されています。', sender: 'bot' };
                    this.props.onAddMessage(botMessage);
                    this.props.onSetIsLoading(false);
                    return;
                }

                // ── 承認待ちの場合：SSEで結果を待つ ──
                if (data.pending && data.request_id) {
                    const requestId = data.request_id;
                    this.props.onSetPendingRequestId(requestId);

                    const evtSource = new EventSource(`${API_URL.replace('/api/llm', '')}/api/events/${requestId}`);

                    evtSource.addEventListener('approved', event => {
                        evtSource.close();
                        if (!this._isMounted) return;
                        this.props.onSetIsLoading(false);
                        this.props.onSetPendingRequestId(null);

                        const approvedData = JSON.parse(event.data);
                        const fullResponse = approvedData.response || '';

                        // 「承認待ち」メッセージを「承認済み」に置き換える処理（追記形式）
                        this._handleApprovedResponse(fullResponse);
                    });

                    evtSource.addEventListener('rejected', event => {
                        evtSource.close();
                        if (!this._isMounted) return;
                        this.props.onSetIsLoading(false);
                        this.props.onSetPendingRequestId(null);

                        const rejectedData = JSON.parse(event.data);
                        const reason = rejectedData.reason || '先生がこの回答の表示を許可しませんでした。';
                        const errorMsg = { text: `⚠️ ${reason}`, sender: 'bot' };
                        this.props.onAddMessage(errorMsg);
                    });

                    evtSource.onerror = () => {
                        evtSource.close();
                        if (!this._isMounted) return;
                        this.props.onSetIsLoading(false);
                        this.props.onSetPendingRequestId(null);
                        const errorMsg = { text: '⚠️ 先生との通信が切断されました。もう一度試してください。', sender: 'bot' };
                        this.props.onAddMessage(errorMsg);
                    };

                    return; // SSEで処理するのでここで終了
                }

                let fullResponse = 'Sorry, I could not get a response.';

                if (data.error === "This content is strictly prohibited." || data.error === "This content violates our safety policies.") {
                    fullResponse = "【警告】不適切な表現が含まれているため、AIは回答できません。";
                } else if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
                    fullResponse = data.choices[0].message.content;
                } else if (data && data.error) {
                    console.error('OpenAI API Error:', data.error);
                    fullResponse = `Error: ${data.error.message || data.error} `;
                }

                this._handleScratchBlocksResponse(fullResponse, projectJson, true);
            })
            .catch(error => {
                if (!this._isMounted) return;
                console.error('Error fetching from OpenAI API:', error);
                const botMessage = { text: 'An error occurred while contacting the AI.', sender: 'bot' };
                this.props.onAddMessage(botMessage);
                this.props.onSetIsLoading(false);
            });
    }

    async _repairScratchCode(scratchCode, diagnostics) {
        try {
            const response = await fetch(SYNTAX_REPAIR_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify({
                    code: scratchCode,
                    diagnostics
                })
            });
            if (!response.ok) throw new Error(`Syntax repair returned ${response.status}.`);
            const data = await response.json();
            return data.repaired && data.code ? data.code : null;
        } catch (error) {
            console.warn('ScratchBlocks syntax repair was unavailable:', error);
            return null;
        }
    }

    _compileScratchCode(scratchCode, currentProject, useFuzzyRepair) {
        const project = ScratchTextCompiler.compile(
            scratchCode,
            currentProject,
            this.props.vm.editingTarget && this.props.vm.editingTarget.id,
            {useFuzzyRepair}
        );
        return {
            project,
            diagnostics: ScratchTextCompiler.getDiagnostics()
        };
    }

    async _handleScratchBlocksResponse(fullResponse, projectJson, shouldStopLoading) {
        const scratchCode = ScratchTextCompiler.extractScratchBlocks(fullResponse);
        const displayResponse = fullResponse
            .replace(/```scratch-project\s*[\s\S]*?```/giu, '')
            .replace(/```json\s*[\s\S]*?```/giu, '')
            .replace('[SCRATCH-PROJECT-JSON]', '')
            .trim();

        this.props.onAddMessage({
            text: displayResponse || fullResponse,
            sender: 'bot'
        });

        if (!scratchCode) {
            if (shouldStopLoading) this.props.onSetIsLoading(false);
            return;
        }

        let newProjectJson = null;
        let compilerDiagnostics = [];
        try {
            const currentProject = typeof projectJson === 'string' ?
                JSON.parse(projectJson) :
                projectJson;
            const initial = this._compileScratchCode(scratchCode, currentProject, false);
            let compiled = initial;
            if (initial.diagnostics.length > 0) {
                const repairedCode = await this._repairScratchCode(scratchCode, initial.diagnostics);
                const originalFuzzy = this._compileScratchCode(scratchCode, currentProject, true);
                if (repairedCode) {
                    const repairedFuzzy = this._compileScratchCode(repairedCode, currentProject, true);
                    compiled = repairedFuzzy.diagnostics.length <= originalFuzzy.diagnostics.length ?
                        repairedFuzzy :
                        originalFuzzy;
                } else {
                    compiled = originalFuzzy;
                }
            }
            newProjectJson = compiled.project;
            compilerDiagnostics = compiled.diagnostics;
            const hadVisibleScripts = currentProject.targets.some(target => (
                Object.values(target.blocks || {}).some(block => block.topLevel)
            ));
            const hasVisibleScripts = newProjectJson.targets.some(target => (
                Object.values(target.blocks || {}).some(block => block.topLevel)
            ));
            if (hadVisibleScripts && !hasVisibleScripts) {
                throw new Error('ScratchBlocks response did not contain visible scripts.');
            }
            const validation = validateScratchProject(newProjectJson);
            if (!validation.valid) {
                throw new Error(validation.errors.slice(0, 3).join('\n'));
            }
        } catch (e) {
            console.error('Error compiling ScratchBlocks response:', e);
            this.props.onAddMessage({
                text: `ScratchBlocks記法をプログラムに変換できませんでした。\n${e.message}`,
                sender: 'bot'
            });
            if (shouldStopLoading) this.props.onSetIsLoading(false);
            return;
        }

        try {
            await this.props.vm.loadProject(newProjectJson);
            if (!this._isMounted) return;
            this.props.vm.refreshWorkspace();
            if (compilerDiagnostics.length > 0) {
                this.props.onAddMessage({
                    text: `一部のコードは安全のため変更しませんでした。\n${compilerDiagnostics.join('\n')}`,
                    sender: 'bot'
                });
            }
            if (shouldStopLoading) this.props.onSetIsLoading(false);
        } catch (e) {
            if (!this._isMounted) return;
            console.error('Error loading ScratchBlocks project:', e);
            this.props.onAddMessage({ text: 'プロジェクトの読み込みに失敗しました。', sender: 'bot' });
            if (shouldStopLoading) this.props.onSetIsLoading(false);
        }
    }

    // 管理者に承認されたレスポンスを処理するメソッド
    _handleApprovedResponse(fullResponse) {
        this._handleScratchBlocksResponse(fullResponse, this.props.vm.toJSON(), false);
    }

    render() {
        const { inputValue, disclaimerTooltip, disclaimerTooltipVisible } = this.state;
        const { messages, isLoading, hasConsented, pendingRequestId, explanationLength } = this.props;

        if (!hasConsented) {
            return (
                <div className={styles.container}>
                    <div
                        className={styles.header}
                        onMouseDown={this.props.onDragHeader}
                        style={{ cursor: 'move' }}
                    >
                        <button
                            className={styles.closeButton}
                            onClick={this.props.onClose}
                        >
                            <img
                                alt="Close Chat"
                                src={chatCloseIcon}
                                style={{ width: '24px', height: '24px' }}
                            />
                        </button>
                        <div className={styles.headerTitleGroup}>
                            <div className={styles.headerTitle}>{'AIチャットを使う前に'}</div>
                        </div>
                        <div className={styles.headerActionPlaceholder} />
                    </div>
                    <div className={styles.body} style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#575E75' }}>
                        <p style={{ fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '20px' }}>
                            このAIチャット機能は、OpenAI社のサービスを利用しています。<br />
                            お子様が安全に利用できるよう対策を行っていますが、未成年の方は保護者の方の監修の上でご利用ください。<br />
                            <br />
                            <strong>個人情報（名前、住所、電話番号など）は絶対に入力しないでください。</strong>
                        </p>
                        <button
                            className={styles.sendButton}
                            style={{ width: 'auto', padding: '10px 20px', borderRadius: '5px', color: 'white' }}
                            onClick={() => this.props.onSetHasConsented(true)}
                        >
                            {'同意して始める'}
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.container}>
                <div
                    className={styles.header}
                    onMouseDown={this.props.onDragHeader}
                    style={{ cursor: 'move' }}
                >
                    <button
                        className={styles.closeButton}
                        onClick={this.props.onClose}
                    >
                        <img
                            alt="Close Chat"
                            src={chatCloseIcon}
                            style={{ width: '24px', height: '24px' }}
                        />
                    </button>
                    <div className={styles.headerTitleGroup}>
                        <div className={styles.headerTitle}>{'AIアシスタント'}</div>
                        <div
                            ref={this.disclaimerInfoRef}
                            aria-label="AI利用時の注意"
                            className={styles.disclaimerInfo}
                            role="note"
                            tabIndex="0"
                            onBlur={this.handleHideDisclaimerTooltip}
                            onFocus={this.handleShowDisclaimerTooltip}
                            onMouseEnter={this.handleShowDisclaimerTooltip}
                            onMouseLeave={this.handleHideDisclaimerTooltip}
                        >
                            {'i'}
                        </div>
                    </div>
                    <button
                        className={styles.clearButton}
                        disabled={isLoading || messages.length === 0}
                        onClick={this.handleClearHistory}
                    >
                        <img
                            alt="Clear History"
                            src={trashIcon}
                            style={{width: '20px', height: '20px'}}
                        />
                    </button>
                </div>
                <div className={styles.body}>
                    <div className={styles.messages}>
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={classNames(styles.message, styles[msg.sender])}
                            >
                                {renderMessageContent(msg.text)}
                            </div>
                        ))}
                        {isLoading && !pendingRequestId && <div className={styles.loading}>{'...'}</div>}
                    </div>
                    <div className={styles.inputContainer}>
                        <FormattedMessage
                            defaultMessage="メッセージを入力..."
                            description="Placeholder text for the chat input"
                            id="gui.chat.placeholder"
                        >
                            {placeholder => (
                                <textarea
                                    ref={this.textareaRef}
                                    className={styles.input}
                                    disabled={isLoading || !!pendingRequestId}
                                    type="text"
                                    placeholder={placeholder}
                                    value={inputValue}
                                    onChange={this.handleInputChange}
                                    onKeyDown={this.handleKeyPress}
                                />
                            )}
                        </FormattedMessage>
                        <button
                            className={styles.sendButton}
                            disabled={isLoading}
                            onClick={this.handleSend}
                        >
                            <img
                                alt="Send"
                                src={sendIcon}
                                style={{ width: '20px', height: '20px' }}
                            />
                        </button>
                    </div>
                </div>
                {disclaimerTooltip && ReactDOM.createPortal(
                    <div
                        className={classNames(styles.disclaimerTooltip, {
                            [styles.disclaimerTooltipVisible]: disclaimerTooltipVisible
                        })}
                        style={{
                            left: disclaimerTooltip.left,
                            top: disclaimerTooltip.top,
                            transform: disclaimerTooltip.showAbove ? 'translateY(-100%)' : 'none'
                        }}
                    >
                        {'AIはまちがえることがあります。個人情報は入力しないでください。'}
                    </div>,
                    document.body
                )}
            </div>
        );
    }
}

ChatComponent.propTypes = {
    hasConsented: PropTypes.bool,
    explanationLength: PropTypes.oneOf(['long', 'normal', 'short']),
    isLoading: PropTypes.bool,
    pendingRequestId: PropTypes.string,
    onSetHasConsented: PropTypes.func.isRequired,
    onSetIsLoading: PropTypes.func.isRequired,
    onSetPendingRequestId: PropTypes.func.isRequired,
    onSetExplanationLength: PropTypes.func.isRequired,
    messages: PropTypes.arrayOf(PropTypes.shape({
        text: PropTypes.string,
        sender: PropTypes.string
    })),
    onAddMessage: PropTypes.func.isRequired,
    onClearHistory: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onDragHeader: PropTypes.func,
    vm: PropTypes.shape({
        shareBlocksToTarget: PropTypes.func,
        editingTarget: PropTypes.shape({
            id: PropTypes.string
        }),
        refreshWorkspace: PropTypes.func,
        toJSON: PropTypes.func, // Added for vm.toJSON
        loadProject: PropTypes.func // Added for vm.loadProject
    }).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    messages: state.scratchGui.chatHistory.messages,
    hasConsented: state.scratchGui.chatHistory.hasConsented,
    isLoading: state.scratchGui.chatHistory.isLoading,
    pendingRequestId: state.scratchGui.chatHistory.pendingRequestId,
    explanationLength: state.scratchGui.chatHistory.explanationLength
});

const mapDispatchToProps = (dispatch, ownProps) => ({
    onClose: ownProps.onClose || (() => dispatch(closeChat())),
    onAddMessage: message => dispatch(addMessage(message)),
    onClearHistory: () => dispatch(clearHistory()),
    onSetHasConsented: hasConsented => dispatch(setHasConsented(hasConsented)),
    onSetIsLoading: isLoading => dispatch(setIsLoading(isLoading)),
    onSetPendingRequestId: id => dispatch(setPendingRequestId(id)),
    onSetExplanationLength: explanationLength => dispatch(setExplanationLength(explanationLength))
});

export default connect(mapStateToProps, mapDispatchToProps)(ChatComponent);
