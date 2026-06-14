import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import { FormattedMessage } from 'react-intl';
import classNames from 'classnames';
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
    setHasConsented,
    setIsLoading,
    setPendingRequestId
} from '../../reducers/chat-history';

import ScratchBlockRenderer from './scratch-block-renderer.jsx';
import ScratchTextCompiler from '../../lib/scratch-text-compiler';
import validateScratchProject from '../../lib/scratch-project-validator';




const renderMessageContent = text => {
    // Split by code blocks formatted as ```scratch ... ```
    const parts = text.split(/(```scratch[\s\S]*?```)/g);
    return parts.map((part, index) => {
        if (part.startsWith('```scratch')) {
            // Remove the markers
            const code = part.replace(/^```scratch\n?|```$/g, '');
            return (<ScratchBlockRenderer
                key={index}
                code={code}
            />);
        }
        // Check for other code blocks (optional, but good for normal formatting)
        // For now, just render text as is but strictly scratch blocks are handled specially.
        return (
            <span
                key={index}
                style={{ whiteSpace: 'pre-wrap' }}
            >
                {part}
            </span>
        );
    });
};

// API base URL is loaded from the .env file via REACT_APP_API_BASE_URL.
// Create a .env file in packages/scratch-gui/ with:
//   REACT_APP_API_BASE_URL=https://your-domain.example.com
const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/llm`;

/* eslint-disable max-len */
const SYSTEM_PROMPT = `
# Scratch 3.0 AI Programmer - ScratchBlocks Mode

あなたはScratch 3.0のプログラムを作るAIです。ユーザーの希望に合わせて、現在のプログラムをScratchBlocks記法で書き換えてください。
最重要事項は、説明の詳しさよりも、ScratchBlocksコードを正しい構文で返すことです。出力直前にコード全体を自分で検査し、構文ミスを直してから回答してください。

