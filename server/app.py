import os
import uuid
import json
import queue
import argparse
import threading
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

app = Flask(__name__, static_folder='.')
CORS(app)

# --- Global State ---
state_lock = Lock()
app_state = {
    # "approval_mode": not args.no_approval,
    "approval_mode": False,
    "ai_enabled": True,
    "syntax_repair_enabled": os.environ.get(
        'SCRATCH_SYNTAX_REPAIR_ENABLED', 'true'
    ).lower() in ('1', 'true', 'yes', 'on'),
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
        diagnostics = data.get('diagnostics') or []
        syntax_reference = data.get('syntaxReference') or ''

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
            model='gpt-5.4-mini',
            messages=[
                {
                    'role': 'system',
                    'content': 'あなたはScratchBlocks構文だけを保守的に修正するコンパイラ補助です。'
                },
                {'role': 'user', 'content': prompt}
            ]
        )
        repaired_code = (response.choices[0].message.content or '').strip()
        return jsonify({
            'enabled': True,
            'repaired': bool(repaired_code and repaired_code != code),
            'code': repaired_code or code
        })
    except BadRequest as e:
        return jsonify({'error': e.description}), 400
    except Exception as e:
        print(f"Error repairing ScratchBlocks syntax: {e}")
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
        messages = data.get('messages')
        model = data.get('model', 'gpt-5.4')
        # フロントから送られた生のユーザー入力（JSONを含まない）
        user_input_display = data.get('userInput') or '(不明な入力)'

        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({"error": "OpenAI API key is not set."}), 500

        # 入力モデレーション
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        last_user_message = next(
            (msg['content'] for msg in reversed(messages) if msg['role'] == 'user'), None
        )

        if last_user_message:
            mod_res = client.moderations.create(input=last_user_message)
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
        print(f"Error in llm_proxy: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    mode_str = "ON" if app_state['approval_mode'] else "OFF"
    # print(f"[Server] 承認モード: {mode_str}  (--no-approval で起動時OFF)")
    print(f"[Server] 承認モード: {mode_str}")
    app.run(port=3001, debug=True, threaded=True)
