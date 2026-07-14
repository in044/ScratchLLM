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
    addLibraryCostumeToEditingTarget,
    addLibraryCostumeToTarget,
    addMissingLibrarySpriteAssets,
    addLibrarySoundToEditingTarget,
    addLibrarySoundToTarget,
    addLibrarySprite,
    buildExistingSpriteNames,
    buildCostumeCatalog,
    buildProjectAssetSummary,
    buildSpriteCatalog,
    buildSoundCatalog,
    findExistingLibrarySpriteName,
    inferDirectLibraryCostumes,
    inferRequiredSpriteAssets,
    isAutomaticCostumeAddEnabled,
    isAutomaticSoundAddEnabled,
    isAutomaticSpriteAddEnabled
} from '../../lib/automatic-sprite-selection';
import {
    addLibraryBackdrop,
    buildBackdropCatalog,
    buildExistingBackdropNames,
    isAutomaticBackdropAddEnabled
} from '../../lib/automatic-backdrop-selection';
import {
    getBackdropAutoAddPreference,
    getBackdropLibraryUseJapanesePreference,
    getCostumeAutoAddPreference,
    getCostumeLibraryUseJapanesePreference,
    getSoundAutoAddPreference,
    getSoundLibraryUseJapanesePreference,
    getSpriteAutoAddPreference
} from '../../lib/user-preferences';

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
    const parts = visibleText.split(/(```(?:scratch|scratchblocks)[ \t]*\r?\n[\s\S]*?```)/gu);
    return parts.map((part, index) => {
        if (/^```(?:scratch|scratchblocks)[ \t]*\r?\n/u.test(part)) {
            // Remove the markers
            const code = part.replace(/^```(?:scratch|scratchblocks)[ \t]*\r?\n|```$/gu, '');
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

const firstTargetCode = scratchCode => {
    const lines = String(scratchCode || '').split(/\r?\n/gu);
    let inTarget = false;
    let section = [];

    const completedSection = () => {
        const code = section.join('\n').trim();
        return code && code !== '# ブロックなし' ? code : '';
    };

    for (const line of lines) {
        if (line.trim() === '# ブロックなし') continue;
        if (/^#\s+\S/gu.test(line)) {
            const code = completedSection();
            if (code) return code;
            inTarget = true;
            section = [];
            continue;
        }
        if (inTarget) section.push(line);
    }

    return completedSection();
};

export const ensureExplanatoryScratchFence = (displayResponse, scratchCode) => {
    const response = String(displayResponse || '').trim();
    if (/```(?:scratch|scratchblocks)[ \t]*\r?\n/iu.test(response)) return response;

    const explanatoryCode = firstTargetCode(scratchCode);
    if (!explanatoryCode) return response;

    return [
        response,
        '重要な処理をブロックで見ると、次のようになります。',
        `\`\`\`scratch\n${explanatoryCode}\n\`\`\``
    ].filter(Boolean).join('\n\n');
};

// API base URL is loaded from the .env file via REACT_APP_API_BASE_URL.
// Create a .env file in packages/scratch-gui/ with:
//   REACT_APP_API_BASE_URL=https://your-domain.example.com
const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/llm`;
const STATUS_URL = `${process.env.REACT_APP_API_BASE_URL}/api/status`;
const SYNTAX_REPAIR_URL = `${process.env.REACT_APP_API_BASE_URL}/api/repair-scratch`;
const ASSET_PLAN_URL = `${process.env.REACT_APP_API_BASE_URL}/api/plan-assets`;

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

export const buildSpriteAssetsAddedMessages = assetSummaries => assetSummaries.flatMap(summary => [
    ...summary.costumes.map(costume => ({
        text: `${summary.targetName}に${formatAddedAssetName(costume)}のコスチュームを追加しました。`,
        sender: 'bot'
    })),
    ...summary.sounds.map(sound => ({
        text: `${summary.targetName}に${formatAddedAssetName(sound)}の音を追加しました。`,
        sender: 'bot'
    }))
]);

export const buildBackdropsAddedMessage = backdrops => ({
    text: `${backdrops.map(backdrop => getAddedAssetName(backdrop)).join('、')}の背景を追加しました。`,
    sender: 'bot'
});

const getAddedAssetName = asset => (
    asset && typeof asset === 'object' ? asset.name : asset
);

const getAddedAssetSourceName = asset => (
    asset && typeof asset === 'object' ? asset.sourceName : ''
);

const formatAddedAssetName = asset => {
    const name = getAddedAssetName(asset);
    return name;
};

const buildAddedAssetContextLines = assetSummaries => assetSummaries.flatMap(summary => [
    ...summary.costumes.map(costume => {
        const name = getAddedAssetName(costume);
        const sourceName = getAddedAssetSourceName(costume);
        const sourceText = sourceName && sourceName !== name ? `追加元は ${sourceName} です。` : '';
        return [
            `追加済みコスチューム: ${summary.targetName}で使えるコスチューム名は「${name}」です。`,
            sourceText,
            'この名前はcurrentAssetsにあるので使用できます。'
        ].join('');
    }),
    ...summary.sounds.map(sound => {
        const name = getAddedAssetName(sound);
        const sourceName = getAddedAssetSourceName(sound);
        const sourceText = sourceName && sourceName !== name ? `追加元は ${sourceName} です。` : '';
        return [
            `追加済み音: ${summary.targetName}で使える音名は「${name}」です。`,
            sourceText,
            'この名前はcurrentAssetsにあるので使用できます。'
        ].join('');
    })
]);

const buildAddedBackdropContextLines = backdrops => backdrops.map(backdrop => {
    const name = getAddedAssetName(backdrop);
    const sourceName = getAddedAssetSourceName(backdrop);
    const sourceText = sourceName && sourceName !== name ? `追加元は ${sourceName} です。` : '';
    return [
        `追加済み背景: Stageで使える背景名は「${name}」です。`,
        sourceText,
        'この名前はcurrentAssetsにあるので使用できます。'
    ].join('');
});

export const getApiErrorMessage = error => {
    if (error && typeof error === 'object' && error.code === 'rate_limited') {
        return 'OpenAI APIの利用上限に達しました。少し時間をおいてから、もう一度試してください。';
    }
    return error && typeof error === 'object' && error.message ?
        error.message :
        String(error || 'Unknown error');
};

const isDogSoundRequirement = asset => /犬|いぬ|イヌ|子犬|dog|puppy|bark|吠/iu.test(String(asset || '')) &&
    /音|sound|鳴|流|play|bark/iu.test(String(asset || ''));

const isDogCostumeRequirement = asset => /犬|いぬ|イヌ|子犬|dog|puppy/iu.test(String(asset || '')) &&
    /コスチューム|見た目|姿|衣装|変身|変化|変える|costume|look|transform/iu.test(String(asset || ''));

const emptySpritePlan = (disabled = false) => ({
    requiredSprites: [],
    sprites: [],
    assetAdditions: [],
    costumeAdditions: [],
    soundAdditions: [],
    requiredBackdrops: [],
    backdrops: [],
    existingBackdropsToReuse: [],
    forbiddenBackdropAdditions: [],
    existingSpritesToReuse: [],
    forbiddenSpriteAdditions: [],
    reason: '',
    spriteAutoAddEnabled: false,
    backdropAutoAddEnabled: false,
    costumeAutoAddEnabled: false,
    soundAutoAddEnabled: false,
    disabled
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

    async _planRequiredSprites (userInput, projectJson) {
        const automaticAddState = await this._getAutomaticAssetAddState();
        if (!automaticAddState.spriteAutoAddEnabled &&
                !automaticAddState.backdropAutoAddEnabled &&
                !automaticAddState.costumeAutoAddEnabled &&
                !automaticAddState.soundAutoAddEnabled) {
            return emptySpritePlan(true);
        }

        try {
            const response = await fetch(ASSET_PLAN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify({
                    userInput,
                    currentProgram: ScratchTextCompiler.projectToScratchBlocks(projectJson),
                    currentAssets: buildProjectAssetSummary(projectJson),
                    spriteCatalog: automaticAddState.spriteAutoAddEnabled ||
                        automaticAddState.costumeAutoAddEnabled || automaticAddState.soundAutoAddEnabled ?
                        buildSpriteCatalog() : undefined,
                    costumeCatalog: automaticAddState.costumeAutoAddEnabled ? buildCostumeCatalog() : undefined,
                    soundCatalog: automaticAddState.soundAutoAddEnabled ? buildSoundCatalog() : undefined,
                    existingSprites: buildExistingSpriteNames(projectJson),
                    backdropCatalog: automaticAddState.backdropAutoAddEnabled ? buildBackdropCatalog() : undefined,
                    existingBackdrops: buildExistingBackdropNames(projectJson),
                    spriteAutoAddEnabled: automaticAddState.spriteAutoAddEnabled,
                    backdropAutoAddEnabled: automaticAddState.backdropAutoAddEnabled,
                    costumeAutoAddEnabled: automaticAddState.costumeAutoAddEnabled,
                    soundAutoAddEnabled: automaticAddState.soundAutoAddEnabled
                })
            });
            if (response.ok === false) throw new Error(`Material planning returned ${response.status}.`);
            const data = await response.json();
            return {
                requiredSprites: Array.isArray(data.requiredSprites) ? data.requiredSprites : [],
                sprites: Array.isArray(data.sprites) ? data.sprites : [],
                assetAdditions: Array.isArray(data.assetAdditions) ? data.assetAdditions : [],
                costumeAdditions: Array.isArray(data.costumeAdditions) ? data.costumeAdditions : [],
                soundAdditions: Array.isArray(data.soundAdditions) ? data.soundAdditions : [],
                requiredBackdrops: Array.isArray(data.requiredBackdrops) ? data.requiredBackdrops : [],
                backdrops: Array.isArray(data.backdrops) ? data.backdrops : [],
                existingBackdropsToReuse: Array.isArray(data.existingBackdropsToReuse) ?
                    data.existingBackdropsToReuse :
                    [],
                forbiddenBackdropAdditions: Array.isArray(data.forbiddenBackdropAdditions) ?
                    data.forbiddenBackdropAdditions :
                    [],
                existingSpritesToReuse: Array.isArray(data.existingSpritesToReuse) ?
                    data.existingSpritesToReuse :
                    [],
                forbiddenSpriteAdditions: Array.isArray(data.forbiddenSpriteAdditions) ?
                    data.forbiddenSpriteAdditions :
                    [],
                reason: typeof data.reason === 'string' ? data.reason : '',
                spriteAutoAddEnabled: automaticAddState.spriteAutoAddEnabled,
                backdropAutoAddEnabled: automaticAddState.backdropAutoAddEnabled,
                costumeAutoAddEnabled: automaticAddState.costumeAutoAddEnabled,
                soundAutoAddEnabled: automaticAddState.soundAutoAddEnabled,
                disabled: data.disabled === true
            };
        } catch (error) {
            console.warn('Automatic material planning was unavailable:', error);
            return emptySpritePlan(true);
        }
    }

    async _getAutomaticAssetAddState () {
        const localSpriteEnabled = isAutomaticSpriteAddEnabled() && getSpriteAutoAddPreference();
        const localBackdropEnabled = isAutomaticBackdropAddEnabled() && getBackdropAutoAddPreference();
        const localCostumeEnabled = isAutomaticCostumeAddEnabled() && getCostumeAutoAddPreference();
        const localSoundEnabled = isAutomaticSoundAddEnabled() && getSoundAutoAddPreference();
        if (!localSpriteEnabled && !localBackdropEnabled && !localCostumeEnabled && !localSoundEnabled) {
            return {
                spriteAutoAddEnabled: false,
                backdropAutoAddEnabled: false,
                costumeAutoAddEnabled: false,
                soundAutoAddEnabled: false
            };
        }

        try {
            const response = await fetch(STATUS_URL);
            if (response.ok === false) throw new Error(`Status returned ${response.status}.`);
            const data = await response.json();
            return {
                spriteAutoAddEnabled: localSpriteEnabled && data.sprite_auto_add_enabled !== false,
                backdropAutoAddEnabled: localBackdropEnabled && data.backdrop_auto_add_enabled !== false,
                costumeAutoAddEnabled: localCostumeEnabled && data.costume_auto_add_enabled !== false,
                soundAutoAddEnabled: localSoundEnabled && data.sound_auto_add_enabled !== false
            };
        } catch (error) {
            console.warn('Automatic asset status was unavailable:', error);
        }

        return {
            spriteAutoAddEnabled: localSpriteEnabled,
            backdropAutoAddEnabled: localBackdropEnabled,
            costumeAutoAddEnabled: localCostumeEnabled,
            soundAutoAddEnabled: localSoundEnabled
        };
    }

    async _applyPlannedSpriteAssets (spritePlan) {
        const spriteEnabled = spritePlan.spriteAutoAddEnabled !== false;
        const costumeEnabled = spritePlan.costumeAutoAddEnabled !== false;
        const soundEnabled = spritePlan.soundAutoAddEnabled !== false;
        if (!spriteEnabled && !costumeEnabled && !soundEnabled) {
            return {addedSpriteNames: [], reusedSpriteNames: [], addedAssetSummaries: []};
        }
        const addedSpriteNames = [];
        const reusedSpriteNames = [];
        const addedAssetSummaries = [];

        const assetAdditions = Array.isArray(spritePlan.assetAdditions) ? spritePlan.assetAdditions : [];
        for (const addition of assetAdditions) {
            const addedAssets = await addMissingLibrarySpriteAssets(
                this.props.vm,
                addition.targetName,
                addition.sourceSpriteName,
                '',
                {
                    costumes: costumeEnabled ? addition.costumeNames || [] : [],
                    sounds: soundEnabled ? addition.soundNames || [] : [],
                    useJapaneseCostumeNames: getCostumeLibraryUseJapanesePreference(),
                    useJapaneseSoundNames: getSoundLibraryUseJapanesePreference()
                }
            );
            if (addedAssets.costumes.length > 0 || addedAssets.sounds.length > 0) {
                addedAssetSummaries.push({
                    targetName: addition.targetName,
                    costumes: addedAssets.costumes,
                    sounds: addedAssets.sounds
                });
            }
        }

        const costumeAdditions = costumeEnabled && Array.isArray(spritePlan.costumeAdditions) ?
            spritePlan.costumeAdditions : [];
        for (const addition of costumeAdditions) {
            if (!addition || !addition.targetName || !addition.costumeName) continue;
            const addedCostume = await addLibraryCostumeToTarget(
                this.props.vm,
                addition.targetName,
                addition.costumeName,
                getCostumeLibraryUseJapanesePreference()
            );
            if (addedCostume) {
                addedAssetSummaries.push({
                    targetName: addedCostume.targetName,
                    costumes: [{
                        name: addedCostume.costumeName,
                        sourceName: addedCostume.sourceCostumeName
                    }],
                    sounds: []
                });
            }
        }

        const soundAdditions = soundEnabled && Array.isArray(spritePlan.soundAdditions) ?
            spritePlan.soundAdditions : [];
        for (const addition of soundAdditions) {
            if (!addition || !addition.targetName || !addition.soundName) continue;
            const addedSound = await addLibrarySoundToTarget(
                this.props.vm,
                addition.targetName,
                addition.soundName,
                getSoundLibraryUseJapanesePreference()
            );
            if (addedSound) {
                addedAssetSummaries.push({
                    targetName: addedSound.targetName,
                    costumes: [],
                    sounds: [addedSound.soundName]
                });
            }
        }

        const sprites = spriteEnabled && Array.isArray(spritePlan.sprites) ? spritePlan.sprites : [];
        for (const selection of sprites) {
            if (!selection || !selection.spriteName) continue;
            const currentProject = this.props.vm.toJSON();
            const existingSpriteName = findExistingLibrarySpriteName(
                currentProject,
                selection.spriteName,
                selection.japaneseName
            );
            if (existingSpriteName) {
                reusedSpriteNames.push(existingSpriteName);
                continue;
            }
            const addedSpriteName = await addLibrarySprite(
                this.props.vm,
                selection.spriteName,
                selection.japaneseName
            );
            if (addedSpriteName) addedSpriteNames.push(addedSpriteName);
        }

        return {addedSpriteNames, reusedSpriteNames, addedAssetSummaries};
    }

    async _applyPlannedBackdrops (spritePlan) {
        if (spritePlan.backdropAutoAddEnabled === false) {
            return {addedBackdrops: [], reusedBackdropNames: []};
        }
        const addedBackdrops = [];
        const reusedBackdropNames = [];
        const plannedBackdrops = Array.isArray(spritePlan.backdrops) ? spritePlan.backdrops : [];
        for (const selection of plannedBackdrops) {
            if (!selection || !selection.backdropName) continue;
            try {
                const result = await addLibraryBackdrop(
                    this.props.vm,
                    selection.backdropName,
                    getBackdropLibraryUseJapanesePreference()
                );
                if (!result) continue;
                if (result.added) {
                    addedBackdrops.push({
                        name: result.backdropName,
                        sourceName: result.sourceBackdropName
                    });
                } else {
                    reusedBackdropNames.push(result.backdropName);
                }
            } catch (error) {
                console.warn(`Automatic backdrop addition failed for ${selection.backdropName}:`, error);
            }
        }
        return {addedBackdrops, reusedBackdropNames};
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

        const initialProjectJson = this.props.vm.toJSON();
        const spritePlan = await this._planRequiredSprites(inputValue, initialProjectJson);
        const requiredBackdrops = Array.isArray(spritePlan.requiredBackdrops) ?
            spritePlan.requiredBackdrops : [];
        const existingBackdropsToReuse = Array.isArray(spritePlan.existingBackdropsToReuse) ?
            spritePlan.existingBackdropsToReuse : [];
        const forbiddenBackdropAdditions = Array.isArray(spritePlan.forbiddenBackdropAdditions) ?
            spritePlan.forbiddenBackdropAdditions : [];
        const automaticSpriteAddEnabled = spritePlan.spriteAutoAddEnabled !== false && !spritePlan.disabled;
        const automaticBackdropAddEnabled = spritePlan.backdropAutoAddEnabled !== false && !spritePlan.disabled;
        const automaticCostumeAddEnabled = spritePlan.costumeAutoAddEnabled !== false && !spritePlan.disabled;
        const automaticSoundAddEnabled = spritePlan.soundAutoAddEnabled !== false && !spritePlan.disabled;
        const automaticAssetAddEnabled = automaticSpriteAddEnabled || automaticBackdropAddEnabled ||
            automaticCostumeAddEnabled || automaticSoundAddEnabled;
        const inferredRequiredAssets = automaticSoundAddEnabled ?
            inferRequiredSpriteAssets(inputValue, initialProjectJson) :
            [];
        const directCostumeNames = automaticCostumeAddEnabled ?
            inferDirectLibraryCostumes(inputValue, initialProjectJson) :
            [];
        const directlyAddedAssetSummaries = [];
        let requiredSpritesFromPlan = spritePlan.requiredSprites;
        let unresolvedInferredRequiredAssets = inferredRequiredAssets;
        if (directCostumeNames.length > 0) {
            for (const costumeName of directCostumeNames) {
                const addedCostume = await addLibraryCostumeToEditingTarget(
                    this.props.vm,
                    costumeName,
                    getCostumeLibraryUseJapanesePreference()
                );
                if (addedCostume) {
                    directlyAddedAssetSummaries.push({
                        targetName: addedCostume.targetName,
                        costumes: [{
                            name: addedCostume.costumeName,
                            sourceName: addedCostume.sourceCostumeName
                        }],
                        sounds: []
                    });
                }
            }
            if (directlyAddedAssetSummaries.some(summary => summary.costumes.length > 0)) {
                requiredSpritesFromPlan = requiredSpritesFromPlan.filter(asset => !isDogCostumeRequirement(asset));
            }
        }
        if (inferredRequiredAssets.includes('犬の音')) {
            const addedSound = await addLibrarySoundToEditingTarget(
                this.props.vm,
                'Dog1',
                getSoundLibraryUseJapanesePreference()
            );
            if (addedSound) {
                directlyAddedAssetSummaries.push({
                    targetName: addedSound.targetName,
                    costumes: [],
                    sounds: [addedSound.soundName]
                });
                unresolvedInferredRequiredAssets = inferredRequiredAssets.filter(asset => asset !== '犬の音');
                requiredSpritesFromPlan = requiredSpritesFromPlan.filter(asset => !isDogSoundRequirement(asset));
            }
        }
        const plannedAssets = await this._applyPlannedSpriteAssets(spritePlan);
        const plannedBackdrops = await this._applyPlannedBackdrops(spritePlan);
        const addedSpriteNames = [
            ...plannedAssets.addedSpriteNames
        ];
        const reusedSpriteNames = [
            ...plannedAssets.reusedSpriteNames
        ];
        const addedAssetSummaries = [
            ...plannedAssets.addedAssetSummaries
        ];
        const allAddedAssetSummaries = [
            ...directlyAddedAssetSummaries,
            ...addedAssetSummaries
        ];
        if (addedSpriteNames.length > 0 || allAddedAssetSummaries.length > 0 ||
                plannedBackdrops.addedBackdrops.length > 0) {
            this.props.vm.refreshWorkspace();
        }
        if (addedSpriteNames.length > 0) {
            this.props.onAddMessage(buildSpriteAddedMessage(addedSpriteNames));
        }
        if (allAddedAssetSummaries.length > 0) {
            buildSpriteAssetsAddedMessages(allAddedAssetSummaries).forEach(message => {
                this.props.onAddMessage(message);
            });
        }
        if (plannedBackdrops.addedBackdrops.length > 0) {
            this.props.onAddMessage(buildBackdropsAddedMessage(plannedBackdrops.addedBackdrops));
        }
        const spriteNamesToReuse = Array.from(new Set([
            ...reusedSpriteNames,
            ...spritePlan.existingSpritesToReuse
        ]));
        const selectedSpriteContext = [
            addedSpriteNames.length > 0 ?
                `追加済みスプライト: ${addedSpriteNames.join('、')}` :
                '',
            ...buildAddedAssetContextLines(allAddedAssetSummaries),
            ...buildAddedBackdropContextLines(plannedBackdrops.addedBackdrops),
            spriteNamesToReuse.length > 0 ?
                `既存スプライトを再利用: ${spriteNamesToReuse.join('、')}` :
                '',
            [...plannedBackdrops.reusedBackdropNames, ...existingBackdropsToReuse].length > 0 ?
                `既存背景を再利用: ${Array.from(new Set([
                    ...plannedBackdrops.reusedBackdropNames,
                    ...existingBackdropsToReuse
                ])).join('、')}` :
                '',
            automaticAssetAddEnabled &&
                    addedSpriteNames.length === 0 &&
                    directlyAddedAssetSummaries.length === 0 &&
                    plannedAssets.addedAssetSummaries.length === 0 &&
                    plannedBackdrops.addedBackdrops.length === 0 &&
                    plannedBackdrops.reusedBackdropNames.length === 0 &&
                    existingBackdropsToReuse.length === 0 &&
                    requiredSpritesFromPlan.length === 0 &&
                    unresolvedInferredRequiredAssets.length === 0 &&
                    requiredBackdrops.length === 0 ?
                '新規素材追加は不要' :
                '',
            spritePlan.forbiddenSpriteAdditions.length > 0 ?
                `追加しないスプライト: ${spritePlan.forbiddenSpriteAdditions.join('、')}` :
                '',
            forbiddenBackdropAdditions.length > 0 ?
                `追加しない背景: ${forbiddenBackdropAdditions.join('、')}` :
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
                        this.props.onSetIsLoading(false);
                        this.props.onSetPendingRequestId(null);

                        const approvedData = JSON.parse(event.data);
                        const fullResponse = approvedData.response || '';

                        // 「承認待ち」メッセージを「承認済み」に置き換える処理（追記形式）
                        this._handleApprovedResponse(fullResponse);
                    });

                    evtSource.addEventListener('rejected', event => {
                        evtSource.close();
                        this.props.onSetIsLoading(false);
                        this.props.onSetPendingRequestId(null);

                        const rejectedData = JSON.parse(event.data);
                        const reason = rejectedData.reason || '先生がこの回答の表示を許可しませんでした。';
                        const errorMsg = { text: `⚠️ ${reason}`, sender: 'bot' };
                        this.props.onAddMessage(errorMsg);
                    });

                    evtSource.onerror = () => {
                        evtSource.close();
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
                    fullResponse = getApiErrorMessage(data.error);
                }

                this._handleScratchBlocksResponse(fullResponse, projectJson, true);
            })
            .catch(error => {
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

    async _repairExplanatoryScratchBlocks(text, currentProject, knownRepairs = new Map()) {
        const source = String(text || '');
        const scratchFenceRegex = /```(scratch|scratchblocks)([ \t]*\r?\n)([\s\S]*?)```/giu;
        const replacements = [];
        let match = scratchFenceRegex.exec(source);

        while (match) {
            const originalFence = match[0];
            const language = match[1];
            const newline = match[2];
            const code = match[3];
            const trimmedCode = code.trim();
            let repairedCode = knownRepairs.get(trimmedCode);

            if (!repairedCode) {
                const compiled = this._compileScratchCode(trimmedCode, currentProject, false);
                repairedCode = await this._repairScratchCode(trimmedCode, compiled.diagnostics);
            }

            if (repairedCode && repairedCode !== trimmedCode) {
                replacements.push({
                    start: match.index,
                    end: match.index + originalFence.length,
                    text: `\`\`\`${language}${newline}${repairedCode}\n\`\`\``
                });
            }
            match = scratchFenceRegex.exec(source);
        }

        if (replacements.length === 0) return source;

        let repairedText = source;
        for (let i = replacements.length - 1; i >= 0; i--) {
            const replacement = replacements[i];
            repairedText = [
                repairedText.slice(0, replacement.start),
                replacement.text,
                repairedText.slice(replacement.end)
            ].join('');
        }
        return repairedText;
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

    async _compileScratchCodeForImport(scratchCode, currentProject) {
        const initial = this._compileScratchCode(scratchCode, currentProject, false);
        let compiled = initial;
        let repairedCode = null;

        if (initial.diagnostics.length > 0) {
            const candidateRepair = await this._repairScratchCode(scratchCode, initial.diagnostics);
            const originalFuzzy = this._compileScratchCode(scratchCode, currentProject, true);
            if (candidateRepair) {
                const repairedFuzzy = this._compileScratchCode(candidateRepair, currentProject, true);
                if (repairedFuzzy.diagnostics.length <= originalFuzzy.diagnostics.length) {
                    compiled = repairedFuzzy;
                    repairedCode = candidateRepair;
                } else {
                    compiled = originalFuzzy;
                }
            } else {
                compiled = originalFuzzy;
            }
        }

        return {
            project: compiled.project,
            diagnostics: compiled.diagnostics,
            repairedCode
        };
    }

    async _handleScratchBlocksResponse(fullResponse, projectJson, shouldStopLoading) {
        const scratchCode = ScratchTextCompiler.extractScratchBlocks(fullResponse);
        let displayResponse = fullResponse
            .replace(/```scratch-project\s*[\s\S]*?```/giu, '')
            .replace(/```json\s*[\s\S]*?```/giu, '')
            .replace('[SCRATCH-PROJECT-JSON]', '')
            .trim();
        displayResponse = ensureExplanatoryScratchFence(displayResponse, scratchCode);
        const currentProject = typeof projectJson === 'string' ?
            JSON.parse(projectJson) :
            projectJson;

        let newProjectJson = null;
        let compilerDiagnostics = [];
        let compileError = null;
        const knownRepairs = new Map();

        if (scratchCode) {
            try {
                const importResult = await this._compileScratchCodeForImport(scratchCode, currentProject);
                newProjectJson = importResult.project;
                compilerDiagnostics = importResult.diagnostics;
                if (importResult.repairedCode && importResult.repairedCode !== scratchCode.trim()) {
                    knownRepairs.set(scratchCode.trim(), importResult.repairedCode);
                }
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
                compileError = e;
            }
        }

        displayResponse = await this._repairExplanatoryScratchBlocks(
            displayResponse,
            currentProject,
            knownRepairs
        );

        this.props.onAddMessage({
            text: displayResponse || fullResponse,
            sender: 'bot'
        });

        if (!scratchCode) {
            if (shouldStopLoading) this.props.onSetIsLoading(false);
            return;
        }

        if (compileError) {
            console.error('Error compiling ScratchBlocks response:', compileError);
            this.props.onAddMessage({
                text: `ScratchBlocks記法をプログラムに変換できませんでした。\n${compileError.message}`,
                sender: 'bot'
            });
            if (shouldStopLoading) this.props.onSetIsLoading(false);
            return;
        }

        try {
            await this.props.vm.loadProject(newProjectJson);
            this.props.vm.refreshWorkspace();
            if (compilerDiagnostics.length > 0) {
                this.props.onAddMessage({
                    text: `一部のコードは安全のため変更しませんでした。\n${compilerDiagnostics.join('\n')}`,
                    sender: 'bot'
                });
            }
            if (shouldStopLoading) this.props.onSetIsLoading(false);
        } catch (e) {
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
                        onTouchStart={this.props.onDragHeader}
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
                            13歳未満の方は利用できません。<br />
                            13歳以上の未成年の方は、保護者の方の監修の上でご利用ください。<br />
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
                    onTouchStart={this.props.onDragHeader}
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