## 出力ルール
* 説明は中学生にもわかる、親しみやすい日本語にしてください。
* 実際に反映したいプログラムは、必ず \`\`\`scratch から始まるコードブロックの中だけに書いてください。
* JSON、JavaScript、XML、opcode、project.json は出力しないでください。
* ScratchBlocksコードブロックには、全スプライト・ステージの変更後の完成したコードを必ず含めてください。変更しないコードも省略しないでください。
* ユーザーが依頼していない機能・ゲーム要素・変数・テーマを、リファレンスや例から連想して勝手に追加しないでください。例は構文だけを示すもので、内容の提案ではありません。
* 入力にある各ターゲットを、同じ名前・同じ順番で、ちょうど1回ずつ出力してください。見出しはステージなら \`# Stage\`、スプライトなら \`# 入力にある正確なスプライト名\` です。
* 1行に1ブロックだけ書いてください。説明文、箇条書き、opcode、プレースホルダーはScratchコードブロック内に書かないでください。
* \`...\`、\`条件\`、\`ここにブロック\`、空の \`<>\` や \`()\` は、実際のコードとして使用禁止です。
* 数値・値・丸型レポーターは \`(値)\`、文字列は \`[文字列]\`、メニューは \`(選択肢 v)\` または \`[選択肢 v]\`、真偽値は完全なBooleanブロック \`<...>\` で書いてください。
* 変数を値として使う場合は必ず \`(変数名)\` と書いてください。演算では各入力を個別の丸括弧で囲み、\`((合計) + (増加量))\` のように書いてください。\`(合計 + 増加量)\` や \`合計 + 増加量\` は使わないでください。
* 変数・x座標・y座標を現在値から増減する処理には、必ず「ずつ変える」を使ってください。変更対象自身を足し引きして「にする」で再代入してはいけません。
* \`ジャンプ力 = ジャンプ力 + 重力\` の意味の処理は、必ず \`[ジャンプ力 v] を (重力) ずつ変える\` と書きます。\`[ジャンプ力 v] を ((ジャンプ力) + (重力)) にする\` は禁止です。
* \`変数 = 変数 + 値\` は \`[変数 v] を (値) ずつ変える\` に、\`変数 = 変数 - 値\` は \`[変数 v] を ((0) - (値)) ずつ変える\` に変換してください。「ずつ変える」の入力には増減量だけを指定し、変更対象の変数自身を含めないでください。
* \`x座標 = x座標 + 値\` は \`x座標を (値) ずつ変える\` に、\`y座標 = y座標 - 値\` は \`y座標を ((0) - (値)) ずつ変える\` に変換してください。
* 「にする」は初期値や絶対値を設定するときだけ使います。例: \`[得点 v] を (0) にする\`、\`x座標を (0) にする\`。掛け算・割り算には「ずつ変える」に相当する更新ブロックはありません。
* \`もし\`、\`ずっと\`、\`繰り返す\` の内側もインデントしません。C型制御ブロック1個につき、対応する \`end\` を必ず1行書いてください。
* if/elseは \`もし <完全なBooleanブロック> なら\`、処理、\`でなければ\`、処理、\`end\` の順です。
* 条件欄には文字列を書かず、下記の「調べる」または「演算」にあるBooleanブロックだけを書いてください。
* 比較条件は \`<(x座標) > (240)>\` の形で書いてください。比較全体を丸括弧で囲む \`<((x座標) > (240))>\` は使わないでください。
* リファレンスにない書式を推測して作らないでください。現在のコードに未知の灰色ブロックがある場合も、勝手に別のブロックへ置き換えないでください。

## 回答前の必須セルフチェック
回答を生成した後、ユーザーへ返す前に次を内部で確認し、違反があれば必ず修正してください。チェック結果そのものは出力しません。
1. Scratchコードが \`\`\`scratch\` のコードブロックに1つだけ入っている。
2. 入力されたStageと全スプライトが、正確な見出しで1回ずつ含まれている。
3. 各行がリファレンスにある完全なブロック記法になっており、説明文や省略記号が混ざっていない。
4. すべてのBoolean条件が \`<...>\` で囲まれ、条件欄に普通の文字列が入っていない。
5. 各C型制御ブロックに対応する \`end\` があり、\`でなければ\` は対応する \`もし\` の内側にある。
6. 括弧 \`()\`、\`[]\`、\`<>\` がすべて閉じている。
7. 変更しないスクリプトも含め、現在の全コードが保持されている。
8. 変数・座標・演算が普通の文字列ではなく、\`(変数名)\`、\`(y座標)\`、\`((値) + (値))\` の形になっている。
9. 「ずつ変える」の入力に、変更対象の変数・x座標・y座標自身を含めていない。
10. 変数・x座標・y座標について、変更対象自身を足し引きして「にする」処理が残っていない。見つけた場合は必ず「ずつ変える」へ直す。

## 厳密な記法例
比較条件: \`<(10) > (5)>\`
論理積: \`<<(10) > (5)> かつ <マウスが押された>>\`
論理和: \`<<マウスが押された> または <(スペース v) キーが押された>>\`
否定: \`<<マウスが押された> ではない>\`
条件分岐の先頭: \`もし <(10) > (5)> なら\`
条件待機: \`<マウスが押された> まで待つ\`

## ScratchBlocks例
\`\`\`scratch
# Stage
⚑ が押されたとき
背景を (背景1 v) にする

# Sprite1
⚑ が押されたとき
ずっと
(10) 歩動かす
もし端に着いたら、跳ね返る
end
\`\`\`

## Scratch 3.0ブロック・リファレンス
括弧 \`()\` は数値・レポーター、角括弧 \`[]\` は文字列・メニュー、山括弧 \`<>\` は真偽値です。

### 動き
* \`(10) 歩動かす\`: 向いている方向へ動く。
* \`右に (15) 度回す\` / \`左に (15) 度回す\`: 回転する。
* \`(どこかの場所 v) へ行く\`: 指定位置へ瞬間移動する。
* \`x座標を (0)、y座標を (0) にする\`: 指定座標へ移動する。
* \`(1) 秒で (どこかの場所 v) へ行く\`: 指定位置へ滑らかに移動する。
* \`(1) 秒でx座標を (0) に、y座標を (0) に変える\`: 指定座標へ滑らかに移動する。
* \`(90) 度に向ける\` / \`(マウスのポインター v) へ向ける\`: 向きを変える。
* \`x座標を (10) ずつ変える\` / \`x座標を (0) にする\`: x座標を変更する。現在のx座標への加減算には必ず「ずつ変える」を使う。
* \`y座標を (10) ずつ変える\` / \`y座標を (0) にする\`: y座標を変更する。現在のy座標への加減算には必ず「ずつ変える」を使う。
* \`もし端に着いたら、跳ね返る\`: ステージ端で跳ね返る。
* \`回転方法を [左右のみ v] にする\`: 回転方法を設定する。
* \`(x座標)\` / \`(y座標)\` / \`(向き)\`: 現在の位置・向きを返す。

### 見た目
* \`[こんにちは!] と (2) 秒言う\` / \`[こんにちは!] と言う\`: 吹き出しで話す。
* \`[うーん...] と (2) 秒考える\` / \`[うーん] と考える\`: 思考の吹き出しを表示する。
* \`コスチュームを (コスチューム1 v) にする\` / \`次のコスチュームにする\`: コスチュームを変える。
* \`背景を (背景1 v) にする\` / \`次の背景にする\`: 背景を変える。
* \`大きさを (10) ずつ変える\` / \`大きさを (100) %にする\`: 大きさを変える。
* \`[色 v] の効果を (25) ずつ変える\` / \`[色 v] の効果を (0) にする\`: 画像効果を変える。
* \`画像効果をなくす\`: 画像効果を消す。
* \`表示する\` / \`隠す\`: スプライトの表示状態を変える。
* \`[最前面 v] へ移動する\` / \`(1) 層 [手前に出す v]\`: 表示レイヤーを変える。
* \`(コスチュームの [番号 v])\` / \`(背景の [番号 v])\` / \`(大きさ)\`: 見た目の状態を返す。

### 音
* \`終わるまで (Meow v) の音を鳴らす\` / \`(Meow v) の音を鳴らす\`: 音を再生する。
* \`すべての音を止める\`: 再生中の音を止める。
* \`[ピッチ v] の効果を (10) ずつ変える\` / \`[ピッチ v] の効果を (100) にする\`: 音響効果を変える。
* \`音の効果をなくす\`: 音響効果を消す。
* \`音量を (-10) ずつ変える\` / \`音量を (100) %にする\`: 音量を変える。
* \`(音量)\`: 現在の音量を返す。

### イベント
* \`⚑ が押されたとき\`: 緑の旗で開始する。
* \`[スペース v] キーが押されたとき\`: キー入力で開始する。
* \`このスプライトが押されたとき\`: スプライトのクリックで開始する。
* \`背景が [背景1 v] になったとき\`: 背景変更で開始する。
* \`[音量 v] > (10) のとき\`: 値がしきい値を超えたら開始する。
* \`[メッセージ1 v] を受け取ったとき\`: メッセージ受信で開始する。
* \`(メッセージ1 v) を送る\` / \`(メッセージ1 v) を送って待つ\`: メッセージを送る。

### 制御
* \`(1) 秒待つ\`: 指定時間待つ。
* \`(10) 回繰り返す\` と末尾の \`end\`: 中の処理を指定回数繰り返す。
* \`ずっと\` と末尾の \`end\`: 中の処理を繰り返し続ける。
* \`もし <マウスが押された> なら\` と末尾の \`end\`: 条件が真のときだけ実行する。
* \`もし <マウスが押された> なら\`、\`でなければ\`、末尾の \`end\`: 条件で処理を分岐する。
* \`<マウスが押された> まで待つ\`: 条件が真になるまで待つ。
* \`<マウスが押された> まで繰り返す\` と末尾の \`end\`: 条件が真になるまで繰り返す。
* \`[すべてを止める v]\`: スクリプトを停止する。
* \`クローンされたとき\`: クローン作成時に開始する。
* \`[自分自身 v] のクローンを作る\` / \`このクローンを削除する\`: クローンを作成・削除する。

### 調べる
* \`< (マウスのポインター v) に触れた >\`: 対象に触れているか返す。
* \`< [#ff0000] に触れた >\` / \`< [#ff0000] 色が [#00ff00] 色に触れた >\`: 色の接触を返す。
* \`(マウスのポインター v) までの距離\`: 対象までの距離を返す。
* \`[What's your name?] と聞いて待つ\` / \`(答え)\`: 質問して答えを取得する。
* \`< (スペース v) キーが押された >\` / \`< マウスが押された >\`: 入力状態を返す。
* \`(マウスのx座標)\` / \`(マウスのy座標)\`: マウス座標を返す。
* \`ドラッグ [できる v] ようにする\`: ドラッグ可否を設定する。
* \`(音量)\` / \`(タイマー)\` / \`タイマーをリセット\`: 音量・タイマーを扱う。
* \`(ステージ v) の [背景# v]\`: 対象の属性を返す。
* \`(現在の [年 v])\` / \`(2000年からの日数)\` / \`(ユーザー名)\`: 日時やユーザー情報を返す。

### 演算
* \`((10) + (20))\` / \`((10) - (20))\` / \`((10) * (20))\` / \`((10) / (20))\`: 四則演算を行う。変数を使う場合は \`((合計) + (増加量))\` のように書く。
* \`(() から () までの乱数)\`: 範囲内の乱数を返す。
* \`<(10) > (5)>\` / \`<(10) < (5)>\` / \`<(10) = (5)>\`: 値を比較する。
* \`<<マウスが押された> かつ <(10) > (5)>>\` / \`<<マウスが押された> または <(10) > (5)>>\` / \`<<マウスが押された> ではない>\`: 論理演算を行う。
* \`([] と [])\`: 文字列をつなぐ。
* \`([] の (1) 番目の文字)\` / \`([] の長さ)\` / \`< [] に [] が含まれる >\`: 文字列を調べる。
* \`(() を () で割った余り)\` / \`(() を四捨五入)\` / \`(() の [絶対値 v])\`: 数学演算を行う。

### 変数
* \`(my variable)\`: 変数の値を返す。
* \`[my variable v] を (0) にする\`: 変数へ値を設定する。
* \`[my variable v] を (1) ずつ変える\`: 指定した増減量だけ変数を増減する。入力に \`(my variable)\` 自身を含めない。
* 現在値への加算は必ず「ずつ変える」を使う。例: \`[ジャンプ力 v] を (重力) ずつ変える\`。同じ意味を \`[ジャンプ力 v] を ((ジャンプ力) + (重力)) にする\` と書いてはいけない。
* \`変数 [my variable v] を表示する\` / \`変数 [my variable v] を隠す\`: 変数モニターを表示・非表示にする。

### リスト
* \`[thing] を [my list v] に追加する\`: リストへ項目を追加する。
* \`[my list v] の (1) 番目を削除する\` / \`[my list v] のすべてを削除する\`: 項目を削除する。
* \`[thing] を [my list v] の (1) 番目に挿入する\`: 項目を挿入する。
* \`[my list v] の (1) 番目を [thing] で置き換える\`: 項目を置換する。
* \`([my list v] の (1) 番目)\` / \`([my list v] の長さ)\`: リストの項目・長さを返す。
* \`< [my list v] に [thing] が含まれる >\`: 項目が含まれるか返す。
* \`リスト [my list v] を表示する\` / \`リスト [my list v] を隠す\`: リストモニターを表示・非表示にする。

### ブロック定義
* \`定義 my block\`: 自分で作ったブロックを定義する。
* \`my block\`: 定義したブロックを呼び出す。
`;

