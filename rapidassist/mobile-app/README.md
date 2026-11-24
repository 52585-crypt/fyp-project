# RapidAssist mobile: native Android CLI

This app uses React Native 0.81.5, Expo SDK 54, and Expo Router. The CLI workflow builds a native development APK with the app's native modules. Expo remains part of the app; this is not a migration to the React Native Community CLI.

## Commands

Run from `mobile-app`:

```bash
npm ci
npm run android:doctor
npm run android
```

`android` builds, installs, and starts the native app on an Android emulator or connected USB-debugging device. Select the existing `Pixel_10_Pro` emulator when prompted. To explicitly select a device, use `npm run android -- --device`.

```bash
npm run android:build  # Build a debug APK without a device
npm run start:native   # Start Metro for an already installed development build
npm run android:go     # Optional Expo Go workflow
```

Debug APK output: `android/app/build/outputs/apk/debug/app-debug.apk`. A debug APK needs Metro running. It is not a signed production distribution.

## Local tooling

The Bash helper supports this Linux workstation. It honors `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`). If Java is not explicitly configured, it selects `/opt/android-studio-for-platform/jbr` when available. The SDK defaults to `$HOME/Android/Sdk`. It does not modify global shell settings.

Observed on this workstation: Node 22.22.1, Android Studio JDK 21.0.9, Android SDK, ADB, and the `Pixel_10_Pro` AVD. System Java is 25, so use the helper commands for the selected Android Studio runtime. No physical device was connected during the initial check.

## Backend connection

For the nearby-provider privacy rollout, release both Expo clients with the
coordinate-free preview UI first. This UI can read either preview response.
Confirm the Android update is installed by supported users and the updated Web
bundle is served before deploying the backend response that omits provider GPS.
Where older clients are still supported, keep the new backend on staging until
those clients are updated or a minimum supported version can be enforced.

Run `npm run dev` in `../server`. It loads `server/.env.development.local` before `server/.env`. Exported shell variables take precedence. Use a dedicated development database, because normal API startup runs account bootstrap and database maintenance. On this workstation, the `rapidassist-dev-mongodb.service` user service starts the existing replica set on login at `127.0.0.1:27018` and uses the data directory `~/.local/share/rapidassist/dev-mongodb`. If API startup reports `ECONNREFUSED`, check and start the service with these commands.

```bash
systemctl --user status rapidassist-dev-mongodb.service
systemctl --user start rapidassist-dev-mongodb.service
```

When Stripe QA occupies port 4000, set `PORT=4001` in `server/.env.development.local` and `EXPO_PUBLIC_DEV_API_PORT=4001` in `mobile-app/.env.development.local`. Restart Metro and reload the app. Expo Web uses the browser's hostname, and the native app uses the Metro hostname or falls back to the Android emulator's `10.0.2.2` alias. A physical Android phone on the same network needs Metro in LAN mode and access to the API port through the workstation firewall. For a USB-connected phone using localhost Metro, forward both ports with ADB:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:4001 tcp:4001
npm run start:native -- --localhost
```

If another Metro instance is already running on 8081, pass `--port 8082` and reverse 8082 instead. Expo Web needs its exact origin in the development backend's `CORS_ORIGIN` allowlist and in Google's authorized JavaScript origins. To point a separate Metro session at Stripe QA, set `EXPO_PUBLIC_DEV_API_PORT=4000` in that session's shell. An explicit `EXPO_PUBLIC_API_URL` takes precedence over automatic host and port selection.

### Staging and production builds

Set `EXPO_PUBLIC_API_URL` to the deployed API's HTTPS origin, without an `/api`
suffix. Use the staging origin in the EAS `preview` environment and the
production origin in the EAS `production` environment. Expo inlines the value
into the bundle, so changing it requires rebuilding the APK or exporting Web
again. The API URL is public configuration. Keep credentials out of it.

For local release builds, export the actual deployed origin in the build
shell. After updating an existing generated Android project, run Expo prebuild
to apply the Gradle configuration before building.

```bash
# Set RAPIDASSIST_STAGING_API_ORIGIN to the deployed HTTPS staging origin first.
export EXPO_PUBLIC_API_URL="${RAPIDASSIST_STAGING_API_ORIGIN:?Set the deployed staging origin}"
npx expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease)
npx expo export --platform web
```

The local Expo-generated release variant uses the debug keystore by default.
Use the EAS `preview` profile or your approved release signing credentials for
distribution. For hosted Expo Web, include its exact browser origin in the
backend `CORS_ORIGIN` allowlist. Release bundling rejects a missing API origin,
HTTP, localhost, and emulator aliases. Local HTTP defaults apply to development
bundles, including Expo Web and the Android emulator.

## Native generation

The `android/` directory is generated and ignored by Git. If missing, the build helper runs `expo prebuild --platform android --no-install`; `expo run:android` also generates it as needed. Keep native configuration in `app.json` and config plugins so regeneration preserves it.

Reference: https://docs.expo.dev/guides/local-app-development/

## Google authentication

Google Sign-In uses one Web application OAuth client for Web credentials and
the Android ID token requested by the native app.

Providers can choose Google or phone/password from **Register as a Provider**.
Google pre-fills the provider's name, verified email and account avatar. The
provider still enters a mobile number and attaches the documents for their
service before creating an account. To return with Google, select **Provider**
on the Login screen. Phone/password sign-in remains available.

The Google account avatar is displayed in Provider Profile. CNIC and face
photo submission, biometric consent and admin approval follow account creation.

1. In Google Cloud, open **Google Auth Platform > Clients** (or **APIs & Services
   > Credentials**) and create or open a client whose application type is **Web
   application**.
2. Under **Authorized JavaScript origins**, add every exact browser origin used
   to run the app. Local Expo Web normally needs `http://localhost:8081`; add
   `http://127.0.0.1:8081` as well if that is the URL used in the browser. Add
   the deployed HTTPS origin separately. Origins include the scheme and port,
   and do not include a path.
