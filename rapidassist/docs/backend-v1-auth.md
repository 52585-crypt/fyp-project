# RapidAssist Backend - Version 1 (Authentication)

## Setup

1. Go to `rapidassist/server`
2. Copy `.env.example` to `.env` and fill:
   - `MONGODB_URI`
   - `JWT_SECRET`
3. Install and run:

```bash
npm install
npm run dev
```

## Endpoints

### Health
- `GET /health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token or auth cookie)
- `POST /api/auth/logout` (clears auth cookie)

## Cookie authentication

`POST /api/auth/register` and `POST /api/auth/login` still return the JWT as `token`,
and they also set an HTTP-only cookie:

- Cookie name: `rapidassist_access_token`
- Default `SameSite`: `lax`
- Default `Secure`: `true` in production, `false` otherwise
- Default max age: 7 days

Protected routes accept either:

- `Authorization: Bearer <token>`
- `rapidassist_access_token` cookie

Optional env settings:

```bash
CORS_ORIGIN=http://localhost:5173,http://localhost:8081
AUTH_COOKIE_NAME=rapidassist_access_token
AUTH_COOKIE_MAX_AGE_MS=604800000
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
```

## Postman test data (example)

Register user:

```json
{
  "role": "user",
  "name": "Ali",
  "phone": "03001234567",
  "password": "secret123"
}
```

Register mechanic:

```json
{
  "role": "mechanic",
  "name": "Ustad Mechanic",
  "phone": "03007654321",
  "password": "secret123",
  "isCertified": true,
  "certificateUrl": "https://example.com/cert.jpg",
  "mechanicProfile": {
    "serviceCategory": "mechanic",
    "selfieUrl": "data:image/jpeg;base64,/9j/...",
    "idCardFrontUrl": "data:image/jpeg;base64,/9j/...",
    "idCardBackUrl": "data:image/jpeg;base64,/9j/...",
    "workshopPhotoUrl": "data:image/jpeg;base64,/9j/...",
    "certificateUrl": "data:image/jpeg;base64,/9j/...",
    "liveLocation": {
      "lat": 31.5204,
      "lng": 74.3587,
      "addressText": "Lahore, Pakistan"
    }
  }
}
```

Mechanic `serviceCategory` values:

- `mechanic`
- `fuel_delivery`
- `towing`

`liveLocation` is optional for mechanic registration. If it is not provided,
the backend stores an empty location block for later update.

Mechanic photos are stored directly in the embedded `mechanicProfile` document
as base64 image data URIs. The backend rejects local phone paths such as
`file://...` because those paths cannot be read by the server later. Optional env:

```bash
JSON_BODY_LIMIT=12mb
MECHANIC_IMAGE_MAX_CHARS=2500000
```

The backend stores identity-match status as `pending`. Connect a face-match/OCR
provider before marking `identityMatch.status` as `matched` or `mismatch`.

Logout:

```http
POST /api/auth/logout
```

