import {addLocaleData} from 'react-intl';

import {localeData, isRtl} from 'scratch-l10n';
import editorMessages from 'scratch-l10n/locales/editor-msgs';

addLocaleData(localeData);

const localMessages = {
    en: {
        'gui.chat.placeholder': 'Type a message...'
    },
    ja: {
        'gui.chat.placeholder': 'メッセージを入力...'
    }
};

const mergeLocalMessages = messagesByLocale => Object.keys(messagesByLocale).reduce((merged, locale) => Object.assign(
    merged,
    {
        [locale]: Object.assign(
            {},
            messagesByLocale[locale],
            localMessages[locale] || localMessages.en
        )
    }
), {});

const editorMessagesWithLocalMessages = mergeLocalMessages(editorMessages);

const UPDATE_LOCALES = 'scratch-gui/locales/UPDATE_LOCALES';
const SELECT_LOCALE = 'scratch-gui/locales/SELECT_LOCALE';

const initialState = {
    isRtl: false,
    locale: 'en',
    messagesByLocale: editorMessagesWithLocalMessages,
    messages: editorMessagesWithLocalMessages.en
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SELECT_LOCALE:
        return Object.assign({}, state, {
            isRtl: isRtl(action.locale),
            locale: action.locale,
            messagesByLocale: state.messagesByLocale,
            messages: state.messagesByLocale[action.locale]
        });
    case UPDATE_LOCALES: {
        const messagesByLocale = mergeLocalMessages(action.messagesByLocale);
        return Object.assign({}, state, {
            isRtl: state.isRtl,
            locale: state.locale,
            messagesByLocale: messagesByLocale,
            messages: messagesByLocale[state.locale]
        });
    }
    default:
        return state;
    }
};

const selectLocale = function (locale) {
    return {
        type: SELECT_LOCALE,
        locale: locale
    };
};

const setLocales = function (localesMessages) {
    return {
        type: UPDATE_LOCALES,
        messagesByLocale: localesMessages
    };
};
const initLocale = function (currentState, locale) {
    if (Object.prototype.hasOwnProperty.call(currentState.messagesByLocale, locale)) {
        return Object.assign(
            {},
            currentState,
            {
                isRtl: isRtl(locale),
                locale: locale,
                messagesByLocale: currentState.messagesByLocale,
                messages: currentState.messagesByLocale[locale]
            }
        );
    }
    // don't change locale if it's not in the current messages
    return currentState;
};
export {
    reducer as default,
    initialState as localesInitialState,
    initLocale,
    selectLocale,
    setLocales
};
