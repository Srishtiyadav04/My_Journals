from flask import Flask, render_template
from storage import init_db
from notes_routes import notes_bp
from journals_routes import journals_bp
from stats_routes import stats_bp

app = Flask(__name__)
init_db()

app.register_blueprint(notes_bp, url_prefix="/api/notes")
app.register_blueprint(journals_bp, url_prefix="/api/journals")
app.register_blueprint(stats_bp, url_prefix="/api/stats")


@app.route("/")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5001)