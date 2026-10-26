from flask import Blueprint, jsonify, request
from storage import get_journals, add_journal

journals_bp = Blueprint("journals", __name__)


@journals_bp.route("/")
def list_journals():
    return jsonify(get_journals())


@journals_bp.route("/", methods=["POST"])
def create_journal():
    data = request.get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Journal name cannot be empty"}), 400
    journal = add_journal(name)
    if journal is None:
        return jsonify({"error": "That journal already exists"}), 409
    return jsonify(journal), 201