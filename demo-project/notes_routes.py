from flask import Blueprint, jsonify, request
from storage import get_notes, add_note, delete_note

notes_bp = Blueprint("notes", __name__)


@notes_bp.route("/")
def list_notes():
    return jsonify(get_notes())


@notes_bp.route("/", methods=["POST"])
def create_note():
    data = request.get_json()
    title = (data.get("title") or "").strip()
    text = (data.get("text") or "").strip()
    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
    return jsonify(add_note(title, text)), 201


@notes_bp.route("/<int:note_id>", methods=["DELETE"])
def remove_note(note_id):
    delete_note(note_id)
    return jsonify({"deleted": note_id})