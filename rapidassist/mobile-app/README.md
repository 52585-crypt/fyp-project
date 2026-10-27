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

Start the API with `npm start` in `../server`. For the Android emulator, explicitly set the API address if needed:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 npm run start:native
```

For a physical phone, use the computer's reachable LAN IP instead. The app also detects the Metro host automatically. Restart Metro after changing the API environment variable.

## Native generation

The `android/` directory is generated and ignored by Git. If missing, the build helper runs `expo prebuild --platform android --no-install`; `expo run:android` also generates it as needed. Keep native configuration in `app.json` and config plugins so regeneration preserves it.

Reference: https://docs.expo.dev/guides/local-app-development/

## Verification report (2026-10-21)

- `npm run android:doctor`: passed; Java 21, ADB, and the emulator configuration detected.
- `npm run typecheck`: passed.
- `bash -n scripts/android-cli.sh`: passed.
- Android SDK Platform 36: installed successfully during setup.
- Native Gradle configuration and native Gradle plugin compilation: completed. Full APK build verification is still pending dependency resolution; no successful APK or device launch is claimed.
- Offline build: unavailable because required Gradle dependencies were not yet cached.
- `expo install --check`: reports suggested Expo/Constants patch updates and React Navigation version differences. Existing dependency versions were preserved.
