from flask import Blueprint, jsonify
from notes_routes import notes          # reuse the list from part 1

stats_bp = Blueprint("stats", __name__)

@stats_bp.route("/")
def get_stats():
    total_notes = len(notes)
    total_words = sum(len(n["text"].split()) for n in notes)
    return jsonify({
        "total_notes": total_notes,
        "total_words": total_words,
    })