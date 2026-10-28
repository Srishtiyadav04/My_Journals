import os
import secrets
from datetime import timedelta
from flask import Flask, render_template, request
from storage import init_db
from auth_routes import auth_bp
from notes_routes import notes_bp
from journals_routes import journals_bp
from stats_routes import stats_bp

BASE_DIR = os.path.dirname(__file__)


def load_secret_key():
    from_env = os.environ.get("JOURNAL_SECRET_KEY")
    if from_env:
        return from_env
    path = os.path.join(BASE_DIR, "secret.key")
    if not os.path.exists(path):
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    with open(path) as f:
        return f.read().strip()


app = Flask(__name__)
app.secret_key = load_secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("JOURNAL_PRODUCTION") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)
init_db()

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(notes_bp, url_prefix="/api/notes")
app.register_blueprint(journals_bp, url_prefix="/api/journals")
app.register_blueprint(stats_bp, url_prefix="/api/stats")


@app.after_request
def add_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5001)