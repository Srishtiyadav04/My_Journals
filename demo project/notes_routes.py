from flask import Blueprint, jsonify

notes_bp = Blueprint("notes", __name__)

# a fake list for now; we'll store real data later
notes = [
    {"id": 1, "text": "First note"},
    {"id": 2, "text": "Second note"},
]

@notes_bp.route("/")
def list_notes():
    return jsonify(notes)