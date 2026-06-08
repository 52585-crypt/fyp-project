# RapidAssist Backend - Version 2.1 (Vehicle Module)

## Base URL
- `http://localhost:4000`

## Auth
All vehicle endpoints require JWT auth. Use one of these:

- Header: `Authorization: Bearer <token>`
- Cookie: `rapidassist_access_token=<token>`

Login or register through `/api/auth` first. Insomnia can store the `Set-Cookie`
response automatically and reuse it on these requests.

## Endpoints

### Create vehicle
- `POST /api/vehicles`

Body:
```json
{
  "type": "car",
  "make": "Toyota",
  "model": "Corolla",
  "year": 2018,
  "registrationNumber": "LEA-123"
}
```

### List my vehicles
- `GET /api/vehicles`

### Update vehicle
- `PATCH /api/vehicles/:id`

Body (send only fields you want to change):
```json
{
  "model": "Corolla GLI",
  "year": 2019
}
```

### Delete vehicle
- `DELETE /api/vehicles/:id`

## Postman / Insomnia tests
1. Register/Login → copy token
2. Create vehicle (201)
3. List my vehicles (200)
4. Update vehicle (200) (owner only)
5. Delete vehicle (200) (owner only)
6. Unauthorized calls (401)
7. Invalid vehicle id (400)

