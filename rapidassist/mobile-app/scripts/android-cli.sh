#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer an explicit JDK; otherwise use Android Studio's bundled runtime.
if [[ -z "${JAVA_HOME:-}" && -x /opt/android-studio-for-platform/jbr/bin/java ]]; then
  export JAVA_HOME=/opt/android-studio-for-platform/jbr
fi
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo 'Android SDK missing. Set ANDROID_HOME to your Android SDK directory.' >&2
  exit 1
fi

mode="${1:-run}"
shift || true
case "$mode" in
  doctor)
    node --version
    java -version
    adb devices
    emulator -list-avds
    ;;
  run) exec npx --no-install expo run:android "$@" ;;
  build)
    if [[ ! -f android/gradlew ]]; then
      npx --no-install expo prebuild --platform android --no-install
    fi
    cd android
    exec bash ./gradlew :app:assembleDebug --console=plain "$@"
    ;;
  *) echo "Unknown mode: $mode (use run, build, doctor)" >&2; exit 1 ;;
esac
