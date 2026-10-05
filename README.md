# Petrisorii

## Create a local admin account

From the project root, run:

```powershell
.\.venv\Scripts\python.exe create_admin.py
```

Enter an admin name and a password of 16–72 UTF-8 bytes when prompted. The password is
entered without being displayed and stored as a bcrypt hash. This local setup command
creates an admin directly in the configured database; public account registration
cannot create admin accounts.

## Event images and publishing

Install backend dependencies with `pip install -r requirements.txt`. Organizations can
attach an optional JPEG, PNG, or WebP image (up to 5 MB) when submitting an event
request. Images are stored under `uploads/event-images/`; keep that directory available
and writable when running the API. Only approved requests are returned by
`GET /published-events/`, which the Home, Opportunities, and Discover views combine
with the bundled sample events.