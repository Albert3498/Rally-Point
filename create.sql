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
);