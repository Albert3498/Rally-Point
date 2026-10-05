"""Create a local administrator account without exposing admin registration publicly."""

import getpass
import sqlite3
import sys
from contextlib import closing

import bcrypt

from Authentification import DB_PATH, name_key


def create_admin(name: str, password: str) -> int:
    """Create an administrator and return its database ID."""
    name = " ".join(name.split())
    if not name or len(name) > 255:
        raise ValueError("Admin name must be between 1 and 255 characters.")
    password_bytes = password.encode("utf-8")
    if len(password_bytes) < 16 or len(password_bytes) > 72:
        raise ValueError("Password must be between 16 and 72 UTF-8 bytes.")

    password_hash = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")
    with closing(sqlite3.connect(DB_PATH)) as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute(
            "SELECT 1 FROM userdata WHERE name_key=? OR lower(name)=lower(?)",
            (name_key(name), name),
        ).fetchone():
            raise ValueError("An account with that name already exists.")
        cursor = db.execute(
            "INSERT INTO userdata(name,password,role,name_key) VALUES(?,?,?,?)",
            (name, password_hash, "admin", name_key(name)),
        )
        db.commit()
        return cursor.lastrowid


def main() -> int:
    name = input("Admin name: ")
    password = getpass.getpass("Admin password (16-72 UTF-8 bytes): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    try:
        admin_id = create_admin(name, password)
    except (ValueError, sqlite3.Error) as err:
        print(f"Could not create admin: {err}", file=sys.stderr)
        return 1

    print(f"Created admin account {name.strip()} (id {admin_id}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
