import os
import uuid
import json
import queue
import argparse
import threading
import re
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from threading import Lock
from werkzeug.exceptions import BadRequest

load_dotenv()

# --- Argument Parsing ---
# parser = argparse.ArgumentParser(description='Scratch LLM Server')
# parser.add_argument(
#     '--no-approval',
#     action='store_true',
#     default=False,
#     help='起動時に承認モードをオフにする'
# )
# args = parser.parse_args()

app = Flask(__name__, static_folder=None)
CORS(app)


def env_flag(name, default=True):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in ('0', 'false', 'no', 'off')


def is_rate_limit_error(error):
    status_code = getattr(error, 'status_code', None)
    if status_code == 429:
        return True
    code = getattr(error, 'code', None)
    if code == 'rate_limit_exceeded':
        return True
    return '429' in str(error) or 'Too Many Requests' in str(error)


def rate_limit_response():
    return jsonify({
        'error': {
            'code': 'rate_limited',
            'message': 'OpenAI APIの利用上限に達しました。少し時間をおいてからもう一度試してください。'
        }
    }), 429


# --- Global State ---
state_lock = Lock()
app_state = {
    # "approval_mode": not args.no_approval,
    "approval_mode": False,
    "ai_enabled": True,
    "syntax_repair_enabled": env_flag('SCRATCH_SYNTAX_REPAIR_ENABLED', True),
}

# id -> {
#   "input": str,
#   "output": str | None,   # None = AI応答待ち
#   "status": "waiting" | "ready",
#   "student_queue": Queue
# }
pending_responses = {}
pending_lock = Lock()

admin_queues = []
admin_queues_lock = Lock()

LLM_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-5.4')
SYNTAX_REPAIR_MODEL = os.environ.get('OPENAI_SYNTAX_REPAIR_MODEL', 'gpt-5.4-mini')
SPRITE_REQUIREMENT_MODEL = os.environ.get('OPENAI_SPRITE_REQUIREMENT_MODEL', LLM_MODEL)
PROMPT_PATH = os.path.join(os.path.dirname(__file__), 'scratch_system_prompt.txt')
with open(PROMPT_PATH, encoding='utf-8') as prompt_file:
    # Recreate the leading and trailing newlines from the original JS template literal.
    prompt_text = prompt_file.read().replace('\\`', '`').strip()
    SYSTEM_PROMPT = f'\n{prompt_text}\n'

EXPLANATION_LENGTH_PROMPTS = {
    'long': """## 説明の長さ: 長い
説明は、コードを初めて学ぶ中学生が、完成後の動きだけでなく「なぜこの作り方にしたのか」まで理解できる詳しさにしてください。
最初に変更内容の全体像を示し、その後、初期化、入力、条件分岐、繰り返し、値の更新、画面上の結果などを、実行される順番に沿って丁寧に説明してください。
追加・変更した重要なブロックについては、その役割、前後のブロックとのつながり、その順番に置く理由を説明してください。
変数や条件式を使う場合は、代表的な値を使った具体例を添えて、実行中に値や動きがどう変化するか説明してください。
専門用語を使う場合は、初めて出てきた箇所で短く意味を説明してください。
理解に役立つ場合は、完成コードに実在する小さなScratchBlocks断片を複数示してください。
同じ内容の言い換えで文章量を増やさず、各段落に新しい情報を含めてください。""",
    'normal': """## 説明の長さ: 普通
説明は、中学生が変更内容とプログラムの動きを無理なく理解できる標準的な詳しさにしてください。
最初に何を変更したかを簡潔に示し、その後、重要な処理を実行される順番に沿って説明してください。
条件分岐、繰り返し、変数など、動きを理解するために重要な仕組みは、その役割と結果が分かるように説明してください。
細かなブロックを一行ずつ説明する必要はありませんが、なぜその処理が必要なのかは重要な箇所で示してください。
説明用のScratchBlocks断片は、処理の理解に役立つ重要部分だけに絞ってください。
重複した説明や、依頼と関係のない一般論は避けてください。""",
    'short': """## 説明の長さ: 短い
説明は、結果をすばやく確認したいユーザー向けに、必要最小限の長さにしてください。
変更した内容と、完成したプログラムがどの順番で動くかを、短い段落または少数の箇条書きで説明してください。
理由の説明は、理解しないと使い方を誤る重要な点だけに限定してください。
ブロックを一行ずつ説明したり、専門用語の詳しい解説、具体例、同じ内容の言い換えを追加したりしないでください。
説明用のScratchBlocks断片は原則として使わず、文章だけでは重要な処理を説明できない場合に限って1個だけ使用してください。"""
}


