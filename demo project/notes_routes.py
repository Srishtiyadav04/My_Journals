from flask import Blueprint, jsonify, request

notes_bp = Blueprint("notes", __name__)

# a temporary list; it resets when the server restarts
notes = [
    {"id": 1, "text": "First note"},
    {"id": 2, "text": "Second note"},
]

@notes_bp.route("/")
def list_notes():
    return jsonify(notes)

@notes_bp.route("/", methods=["POST"])
def add_note():
    data = request.get_json()
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "Note cannot be empty"}), 400

    new_id = max((n["id"] for n in notes), default=0) + 1
    note = {"id": new_id, "text": text}
    notes.append(note)
    return jsonify(note), 201