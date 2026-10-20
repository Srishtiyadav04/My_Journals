from flask import Flask
from notes_routes import notes_bp
from stats_routes import stats_bp                            # NEW: import part 2

app = Flask(__name__)

app.register_blueprint(notes_bp, url_prefix="/api/notes")
app.register_blueprint(stats_bp, url_prefix="/api/stats")    # NEW: plug in part 2

@app.route("/")
def home():
    return "Hello, my website works!"

if __name__ == "__main__":
    app.run(debug=True)