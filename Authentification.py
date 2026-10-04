import bcrypt
from pydantic import BaseModel,field_validator
import sqlite3
from fastapi import APIRouter,HTTPException,Depends,Query
from fastapi.security import HTTPBearer,HTTPAuthorizationCredentials
import os
import jwt
from datetime import datetime,timedelta,UTC,date
from dotenv import load_dotenv
from collections import defaultdict
load_dotenv()
DB_PATH=os.environ.get("DATABASE_PATH","userdata.db")
login_attempts=defaultdict(list)
MAX_LOGIN_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
JWT_SECRET_KEY=os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM=os.environ["JWT_ALGORITHM"]
JWT_EXPIRATION_MINUTES=int(os.environ["JWT_EXPIRATION_MINUTES"])
auth_router=APIRouter()
security=HTTPBearer()
def get_db():
    db=sqlite3.connect(DB_PATH)
    try:
        yield db
    finally:
        db.close()
with sqlite3.connect(DB_PATH) as setup_conn:
    setup_conn.execute("""
        CREATE TABLE IF NOT EXISTS userdata(
            id INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            birthdate TEXT NOT NULL
        )
    """)
    columns=setup_conn.execute("PRAGMA table_info(userdata)").fetchall()
    current_columns=[col[1] for col in columns]
    if "role" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'")
    if "name" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN name VARCHAR(255)")
    if "birthdate" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN birthdate TEXT")
    if "city" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN city VARCHAR(255)")
    if "country" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN country VARCHAR(255)")
    setup_conn.execute("""
        CREATE TABLE IF NOT EXISTS user_aptitudes(
            user_id INTEGER NOT NULL REFERENCES userdata(id),
            aptitude VARCHAR(100) NOT NULL,
            PRIMARY KEY(user_id,aptitude)
        )
    """)
    setup_conn.execute("CREATE INDEX IF NOT EXISTS idx_user_aptitudes_aptitude ON user_aptitudes(aptitude)")
def clean_text(value: str, label: str) -> str:
    value = " ".join(value.split())
    if not value or not all(char.isalpha() or char in " -'" for char in value):
        raise ValueError(f"{label} can contain only letters, spaces, hyphens and apostrophes")
    return value.title()
MIN_STUDENT_AGE=14
MAX_STUDENT_AGE=18
def age_on(birthdate: date, today: date) -> int:
    had_birthday=(today.month,today.day)>=(birthdate.month,birthdate.day)
    return today.year-birthdate.year-(0 if had_birthday else 1)
class Registration(BaseModel):
    password: str
    name: str
    birthdate: date
    city: str
    country: str
    aptitudes: list[str] = []

    @field_validator("birthdate")
    @classmethod
    def student_age_only(cls, value: date) -> date:
        age=age_on(value,datetime.now(UTC).date())
        if not MIN_STUDENT_AGE<=age<=MAX_STUDENT_AGE:
            raise ValueError(f"Only students aged {MIN_STUDENT_AGE}-{MAX_STUDENT_AGE} can register")
        return value

    @field_validator("city")
    @classmethod
    def format_city(cls, value: str) -> str:
        return clean_text(value, "City")

    @field_validator("country")
    @classmethod
    def format_country(cls, value: str) -> str:
        return clean_text(value, "Country")

    @field_validator("aptitudes")
    @classmethod
    def format_aptitudes(cls, values: list[str]) -> list[str]:
        cleaned = {" ".join(v.split()).lower() for v in values}
        if "" in cleaned:
            raise ValueError("Aptitudes cannot be empty")
        return sorted(cleaned)

    @field_validator("name")
    @classmethod
    def format_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value or not all(char.isalpha() or char == " " for char in value):
            raise ValueError("Name can contain only letters and spaces")
        return value.title()
class Credentials(BaseModel):
    name: str
    password: str
