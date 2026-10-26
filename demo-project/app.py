from flask import Flask, render_template        # add render_template
from notes_routes import notes_bp
from stats_routes import stats_bp

app = Flask(__name__)

app.register_blueprint(notes_bp, url_prefix="/api/notes")
app.register_blueprint(stats_bp, url_prefix="/api/stats")

@app.route("/")
def home():
    return render_template("index.html")        # was: return "Hello, my website works!"

if __name__ == "__main__":
        app.run(debug=True, port=5001)