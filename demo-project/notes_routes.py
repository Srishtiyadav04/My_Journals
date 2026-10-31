import re
from flask import Blueprint, jsonify, request
from storage import (
    get_notes, add_note, delete_note, journal_owned,
    update_note_style, update_note_text,
)
from auth_routes import login_required, current_user_id

notes_bp = Blueprint("notes", __name__)

FONTS = {"sans", "serif", "book", "mono", "cursive", "rounded"}
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

MAX_TEXT = 20000
MAX_RUNS = 2000
RUN_KEYS = {"t", "b", "i", "u", "s", "h", "c", "f", "z"}


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def clean_text(value):
    return value.strip() if isinstance(value, str) else ""


def valid_size(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def read_style(data):
    font = data.get("font") or "sans"
    size = data.get("size", 16)
    color = data.get("color") or ""
    title_font = data.get("title_font") or "sans"
    title_size = data.get("title_size", 20)
    title_color = data.get("title_color") or ""
    title_bold = data.get("title_bold", True)

    if font not in FONTS or title_font not in FONTS:
        return None, "Unknown font"
    if not valid_size(size, 12, 32):
        return None, "Text size must be between 12 and 32"
    if not valid_size(title_size, 14, 48):
        return None, "Title size must be between 14 and 48"
    for c in (color, title_color):
        if c and not (isinstance(c, str) and COLOR_RE.match(c)):
            return None, "Invalid colour"
    if not isinstance(title_bold, bool):
        return None, "Invalid bold setting"

    return {
        "font": font, "size": size, "color": color,
        "title_font": title_font, "title_size": title_size,
        "title_color": title_color, "title_bold": int(title_bold),
    }, None


def clean_runs(value):
    """Checks formatted text: a list of runs like {"t": "hi", "b": 1, "c": "#aabbcc"}."""
    if not isinstance(value, list) or len(value) > MAX_RUNS:
        return None, "Too much formatting in this note"
    runs = []
    total = 0
    for item in value:
        if not isinstance(item, dict) or set(item) - RUN_KEYS:
            return None, "Invalid formatting"
        t = item.get("t")
        if not isinstance(t, str) or t == "":
            return None, "Invalid formatting"
        total += len(t)
        run = {"t": t}
        for key in ("b", "i", "u", "s"):
            if key in item:
                if item[key] not in (0, 1, True, False):
                    return None, "Invalid formatting"
                if item[key]:
                    run[key] = 1
        for key in ("h", "c"):
            if item.get(key):
                if not (isinstance(item[key], str) and COLOR_RE.match(item[key])):
                    return None, "Invalid colour"
                run[key] = item[key].lower()
        if item.get("f"):
            if item["f"] not in FONTS:
                return None, "Unknown font"
            run["f"] = item["f"]
        if item.get("z"):
            if not valid_size(item["z"], 10, 64):
                return None, "Text size must be between 10 and 64"
            run["z"] = item["z"]
        runs.append(run)
    if total > MAX_TEXT:
        return None, "This note is too long (20,000 characters maximum)"
    return runs, None


def read_body(data):
    """Returns (plain_text, runs_or_None, error). Formatted text wins when it is sent."""
    if data.get("rich") is not None:
        runs, error = clean_runs(data["rich"])
        if error:
            return None, None, error
        text = "".join(r["t"] for r in runs).strip()
        return text, (runs or None), None
    text = clean_text(data.get("text"))
    if len(text) > MAX_TEXT:
        return None, None, "This note is too long (20,000 characters maximum)"
    return text, None, None


@notes_bp.route("/")
@login_required
def list_notes():
    journal_id = request.args.get("journal_id", type=int)
    return jsonify(get_notes(current_user_id(), journal_id))


@notes_bp.route("/", methods=["POST"])
@login_required
def create_note():
    data = json_body()
    title = clean_text(data.get("title"))
    journal_id = data.get("journal_id")

    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    if (not isinstance(journal_id, int) or isinstance(journal_id, bool)
            or not journal_owned(current_user_id(), journal_id)):
        return jsonify({"error": "Choose a journal first"}), 400

    text, runs, error = read_body(data)
    if error:
        return jsonify({"error": error}), 400
    style, error = read_style(data)
    if error:
        return jsonify({"error": error}), 400

    return jsonify(add_note(journal_id, title, text, runs, style)), 201


@notes_bp.route("/<int:note_id>", methods=["PATCH"])
@login_required
def edit_note(note_id):
    data = json_body()
    title = clean_text(data.get("title"))
    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    text, runs, error = read_body(data)
    if error:
        return jsonify({"error": error}), 400
    if not update_note_text(current_user_id(), note_id, title, text, runs):
        return jsonify({"error": "Note not found"}), 404
    return jsonify({"id": note_id, "title": title, "text": text, "rich": runs})


@notes_bp.route("/<int:note_id>/style", methods=["PATCH"])
@login_required
def change_style(note_id):
    style, error = read_style(json_body())
    if error:
        return jsonify({"error": error}), 400
    if not update_note_style(current_user_id(), note_id, style):
        return jsonify({"error": "Note not found"}), 404
    return jsonify(style)


@notes_bp.route("/<int:note_id>", methods=["DELETE"])
@login_required
def remove_note(note_id):
    if not delete_note(current_user_id(), note_id):
        return jsonify({"error": "Note not found"}), 404
    return jsonify({"deleted": note_id})