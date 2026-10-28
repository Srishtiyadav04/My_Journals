import re
import time
from functools import wraps
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash
from storage import create_user, get_user, get_user_by_username

auth_bp = Blueprint("auth", __name__)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 128

DUMMY_HASH = generate_password_hash("not-a-real-password")

MAX_FAILS = 5
WINDOW_SECONDS = 10 * 60
FAILS = {}


def too_many_attempts(key):
    now = time.time()
    recent = [t for t in FAILS.get(key, []) if now - t < WINDOW_SECONDS]
    if recent:
        FAILS[key] = recent
    else:
        FAILS.pop(key, None)
    return len(recent) >= MAX_FAILS


def record_failure(key):
    if len(FAILS) > 5000:
        FAILS.clear()
    FAILS.setdefault(key, []).append(time.time())


def current_user():
    user_id = session.get("user_id")
    name = session.get("name")
    if not isinstance(user_id, int) or not isinstance(name, str):
        return None
    user = get_user(user_id)
    if user is None or user["username"].lower() != name.lower():
        return None
    return user


def current_user_id():
    return session.get("user_id")


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({"error": "Please log in"}), 401
        return view(*args, **kwargs)
    return wrapper


def start_session(user):
    session.clear()
    session["user_id"] = user["id"]
    session["name"] = user["username"]
    session.permanent = True


def read_credentials():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, None
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None
    return username.strip(), password


@auth_bp.route("/signup", methods=["POST"])
def signup():
    username, password = read_credentials()
    if not username:
        return jsonify({"error": "Enter a username and a password"}), 400
    if not USERNAME_RE.match(username):
        return jsonify({"error": "Username must be 3 to 30 characters: letters, numbers, dots, dashes or underscores"}), 400
    if len(password) < MIN_PASSWORD:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if len(password) > MAX_PASSWORD:
        return jsonify({"error": "Password is too long (128 characters maximum)"}), 400

    user = create_user(username, generate_password_hash(password))
    if user is None:
        return jsonify({"error": "That username is taken"}), 409
    start_session(user)
    return jsonify({"user": {"username": user["username"]}}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    username, password = read_credentials()
    if not username or not password or len(password) > MAX_PASSWORD:
        return jsonify({"error": "Wrong username or password"}), 401

    key = (request.remote_addr, username.lower())
    if too_many_attempts(key):
        return jsonify({"error": "Too many attempts. Try again in a few minutes."}), 429

    user = get_user_by_username(username)
    if user is None:
        check_password_hash(DUMMY_HASH, password)
        ok = False
    else:
        ok = check_password_hash(user["password_hash"], password)

    if not ok:
        record_failure(key)
        return jsonify({"error": "Wrong username or password"}), 401

    FAILS.pop(key, None)
    start_session(user)
    return jsonify({"user": {"username": user["username"]}})


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/me")
def me():
    user = current_user()
    return jsonify({"user": {"username": user["username"]} if user else None})