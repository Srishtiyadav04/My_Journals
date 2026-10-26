from flask import Blueprint, jsonify
from storage import get_notes

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/")
def get_stats():
    notes = get_notes()
    total_notes = len(notes)
    total_words = sum(len(n["text"].split()) for n in notes)
    return jsonify({
        "total_notes": total_notes,
        "total_words": total_words,
    })