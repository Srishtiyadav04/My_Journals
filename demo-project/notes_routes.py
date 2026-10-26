from flask import Blueprint, jsonify, request
from storage import get_notes, add_note, delete_note, journal_exists

notes_bp = Blueprint("notes", __name__)


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
    return jsonify(add_note(journal_id, title, text)), 201


@notes_bp.route("/<int:note_id>", methods=["DELETE"])
def remove_note(note_id):
    delete_note(note_id)
    return jsonify({"deleted": note_id})