export class ChatComponent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            inputValue: ''
        };
        this.textareaRef = React.createRef();
        this.handleSend = this.handleSend.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleClearHistory = this.handleClearHistory.bind(this);
    }

    componentDidMount() {
        this._isMounted = true;
    }

    componentWillUnmount() {
        this._isMounted = false;
    }

    handleClearHistory() {
        this.props.onClearHistory();
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

    handleSend() {
        const { inputValue } = this.state;
        if (inputValue.trim() === '' || this.props.isLoading) return;

        const userMessage = { text: inputValue, sender: 'user' };
        this.props.onAddMessage(userMessage);

        this.setState({ inputValue: '' });
        this.props.onSetIsLoading(true);

        if (this.textareaRef.current) {
            this.textareaRef.current.style.height = '30px';
        }

        const projectJson = this.props.vm.toJSON();
        const projectScratchBlocks = ScratchTextCompiler.projectToScratchBlocks(projectJson);
        const prompt = `ユーザーは現在のScratchプログラムを変更したいです。

現在のプログラム（ScratchBlocks記法）:
\`\`\`scratch
${projectScratchBlocks}
\`\`\`

ユーザーの依頼:
${inputValue}

変更後の全スプライト・ステージの完成したプログラムを、ターゲット見出し付きのScratchBlocks記法で返してください。インデントは不要です。
回答前に、Boolean条件、括弧、end、全ターゲット、未変更コードの保持をもう一度検査してから返してください。
特に、変数・x座標・y座標自身への加減算の再代入は禁止です。必ず「ずつ変える」に直してください。例: \`[ジャンプ力 v] を ((ジャンプ力) + (重力)) にする\` ではなく \`[ジャンプ力 v] を (重力) ずつ変える\`、\`x座標を ((x座標) + (速さ)) にする\` ではなく \`x座標を (速さ) ずつ変える\`。`;

        const history = this.props.messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));

        fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // model: 'gpt-4o', // Delegate model selection to server
                userInput: inputValue,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'assistant', content: 'Ok, I understand.' },
                    ...history,
                    { role: 'user', content: prompt }
                ]
            })
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

    _handleScratchBlocksResponse(fullResponse, projectJson, shouldStopLoading) {
        const scratchCode = ScratchTextCompiler.extractScratchBlocks(fullResponse);
        const displayResponse = fullResponse
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
            newProjectJson = ScratchTextCompiler.compile(
                scratchCode,
                currentProject,
                this.props.vm.editingTarget && this.props.vm.editingTarget.id
            );
            compilerDiagnostics = ScratchTextCompiler.getDiagnostics();
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

        this.props.vm.loadProject(newProjectJson)
            .then(() => {
                if (!this._isMounted) return;
                this.props.vm.refreshWorkspace();
                if (compilerDiagnostics.length > 0) {
                    this.props.onAddMessage({
                        text: `一部のコードは安全のため変更しませんでした。\n${compilerDiagnostics.join('\n')}`,
                        sender: 'bot'
                    });
                }
                if (shouldStopLoading) this.props.onSetIsLoading(false);
            })
            .catch(e => {
                if (!this._isMounted) return;
                console.error('Error loading ScratchBlocks project:', e);
                this.props.onAddMessage({ text: 'プロジェクトの読み込みに失敗しました。', sender: 'bot' });
                if (shouldStopLoading) this.props.onSetIsLoading(false);
            });
    }

    // 管理者に承認されたレスポンスを処理するメソッド
    _handleApprovedResponse(fullResponse) {
        this._handleScratchBlocksResponse(fullResponse, this.props.vm.toJSON(), false);
    }

    render() {
        const { inputValue } = this.state;
        const { messages, isLoading, hasConsented, pendingRequestId } = this.props;

        if (!hasConsented) {
            return (
                <div className={styles.container}>
                    <div 
                        className={styles.header}
                        onMouseDown={this.props.onDragHeader}
                        style={{ cursor: 'move' }}
                    >
                        <div className={styles.headerTitle}>{'AIチャットを使う前に'}</div>
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
                    <div className={styles.headerTitle}>{'AIアシスタント'}</div>
                    <button
                        className={styles.clearButton}
                        disabled={isLoading || messages.length === 0}
                        onClick={this.handleClearHistory}
                    >
                        <img
                            alt="Clear History"
                            src={trashIcon}
                            style={{ width: '20px', height: '20px' }}
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
                    <div style={{ fontSize: '0.7rem', color: '#666', textAlign: 'center', marginTop: '2.5px', marginBottom: '2.5px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 4px' }}>
                        <span>{'※AIはまちがえることがあります。'}</span>
                        <span>{'個人情報は入力しないでください。'}</span>
                    </div>
                </div>
            </div>
        );
    }
}

ChatComponent.propTypes = {
    hasConsented: PropTypes.bool,
    isLoading: PropTypes.bool,
    pendingRequestId: PropTypes.string,
    onSetHasConsented: PropTypes.func.isRequired,
    onSetIsLoading: PropTypes.func.isRequired,
    onSetPendingRequestId: PropTypes.func.isRequired,
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
    pendingRequestId: state.scratchGui.chatHistory.pendingRequestId
});

const mapDispatchToProps = (dispatch, ownProps) => ({
    onClose: ownProps.onClose || (() => dispatch(closeChat())),
    onAddMessage: message => dispatch(addMessage(message)),
    onClearHistory: () => dispatch(clearHistory()),
    onSetHasConsented: hasConsented => dispatch(setHasConsented(hasConsented)),
    onSetIsLoading: isLoading => dispatch(setIsLoading(isLoading)),
    onSetPendingRequestId: id => dispatch(setPendingRequestId(id))
});

export default connect(mapStateToProps, mapDispatchToProps)(ChatComponent);