def is_rate_limited(name:str)->bool:
    window_start=datetime.now(UTC)-timedelta(minutes=LOGIN_WINDOW_MINUTES)
    login_attempts[name]=[t for t in login_attempts[name] if t>window_start]
    return len(login_attempts[name])>=MAX_LOGIN_ATTEMPTS
def create_token(name:str,role:str)->str:
    payload={
        "sub":name,
        "role":role,
        "exp":datetime.now(UTC)+timedelta(minutes=JWT_EXPIRATION_MINUTES)
    }
    token=jwt.encode(payload,JWT_SECRET_KEY,algorithm=JWT_ALGORITHM)
    return token
@auth_router.post("/register/")
def create_user(personal_data:Registration,db:sqlite3.Connection=Depends(get_db)):
    cur=db.cursor()
    hashed_password=bcrypt.hashpw(
        personal_data.password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode()
    try:
        cur.execute(
            "INSERT INTO userdata(name,password,birthdate,city,country) VALUES(?,?,?,?,?)",
            (personal_data.name,hashed_password,personal_data.birthdate.isoformat(),
             personal_data.city,personal_data.country)
        )
        cur.executemany(
            "INSERT INTO user_aptitudes(user_id,aptitude) VALUES(?,?)",
            [(cur.lastrowid,a) for a in personal_data.aptitudes]
        )
        db.commit()
        return{"id":cur.lastrowid}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400,detail="name already exists")
@auth_router.post("/login/")
def user_login(login_data:Credentials,db:sqlite3.Connection=Depends(get_db)):
    if is_rate_limited(login_data.name):
        raise HTTPException(status_code=429,detail="Too many login attempts,try again later")
    cur=db.cursor()
    cur.execute("SELECT id,name,password,role FROM userdata WHERE name=?",(login_data.name,))
    user_row=cur.fetchone()
    if user_row is None:
        login_attempts[login_data.name].append(datetime.now(UTC))
        raise HTTPException(status_code=400,detail="invalid user")
    password_hash=user_row[2]
    current_role=user_row[3]
    password_bytes=login_data.password.encode("utf-8")
    if not bcrypt.checkpw(password_bytes,password_hash.encode("utf-8")):
        login_attempts[login_data.name].append(datetime.now(UTC))
        raise HTTPException(status_code=400,detail="invalid user")
    login_attempts.pop(login_data.name,None)
    token=create_token(login_data.name,current_role)
    return{"access_token":token,"token_type":"bearer"}
def get_current_user(credentials: HTTPAuthorizationCredentials=Depends(security)):
    token=credentials.credentials
    try:
        payload=jwt.decode(token,JWT_SECRET_KEY,algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401,detail="login again please")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401,detail="token is invalid")
    return payload
@auth_router.get("/whoami/")
def whoami(user=Depends(get_current_user)):
    return user
@auth_router.get("/users/search/")
def search_users(
    aptitude:list[str]=Query(default=[]),
    city:str|None=None,
    country:str|None=None,
    user=Depends(get_current_user),
    db:sqlite3.Connection=Depends(get_db)
):
    wanted=sorted({" ".join(a.split()).lower() for a in aptitude if a.strip()})
    query="SELECT id,name,city,country FROM userdata WHERE 1=1"
    params:list=[]
    if city:
        query+=" AND lower(city)=lower(?)"
        params.append(city.strip())
    if country:
        query+=" AND lower(country)=lower(?)"
        params.append(country.strip())
    if wanted:
        marks=",".join("?"*len(wanted))
        query+=(" AND id IN (SELECT user_id FROM user_aptitudes WHERE aptitude IN ("+marks+")"
                " GROUP BY user_id HAVING COUNT(DISTINCT aptitude)=?)")
        params.extend(wanted)
        params.append(len(wanted))
    rows=db.execute(query,params).fetchall()
    return[
        {
            "id":r[0],"name":r[1],"city":r[2],"country":r[3],
            "aptitudes":[a[0] for a in db.execute(
                "SELECT aptitude FROM user_aptitudes WHERE user_id=? ORDER BY aptitude",(r[0],))]
        }
        for r in rows
    ]
