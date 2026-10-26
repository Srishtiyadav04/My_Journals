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
            "CREATE TABLE IF NOT EXISTS journals ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT NOT NULL UNIQUE)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "journal_id INTEGER NOT NULL, "
            "title TEXT NOT NULL, "
            "text TEXT NOT NULL DEFAULT '', "
            "created_at TEXT NOT NULL)"
        )
        conn.execute("INSERT OR IGNORE INTO journals (name) VALUES ('Personal')")


def get_journals():
    with get_db() as conn:
        rows = conn.execute("SELECT id, name FROM journals ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def journal_exists(journal_id):
    with get_db() as conn:
        row = conn.execute("SELECT 1 FROM journals WHERE id = ?", (journal_id,)).fetchone()
    return row is not None


def add_journal(name):
    try:
        with get_db() as conn:
            cur = conn.execute("INSERT INTO journals (name) VALUES (?)", (name,))
            return {"id": cur.lastrowid, "name": name}
    except sqlite3.IntegrityError:
        return None


def get_notes(journal_id=None):
    query = "SELECT id, journal_id, title, text, created_at FROM notes"
    params = ()
    if journal_id is not None:
        query += " WHERE journal_id = ?"
        params = (journal_id,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def add_note(journal_id, title, text):
    created_at = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO notes (journal_id, title, text, created_at) VALUES (?, ?, ?, ?)",
            (journal_id, title, text, created_at),
        )
        return {
            "id": cur.lastrowid, "journal_id": journal_id,
            "title": title, "text": text, "created_at": created_at,
        }


def delete_note(note_id):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))