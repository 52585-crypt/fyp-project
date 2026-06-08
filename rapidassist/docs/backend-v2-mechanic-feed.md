# RapidAssist Backend - Version 2.3 (Mechanic Request Feed)

## Endpoint

### List open requests (mechanic only)
- `GET /api/requests/open`

Auth:
- `Authorization: Bearer <token>`
- or cookie `rapidassist_access_token=<token>`

Rules:
- Only `role=mechanic` can access (others get 403)
- Returns only `status="open"`
- Does **not** include user personal data

Response includes:
- request id
- category
- unknownIssue + issueType
- location.addressText
- createdAt
- vehicle basic info

## Postman / Insomnia tests
1. Login as **mechanic** → call `GET /api/requests/open` → 200
2. Login as **user** → call `GET /api/requests/open` → 403
3. No token → call `GET /api/requests/open` → 401

