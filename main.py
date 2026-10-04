from fastapi import FastAPI
from Authentification import auth_router
from event_requests import event_router
from Filter import filter_router
app=FastAPI()
app.include_router(auth_router)
app.include_router(event_router)
app.include_router(filter_router)
