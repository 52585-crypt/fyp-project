# RapidAssist Mobile - Version 1 (Authentication)

## Setup

1. Go to `rapidassist/mobile-app`
2. Install:

```bash
npm install
npm run start
```

## Routes

- `/(auth)/welcome`
- `/(auth)/login`
- `/(auth)/signup`
- `/(app)/home`

## Backend API

Update base URL in `src/config/api.ts`:

- Android emulator: `http://10.0.2.2:4000`
- Real device: `http://<PC_LAN_IP>:4000`

Endpoints used:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

## Screenshot checklist (for report)

- Welcome screen
- Signup screen (role pills visible)
- Login screen
- Home screen after login (shows name + role)

## Manual test cases

- Signup user (valid) → token + redirect to home
- Signup mechanic (valid) → role shows mechanic on home
- Login wrong password → error message
- Duplicate phone signup → shows backend message (409)
- Logout → redirect back to auth flow on next app launch

