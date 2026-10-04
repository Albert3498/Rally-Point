import datetime
import logging
import sqlite3
from functools import lru_cache
from fastapi import APIRouter, HTTPException, Query
from geopy.exc import GeocoderServiceError
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from events_store import PUBLIC_EVENT_COLUMNS, connect_events_db, initialize_events_db

filter_router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize Nominatim geocoder cu user agent specific
geolocator = Nominatim(user_agent="romania_events_app")

# --- Database Setup (Conform create.sql) ---
def init_db():
    initialize_events_db()

init_db()

# --- Cache pentru coordonatele orașelor ---
@lru_cache(maxsize=128)
def get_city_coordinates(city_name: str, country: str):
    """
    Caută coordonatele unui oraș din țara specificată folosind Nominatim.
    Rezultatele sunt păstrate în cache pentru a evita rate-limiting-ul.
    """
    try:
        location = geolocator.geocode(
            query={"city": city_name, "country": country}
        )
        if location:
            return (location.latitude, location.longitude)
    except GeocoderServiceError as e:
        logger.error("Failed to geocode city %r in %r: %s", city_name, country, e)
        raise HTTPException(status_code=503, detail="City geocoding service is unavailable") from e
    return None

# --- Values used by event rows ---
PAY_TYPE_ALIASES = {
    'free': ('free', 'gratuit'),
    'gratuit': ('free', 'gratuit'),
    'paid': ('paid', 'platit'),
    'platit': ('paid', 'platit'),
}
ALLOWED_LANGUAGES = {
    value.casefold() for value in {
        'Romanian', 'Română',
        'English', 'Engleză',
        'Hungarian', 'Maghiară',
        'German', 'Germană',
        'Ukrainian', 'Ucraineană',
        'Sign Language', 'Limbajul semnelor'
    }
}

@filter_router.get("/events/")
def get_events(
    city: str | None = Query(None, description="City to search for"),
    country: str | None = Query("Romania", description="Country used for city lookup"),
    distance: int | None = Query(None, gt=0, description="Maximum search radius in km"),
    pay: str | None = Query(None, description="Tip plată: free/paid sau gratuit/platit"),
    name: str | None = Query(None, description="Căutare după titlul evenimentului"),
    date: datetime.date | None = Query(None, description="Data minimă a evenimentului (YYYY-MM-DD)"),
    action: str | None = Query(None, description="Tipul de acțiune/categorie"),
    accessibility: bool | None = Query(None, description="Accesibilitate persoane cu dizabilități"),
    language: str | None = Query(None, description="Limba de desfășurare")
):
    # 1. Validare parametri
    if pay is not None and pay.casefold() not in PAY_TYPE_ALIASES:
        raise HTTPException(status_code=400, detail="Opțiune invalidă pentru plată (ex: gratuit, platit, free, paid)")
    if action is not None and not action.strip():
        raise HTTPException(status_code=400, detail="Tip de acțiune invalid")
    if language is not None and language.casefold() not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Limbă nesuportată")

    if distance is not None and not city:
        raise HTTPException(status_code=400, detail="A city is required when filtering by distance")

    # 2. Localizarea coordonatelor de căutare ale utilizatorului
    user_coords = None
    if city and distance is not None:
        user_coords = get_city_coordinates(city, country or "Romania")
        if not user_coords and distance is not None:
            raise HTTPException(
                status_code=404, 
                detail=f"City '{city}' was not found in {country or 'Romania'}"
            )

    # 3. Interogare dinamică SQL (Conform structurii din create.sql)
    query = f"SELECT {PUBLIC_EVENT_COLUMNS} FROM events WHERE 1=1"
    params = []

    if pay:
        pay_values = PAY_TYPE_ALIASES[pay.casefold()]
        query += " AND LOWER(pay_type) IN (?, ?)"
        params.extend(pay_values)

    if accessibility is not None:
        query += " AND accessibility = ?"
        params.append(accessibility)

    if name:
        query += " AND title LIKE ?"
        params.append(f"%{name}%")

    if date:
        query += " AND date >= ?"
        params.append(date.isoformat())

    conn = connect_events_db()
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

    # Compare these in Python so Romanian and other Unicode text is case-insensitive.
    if action:
        requested_action = action.casefold()
        rows = [event for event in rows if (event.get("action") or "").casefold() == requested_action]
    if language:
        requested_language = language.casefold()
        rows = [event for event in rows if (event.get("language") or "").casefold() == requested_language]

    # 4. Calculare distanță pe baza orașului din baza de date
    filtered_events = []
    for event in rows:
        event_city = event.get("city")
        
        # Filtrare strictă pe oraș dacă nu s-a cerut o rază de distanță
        if city and not distance:
            if not event_city or event_city.casefold() != city.casefold():
                continue

        # Calcul distanță geodesică dacă avem rază setată
        if distance:
            if not event_city:
                continue
            event_coords = get_city_coordinates(
                event_city, event.get("country") or country or "Romania"
            )
            if not event_coords:
                continue
            dist_km = geodesic(user_coords, event_coords).km
            if dist_km > distance:
                continue
            event["distance_km"] = round(dist_km, 2)

        filtered_events.append(event)

    return {"events": filtered_events}