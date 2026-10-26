import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "notes.db")


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "text TEXT NOT NULL)"
        )


def get_notes():
    with get_db() as conn:
        rows = conn.execute("SELECT id, text FROM notes ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def add_note(text):
    with get_db() as conn:
        cur = conn.execute("INSERT INTO notes (text) VALUES (?)", (text,))
        return {"id": cur.lastrowid, "text": text}


def delete_note(note_id):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))