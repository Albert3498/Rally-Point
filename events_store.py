import os
import sqlite3

EVENTS_DB_PATH = os.environ.get("EVENTS_DATABASE_PATH", "events.db")
PUBLIC_EVENT_COLUMNS = (
    "id, title, city, country, date, pay_type, pay, action, accessibility, language"
)


def connect_events_db() -> sqlite3.Connection:
    return sqlite3.connect(EVENTS_DB_PATH, timeout=10)


def initialize_events_db() -> None:
    conn = connect_events_db()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,
                    city TEXT,
                    country TEXT,
                    date TEXT,
                    pay_type TEXT,
                    pay INTEGER DEFAULT 0,
                    action TEXT,
                    accessibility BOOLEAN,
                    language TEXT,
                    source TEXT,
                    external_id TEXT
                )
            """)
            columns = {row[1] for row in conn.execute("PRAGMA table_info(events)")}
            for column in ("country", "source", "external_id"):
                if column not in columns:
                    conn.execute(f"ALTER TABLE events ADD COLUMN {column} TEXT")
            conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_external_id
                ON events(source, external_id)
                WHERE source IS NOT NULL AND external_id IS NOT NULL
            """)
    finally:
        conn.close()
