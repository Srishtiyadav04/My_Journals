from flask import Blueprint, jsonify, request
from storage import get_journals, add_journal, rename_journal, delete_journal
from auth_routes import login_required, current_user_id

journals_bp = Blueprint("journals", __name__)


def clean_name(data):
    data = data if isinstance(data, dict) else {}
    name = (data.get("name") or "")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        return None, "Journal name cannot be empty"
    if len(name) > 60:
        return None, "Journal name is too long (60 characters maximum)"
    return name, None


@journals_bp.route("/")
@login_required
def list_journals():
    return jsonify(get_journals(current_user_id()))


@journals_bp.route("/", methods=["POST"])
@login_required
def create_journal():
    name, error = clean_name(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    journal = add_journal(current_user_id(), name)
    if journal is None:
        return jsonify({"error": "You already have a journal with that name"}), 409
    return jsonify(journal), 201


@journals_bp.route("/<int:journal_id>", methods=["PATCH"])
@login_required
def change_journal(journal_id):
    name, error = clean_name(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    result = rename_journal(current_user_id(), journal_id, name)
    if result == "missing":
        return jsonify({"error": "Journal not found"}), 404
    if result == "exists":
        return jsonify({"error": "Another journal already has that name"}), 409
    return jsonify({"id": journal_id, "name": name})


@journals_bp.route("/<int:journal_id>", methods=["DELETE"])
@login_required
def remove_journal(journal_id):
    if not delete_journal(current_user_id(), journal_id):
        return jsonify({"error": "Journal not found"}), 404
    return jsonify({"deleted": journal_id})