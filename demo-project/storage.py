import sqlite3
import os
from datetime import datetime, timezone

DB_FILE = os.path.join(os.path.dirname(__file__), "notes.db")

STYLE_COLUMNS = {
    "font": "TEXT NOT NULL DEFAULT 'sans'",
    "size": "INTEGER NOT NULL DEFAULT 16",
    "color": "TEXT NOT NULL DEFAULT ''",
    "title_font": "TEXT NOT NULL DEFAULT 'sans'",
    "title_size": "INTEGER NOT NULL DEFAULT 20",
    "title_color": "TEXT NOT NULL DEFAULT ''",
    "title_bold": "INTEGER NOT NULL DEFAULT 1",
}
STYLE_KEYS = list(STYLE_COLUMNS)


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
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(notes)")}
        for name, definition in STYLE_COLUMNS.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE notes ADD COLUMN {name} {definition}")
        count = conn.execute("SELECT COUNT(*) FROM journals").fetchone()[0]
        if count == 0:
            conn.execute("INSERT INTO journals (name) VALUES ('Personal')")


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


def rename_journal(journal_id, name):
    try:
        with get_db() as conn:
            cur = conn.execute(
                "UPDATE journals SET name = ? WHERE id = ?", (name, journal_id)
            )
            return "ok" if cur.rowcount > 0 else "missing"
    except sqlite3.IntegrityError:
        return "exists"


def delete_journal(journal_id):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE journal_id = ?", (journal_id,))
        cur = conn.execute("DELETE FROM journals WHERE id = ?", (journal_id,))
        return cur.rowcount > 0


def get_notes(journal_id=None):
    columns = "id, journal_id, title, text, created_at, " + ", ".join(STYLE_KEYS)
    query = f"SELECT {columns} FROM notes"
    params = ()
    if journal_id is not None:
        query += " WHERE journal_id = ?"
        params = (journal_id,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def add_note(journal_id, title, text, style):
    created_at = datetime.now(timezone.utc).isoformat()
    columns = ", ".join(STYLE_KEYS)
    marks = ", ".join("?" for _ in STYLE_KEYS)
    values = [style[k] for k in STYLE_KEYS]
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO notes (journal_id, title, text, created_at, {columns}) "
            f"VALUES (?, ?, ?, ?, {marks})",
            [journal_id, title, text, created_at] + values,
        )
        return {
            "id": cur.lastrowid, "journal_id": journal_id, "title": title,
            "text": text, "created_at": created_at, **style,
        }


def update_note_text(note_id, title, text):
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE notes SET title = ?, text = ? WHERE id = ?", (title, text, note_id)
        )
        return cur.rowcount > 0


def update_note_style(note_id, style):
    assignments = ", ".join(f"{k} = ?" for k in STYLE_KEYS)
    values = [style[k] for k in STYLE_KEYS] + [note_id]
    with get_db() as conn:
        cur = conn.execute(f"UPDATE notes SET {assignments} WHERE id = ?", values)
        return cur.rowcount > 0


def delete_note(note_id):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))