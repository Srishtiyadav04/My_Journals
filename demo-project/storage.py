import json
import os
import sqlite3
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.environ.get("JOURNAL_DB") or os.path.join(BASE_DIR, "notes.db")
UPLOAD_DIR = os.environ.get("JOURNAL_UPLOADS") or os.path.join(BASE_DIR, "uploads")

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
NOTE_COLUMNS = dict(STYLE_COLUMNS, rich="TEXT")

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
    os.makedirs(UPLOAD_DIR, exist_ok=True)
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
        for name, definition in NOTE_COLUMNS.items():
            if name not in note_columns:
                conn.execute(f"ALTER TABLE notes ADD COLUMN {name} {definition}")

        conn.execute(
            "CREATE TABLE IF NOT EXISTS media ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "note_id INTEGER NOT NULL, "
            "filename TEXT NOT NULL UNIQUE, "
            "kind TEXT NOT NULL, "
            "size INTEGER NOT NULL, "
            "created_at TEXT NOT NULL)"
        )

        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_journal ON notes (journal_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_journals_user ON journals (user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_media_note ON media (note_id)")


def remove_files(filenames):
    for name in filenames:
        try:
            os.remove(os.path.join(UPLOAD_DIR, name))
        except OSError:
            pass


# ---------- users ----------

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


# ---------- journals ----------

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
        files = [
            r["filename"]
            for r in conn.execute(
                "SELECT m.filename FROM media m JOIN notes n ON n.id = m.note_id "
                "WHERE n.journal_id = ?",
                (journal_id,),
            )
        ]
        conn.execute(
            "DELETE FROM media WHERE note_id IN (SELECT id FROM notes WHERE journal_id = ?)",
            (journal_id,),
        )
        conn.execute("DELETE FROM notes WHERE journal_id = ?", (journal_id,))
        conn.execute("DELETE FROM journals WHERE id = ?", (journal_id,))
    remove_files(files)
    return True


# ---------- notes ----------

def parse_rich(value):
    if not value:
        return None
    try:
        data = json.loads(value)
    except ValueError:
        return None
    return data if isinstance(data, list) else None


def get_notes(user_id, journal_id=None):
    columns = "n.id, n.journal_id, n.title, n.text, n.rich, n.created_at, " + ", ".join(
        "n." + k for k in STYLE_KEYS
    )
    scope = "j.user_id = ?"
    params = [user_id]
    if journal_id is not None:
        scope += " AND n.journal_id = ?"
        params.append(journal_id)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT {columns} FROM notes n JOIN journals j ON j.id = n.journal_id "
            f"WHERE {scope} ORDER BY n.id DESC",
            params,
        ).fetchall()
        media_rows = conn.execute(
            "SELECT m.id, m.note_id, m.kind FROM media m "
            "JOIN notes n ON n.id = m.note_id JOIN journals j ON j.id = n.journal_id "
            f"WHERE {scope} ORDER BY m.id",
            params,
        ).fetchall()

    by_note = {}
    for m in media_rows:
        by_note.setdefault(m["note_id"], []).append({"id": m["id"], "kind": m["kind"]})

    notes = []
    for r in rows:
        note = dict(r)
        note["rich"] = parse_rich(note["rich"])
        note["media"] = by_note.get(note["id"], [])
        notes.append(note)
    return notes


def add_note(journal_id, title, text, rich, style):
    created_at = now_iso()
    columns = ", ".join(STYLE_KEYS)
    marks = ", ".join("?" for _ in STYLE_KEYS)
    values = [style[k] for k in STYLE_KEYS]
    rich_json = json.dumps(rich, separators=(",", ":")) if rich else None
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO notes (journal_id, title, text, rich, created_at, {columns}) "
            f"VALUES (?, ?, ?, ?, ?, {marks})",
            [journal_id, title, text, rich_json, created_at] + values,
        )
        return {
            "id": cur.lastrowid, "journal_id": journal_id, "title": title,
            "text": text, "rich": rich or None, "media": [],
            "created_at": created_at, **style,
        }


OWNED_NOTE = "id = ? AND journal_id IN (SELECT id FROM journals WHERE user_id = ?)"


def update_note_text(user_id, note_id, title, text, rich):
    rich_json = json.dumps(rich, separators=(",", ":")) if rich else None
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE notes SET title = ?, text = ?, rich = ? WHERE {OWNED_NOTE}",
            (title, text, rich_json, note_id, user_id),
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
        owned = conn.execute(
            f"SELECT 1 FROM notes WHERE {OWNED_NOTE}", (note_id, user_id)
        ).fetchone()
        if owned is None:
            return False
        files = [
            r["filename"]
            for r in conn.execute("SELECT filename FROM media WHERE note_id = ?", (note_id,))
        ]
        conn.execute("DELETE FROM media WHERE note_id = ?", (note_id,))
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    remove_files(files)
    return True


# ---------- media ----------

def note_owned(user_id, note_id):
    with get_db() as conn:
        row = conn.execute(
            f"SELECT 1 FROM notes WHERE {OWNED_NOTE}", (note_id, user_id)
        ).fetchone()
    return row is not None


def media_count(note_id):
    with get_db() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM media WHERE note_id = ?", (note_id,)
        ).fetchone()[0]


def user_media_bytes(user_id):
    with get_db() as conn:
        return conn.execute(
            "SELECT COALESCE(SUM(m.size), 0) FROM media m "
            "JOIN notes n ON n.id = m.note_id JOIN journals j ON j.id = n.journal_id "
            "WHERE j.user_id = ?",
            (user_id,),
        ).fetchone()[0]


def add_media(note_id, filename, kind, size):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO media (note_id, filename, kind, size, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (note_id, filename, kind, size, now_iso()),
        )
        return {"id": cur.lastrowid, "kind": kind}


def get_media(user_id, media_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT m.id, m.filename, m.kind FROM media m "
            "JOIN notes n ON n.id = m.note_id JOIN journals j ON j.id = n.journal_id "
            "WHERE m.id = ? AND j.user_id = ?",
            (media_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def delete_media(user_id, media_id):
    item = get_media(user_id, media_id)
    if item is None:
        return False
    with get_db() as conn:
        conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
    remove_files([item["filename"]])
    return True