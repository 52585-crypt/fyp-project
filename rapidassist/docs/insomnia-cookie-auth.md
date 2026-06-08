# RapidAssist Insomnia Cookie Auth

## Base URL

```text
http://localhost:4000
```

## Cookie flow

1. Send `POST /api/auth/login` or `POST /api/auth/register`.
2. Confirm the response has a `Set-Cookie` header for `rapidassist_access_token`.
3. Call protected routes without an `Authorization` header.
4. Insomnia should send the stored cookie automatically.

Bearer tokens still work, so mobile clients do not need to change.

## Login

```http
POST /api/auth/login
```

```json
{
  "phone": "03001234567",
  "password": "123456"
}
```

## Register user

```http
POST /api/auth/register
```

```json
{
  "role": "user",
  "name": "Test User",
  "phone": "03001234567",
  "password": "123456"
}
```

## Register mechanic

```http
POST /api/auth/register
```

```json
{
  "role": "mechanic",
  "name": "Test Mechanic",
  "phone": "03007654321",
  "password": "123456",
  "isCertified": true,
  "certificateUrl": "https://example.com/certificate.pdf"
}
```

## Protected route test

```http
GET /api/vehicles
```

Expected result after login/register:

```json
{
  "ok": true,
  "vehicles": []
}
```

## Logout

```http
POST /api/auth/logout
```

This clears the `rapidassist_access_token` cookie. After logout, protected routes
should return `401 Unauthorized` unless you send a valid Bearer token.
