from flask import Blueprint, jsonify
from storage import get_notes
from auth_routes import login_required, current_user_id

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/")
@login_required
def get_stats():
    notes = get_notes(current_user_id())
    total_notes = len(notes)
    total_words = sum(len(n["text"].split()) for n in notes)
    return jsonify({
        "total_notes": total_notes,
        "total_words": total_words,
    })