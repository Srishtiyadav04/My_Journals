import re
from flask import Blueprint, jsonify, request
from storage import (
    get_notes, add_note, delete_note, journal_exists, update_note_style,
)

notes_bp = Blueprint("notes", __name__)

FONTS = {"sans", "serif", "book", "mono", "cursive", "rounded"}
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


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
        if c and not COLOR_RE.match(c):
            return None, "Invalid colour"
    if not isinstance(title_bold, bool):
        return None, "Invalid bold setting"

    return {
        "font": font, "size": size, "color": color,
        "title_font": title_font, "title_size": title_size,
        "title_color": title_color, "title_bold": int(title_bold),
    }, None


@notes_bp.route("/")
def list_notes():
    journal_id = request.args.get("journal_id", type=int)
    return jsonify(get_notes(journal_id))


@notes_bp.route("/", methods=["POST"])
def create_note():
    data = request.get_json()
    title = (data.get("title") or "").strip()
    text = (data.get("text") or "").strip()
    journal_id = data.get("journal_id")

    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    if not isinstance(journal_id, int) or not journal_exists(journal_id):
        return jsonify({"error": "Choose a journal first"}), 400

    style, error = read_style(data)
    if error:
        return jsonify({"error": error}), 400

    return jsonify(add_note(journal_id, title, text, style)), 201


@notes_bp.route("/<int:note_id>/style", methods=["PATCH"])
def change_style(note_id):
    style, error = read_style(request.get_json())
    if error:
        return jsonify({"error": error}), 400
    if not update_note_style(note_id, style):
        return jsonify({"error": "Note not found"}), 404
    return jsonify(style)


@notes_bp.route("/<int:note_id>", methods=["DELETE"])
def remove_note(note_id):
    delete_note(note_id)
    return jsonify({"deleted": note_id})