CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    title VARCHAR(255),
    country VARCHAR(255),
    city VARCHAR(255),
    date DATETIME2,
    pay_type VARCHAR(255),
    pay INTEGER DEFAULT 0, 
    action VARCHAR(255),
    accessibility BOOLEAN,
    language VARCHAR(255)
)