import logging

import requests
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/events", tags=["Automatic Events"])
logger = logging.getLogger(__name__)

IMPACT_VOLUNTEER_API = "https://impactvolunteer.com/api/public/volunteer-projects?limit=100"

@router.get("/automatic-sync")
def sync_automatic_events():
    """
    Fetches volunteer projects from the Impact Volunteer API and transforms them
    into RallyPoint automatic events.
    """
    try:
        response = requests.get(IMPACT_VOLUNTEER_API, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Extract projects from the response (adjust key based on actual API structure)
        projects = data.get("projects", data) if isinstance(data, dict) else data

        events = []
        for proj in projects:
            # Match the events table and /events/ response schema.
            event = {
                "id": proj.get("id"),
                "title": proj.get("title") or proj.get("name"),
                "city": proj.get("city") or proj.get("location"),
                "date": proj.get("date"),
                "pay_type": proj.get("pay_type"),
                "pay": proj.get("pay", 0),
                "action": proj.get("action") or proj.get("category"),
                "accessibility": proj.get("accessibility"),
                "language": proj.get("language"),
            }
            events.append(event)

        return {
            "status": "success",
            "count": len(events),
            "events": events
        }

    except requests.RequestException as e:
        logger.error(f"Failed to fetch external volunteer projects: {e}")
        raise HTTPException(status_code=502, detail=f"External API error: {e}")
    except Exception as e:
        logger.error(f"Error processing automatic events: {e}")
        raise HTTPException(status_code=500, detail=str(e))