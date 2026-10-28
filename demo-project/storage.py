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

JOURNALS_SQL = (
    "CREATE TABLE {} ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
    "user_id INTEGER, "
    "name TEXT NOT NULL, "
    "UNIQUE (user_id, name))"
)


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    with get_db() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "username TEXT NOT NULL UNIQUE COLLATE NOCASE, "
            "password_hash TEXT NOT NULL, "
            "created_at TEXT NOT NULL)"
        )

        journal_columns = {r["name"] for r in conn.execute("PRAGMA table_info(journals)")}
        if not journal_columns:
            conn.execute(JOURNALS_SQL.format("journals"))
        elif "user_id" not in journal_columns:
            conn.execute("BEGIN")
            conn.execute(JOURNALS_SQL.format("journals_new"))
            conn.execute(
                "INSERT INTO journals_new (id, user_id, name) "
                "SELECT id, NULL, name FROM journals"
            )
            conn.execute("DROP TABLE journals")
            conn.execute("ALTER TABLE journals_new RENAME TO journals")

        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "journal_id INTEGER NOT NULL, "
            "title TEXT NOT NULL, "
            "text TEXT NOT NULL DEFAULT '', "
            "created_at TEXT NOT NULL)"
        )
        note_columns = {r["name"] for r in conn.execute("PRAGMA table_info(notes)")}
        for name, definition in STYLE_COLUMNS.items():
            if name not in note_columns:
                conn.execute(f"ALTER TABLE notes ADD COLUMN {name} {definition}")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_journal ON notes (journal_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_journals_user ON journals (user_id)")


def create_user(username, password_hash):
    try:
        with get_db() as conn:
            first = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, password_hash, now_iso()),
            )
            user_id = cur.lastrowid
            if first:
                conn.execute("UPDATE journals SET user_id = ? WHERE user_id IS NULL", (user_id,))
            has_journal = conn.execute(
                "SELECT 1 FROM journals WHERE user_id = ?", (user_id,)
            ).fetchone()
            if not has_journal:
                conn.execute(
                    "INSERT INTO journals (user_id, name) VALUES (?, 'Personal')", (user_id,)
                )
            return {"id": user_id, "username": username}
    except sqlite3.IntegrityError:
        return None


def get_user(user_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_username(username):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    return dict(row) if row else None


def get_journals(user_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name FROM journals WHERE user_id = ? ORDER BY id", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def journal_owned(user_id, journal_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM journals WHERE id = ? AND user_id = ?", (journal_id, user_id)
        ).fetchone()
    return row is not None


def add_journal(user_id, name):
    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO journals (user_id, name) VALUES (?, ?)", (user_id, name)
            )
            return {"id": cur.lastrowid, "name": name}
    except sqlite3.IntegrityError:
        return None


def rename_journal(user_id, journal_id, name):
    try:
        with get_db() as conn:
            cur = conn.execute(
                "UPDATE journals SET name = ? WHERE id = ? AND user_id = ?",
                (name, journal_id, user_id),
            )
            return "ok" if cur.rowcount > 0 else "missing"
    except sqlite3.IntegrityError:
        return "exists"


def delete_journal(user_id, journal_id):
    with get_db() as conn:
        owned = conn.execute(
            "SELECT 1 FROM journals WHERE id = ? AND user_id = ?", (journal_id, user_id)
        ).fetchone()
        if owned is None:
            return False
        conn.execute("DELETE FROM notes WHERE journal_id = ?", (journal_id,))
        conn.execute("DELETE FROM journals WHERE id = ?", (journal_id,))
        return True


def get_notes(user_id, journal_id=None):
    columns = "n.id, n.journal_id, n.title, n.text, n.created_at, " + ", ".join(
        "n." + k for k in STYLE_KEYS
    )
    query = (
        f"SELECT {columns} FROM notes n "
        "JOIN journals j ON j.id = n.journal_id WHERE j.user_id = ?"
    )
    params = [user_id]
    if journal_id is not None:
        query += " AND n.journal_id = ?"
        params.append(journal_id)
    query += " ORDER BY n.id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def add_note(journal_id, title, text, style):
    created_at = now_iso()
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


OWNED_NOTE = "id = ? AND journal_id IN (SELECT id FROM journals WHERE user_id = ?)"


def update_note_text(user_id, note_id, title, text):
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE notes SET title = ?, text = ? WHERE {OWNED_NOTE}",
            (title, text, note_id, user_id),
        )
        return cur.rowcount > 0


def update_note_style(user_id, note_id, style):
    assignments = ", ".join(f"{k} = ?" for k in STYLE_KEYS)
    values = [style[k] for k in STYLE_KEYS] + [note_id, user_id]
    with get_db() as conn:
        cur = conn.execute(f"UPDATE notes SET {assignments} WHERE {OWNED_NOTE}", values)
        return cur.rowcount > 0


def delete_note(user_id, note_id):
    with get_db() as conn:
        cur = conn.execute(f"DELETE FROM notes WHERE {OWNED_NOTE}", (note_id, user_id))
        return cur.rowcount > 0