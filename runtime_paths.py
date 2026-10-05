"""Point writable paths at /tmp when running on Vercel (the deployed filesystem is read-only).

Must be imported before any module that reads DATABASE_PATH or EVENT_IMAGE_UPLOAD_DIR.
Data in /tmp is ephemeral: each cold start re-seeds from the databases bundled in the repo.
"""
import os
import shutil
import tempfile
from pathlib import Path

BUNDLE_DIR = Path(__file__).resolve().parent


def configure() -> None:
    if not os.environ.get("VERCEL"):
        return
    work_dir = Path(tempfile.gettempdir()) / "rallypoint"
    work_dir.mkdir(parents=True, exist_ok=True)
    for db_name, env_name in (("userdata.db", "DATABASE_PATH"), ("events.db", "EVENTS_DB_PATH")):
        target = work_dir / db_name
        if not target.exists():
            shutil.copy(BUNDLE_DIR / db_name, target)
        os.environ.setdefault(env_name, str(target))
    os.environ.setdefault("EVENT_IMAGE_UPLOAD_DIR", str(work_dir / "event-images"))


configure()
