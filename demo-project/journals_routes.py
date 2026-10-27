from flask import Blueprint, jsonify, request
from storage import get_journals, add_journal, rename_journal, delete_journal

journals_bp = Blueprint("journals", __name__)


def clean_name(data):
    name = ((data or {}).get("name") or "").strip()
    if not name:
        return None, "Journal name cannot be empty"
    if len(name) > 60:
        return None, "Journal name is too long (60 characters maximum)"
    return name, None


@journals_bp.route("/")
def list_journals():
    return jsonify(get_journals())


@journals_bp.route("/", methods=["POST"])
def create_journal():
    name, error = clean_name(request.get_json())
    if error:
        return jsonify({"error": error}), 400
    journal = add_journal(name)
    if journal is None:
        return jsonify({"error": "That journal already exists"}), 409
    return jsonify(journal), 201


@journals_bp.route("/<int:journal_id>", methods=["PATCH"])
def change_journal(journal_id):
    name, error = clean_name(request.get_json())
    if error:
        return jsonify({"error": error}), 400
    result = rename_journal(journal_id, name)
    if result == "missing":
        return jsonify({"error": "Journal not found"}), 404
    if result == "exists":
        return jsonify({"error": "Another journal already has that name"}), 409
    return jsonify({"id": journal_id, "name": name})


@journals_bp.route("/<int:journal_id>", methods=["DELETE"])
def remove_journal(journal_id):
    if not delete_journal(journal_id):
        return jsonify({"error": "Journal not found"}), 404
    return jsonify({"deleted": journal_id})