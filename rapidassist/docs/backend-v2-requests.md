# RapidAssist Backend - Version 2.2 (Service Request Creation)

## Base URL
- `http://localhost:4000`

## Auth
All request endpoints require JWT:
- Header: `Authorization: Bearer <token>`

## Endpoints

### Create request
- `POST /api/requests`

Body (known issue):
```json
{
  "vehicleId": "<vehicleId>",
  "category": "car",
  "unknownIssue": false,
  "issueType": "engine",
  "description": "Car not starting",
  "location": {
    "lat": 31.5204,
    "lng": 74.3587,
    "addressText": "Gulberg, Lahore"
  }
}
```

Body (unknown issue):
```json
{
  "vehicleId": "<vehicleId>",
  "category": "bike",
  "unknownIssue": true,
  "issueType": null,
  "description": "Bike is making weird sound",
  "location": {
    "lat": 33.6844,
    "lng": 73.0479,
    "addressText": "Blue Area, Islamabad"
  }
}
```

### List my requests
- `GET /api/requests`

## Postman / Insomnia tests
1. Login → get token
2. Create a vehicle → copy `vehicleId`
3. Create request (201)
4. Create request unknown issue (201)
5. List my requests (200)
6. Unauthorized (401)
7. Wrong vehicleId / not owned vehicleId → 403

