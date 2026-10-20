from flask import Flask
from notes_routes import notes_bp          # import the other file

app = Flask(__name__)

app.register_blueprint(notes_bp, url_prefix="/api/notes")   # plug it in

@app.route("/")
def home():
    return "Hello, my website works!"

if __name__ == "__main__":
    app.run(debug=True)