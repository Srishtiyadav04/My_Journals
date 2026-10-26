import sqlite3
import os
from datetime import datetime, timezone

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
            "title TEXT NOT NULL, "
            "text TEXT NOT NULL DEFAULT '', "
            "created_at TEXT NOT NULL)"
        )


def get_notes():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, text, created_at FROM notes ORDER BY id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def add_note(title, text):
    created_at = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO notes (title, text, created_at) VALUES (?, ?, ?)",
            (title, text, created_at),
        )
        return {"id": cur.lastrowid, "title": title, "text": text, "created_at": created_at}


def delete_note(note_id):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))