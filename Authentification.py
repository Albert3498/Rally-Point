import bcrypt
from pydantic import BaseModel,EmailStr,field_validator,model_validator
from typing import Literal
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
def name_key(name: str) -> str:
    """Comparison form of a name: Unicode case-folded, whitespace collapsed ("ȘCOALA  X" == "școala x")."""
    return " ".join(name.split()).casefold()
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
            birthdate TEXT,
            role VARCHAR(50) NOT NULL DEFAULT 'user',
            city VARCHAR(255),
            country VARCHAR(255),
            email VARCHAR(255),
            name_key VARCHAR(255)
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
    if "email" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN email VARCHAR(255)")
    if "name_key" not in current_columns:
        setup_conn.execute("ALTER TABLE userdata ADD COLUMN name_key VARCHAR(255)")
    # Older databases declared birthdate NOT NULL, but organization accounts have no birthdate.
    # SQLite cannot drop a NOT NULL, so rebuild the table once (keeps ids, so foreign keys stay valid).
    if any(col[1]=="birthdate" and col[3] for col in setup_conn.execute("PRAGMA table_info(userdata)")):
        setup_conn.execute("""
            CREATE TABLE userdata_new(
                id INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                birthdate TEXT,
                role VARCHAR(50) NOT NULL DEFAULT 'user',
                city VARCHAR(255),
                country VARCHAR(255),
                email VARCHAR(255),
                name_key VARCHAR(255)
            )
        """)
        setup_conn.execute(
            "INSERT INTO userdata_new(id,name,password,birthdate,role,city,country,email,name_key) "
            "SELECT id,name,password,birthdate,role,city,country,email,name_key FROM userdata")
        setup_conn.execute("DROP TABLE userdata")
        setup_conn.execute("ALTER TABLE userdata_new RENAME TO userdata")
    # Names are unique ignoring case ("Ong Verde" and "ONG VERDE" are the same account). SQLite's NOCASE only
    # folds ASCII ("ȚARA" != "țara"), so the comparison form is stored in name_key and filled in here for old rows.
    for row_id,row_name in setup_conn.execute("SELECT id,name FROM userdata WHERE name_key IS NULL").fetchall():
        setup_conn.execute("UPDATE userdata SET name_key=? WHERE id=?",(name_key(row_name),row_id))
    try:
        setup_conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_userdata_name_key ON userdata(name_key)")
    except sqlite3.IntegrityError:
        pass  # existing rows already differ only by case; the register check still blocks new ones
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
MAX_ORGANIZATION_NAME_LENGTH=100
def student_name(value: str) -> str:
    value = " ".join(value.split())
    if not value or not all(char.isalpha() or char == " " for char in value):
        raise ValueError("Name can contain only letters and spaces")
    return value.title()
def organization_name(value: str) -> str:
    # Organization names keep their capitalisation ("ONG Verde") and may contain digits and . & , ( ) -
    value = " ".join(value.split())
    if not any(char.isalpha() for char in value) or not all(char.isalnum() or char in " -'.&,()" for char in value):
        raise ValueError("Organization name can contain only letters, digits, spaces and - ' . & , ( )")
    if len(value) > MAX_ORGANIZATION_NAME_LENGTH:
        raise ValueError(f"Organization name can have at most {MAX_ORGANIZATION_NAME_LENGTH} characters")
    return value
class Registration(BaseModel):
    # "student": a person aged 14-18 (name = their name). "organization": an adult NGO/association
    # (name = the organization's name, needs a contact email, has no birthdate or aptitudes).
    account_type: Literal["student","organization"] = "student"
    password: str
    name: str
    birthdate: date | None = None
    email: EmailStr | None = None
    city: str
    country: str
    aptitudes: list[str] = []

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

    @model_validator(mode="after")
    def check_account_type(self):
        if self.account_type == "organization":
            if self.birthdate is not None:
                raise ValueError("Organization accounts must not send a birthdate")
            if self.aptitudes:
                raise ValueError("Organization accounts cannot have aptitudes")
            if self.email is None:
                raise ValueError("Organization accounts need a contact email")
            self.name = organization_name(self.name)
            return self
        if self.birthdate is None:
            raise ValueError("Student accounts need a birthdate")
        age = age_on(self.birthdate, datetime.now(UTC).date())
        if not MIN_STUDENT_AGE <= age <= MAX_STUDENT_AGE:
            raise ValueError(
                f"Only students aged {MIN_STUDENT_AGE}-{MAX_STUDENT_AGE} can register "
                "(adult organizations register with account_type 'organization')")
        self.name = student_name(self.name)
        return self
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
    role="organization" if personal_data.account_type=="organization" else "user"
    birthdate=personal_data.birthdate.isoformat() if personal_data.birthdate else None
    try:
        # names are unique ignoring case; checked here and enforced by idx_userdata_name_key
        key=name_key(personal_data.name)
        if cur.execute("SELECT 1 FROM userdata WHERE name_key=?",(key,)).fetchone():
            raise HTTPException(status_code=400,detail="name already exists")
        cur.execute(
            "INSERT INTO userdata(name,password,birthdate,city,country,role,email,name_key) VALUES(?,?,?,?,?,?,?,?)",
            (personal_data.name,hashed_password,birthdate,
             personal_data.city,personal_data.country,role,personal_data.email,key)
        )
        user_id=cur.lastrowid
        cur.executemany(
            "INSERT INTO user_aptitudes(user_id,aptitude) VALUES(?,?)",
            [(user_id,a) for a in personal_data.aptitudes]
        )
        db.commit()
        return{"id":user_id,"role":role}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400,detail="name already exists")
@auth_router.post("/login/")
def user_login(login_data:Credentials,db:sqlite3.Connection=Depends(get_db)):
    # Login ignores case, so the rate limit must too, or "ann"/"Ann"/"ANN" would each get 5 tries.
    attempts_key=name_key(login_data.name)
    if is_rate_limited(attempts_key):
        raise HTTPException(status_code=429,detail="Too many login attempts,try again later")
    cur=db.cursor()
    cur.execute("SELECT id,name,password,role FROM userdata WHERE name_key=?",(attempts_key,))
    user_row=cur.fetchone()
    if user_row is None:
        login_attempts[attempts_key].append(datetime.now(UTC))
        raise HTTPException(status_code=400,detail="invalid user")
    password_hash=user_row[2]
    current_role=user_row[3]
    password_bytes=login_data.password.encode("utf-8")
    if not bcrypt.checkpw(password_bytes,password_hash.encode("utf-8")):
        login_attempts[attempts_key].append(datetime.now(UTC))
        raise HTTPException(status_code=400,detail="invalid user")
    login_attempts.pop(attempts_key,None)
    # the token carries the stored name, not what was typed: other code looks the account up by exact name
    token=create_token(user_row[1],current_role)
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
    # only students are volunteers; organizations and admins are not listed
    query="SELECT id,name,city,country FROM userdata WHERE role='user'"
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
