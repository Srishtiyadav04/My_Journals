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
    text = clean_text(data.get("text"))
    journal_id = data.get("journal_id")

    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    if (not isinstance(journal_id, int) or isinstance(journal_id, bool)
            or not journal_owned(current_user_id(), journal_id)):
        return jsonify({"error": "Choose a journal first"}), 400

    style, error = read_style(data)
    if error:
        return jsonify({"error": error}), 400

    return jsonify(add_note(journal_id, title, text, style)), 201


@notes_bp.route("/<int:note_id>", methods=["PATCH"])
@login_required
def edit_note(note_id):
    data = json_body()
    title = clean_text(data.get("title"))
    text = clean_text(data.get("text"))
    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    if not update_note_text(current_user_id(), note_id, title, text):
        return jsonify({"error": "Note not found"}), 404
    return jsonify({"id": note_id, "title": title, "text": text})


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