# Petrisorii

## Run the full-stack application

1. Start the FastAPI backend from the project directory:

   ```sh
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

2. Serve `interface.html` over HTTP (for example, with VS Code Live Server at
   `http://127.0.0.1:5501`). Do not open it directly with `file://`; browser
   security blocks API requests from that origin.

The interface defaults to `http://127.0.0.1:8000` and loads events from the
backend. For a different backend address, change `apiBase` in the `APP_CONFIG`
block near the bottom of `interface.html`. Registration, login, volunteer
search, event requests, and admin review use the API; automatic event sync is
available to admins from the Admin page.

## Automatic event sync

An administrator can sync up to 100 current projects from Impact Volunteer with
`POST /events/automatic-sync`, using the usual `Authorization: Bearer <token>`
header. Provider IDs are tracked separately from local event IDs, so repeated
syncs update existing records instead of duplicating them. Synced records are
available from `GET /events/`.