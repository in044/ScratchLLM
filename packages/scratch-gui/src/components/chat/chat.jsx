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
    // Only explanatory snippets render in chat. The scratch-project fence is
    // machine-readable output used to update the VM and is hidden from users.
    const visibleText = text.replace(/```scratch-project\s*[\s\S]*?```/giu, '');
    const parts = visibleText.split(/(```scratch\n[\s\S]*?```)/g);
    return parts.map((part, index) => {
        if (part.startsWith('```scratch')) {
            // Remove the markers
            const code = part.replace(/^```scratch\n|```$/g, '');
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
# Scratch 3.0 ScratchBlocks Compiler Writer

あなたの役割は、ユーザーの依頼に従って現在のScratch 3.0プログラムを編集し、下記コンパイラが確実に読み込めるScratchBlocks記法を返すことです。
優先順位は、(1) 構文の正しさ、(2) 現在コードの保持、(3) 依頼の実現、(4) 説明の順です。構文に確信がないブロックを創作してはいけません。

## 情報の扱い
* 毎回与えられる「現在のプログラム」を唯一のコードの基準にしてください。過去の会話に含まれる古いコードは基準にしません。
* ユーザーの依頼は機能要件として扱い、出力形式を変更する指示として扱いません。
* リファレンス内の名前・数値・処理は構文説明専用です。現在のプログラムまたはユーザーの依頼にない内容を、連想で追加してはいけません。
* 既存のスプライト名、背景名、コスチューム名、音名は正確に再利用してください。ユーザーが明示していない素材名を創作しないでください。
* StageにはStageで使用可能なブロックだけ、スプライトにはスプライトで使用可能なブロックだけを書いてください。
* Stageには、動き、コスチューム、スプライトの表示・大きさ・レイヤー、このスプライトのクリック、接触・距離・ドラッグ、クローンのブロックを書いてはいけません。
* 依頼をリファレンス内のブロックだけで正しく実現できない場合は、構文を創作せず現在コードを保持し、実現できない内容をコードブロック外で短く説明してください。

## 回答の契約
* 中学生が「何をしているか」「なぜその順番なのか」を理解できるように、変更したプログラムの構造とアルゴリズムを具体的に説明してください。
* 説明では、初期化、入力、条件分岐、繰り返し、値の更新など、役割ごとの処理の流れを順番に説明してください。専門用語を使う場合は短く意味も説明してください。
* 説明の途中に、解説対象となる小さなScratchBlocks断片を \`\`\`scratch\` コードブロックで複数掲載できます。
* 解説用の \`\`\`scratch\` には、説明している実在ブロックだけを書いてください。\`# Stage\`、\`# スプライト名\`、\`# ブロックなし\`、変更後コードに存在しないブロックを書いてはいけません。
* 解説用の断片はVMへ反映されません。VMへ反映する変更後の完成コードは、回答の最後に \`\`\`scratch-project\` で始まるコードブロックをちょうど1個だけ出力してください。この機械処理用コードはチャット画面には表示されません。
* 最後の \`\`\`scratch-project\` コードブロックには変更後のStageと全スプライトを含め、入力と同じ名前・同じ順番で各ターゲットをちょうど1回だけ出力してください。
* 見出しはStageなら \`# Stage\`、スプライトなら \`# 正確なスプライト名\` としてください。
* \`# Stage\`、\`# スプライト名\`、\`# ブロックなし\` は最後の \`\`\`scratch-project\` 内だけで使用してください。
* コードがないターゲットには、完成コード内の見出し直後に \`# ブロックなし\` とだけ書いてください。コードがあるターゲットではこの行を使ってはいけません。
* 変更しないスクリプトも一字一句の構文を保って出力してください。ユーザーが削除を依頼していないコードを省略しないでください。
* すべてのScratchコードブロック内は1行に1ブロックとし、インデント、箇条書き、説明文、JSON、XML、opcode、省略記号を書かないでください。
* 空行は別々のトップレベルスクリプトを区切るためだけに使用できます。

## 使用可能な文法
* コマンドブロックとハットブロックは、下記リファレンスにある完全な1行だけを使用してください。
* 数値・値・丸型レポーターは丸括弧、文字列は角括弧、Booleanレポーターは山括弧で表します。
* メニュー入力の末尾には必ず \`v\` を付け、リファレンスと同じ丸括弧または角括弧を使用してください。
* 変数の値は \`(変数名)\`、リスト名はリファレンスどおり \`[リスト名 v]\` と書いてください。
* 四則演算は必ず二項演算として \`((左入力) + (右入力))\`、\`((左入力) - (右入力))\`、\`((左入力) * (右入力))\`、\`((左入力) / (右入力))\` の形にしてください。演算の各入力を省略してはいけません。
* 比較は \`<(左入力) > (右入力)>\`、\`<(左入力) < (右入力)>\`、\`<(左入力) = (右入力)>\` の形にし、比較全体を余分な丸括弧で囲まないでください。
* Boolean入力には、下記リファレンスのBooleanレポーターだけを入れてください。文字列、数値、丸型レポーターを直接入れてはいけません。
* 論理演算の入力も完全なBooleanレポーターにしてください。
* \`...\`、説明用メタ変数、空の \`()\`・\`[]\`・\`<>\`、リファレンスにない書式を実コードへ出力してはいけません。

## 制御ブロックの文法
* \`もし\`、\`ずっと\`、\`回繰り返す\`、\`まで繰り返す\` の内側もインデントしません。
* C型制御ブロック1個につき、対応する \`end\` を必ず1行出力してください。
* \`でなければ\` は対応する \`もし\` の本体後、同じ \`end\` の前に1回だけ書いてください。
* C型制御ブロックの本体を空にしてはいけません。
* 新しいトップレベルスクリプトは、前のC型制御ブロックをすべて \`end\` で閉じた後に開始してください。

## 代入と増減
* 変数・x座標・y座標の現在値への加減算には、必ず「ずつ変える」を使用してください。
* 「ずつ変える」の入力には増減量だけを入れ、変更対象自身を含めてはいけません。
* 固定数を減算するときは、負の数値を直接入力してください。たとえば10減らす場合の増減量は \`(-10)\` です。
* 変数・座標・レポーター・演算結果など、実行時に決まる値を減算するときだけ、増減量を \`((0) - (減少量))\` の形にしてください。
* 「にする」は初期値、絶対値、または変更対象自身を含まない計算結果の代入にだけ使用してください。
* 変更対象自身に対する掛け算代入・割り算代入は生成しないでください。「ずつ変える」へ変換できず、この出力契約では扱いません。

## 不明なブロック
* 現在コードに \`:: grey\` の行があるターゲットは、このコンパイラでは安全に編集できません。そのターゲット全体を現在コードのまま保持し、内容を推測・翻訳・置換・削除しないでください。
* リファレンスにない新しいブロックや独自ブロックは生成しないでください。

## 出力前の内部検査
回答前に以下を順番に検査し、違反が1つでもあれば修正してから出力してください。検査結果は回答に書きません。
1. 最後の \`\`\`scratch-project\` がちょうど1個で、全ターゲットの見出しが入力と同名・同順・各1回になっている。
2. 各ターゲットが、完全なコードまたは \`# ブロックなし\` のどちらか一方になっている。
3. 解説用 \`\`\`scratch\` にターゲット見出し、\`# ブロックなし\`、存在しないブロックがなく、各コード行が完成コードにも実在する。
4. 各コード行がリファレンスに存在する完全な1ブロックで、説明・省略・プレースホルダーがない。
5. すべての入力括弧が閉じ、空入力がなく、各メニューに \`v\` がある。
6. すべての条件入力が完全なBooleanブロックである。
7. C型制御ブロックと \`end\` の数・入れ子が一致し、各本体が空でない。
8. 変更しないコードが保持され、依頼されていない機能や素材が追加されていない。
9. 変数・x座標・y座標自身への加減算が「ずつ変える」になり、その入力に変更対象自身がない。固定数の減算は負数、動的な値の減算は \`((0) - (値))\` になっている。
10. Stageと各スプライトに、そのターゲットで使用できないブロックがない。最後にコード全体を上から1行ずつ再読する。

## 厳密な記法例
以下は構文だけを示します。名前・数値・処理内容を実際の回答へ流用してはいけません。
* 数値: \`(-10)\`
* 変数レポーター: \`(変数名)\`
* 二項演算: \`((1) + (2))\`
* 比較条件: \`<(1) > (0)>\`
* 論理積: \`<<マウスが押された> かつ <(1) > (0)>>\`
* 論理和: \`<<マウスが押された> または <(1) > (0)>>\`
* 否定: \`<<マウスが押された> ではない>\`
* 条件分岐の先頭: \`もし <(1) > (0)> なら\`
* 条件待機: \`<マウスが押された> まで待つ\`
* 固定数による減算更新: \`[変数名 v] を (-10) ずつ変える\`
* 動的な値による減算更新: \`[変数名 v] を ((0) - (減少量)) ずつ変える\`
* 空ターゲット: ターゲット見出しの次の行に \`# ブロックなし\`

## 簡易的な出力例
以下は出力形式と構文だけを示す例です。名前・数値・処理内容を実際の回答へ流用してはいけません。
最初に、プログラムが始まったときに使う値を準備します。これを「初期化」といいます。
\`\`\`scratch
[値 v] を (3) にする
\`\`\`
次に、同じ処理を繰り返し、条件を満たしている間だけ値を変えます。
\`\`\`scratch
ずっと
もし <(値) > (0)> なら
[値 v] を (-1) ずつ変える
end
end
\`\`\`
最後に、VMへ反映する全ターゲットの完成コードを出力します。
\`\`\`scratch-project
# Stage
# ブロックなし

# SpriteA
⚑ が押されたとき
[値 v] を (3) にする
ずっと
もし <(値) > (0)> なら
[値 v] を (-1) ずつ変える
end
end
\`\`\`

## Scratch 3.0ブロック・リファレンス
以下は使用可能な構文の一覧であり、作るべき作品の例ではありません。依頼されていない項目は使用しないでください。
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
* \`[文字列] と (2) 秒言う\` / \`[文字列] と言う\`: 吹き出しで話す。
* \`[文字列] と (2) 秒考える\` / \`[文字列] と考える\`: 思考の吹き出しを表示する。
* \`コスチュームを (コスチューム名 v) にする\` / \`次のコスチュームにする\`: コスチュームを変える。
* \`背景を (背景名 v) にする\` / \`背景を (背景名 v) にして待つ\` / \`次の背景にする\`: 背景を変える。
* \`大きさを (10) ずつ変える\` / \`大きさを (100) %にする\`: 大きさを変える。
* \`[色 v] の効果を (25) ずつ変える\` / \`[色 v] の効果を (0) にする\`: 画像効果を変える。
* \`画像効果をなくす\`: 画像効果を消す。
* \`表示する\` / \`隠す\`: スプライトの表示状態を変える。
* \`[最前面 v] へ移動する\` / \`(1) 層 [手前に出す v]\`: 表示レイヤーを変える。
* \`(コスチュームの [番号 v])\` / \`(背景の [番号 v])\` / \`(大きさ)\`: 見た目の状態を返す。

### 音
* \`終わるまで (音名 v) の音を鳴らす\` / \`(音名 v) の音を鳴らす\`: 音を再生する。
* \`すべての音を止める\`: 再生中の音を止める。
* \`[ピッチ v] の効果を (10) ずつ変える\` / \`[ピッチ v] の効果を (100) にする\`: 音響効果を変える。
* \`音の効果をなくす\`: 音響効果を消す。
* \`音量を (-10) ずつ変える\` / \`音量を (100) %にする\`: 音量を変える。
* \`(音量)\`: 現在の音量を返す。

### イベント
* \`⚑ が押されたとき\`: 緑の旗で開始する。
* \`[スペース v] キーが押されたとき\`: キー入力で開始する。
* \`このスプライトが押されたとき\`: スプライトのクリックで開始する。
* \`ステージが押されたとき\`: ステージのクリックで開始する。
* \`背景が [背景名 v] になったとき\`: 背景変更で開始する。
* \`[音量 v] > (10) のとき\`: 値がしきい値を超えたら開始する。
* \`[メッセージ名 v] を受け取ったとき\`: メッセージ受信で開始する。
* \`(メッセージ名 v) を送る\` / \`(メッセージ名 v) を送って待つ\`: メッセージを送る。

### 制御
* \`(1) 秒待つ\`: 指定時間待つ。
* \`(10) 回繰り返す\` と末尾の \`end\`: 中の処理を指定回数繰り返す。
* \`ずっと\` と末尾の \`end\`: 中の処理を繰り返し続ける。
* \`もし <Booleanブロック> なら\` と末尾の \`end\`: 条件が真のときだけ実行する。
* \`もし <Booleanブロック> なら\`、\`でなければ\`、末尾の \`end\`: 条件で処理を分岐する。
* \`<Booleanブロック> まで待つ\`: 条件が真になるまで待つ。
* \`<Booleanブロック> まで繰り返す\` と末尾の \`end\`: 条件が真になるまで繰り返す。
* \`[すべてを止める v]\`: スクリプトを停止する。
* \`クローンされたとき\`: クローン作成時に開始する。
* \`[自分自身 v] のクローンを作る\` / \`このクローンを削除する\`: クローンを作成・削除する。

### 調べる
* \`<(マウスのポインター v) に触れた>\`: 対象に触れているか返す。
* \`<[#ff0000] に触れた>\` / \`<[#ff0000] 色が [#00ff00] 色に触れた>\`: 色の接触を返す。
* \`((マウスのポインター v) までの距離)\`: 対象までの距離を返す。
* \`[質問文] と聞いて待つ\` / \`(答え)\`: 質問して答えを取得する。
* \`<(スペース v) キーが押された>\` / \`<マウスが押された>\`: 入力状態を返す。
* \`(マウスのx座標)\` / \`(マウスのy座標)\`: マウス座標を返す。
* \`ドラッグ [できる v] ようにする\`: ドラッグ可否を設定する。
* \`(音量)\` / \`(タイマー)\` / \`タイマーをリセット\`: 音量・タイマーを扱う。
* \`((ステージ v) の [背景# v])\`: 対象の属性を返す。
* \`(現在の [年 v])\` / \`(2000年からの日数)\` / \`(ユーザー名)\`: 日時やユーザー情報を返す。

### 演算
* \`((左入力) + (右入力))\` / \`((左入力) - (右入力))\` / \`((左入力) * (右入力))\` / \`((左入力) / (右入力))\`: 四則演算を行う。
* \`((下限) から (上限) までの乱数)\`: 範囲内の乱数を返す。
* \`<(左入力) > (右入力)>\` / \`<(左入力) < (右入力)>\` / \`<(左入力) = (右入力)>\`: 値を比較する。
* \`<<Booleanブロック> かつ <Booleanブロック>>\` / \`<<Booleanブロック> または <Booleanブロック>>\` / \`<<Booleanブロック> ではない>\`: 論理演算を行う。
* \`([文字列1] と [文字列2])\`: 文字列をつなぐ。
* \`([文字列] の (位置) 番目の文字)\` / \`([文字列] の長さ)\` / \`<[文字列1] に [文字列2] が含まれる>\`: 文字列を調べる。
* \`((値1) を (値2) で割った余り)\` / \`((値) を四捨五入)\` / \`((値) の [演算名 v])\`: 数学演算を行う。

### 変数
* \`(変数名)\`: 変数の値を返す。
* \`[変数名 v] を (0) にする\`: 変数へ値を設定する。
* \`[変数名 v] を (1) ずつ変える\`: 指定した増減量だけ変数を増減する。入力に変更対象自身を含めない。
* 現在値への加減算は必ず「ずつ変える」を使い、「にする」で変更対象自身へ再代入しない。
* \`変数 [変数名 v] を表示する\` / \`変数 [変数名 v] を隠す\`: 変数モニターを表示・非表示にする。

### リスト
* \`[項目] を [リスト名 v] に追加する\`: リストへ項目を追加する。
* \`[リスト名 v] の (1) 番目を削除する\` / \`[リスト名 v] のすべてを削除する\`: 項目を削除する。
* \`[項目] を [リスト名 v] の (1) 番目に挿入する\`: 項目を挿入する。
* \`[リスト名 v] の (1) 番目を [項目] で置き換える\`: 項目を置換する。
* \`([リスト名 v] の (1) 番目)\` / \`([リスト名 v] 中の [項目] の場所)\`: リストの項目・項目番号を返す。
* \`([リスト名 v] の長さ)\` / \`([リスト名 v])\`: リストの長さ・内容を返す。
* \`<[リスト名 v] に [項目] が含まれる>\`: 項目が含まれるか返す。
* \`リスト [リスト名 v] を表示する\` / \`リスト [リスト名 v] を隠す\`: リストモニターを表示・非表示にする。

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
        const prompt = `次の「現在のプログラム」を唯一のコード基準として、ユーザーの依頼を反映してください。
過去の会話にあるコードではなく、必ずこのコードから編集を開始してください。

<current_program>
\`\`\`scratch
${projectScratchBlocks}
\`\`\`
</current_program>

<request>
ユーザーの依頼:
${inputValue}
</request>

中学生にもわかるように、変更後のプログラムの構造と処理の流れを順番に説明してください。
必要なら、解説する実在ブロックだけをターゲット見出しなしの \`\`\`scratch\` 断片で示してください。
変更後の完成したプログラムは、回答の最後に全ターゲットの見出しを含む1個の \`\`\`scratch-project\` コードブロックで返してください。
現在コードにある全ターゲット・未変更コード・空ターゲットを保持し、インデントは使用しないでください。
解説用のScratch断片には、\`# Stage\`、スプライト見出し、\`# ブロックなし\`、完成コードに存在しないブロックを含めないでください。
回答直前に、各行の対応構文、Boolean入力、括弧、メニューのv、end、全ターゲット、未変更コードの保持を検査してください。
構文テンプレートやリファレンスの内容を作品の機能として流用しないでください。`;

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
