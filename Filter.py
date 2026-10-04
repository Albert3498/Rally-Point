import datetime
import sqlite3
from fastapi import APIRouter, HTTPException, Depends, Query
from geopy.geocoders import Nominatim
from geopy.distance import geodesic

filter_router = APIRouter()


# Initialize Nominatim geocoder
geolocator = Nominatim(user_agent="city_distance_app")

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect("events.db")
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        country TEXT,
        city TEXT,
        latitude REAL,
        longitude REAL,
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

# --- Allowed Filter Values ---
ALLOWED_ACTIONS = {'direct', 'logistics', 'creative / digital'}
ALLOWED_PAY = {'free', 'paid'}
ALLOWED_LANGUAGES = {'Romanian', 'English', 'Russian', 'French', 'Arabic', 'Spanish', 'Sign Language'}

@filter_router.get("/events/")
def event(
    city: str | None = None,
    country: str | None = None,
    distance: int | None = None,
    pay: str | None = None,
    name: str | None = None,
    date: datetime.date | None = None,
    action: str | None = None,
    accessibility: bool | None = None,
    language: str | None = None
):
    # 1. Validate parameters only when provided
    if pay is not None and pay not in ALLOWED_PAY:
        raise HTTPException(status_code=400, detail="Invalid pay option")
    if action is not None and action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action option")
    if language is not None and language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Invalid language option")

    # 2. Geocode target location if city or country is requested
    user_coords = None
    if city or country:
        search_query = f"{city or ''}, {country or ''}".strip(", ")
        location = geolocator.geocode(search_query)
        if location:
            user_coords = (location.latitude, location.longitude)
        elif distance is not None:
            raise HTTPException(status_code=404, detail="Search location could not be found")

    # 3. Dynamic SQL Query
    query = "SELECT * FROM events WHERE 1=1"
    params = []

    if pay:
        query += " AND pay_type = ?"
        params.append(pay)
    if action:
        query += " AND action = ?"
        params.append(action)
    if language:
        query += " AND language = ?"
        params.append(language)
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
    conn.row_factory = sqlite3.Row  # Return dict-like rows
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # 4. Filter results by distance radius (km)
    filtered_events = []
    for event in rows:
        if distance and user_coords:
            event_coords = (event["latitude"], event["longitude"])
            if event_coords[0] is not None and event_coords[1] is not None:
                dist_km = geodesic(user_coords, event_coords).km
                if dist_km > distance:
                    continue
                event["distance_km"] = round(dist_km, 2)

        filtered_events.append(event)

    return {"events": filtered_events}