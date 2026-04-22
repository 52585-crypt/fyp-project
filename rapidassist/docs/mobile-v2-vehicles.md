# RapidAssist Mobile - Version 2.1 (Vehicle Module)

## Screens
- `/(app)/vehicles` (My Vehicles)
- `/(app)/vehicles/add` (Add Vehicle)

## Backend APIs used
- `GET /api/vehicles`
- `POST /api/vehicles`
- `DELETE /api/vehicles/:id`

## Screenshot checklist
- Home screen showing **My Vehicles** button
- My Vehicles (empty state)
- Add Vehicle form
- My Vehicles after adding one vehicle
- Delete vehicle confirmation/result

## Manual testing
- Add vehicle → appears in list
- Refresh (reopen vehicles screen) → list still loads
- Delete vehicle → removed from list
- If backend down → error message shows

