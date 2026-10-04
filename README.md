# Petrisorii

## Automatic event sync

An administrator can sync up to 100 current projects from Impact Volunteer with
`POST /events/automatic-sync`, using the usual `Authorization: Bearer <token>`
header. Provider IDs are tracked separately from local event IDs, so repeated
syncs update existing records instead of duplicating them. Synced records are
available from `GET /events/`.