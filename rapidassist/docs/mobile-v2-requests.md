# RapidAssist Mobile - Version 2.2 (Create Service Request)

## Screen
- `/(app)/request/create`

## Backend APIs used
- `GET /api/vehicles` (vehicle picker)
- `POST /api/requests` (create request)

## Screenshot checklist
- Create Request screen (vehicle cards + category pills)
- Unknown issue toggle enabled
- Location block filled
- Success navigation back to Home (or confirmation state)

## Manual testing
- With vehicles present: create request (known issue) → backend 201
- Unknown issue flow: create request (unknownIssue=true) → backend 201
- Without vehicles: empty state prompts “Add Vehicle”
- Backend down: error message visible

