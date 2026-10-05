import runtime_paths  # noqa: F401  (must run before the modules below read their env vars)
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from Authentification import auth_router
from event_requests import UPLOAD_DIR, event_router
from Filter import filter_router
app=FastAPI()
# The web interface is opened from a local dev server (e.g. VS Code Live Server on :5501)
# or straight from disk, so allow any localhost port. Auth uses a Bearer header, not cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(event_router)
app.include_router(filter_router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

BASE_DIR = Path(__file__).resolve().parent


@app.get("/", include_in_schema=False)
def web_interface():
    return FileResponse(BASE_DIR / "interface.html")


for static_dir in ("css", "js", "images"):
    app.mount(f"/{static_dir}", StaticFiles(directory=BASE_DIR / static_dir), name=static_dir)
