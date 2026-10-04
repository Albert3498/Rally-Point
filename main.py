from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from Authentification import auth_router
from event_requests import event_router
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
