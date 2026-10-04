import datetime
import sqlite3
from functools import lru_cache
from fastapi import APIRouter, HTTPException, Query
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from Authentification import DB_PATH
from event_requests import Category

filter_router = APIRouter()

# Initialize Nominatim geocoder cu user agent specific
geolocator = Nominatim(user_agent="romania_events_app")

# --- Database Setup (Conform create.sql) ---
def init_db():
    conn = sqlite3.connect("events.db")
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        city TEXT,
        date TEXT,
        pay_type TEXT,
        pay INTEGER DEFAULT 0,
        action TEXT,
        accessibility BOOLEAN,
        language TEXT
    )
    """)
    conn.commit()
    conn.close()

init_db()

# --- Cache pentru coordonatele orașelor din România ---
@lru_cache(maxsize=128)
def get_city_coordinates(city_name: str):
    """
    Caută coordonatele unui oraș din România folosind Nominatim.
    Rezultatele sunt păstrate în cache pentru a evita rate-limiting-ul.
    """
    try:
        location = geolocator.geocode(
            query={"city": city_name, "country": "Romania"},
            country_codes="ro"
        )
        if location:
            return (location.latitude, location.longitude)
    except Exception:
        pass
    return None

# --- Valori permise adaptate pentru România ---
ALLOWED_ACTIONS = {'direct', 'logistics', 'creative / digital', 'voluntariat', 'educație', 'cultural'}
ALLOWED_PAY = {'free', 'paid', 'gratuit', 'platit'}
ALLOWED_LANGUAGES = {
    'Romanian', 'Română',
    'English', 'Engleză',
    'Hungarian', 'Maghiară',
    'German', 'Germană',
    'Ukrainian', 'Ucraineană',
    'Sign Language', 'Limbajul semnelor'
}
REQUEST_CATEGORIES = {category.value for category in Category}


def approved_requests_as_events(name, city, date, action) -> list[dict]:
    """Approved event requests (userdata.db) shaped like the rows of events.db."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM event_requests WHERE status='approved' ORDER BY start_datetime").fetchall()
    events = []
    for row in rows:
        event = {
            "id": f"req-{row['id']}", "title": row["title"], "description": row["description"],
            "organization": row["organizer_name"], "city": row["location"],
            "action": row["category"], "date": row["start_datetime"][:10],
            "contact": row["contact_email"], "pay_type": "free", "accessibility": False,
            "volunteers_needed": row["volunteers_needed"], "tasks": row["volunteer_tasks"],
            "requirements": row["requirements"],
        }
        if name and name.lower() not in event["title"].lower():
            continue
        if city and city.lower() != event["city"].lower():
            continue
        if date and event["date"] < date.isoformat():
            continue
        if action and action.lower() != event["action"]:
            continue
        events.append(event)
    return events


@filter_router.get("/events/")
def get_events(
    city: str | None = Query(None, description="Orașul din România"),
    country: str | None = Query("România", description="Țara (implicit România)"),
    distance: int | None = Query(None, description="Raza maximă de căutare în km"),
    pay: str | None = Query(None, description="Tip plată: free/paid sau gratuit/platit"),
    name: str | None = Query(None, description="Căutare după titlul evenimentului"),
    date: datetime.date | None = Query(None, description="Data minimă a evenimentului (YYYY-MM-DD)"),
    action: str | None = Query(None, description="Tipul de acțiune/categorie"),
    accessibility: bool | None = Query(None, description="Accesibilitate persoane cu dizabilități"),
    language: str | None = Query(None, description="Limba de desfășurare")
):
    # 1. Validare parametri
    if pay is not None and pay.lower() not in ALLOWED_PAY:
        raise HTTPException(status_code=400, detail="Opțiune invalidă pentru plată (ex: gratuit, platit, free, paid)")
    if action is not None and action.lower() not in ALLOWED_ACTIONS | REQUEST_CATEGORIES:
        raise HTTPException(status_code=400, detail="Tip de acțiune invalid")
    if language is not None and language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Limbă nesuportată")

    # 2. Localizarea coordonatelor de căutare ale utilizatorului
    user_coords = None
    if city:
        user_coords = get_city_coordinates(city)
        if not user_coords and distance is not None:
            raise HTTPException(
                status_code=404, 
                detail=f"Orașul '{city}' nu a fost găsit în România"
            )

    # 3. Interogare dinamică SQL (Conform structurii din create.sql)
    query = "SELECT * FROM events WHERE 1=1"
    params = []

    if pay:
        # Mapare variante ro/en pentru baza de date
        pay_value = "free" if pay.lower() in ("free", "gratuit") else "paid"
        query += " AND (pay_type = ? OR pay_type = ?)"
        params.extend([pay_value, pay])

    if action:
        query += " AND LOWER(action) = LOWER(?)"
        params.append(action)

    if language:
        query += " AND (LOWER(language) = LOWER(?) OR language = ?)"
        params.extend([language, language])

    if accessibility is not None:
        query += " AND accessibility = ?"
        params.append(accessibility)

    if name:
        query += " AND title LIKE ?"
        params.append(f"%{name}%")

    if date:
        query += " AND date >= ?"
        params.append(date.isoformat())

    conn = sqlite3.connect("events.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # 4. Calculare distanță pe baza orașului din baza de date
    filtered_events = []
    for event in rows:
        event_city = event.get("city")
        
        # Filtrare strictă pe oraș dacă nu s-a cerut o rază de distanță
        if city and not distance:
            if event_city and event_city.lower() != city.lower():
                continue

        # Calcul distanță geodesică dacă avem rază setată
        if distance and user_coords and event_city:
            event_coords = get_city_coordinates(event_city)
            if event_coords:
                dist_km = geodesic(user_coords, event_coords).km
                if dist_km > distance:
                    continue
                event["distance_km"] = round(dist_km, 2)

        filtered_events.append(event)

    # Requests carry no pay, language, accessibility or coordinates, so those filters exclude them.
    if pay is None and language is None and accessibility is None and distance is None:
        filtered_events += approved_requests_as_events(name, city, date, action)
    return {"events": filtered_events}