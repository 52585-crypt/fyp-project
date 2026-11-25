# RapidAssist QA harness

End-to-end tests that run against the real server, admin panel and Expo Web build. Nothing outside `qa-tests/` is modified.
The report is in [QA_REPORT.md](QA_REPORT.md).

```bash
cd qa-tests && npm install

# 1. Isolated backend: in-memory MongoDB + OSRM stub + server on :4000 (keep running)
node lib/start-stack.js

# 2. Backend API + Socket.io suite
node api/run-api-tests.js

# 3. Admin panel (in another terminal), then the UI test
(cd ../admin-panel && VITE_API_BASE_URL=http://localhost:4000 npx vite --port 5173)
node ui/admin-panel.e2e.js

# 4. Expo Web (in another terminal), then the walkthrough
(cd ../mobile-app && CI=1 EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo start --web --port 8081)
#    mobile-app/.env pins EXPO_PUBLIC_API_URL to a LAN IP that the dev web bundle keeps using;
#    APP_API_ORIGIN makes Playwright reroute those calls (HTTP + WebSocket) to the QA server.
APP_API_ORIGIN=http://192.168.0.116:4001 node ui/mobile-web.e2e.js

# 5. Rebuild the report
node make-report.js
```

Shortcuts (each starts and stops its own stack):

- `./run-api-regression.sh`: API suite plus a regression check against `results/api-baseline.json`.
- `./run-mobile-web.sh`: Expo Web walkthrough (Expo must already run on :8081; restart it after app changes, because with `CI=1` Metro does not watch files).
- `node ui/cookie-probe.js` (stack running): checks whether the httpOnly auth cookie works from the Expo Web origin.

- Playwright uses the installed Google Chrome (`/usr/bin/google-chrome`; set `CHROME_PATH` to change it).
- Login is rate-limited to 30 attempts per 15 minutes per IP. Restart the stack between repeated full runs.
- Results: `results/*.json`. Screenshots: `screenshots/`.