def require_string(data, name, max_length):
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise BadRequest(f'{name} must be a non-empty string.')
    if len(value) > max_length:
        raise BadRequest(f'{name} is too long.')
    return value


def sanitize_history(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise BadRequest('history must be an array.')

    history = []
    for item in value:
        if not isinstance(item, dict):
            continue
        role = item.get('role')
        content = item.get('content')
        if role not in ('user', 'assistant') or not isinstance(content, str):
            continue
        history.append({'role': role, 'content': content})
    return history


def sanitize_sprite_catalog(value):
    if not isinstance(value, list):
        raise BadRequest('spriteCatalog must be an array.')

    use_japanese_names = env_flag('SCRATCH_SPRITE_JAPANESE_NAMES_ENABLED', True)
    catalog = []
    for item in value[:1000]:
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        tags = item.get('tags', [])
        costumes = item.get('costumes', [])
        sounds = item.get('sounds', [])
        display_name = item.get('displayName')
        japanese_name = item.get('japaneseName')
        aliases = item.get('aliases', [])
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(tags, list):
            tags = []
        if not isinstance(costumes, list):
            costumes = []
        if not isinstance(sounds, list):
            sounds = []
        if not isinstance(aliases, list):
            aliases = []
        sanitized_name = name.strip()[:100]
        sanitized_display_name = (
            display_name.strip()[:120]
            if use_japanese_names and isinstance(display_name, str)
            else sanitized_name
        )
        sanitized_japanese_name = (
            japanese_name.strip()[:40]
            if use_japanese_names and isinstance(japanese_name, str)
            else ''
        )
        catalog.append({
            'name': sanitized_name,
            'displayName': sanitized_display_name,
            'japaneseName': sanitized_japanese_name,
            'aliases': [
                alias.strip()[:120]
                for alias in aliases[:10]
                if use_japanese_names and isinstance(alias, str) and alias.strip()
            ],
            'tags': [
                tag.strip()[:50]
                for tag in tags[:20]
                if isinstance(tag, str) and tag.strip()
            ],
            'costumes': [
                costume.strip()[:80]
                for costume in costumes[:30]
                if isinstance(costume, str) and costume.strip()
            ],
            'sounds': [
                sound.strip()[:80]
                for sound in sounds[:30]
                if isinstance(sound, str) and sound.strip()
            ]
        })
    if not catalog:
        raise BadRequest('spriteCatalog must contain at least one sprite.')
    return catalog


def sanitize_optional_sprite_catalog(value):
    if value is None:
        return []
    return sanitize_sprite_catalog(value)


def sanitize_current_assets(value):
    if value is None:
        return {'targets': []}
    if not isinstance(value, dict) or not isinstance(value.get('targets'), list):
        raise BadRequest('currentAssets must contain a targets array.')

    targets = []
    for target in value['targets'][:100]:
        if not isinstance(target, dict):
            continue
        name = target.get('name')
        if not isinstance(name, str) or not name.strip():
            continue
        costumes = target.get('costumes', [])
        sounds = target.get('sounds', [])
        if not isinstance(costumes, list):
            costumes = []
        if not isinstance(sounds, list):
            sounds = []
        targets.append({
            'name': name.strip()[:100],
            'costumes': [
                item.strip()[:100]
                for item in costumes[:100]
                if isinstance(item, str) and item.strip()
            ],
            'sounds': [
                item.strip()[:100]
                for item in sounds[:100]
                if isinstance(item, str) and item.strip()
            ]
        })
    return {'targets': targets}


def sanitize_existing_sprites(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise BadRequest('existingSprites must be an array.')
    return [
        item.strip()[:100]
        for item in value[:100]
        if isinstance(item, str) and item.strip()
    ]


def build_sprite_requirement_messages(data):
    user_input = require_string(data, 'userInput', 10000)
    current_program = require_string(data, 'currentProgram', 200000)
    current_assets = sanitize_current_assets(data.get('currentAssets'))
    catalog = sanitize_optional_sprite_catalog(data.get('spriteCatalog'))
    existing_sprites = sanitize_existing_sprites(data.get('existingSprites'))

    def catalog_line(item):
        asset_parts = []
        if item['costumes']:
            asset_parts.append(f'コスチューム: {", ".join(item["costumes"])}')
        if item['sounds']:
            asset_parts.append(f'音: {", ".join(item["sounds"])}')
        asset_text = f'（{" / ".join(asset_parts)}）' if asset_parts else ''
        return f'- {item["displayName"]}{asset_text}'

    catalog_text = '\n'.join(catalog_line(item) for item in catalog) if catalog else '未指定'
    prompt = f"""次のScratchプログラム変更依頼を、コード修正の観点から解析してください。
目的は「Scratchライブラリから自動追加すべきスプライト・コスチューム・音が本当に必要か」を保守的に判定することです。

ルール:
- 既存スプライトの動作変更、入力キー、条件、変数、見た目変更、説明依頼では新規スプライトを要求しない。
- ユーザーが明示した新しい登場物・キャラクター・物体が、既存スプライトだけでは実現できない場合だけ requiredSprites に入れる。
- ユーザーが明示したコスチューム・見た目素材・音が現在の素材にない場合も、requiredSprites に「犬の音」「走るコスチューム」のような必要素材の短い説明を入れる。
- 音やコスチュームだけが必要な場合は、新しい登場物として画面に出す必要はないが、素材を含むライブラリスプライトを後段で選べるよう requiredSprites に入れる。
- 「矢印で移動」はキーボードの矢印キー操作を意味する。矢印スプライト、矢印画像、左右ボタンを要求してはいけない。
- UIボタンや操作説明用の画像は、ユーザーが「画面に追加して」と明示した場合だけ要求する。
- 既存スプライトで代用できる対象は existingSpritesToReuse に入れ、requiredSprites には入れない。
- スプライトを新しく画面に登場させる必要がある場合は sprites に入れる。
- 既存スプライトへコスチューム・音だけを追加すればよい場合は assetAdditions に入れ、sprites には入れない。
- requiredSprites は説明用です。実際に追加する素材は必ず sprites または assetAdditions にも入れる。
- 例: 「バナナから逃げるゲーム」は requiredSprites に「バナナ」、sprites に {{"spriteName":"Bananas"}} を入れる。
- spriteName/sourceSpriteName はスプライト一覧にある名前だけを使用する。
- costumeNames/soundNames は、その sourceSpriteName の行に書かれたコスチューム名・音名だけを使用する。
- 迷う場合は requiredSprites を空配列にする。

現在のプログラム:
```scratch
{current_program}
```

現在の素材:
{json.dumps(current_assets, ensure_ascii=False)}

既存スプライト一覧:
{json.dumps(existing_sprites, ensure_ascii=False)}

スプライト一覧:
{catalog_text}

ユーザーの依頼:
{user_input}

JSONだけを返してください。
形式:
{{
  "requiredSprites": ["新しく必要なスプライト・コスチューム・音の短い説明"],
  "sprites": [{{"spriteName": "追加するライブラリスプライト名"}}],
  "assetAdditions": [
    {{
      "targetName": "素材を追加する既存スプライト名",
      "sourceSpriteName": "素材を持つライブラリスプライト名",
      "costumeNames": ["追加するコスチューム名"],
      "soundNames": ["追加する音名"]
    }}
  ],
  "existingSpritesToReuse": ["再利用する既存スプライト名"],
  "forbiddenSpriteAdditions": ["追加してはいけないもの"],
  "reason": "短い理由"
}}"""
    return [
        {
            'role': 'system',
            'content': 'あなたはScratchコード修正のための素材要求ゲートです。JSONだけを返します。'
        },
        {'role': 'user', 'content': prompt}
    ]


def parse_sprite_requirement(content):
    try:
        plan = json.loads(content or '{}')
    except json.JSONDecodeError:
        return {
            'requiredSprites': [],
            'sprites': [],
            'assetAdditions': [],
            'existingSpritesToReuse': [],
            'forbiddenSpriteAdditions': [],
            'reason': ''
        }
    if not isinstance(plan, dict):
        plan = {}

    def string_list(name):
        value = plan.get(name)
        if not isinstance(value, list):
            return []
        return [
            item.strip()[:120]
            for item in value[:10]
            if isinstance(item, str) and item.strip()
        ]

    catalog = []
    valid_names = set()
    assets_by_name = {}
    raw_catalog = plan.get('_catalog')
    if isinstance(raw_catalog, list):
        catalog = raw_catalog
    for item in catalog:
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        if not isinstance(name, str):
            continue
        valid_names.add(name)
        assets_by_name[name] = {
            'costumes': set(item.get('costumes', []) if isinstance(item.get('costumes'), list) else []),
            'sounds': set(item.get('sounds', []) if isinstance(item.get('sounds'), list) else [])
        }

    def sprite_list():
        value = plan.get('sprites')
        if not isinstance(value, list):
            return []
        result = []
        for item in value[:10]:
            if not isinstance(item, dict):
                continue
            sprite_name = item.get('spriteName')
            if not isinstance(sprite_name, str) or not sprite_name.strip():
                continue
            if valid_names and sprite_name not in valid_names:
                continue
            result.append({'spriteName': sprite_name.strip()[:100]})
        return result

    def asset_additions():
        value = plan.get('assetAdditions')
        if not isinstance(value, list):
            return []
        result = []
        for item in value[:10]:
            if not isinstance(item, dict):
                continue
            target_name = item.get('targetName')
            source_name = item.get('sourceSpriteName')
            if not isinstance(target_name, str) or not target_name.strip():
                continue
            if not isinstance(source_name, str) or not source_name.strip():
                continue
            source_name = source_name.strip()[:100]
            if valid_names and source_name not in valid_names:
                continue
            costume_names = item.get('costumeNames', [])
            sound_names = item.get('soundNames', [])
            if not isinstance(costume_names, list):
                costume_names = []
            if not isinstance(sound_names, list):
                sound_names = []
            valid_costumes = assets_by_name.get(source_name, {}).get('costumes', set())
            valid_sounds = assets_by_name.get(source_name, {}).get('sounds', set())
            costumes = [
                name.strip()[:100]
                for name in costume_names[:20]
                if isinstance(name, str) and name.strip() and (not valid_costumes or name.strip() in valid_costumes)
            ]
            sounds = [
                name.strip()[:100]
                for name in sound_names[:20]
                if isinstance(name, str) and name.strip() and (not valid_sounds or name.strip() in valid_sounds)
            ]
            if not costumes and not sounds:
                continue
            result.append({
                'targetName': target_name.strip()[:100],
                'sourceSpriteName': source_name,
                'costumeNames': costumes,
                'soundNames': sounds
            })
        return result

    reason = plan.get('reason')
    return {
        'requiredSprites': string_list('requiredSprites'),
        'sprites': sprite_list(),
        'assetAdditions': asset_additions(),
        'existingSpritesToReuse': string_list('existingSpritesToReuse'),
        'forbiddenSpriteAdditions': string_list('forbiddenSpriteAdditions'),
        'reason': reason.strip()[:500] if isinstance(reason, str) else ''
    }


def normalize_catalog_match_text(value):
    return re.sub(r'[\s（）()・_\-]+', '', str(value or '').strip().lower())


def is_asset_only_requirement(value):
    return bool(re.search(
        r'音|鳴|なら|流|sound|play|コスチューム|衣装|見た目|姿|変身|変化|変える|costume|look|transform',
        str(value or ''),
        re.I
    ))


def catalog_match_terms(item):
    values = [
        item.get('name'),
        item.get('displayName'),
        item.get('japaneseName')
    ]
    aliases = item.get('aliases')
    if isinstance(aliases, list):
        values.extend(aliases)
    tags = item.get('tags')
    if isinstance(tags, list):
        values.extend(tags)
    terms = []
    for value in values:
        if isinstance(value, str) and value.strip():
            terms.append(normalize_catalog_match_text(value))
    return [term for term in terms if term]


def infer_sprites_from_required_sprites(required_sprites, catalog, existing_sprites):
    if not catalog:
        return []
    existing_normalized = {
        normalize_catalog_match_text(name)
        for name in existing_sprites
        if isinstance(name, str)
    }
    result = []
    added = set()
    for required in required_sprites[:10]:
        if is_asset_only_requirement(required):
            continue
        normalized_required = normalize_catalog_match_text(required)
        if not normalized_required:
            continue
        for item in catalog:
            if not isinstance(item, dict):
                continue
            name = item.get('name')
            if not isinstance(name, str) or not name.strip() or name in added:
                continue
            terms = catalog_match_terms(item)
            if normalize_catalog_match_text(name) in existing_normalized:
                continue
            if any(
                normalized_required == term or
                normalized_required in term or
                term in normalized_required
                for term in terms
            ):
                result.append({'spriteName': name.strip()[:100]})
                added.add(name)
                break
    return result


def parse_sprite_requirement_with_catalog(content, catalog):
    try:
        plan = json.loads(content or '{}')
    except json.JSONDecodeError:
        plan = {}
    if not isinstance(plan, dict):
        plan = {}
    plan['_catalog'] = catalog
    parsed = parse_sprite_requirement(json.dumps(plan, ensure_ascii=False))
    if not parsed['sprites'] and not parsed['assetAdditions']:
        parsed['sprites'] = infer_sprites_from_required_sprites(
            parsed['requiredSprites'],
            catalog,
            parsed['existingSpritesToReuse']
        )
    return parsed


def build_llm_messages(data):
    user_input = require_string(data, 'userInput', 10000)
    current_program = require_string(data, 'currentProgram', 200000)
    current_assets = sanitize_current_assets(data.get('currentAssets'))
    explanation_length = data.get('explanationLength', 'normal')
    if explanation_length not in EXPLANATION_LENGTH_PROMPTS:
        explanation_length = 'normal'

    system_prompt = f'{SYSTEM_PROMPT}\n{EXPLANATION_LENGTH_PROMPTS[explanation_length]}'
    task_prompt = f"""次の「現在のプログラム」を唯一のコード基準として、ユーザーの依頼を反映してください。
過去の会話にあるコードではなく、必ずこのコードから編集を開始してください。

<current_program>
```scratch
{current_program}
```
</current_program>

<current_assets>
{json.dumps(current_assets, ensure_ascii=False)}
</current_assets>

<request>
ユーザーの依頼:
{user_input}
</request>

中学生にもわかるように、変更後のプログラムの構造と処理の流れを順番に説明してください。
必要なら、解説する実在ブロックだけをターゲット見出しなしの ```scratch``` 断片で示してください。
変更後の完成したプログラムは、回答の最後に全ターゲットの見出しを含む1個の ```scratch-project``` コードブロックで返してください。
現在コードにある全ターゲット・未変更コード・空ターゲットを保持し、インデントは使用しないでください。
`current_assets` は各ターゲットで使用できる素材名の一覧です。コスチューム・背景・音はこの一覧にある名前だけを使用してください。
解説用のScratch断片には、`# Stage`、スプライト見出し、`# ブロックなし`、完成コードに存在しないブロックを含めないでください。
回答直前に、各行の対応構文、Boolean入力、括弧、メニューのv、end、全ターゲット、未変更コードの保持を検査してください。
構文テンプレートやリファレンスの内容を作品の機能として流用しないでください。"""
    return [
        {'role': 'system', 'content': system_prompt},
        *sanitize_history(data.get('history')),
        {'role': 'user', 'content': task_prompt}
    ]


def parse_json_request():
    """Parse JSON as UTF-8, with CP932 fallback for Japanese legacy clients."""
    raw_body = request.get_data(cache=True)
    if not raw_body:
        return {}

    decode_errors = []
    for encoding in ('utf-8-sig', 'cp932'):
        try:
            text = raw_body.decode(encoding)
            data = json.loads(text)
            if not isinstance(data, dict):
                raise BadRequest('JSON request body must be an object.')
            return data
        except UnicodeDecodeError as error:
            decode_errors.append(f'{encoding}: {error}')
        except json.JSONDecodeError as error:
            raise BadRequest(f'Failed to decode JSON object: {error}') from error

    raise BadRequest(
        'Failed to decode JSON object as UTF-8 or CP932: '
        f'{"; ".join(decode_errors)}'
    )


def normalize_scratch_key_names(code):
    replacements = {
        '[上向き v] キーが押されたとき': '[上向き矢印 v] キーが押されたとき',
        '[下向き v] キーが押されたとき': '[下向き矢印 v] キーが押されたとき',
        '[右向き v] キーが押されたとき': '[右向き矢印 v] キーが押されたとき',
        '[左向き v] キーが押されたとき': '[左向き矢印 v] キーが押されたとき',
        '<(上向き v) キーが押された>': '<(上向き矢印 v) キーが押された>',
        '<(下向き v) キーが押された>': '<(下向き矢印 v) キーが押された>',
        '<(右向き v) キーが押された>': '<(右向き矢印 v) キーが押された>',
        '<(左向き v) キーが押された>': '<(左向き矢印 v) キーが押された>',
    }
    normalized = code
    for wrong, correct in replacements.items():
        normalized = normalized.replace(wrong, correct)
    return normalized


# ─────────────────────────────────────────────
# 管理者全員に通知
# ─────────────────────────────────────────────
def notify_admin(event_type: str, data: dict):
    msg = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    with admin_queues_lock:
        for q in list(admin_queues):
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass


# ─────────────────────────────────────────────
# 管理者 SSE
# ─────────────────────────────────────────────
@app.route('/api/admin/events')
def admin_events():
    q = queue.Queue(maxsize=50)
    with admin_queues_lock:
        admin_queues.append(q)

    with state_lock:
        initial = dict(app_state)
    with pending_lock:
        initial["pending"] = [
            {
                "id": rid,
                "input": v["input"],
                "output": v["output"],
                "status": v["status"]
            }
            for rid, v in pending_responses.items()
        ]

    def stream():
        yield f"event: init\ndata: {json.dumps(initial, ensure_ascii=False)}\n\n"
        try:
            while True:
                try:
                    msg = q.get(timeout=25)
                    yield msg
                except queue.Empty:
                    yield ": heartbeat\n\n"
        finally:
            with admin_queues_lock:
                if q in admin_queues:
                    admin_queues.remove(q)

    return Response(stream(), mimetype='text/event-stream',
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────────
# 生徒側 SSE
# ─────────────────────────────────────────────
@app.route('/api/events/<request_id>')
def student_events(request_id):
    def stream():
        with pending_lock:
            entry = pending_responses.get(request_id)
            if entry is None:
                yield f"event: error\ndata: {json.dumps({'error': 'Not found'})}\n\n"
                return
            q = entry["student_queue"]
        try:
            while True:
                try:
                    msg = q.get(timeout=30)
                    yield msg
                    return
                except queue.Empty:
                    yield ": heartbeat\n\n"
        finally:
            pass

    return Response(stream(), mimetype='text/event-stream',
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────────
# 状態取得
# ─────────────────────────────────────────────
@app.route('/api/status')
def get_status():
    with state_lock:
        return jsonify(dict(app_state))


# ─────────────────────────────────────────────
# バージョン取得
# ─────────────────────────────────────────────
@app.route('/api/version')
def get_version():
    return jsonify({
        "version": "1.0.1"
    })



# ─────────────────────────────────────────────
# 承認モードのトグル
# ─────────────────────────────────────────────
@app.route('/api/admin/toggle-approval', methods=['POST'])
def toggle_approval():
    with state_lock:
        app_state['approval_mode'] = not app_state['approval_mode']
        new_val = app_state['approval_mode']
    notify_admin('state_changed', {'approval_mode': new_val})
    return jsonify({'approval_mode': new_val})


# ─────────────────────────────────────────────
# AI on/off トグル
# ─────────────────────────────────────────────
@app.route('/api/admin/toggle-ai', methods=['POST'])
def toggle_ai():
    with state_lock:
        app_state['ai_enabled'] = not app_state['ai_enabled']
        new_val = app_state['ai_enabled']
    notify_admin('state_changed', {'ai_enabled': new_val})
    return jsonify({'ai_enabled': new_val})


# ─────────────────────────────────────────────
# Scratch構文修正 on/off トグル
# ─────────────────────────────────────────────
@app.route('/api/admin/toggle-syntax-repair', methods=['POST'])
def toggle_syntax_repair():
    with state_lock:
        app_state['syntax_repair_enabled'] = not app_state['syntax_repair_enabled']
        new_val = app_state['syntax_repair_enabled']
    notify_admin('state_changed', {'syntax_repair_enabled': new_val})
    return jsonify({'syntax_repair_enabled': new_val})


# ─────────────────────────────────────────────
# 承認
# ─────────────────────────────────────────────
@app.route('/api/admin/approve/<request_id>', methods=['POST'])
def approve_response(request_id):
    with pending_lock:
        entry = pending_responses.pop(request_id, None)
    if entry is None:
        return jsonify({'error': 'Not found'}), 404
    if entry['status'] != 'ready':
        return jsonify({'error': 'AI response not ready yet'}), 409

    msg = f"event: approved\ndata: {json.dumps({'response': entry['output']}, ensure_ascii=False)}\n\n"
    entry['student_queue'].put_nowait(msg)
    notify_admin('removed', {'id': request_id})
    return jsonify({'status': 'approved'})


# ─────────────────────────────────────────────
# 拒否
# ─────────────────────────────────────────────
@app.route('/api/admin/reject/<request_id>', methods=['POST'])
def reject_response(request_id):
    data = parse_json_request()
    reason = data.get('reason', '先生がこの回答の表示を許可しませんでした。別の質問をしてみてください。')

    with pending_lock:
        entry = pending_responses.pop(request_id, None)
    if entry is None:
        return jsonify({'error': 'Not found'}), 404

    msg = f"event: rejected\ndata: {json.dumps({'reason': reason}, ensure_ascii=False)}\n\n"
    entry['student_queue'].put_nowait(msg)
    notify_admin('removed', {'id': request_id})
    return jsonify({'status': 'rejected'})


# ─────────────────────────────────────────────
# 管理者画面
# ─────────────────────────────────────────────
# @app.route('/admin')
# def admin_ui():
#     return send_from_directory('.', 'admin.html')


# ─────────────────────────────────────────────
# バックグラウンドでOpenAI呼び出し
# ─────────────────────────────────────────────
def call_openai_async(request_id: str, messages: list, model: str):
    """OpenAI APIを非同期で呼び出し、結果をpendingに保存して管理者へ通知"""
    try:
        api_key = os.environ.get('OPENAI_API_KEY')
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        response = client.chat.completions.create(model=model, messages=messages)
        response_content = response.choices[0].message.content

        # 出力モデレーション
        if response_content:
            mod_res = client.moderations.create(input=response_content)
            if mod_res.results[0].flagged:
                print(f"Output Moderation Flagged for {request_id}")
                # 拒否扱いにする
                with pending_lock:
                    entry = pending_responses.pop(request_id, None)
                if entry:
                    msg = f"event: rejected\ndata: {json.dumps({'reason': 'AIが不適切なコンテンツを生成したため、自動的にブロックされました。'}, ensure_ascii=False)}\n\n"
                    entry['student_queue'].put_nowait(msg)
                    notify_admin('removed', {'id': request_id})
                return

        # 応答をpendingに保存してstatusをreadyに更新
        with pending_lock:
            if request_id not in pending_responses:
                return  # 既に拒否済み
            pending_responses[request_id]['output'] = response_content
            pending_responses[request_id]['status'] = 'ready'

        # 管理者へ「応答準備完了」を通知
        notify_admin('response_ready', {
            'id': request_id,
            'output': response_content
        })

    except Exception as e:
        print(f"Background OpenAI error for {request_id}: {e}")
        with pending_lock:
            entry = pending_responses.pop(request_id, None)
        if entry:
            msg = f"event: rejected\ndata: {json.dumps({'reason': f'AIとの通信でエラーが発生しました: {str(e)}'}, ensure_ascii=False)}\n\n"
            entry['student_queue'].put_nowait(msg)
            notify_admin('removed', {'id': request_id})


# ─────────────────────────────────────────────
# ScratchBlocks構文修正
# ─────────────────────────────────────────────
@app.route('/api/repair-scratch', methods=['POST'])
def repair_scratch():
    try:
        with state_lock:
            enabled = app_state['syntax_repair_enabled']
            ai_enabled = app_state['ai_enabled']
        data = parse_json_request()
        code = data.get('code') or ''
        original_code = code
        diagnostics = data.get('diagnostics') or []
        reference_start = SYSTEM_PROMPT.find('## Scratch 3.0ブロック・リファレンス')
        syntax_reference = SYSTEM_PROMPT[reference_start:] if reference_start >= 0 else SYSTEM_PROMPT

        if enabled and code:
            normalized_code = normalize_scratch_key_names(code)
            if normalized_code != code and (not ai_enabled or not diagnostics):
                return jsonify({
                    'enabled': True,
                    'repaired': True,
                    'code': normalized_code
                })
            code = normalized_code

        if not enabled or not ai_enabled or not code or not diagnostics:
            return jsonify({'enabled': enabled, 'repaired': False, 'code': code})

        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({'error': 'OpenAI API key is not set.'}), 500

        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        prompt = f"""次のScratchBlocksプログラムには、コンパイラが認識できない構文があります。
機能、ターゲット、行順、数値、文字列、変数名、リスト名、素材名を変更せず、構文だけを修正してください。
未知行を削除したり、新しい処理を追加したりしないでください。
修正できない行は元のまま残してください。
出力は修正後のプログラム本文だけにし、説明、Markdown、コードフェンスを含めないでください。

診断:
{chr(10).join(str(item) for item in diagnostics)}

使用可能な構文の参考:
{syntax_reference}

プログラム:
{code}"""
        response = client.chat.completions.create(
            model=SYNTAX_REPAIR_MODEL,
            messages=[
                {
                    'role': 'system',
                    'content': 'あなたはScratchBlocks構文だけを保守的に修正するコンパイラ補助です。'
                },
                {'role': 'user', 'content': prompt}
            ]
        )
        repaired_code = normalize_scratch_key_names(
            (response.choices[0].message.content or '').strip()
        )
        return jsonify({
            'enabled': True,
            'repaired': bool(repaired_code and repaired_code != original_code),
            'code': repaired_code or code
        })
    except BadRequest as e:
        return jsonify({'error': e.description}), 400
    except Exception as e:
        print(f"Error repairing ScratchBlocks syntax: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────
# プログラム修正用スプライト要求計画
# ─────────────────────────────────────────────
@app.route('/api/plan-sprites', methods=['POST'])
def plan_sprites():
    try:
        if not env_flag('SCRATCH_AUTO_SPRITE_ADD_ENABLED', True):
            return jsonify({
                'requiredSprites': [],
                'sprites': [],
                'assetAdditions': [],
                'existingSpritesToReuse': [],
                'forbiddenSpriteAdditions': [],
                'reason': '',
                'disabled': True
            })

        with state_lock:
            ai_enabled = app_state['ai_enabled']
        if not ai_enabled:
            return jsonify({
                'requiredSprites': [],
                'sprites': [],
                'assetAdditions': [],
                'disabled': True
            }), 503

        data = parse_json_request()
        messages = build_sprite_requirement_messages(data)
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({'error': 'OpenAI API key is not set.'}), 500

        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        moderation = client.moderations.create(input=data['userInput'])
        if moderation.results[0].flagged:
            return jsonify({
                'error': 'This content violates our safety policies.',
                'flagged': True
            }), 400
        response = client.chat.completions.create(
            model=SPRITE_REQUIREMENT_MODEL,
            messages=messages,
            response_format={'type': 'json_object'}
        )
        content = response.choices[0].message.content
        catalog = sanitize_optional_sprite_catalog(data.get('spriteCatalog'))
        return jsonify(parse_sprite_requirement_with_catalog(content, catalog))
    except BadRequest as e:
        return jsonify({'error': e.description}), 400
    except Exception as e:
        if is_rate_limit_error(e):
            print(f"Rate limited while planning sprites: {e}")
            return rate_limit_response()
        print(f"Error planning sprites: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────
# LLM プロキシ (メイン)
# ─────────────────────────────────────────────
@app.route('/api/llm', methods=['POST'])
def llm_proxy():
    try:
        with state_lock:
            ai_enabled = app_state['ai_enabled']
            approval_mode = app_state['approval_mode']

        if not ai_enabled:
            return jsonify({"error": "AI機能は現在オフになっています。", "disabled": True}), 503

        data = parse_json_request()
        messages = build_llm_messages(data)
        model = LLM_MODEL
        # フロントから送られた生のユーザー入力（JSONを含まない）
        user_input_display = data['userInput']

        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({"error": "OpenAI API key is not set."}), 500

        # 入力モデレーション
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        if user_input_display:
            mod_res = client.moderations.create(input=user_input_display)
            output = mod_res.results[0]
            if output.flagged:
                return jsonify({
                    "error": "This content violates our safety policies.",
                    "flagged": True,
                    "categories": output.categories.model_dump()
                }), 400

        # 承認モード
        # if approval_mode:
        #     request_id = str(uuid.uuid4())
        #     student_q = queue.Queue(maxsize=1)
        #     input_text = user_input_display

        #     # ① 即座にpendingに登録（status=waiting, output=None）
        #     with pending_lock:
        #         pending_responses[request_id] = {
        #             "input": input_text,
        #             "output": None,
        #             "status": "waiting",
        #             "student_queue": student_q
        #         }

        #     # ② 管理者へ即座に通知（入力のみ、まだ出力なし）
        #     notify_admin('new_request', {
        #         "id": request_id,
        #         "input": input_text,
        #         "output": None,
        #         "status": "waiting"
        #     })

        #     # ③ バックグラウンドでOpenAI呼び出し開始
        #     t = threading.Thread(
        #         target=call_openai_async,
        #         args=(request_id, messages, model),
        #         daemon=True
        #     )
        #     t.start()

        #     # ④ 生徒にはrequest_idだけ返す
        #     return jsonify({"pending": True, "request_id": request_id})

        # 通常モード: 同期で処理
        response = client.chat.completions.create(model=model, messages=messages)
        response_content = response.choices[0].message.content

        if response_content:
            mod_out = client.moderations.create(input=response_content)
            if mod_out.results[0].flagged:
                return jsonify({
                    "error": "The AI generated content that violates safety policies.",
                    "flagged": True
                }), 500

        return jsonify(response.model_dump())

    except BadRequest as e:
        print(f"Bad request in llm_proxy: {e.description}")
        return jsonify({"error": e.description}), 400
    except Exception as e:
        if is_rate_limit_error(e):
            print(f"Rate limited in llm_proxy: {e}")
            return rate_limit_response()
        print(f"Error in llm_proxy: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    mode_str = "ON" if app_state['approval_mode'] else "OFF"
    # print(f"[Server] 承認モード: {mode_str}  (--no-approval で起動時OFF)")
    print(f"[Server] 承認モード: {mode_str}")
    app.run(port=3001, debug=True, threaded=True)
