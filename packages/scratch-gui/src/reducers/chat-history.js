import {
    getExplanationLengthPreference,
    setExplanationLengthPreference
} from '../lib/user-preferences';

const ADD_MESSAGE = 'scratch-gui/chat-history/ADD_MESSAGE';
const CLEAR_HISTORY = 'scratch-gui/chat-history/CLEAR_HISTORY';
const SET_HAS_CONSENTED = 'scratch-gui/chat-history/SET_HAS_CONSENTED';
const SET_HAS_GLOBAL_CONSENTED = 'scratch-gui/chat-history/SET_HAS_GLOBAL_CONSENTED';
const SET_IS_LOADING = 'scratch-gui/chat-history/SET_IS_LOADING';
const SET_PENDING_REQUEST_ID = 'scratch-gui/chat-history/SET_PENDING_REQUEST_ID';
const SET_EXPLANATION_LENGTH = 'scratch-gui/chat-history/SET_EXPLANATION_LENGTH';

const initialState = {
    messages: [],
    hasConsented: false,
    hasGlobalConsented: false,
    isLoading: false,
    pendingRequestId: null,
    explanationLength: getExplanationLengthPreference()
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;

    switch (action.type) {
        case ADD_MESSAGE:
            return {
                ...state,
                messages: [...state.messages, action.message]
            };
        case CLEAR_HISTORY:
            return {
                ...state,
                messages: []
            };
        case SET_HAS_CONSENTED:
            return {
                ...state,
                hasConsented: action.hasConsented
            };
        case SET_HAS_GLOBAL_CONSENTED:
            return {
                ...state,
                hasGlobalConsented: action.hasGlobalConsented
            };
        case SET_IS_LOADING:
            return {
                ...state,
                isLoading: action.isLoading
            };
        case SET_PENDING_REQUEST_ID:
            return {
                ...state,
                pendingRequestId: action.pendingRequestId
            };
        case SET_EXPLANATION_LENGTH:
            return {
                ...state,
                explanationLength: action.explanationLength
            };
        default:
            return state;
    }
};

const addMessage = message => ({
    type: ADD_MESSAGE,
    message
});

const clearHistory = () => ({
    type: CLEAR_HISTORY
});

const setHasConsented = hasConsented => ({
    type: SET_HAS_CONSENTED,
    hasConsented
});

const setHasGlobalConsented = hasGlobalConsented => ({
    type: SET_HAS_GLOBAL_CONSENTED,
    hasGlobalConsented
});

const setIsLoading = isLoading => ({
    type: SET_IS_LOADING,
    isLoading
});

const setPendingRequestId = pendingRequestId => ({
    type: SET_PENDING_REQUEST_ID,
    pendingRequestId
});

const setExplanationLength = explanationLength => {
    setExplanationLengthPreference(explanationLength);
    return {
        type: SET_EXPLANATION_LENGTH,
        explanationLength
    };
};

export {
    reducer as default,
    initialState as chatHistoryInitialState,
    addMessage,
    clearHistory,
    setHasConsented,
    setHasGlobalConsented,
    setIsLoading,
    setPendingRequestId,
    setExplanationLength
};
