from fastapi import FastAPI
from Authentification import auth_router
app=FastAPI()
app.include_router(auth_router)
