#!/usr/bin/env bash
# Installs the debug and minified release APKs on a running emulator, launches each, walks the main
# screens, imports the bundled sample project, and fails on any crash. Usage: device-smoke.sh <apk-dir>
set -euo pipefail
DIR="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
echo "Device API level: $SDK"

check_alive() {
  local pkg="$1" step="$2"
  if adb logcat -d -s AndroidRuntime:E | grep -q "Process: $pkg"; then
    echo "::error::$pkg crashed during: $step"
    adb logcat -d -s AndroidRuntime:E | head -150
    exit 1
  fi
  if ! adb shell pidof "$pkg" > /dev/null 2>&1 && ! adb shell ps | tr -d '\r' | grep -q " $pkg$"; then
    echo "::error::$pkg is not running after: $step"
    adb logcat -d | tail -150
    exit 1
  fi
}

for apk in "$DIR"/*.apk; do
  echo "::group::Install $(basename "$apk")"
  adb install -r "$apk"
  echo "::endgroup::"
done

for pkg in com.appfix.studio.debug com.appfix.studio; do
  echo "::group::Smoke test $pkg"
  adb shell pm list packages | grep -qx "package:$pkg" || { echo "::error::$pkg not installed"; exit 1; }
  adb logcat -c
  adb shell am start -W -n "$pkg/com.appfix.studio.MainActivity"
  sleep 6
  check_alive "$pkg" "launch"
  for tab in Projects Editor Repair Settings Home; do
    python3 "$HERE/ui_tap.py" "$tab" 20
    sleep 2
    check_alive "$pkg" "open $tab"
  done
  python3 "$HERE/ui_tap.py" "Sample app" 20
  # Import runs in the background; wait for the project screen.
  python3 "$HERE/ui_tap.py" "Overview" 60 || { adb logcat -d | tail -100; exit 1; }
  sleep 2
  check_alive "$pkg" "import sample project"
  adb exec-out screencap -p > "$DIR/../screenshot-$pkg-api$SDK.png" || true
  adb shell am force-stop "$pkg"
  echo "::endgroup::"
done
echo "Smoke test passed on API $SDK"
