# ScratchLLM

ScratchLLMは、[Scratch Editor](https://github.com/scratchfoundation/scratch-editor)を改変し、
自然言語によるプログラミング支援を追加したプロジェクトです。
Scratch FoundationやMITの公式製品ではなく、両者による承認・推奨を示すものではありません。
公式のScratchを利用する場合は、[ScratchのWebサイト](https://scratch.mit.edu/)をご覧ください。

## ライセンスと帰属

本プロジェクトは、Scratch Editorのライセンスに従い、**GNU Affero General Public License
version 3 only（AGPL-3.0-only）**で提供します。改変・再配布は同ライセンスの条件に従って行えます。
全文は[LICENSE](LICENSE)をご覧ください。法令で認められる範囲で、本ソフトウェアは無保証です。

上流の開発元はScratch FoundationおよびScratchの貢献者です。
継承したコードにはMassachusetts Institute of Technology（MIT）の著作権表示も含まれます。
既存の著作権表示・ライセンス表示・免責表示は保持します。
各パッケージの[NOTICE](packages/scratch-gui/NOTICE)には、従来のBSD-3-Clauseの表示を全文保存しています。
これらは過去のコードに関する表示であり、本プロジェクト全体のAGPL-3.0-onlyを置き換えるものではありません。
依存ライブラリや画像・音声・フォントなど、個別のライセンスがある素材にはそれぞれの条件が適用されます。

Scratchの名称、ロゴ、Scratch Catなどのキャラクターに関する商標はScratch Foundationに帰属します。
ソフトウェアのライセンスによって、派生製品の推奨・宣伝にこれらの商標を使う許可が与えられるわけではありません。
詳しくは[上流の商標表示](https://github.com/scratchfoundation/scratch-editor/blob/develop/TRADEMARK)をご確認ください。

## 上流からの変更

このリポジトリはScratch Editorの改変版です。主な変更は次のとおりです。

- AIチャットとScratchブロックの生成・説明・構文修復。
- スプライト、背景、コスチューム、サウンドの検索と自動選択・追加。
- チャットの展開、ステージサイズなど、エディターの画面構成の変更。
- OpenAI APIとの連携を行うPythonサーバーと管理機能。

Git履歴には2026-02-24以降の本フォークの変更が記録されています。
直近の機能変更は2026-07-19のステージ配置調整です。
2026-10-12にREADMEと各パッケージのライセンス・帰属表示を整備しました。
個々の変更内容、日付、貢献者は`git log`で確認できます。

## リポジトリ構成

| ディレクトリ | 内容 | ライセンス・帰属表示 |
| --- | --- | --- |
| `packages/scratch-gui` | エディターのUIとAIチャット | [LICENSE](packages/scratch-gui/LICENSE) / [NOTICE](packages/scratch-gui/NOTICE) |
| `packages/scratch-render` | ステージ、スプライト、背景の描画 | [LICENSE](packages/scratch-render/LICENSE) / [NOTICE](packages/scratch-render/NOTICE) |
| `packages/scratch-svg-renderer` | SVG画像の処理 | [LICENSE](packages/scratch-svg-renderer/LICENSE) / [NOTICE](packages/scratch-svg-renderer/NOTICE) |
| `packages/scratch-vm` | Scratchプロジェクトの実行 | [LICENSE](packages/scratch-vm/LICENSE) / [NOTICE](packages/scratch-vm/NOTICE) |
| `server` | AI支援用Pythonサーバー、プロンプト、管理画面 | [LICENSE](LICENSE) |

各パッケージのREADMEには、上流由来の技術情報も含まれています。
本フォークの起動には以下の手順を使用してください。

## 開発環境と起動

Node.jsのバージョンは[.nvmrc](.nvmrc)（20.19.2）を参照してください。
Git、npm、Python 3が必要です。以下はリポジトリのルートで実行します。

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r server/requirements.txt
```

`server/.env`を作成し、サーバー側の設定を記載します。
`OPENAI_MODEL`などは利用可能なモデルに合わせて指定してください。

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-model
OPENAI_SYNTAX_REPAIR_MODEL=your-repair-model
OPENAI_ASSET_PLANNING_MODEL=your-planning-model
```

`packages/scratch-gui/.env`に、フロントエンドから接続するAPIのURLを指定します。

```dotenv
REACT_APP_API_BASE_URL=http://localhost:3001
```

Pythonサーバーを起動します。`.env`を読み込むため、`server`ディレクトリで実行します。

```bash
source .venv/bin/activate
cd server
python app.py
```

別のターミナルで、ルートからエディターを起動します。

```bash
npm run start:react --workspace=@scratch/scratch-gui
```

[http://localhost:8601/](http://localhost:8601/)を開いてください。
APIキーはサーバー側の`.env`に保存し、リポジトリやフロントエンドには含めないでください。
`server/index.js`は別のGemini用実装であり、上記のAIチャットには`server/app.py`を使用します。

各パッケージのビルドは、ルートから実行します。

```bash
npm run build
```

## 再配布・公開時のソースコード提供

AGPL第4〜6条に従い、配布物にはライセンス全文、著作権・免責表示、改変内容と日付を含めてください。
ビルド済みの配布物については、第6条に従って対応するソースコードも提供してください。
対応するソースには、実際に配布した版の変更済みコード、必要な依存コード、ビルド・導入・実行用スクリプトを含めます。

改変版をネットワーク経由で利用させる場合は、AGPL第13条に従い、利用者がその版の対応するソースを
無償で取得できる方法を画面上で目立つように案内してください。
本エディターのメニューバーには「ソースコード（GitHub）」へのリンクがあり、現在は
[in044/ScratchLLM](https://github.com/in044/ScratchLLM)を参照しています。
公開時には、[リンク先の設定](packages/scratch-gui/src/components/menu-bar/menu-bar.jsx)を
実際に稼働する版のソースを提供するURLに合わせ、対応するコミットやタグ、取得方法を明示してください。
上流の未改変ソースだけでは、本フォークの対応するソースの提供にはなりません。

この節は提供手順の要約です。正確な条件は[LICENSE](LICENSE)第4〜6条・第13条を参照してください。

## 謝辞

Scratch Foundation、MIT、Scratchコミュニティ、上流と本フォークの貢献者に感謝します。
Scratchの活動への支援については[Scratch Foundation](https://www.scratchfoundation.org/)をご覧ください。