3. Put that Web client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in
   `mobile-app/.env`, and put the same value in `GOOGLE_CLIENT_IDS` in
   `server/.env`. Restart both processes after changing either file.
4. For Android, also create an **Android** OAuth client in the same Google Cloud
   project with package `com.rapidassist.app` and the SHA-1 of the certificate
   used to sign the installed build. Obtain the debug SHA-1 with
   `cd android && ./gradlew signingReport`.
5. Native Google Sign-In is unavailable in Expo Go. Rebuild and install the
   development app with `npm run android:build`, then use `npm run start:native`.

An `Error 401: invalid_client` with `no registered origin` specifically means
that the Web OAuth client is missing the browser's Authorized JavaScript
origin. A redirect URI or Maps API key does not resolve this error.

## Google Maps

The customer location picker, tracking map, and provider job maps use Google Maps when configured. Without a key, they retain the existing OpenStreetMap/CARTO maps. Search and route services are unchanged.

1. Enable billing, the Maps SDK for Android, and the Maps JavaScript API in Google Cloud.
2. Create separate restricted keys. Restrict the Android key to package `com.rapidassist.app`, the signing certificate SHA-1, and Maps SDK for Android. Restrict the Web key to the allowed browser origins and Maps JavaScript API. The local Expo server currently uses `http://localhost:8081`; include the origin actually used by your browser.
3. Add `GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` to the local `.env` file. Do not commit the keys. The Web key is included in the client bundle and must be restricted by origin.
4. Restart Metro after changing `.env`. Run `npx expo prebuild --platform android` and rebuild/reinstall the Android development app after setting or changing its key; a Metro reload alone cannot update the native key or add the native Maps SDK.

Google Maps requires access to the configured Google Cloud project and enabled APIs. See [Google's Maps security guidance](https://developers.google.com/maps/api-security-best-practices) and [Expo's map setup](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/).

## CARTO basemaps (non-Google maps)

Without Google Maps keys, every map uses CARTO Voyager raster tiles (`tile.openstreetmap.org` blocks app traffic). Set `EXPO_PUBLIC_CARTO_BASEMAP_API_KEY` in `mobile-app/.env` and restart Expo with `npx expo start -c`; without a key CARTO returns an "API KEY REQUIRED" placeholder tile.

CARTO key is restricted to localhost; add the production domain in the CARTO dashboard or use a separate unrestricted key for mobile builds. Requests from the Android WebView, a LAN IP, or a deployed domain otherwise get 403 tiles.

## Verification report (2026-11-11)

- `npm run android:doctor`: passed; Java 21, ADB, and the emulator configuration detected.
- `npm run typecheck`: passed.
- `bash -n scripts/android-cli.sh`: passed.
- Android SDK Platform 36: installed successfully during setup.
- Native Gradle configuration, Google Sign-In native module compilation, and
  debug APK assembly: passed.
- `expo install --check`: reports suggested Expo/Constants patch updates and React Navigation version differences. Existing dependency versions were preserved.
