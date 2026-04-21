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
- `GET /api/auth/me` (Bearer token)

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
  "certificateUrl": "https://example.com/cert.jpg"
}
```

