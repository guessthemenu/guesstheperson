#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_LOCAL_PROPERTIES="$ROOT_DIR/frontend/android/local.properties"
BREW_BIN="/opt/homebrew/bin/brew"

status_ok() {
  printf '[ok] %s\n' "$1"
}

status_warn() {
  printf '[warn] %s\n' "$1"
}

printf 'Checking native development prerequisites for GuessThePerson\n\n'

if [[ -d "/Applications/Xcode.app" ]]; then
  status_ok 'Xcode.app is installed'
else
  status_warn 'Xcode.app is not installed. Install full Xcode from the App Store.'
fi

if [[ "$(xcode-select -p 2>/dev/null || true)" == "/Applications/Xcode.app/Contents/Developer" ]]; then
  status_ok 'xcode-select points to full Xcode'
else
  status_warn 'xcode-select is not pointing to full Xcode. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
fi

if command -v pod >/dev/null 2>&1; then
  status_ok "CocoaPods is installed ($(pod --version))"
else
  status_warn 'CocoaPods is missing. Install with: brew install cocoapods'
fi

if [[ -x "$BREW_BIN" ]]; then
  JAVA_PREFIX="$($BREW_BIN --prefix openjdk@17 2>/dev/null || true)"
else
  JAVA_PREFIX=''
fi

if [[ -n "$JAVA_PREFIX" && -x "$JAVA_PREFIX/bin/java" ]]; then
  status_ok "OpenJDK 17 is installed at $JAVA_PREFIX"
else
  status_warn 'OpenJDK 17 is not available via Homebrew. Install with: brew install openjdk@17'
fi

ANDROID_SDK_PATH=''

if [[ -d "$HOME/Library/Android/sdk" ]]; then
  ANDROID_SDK_PATH="$HOME/Library/Android/sdk"
elif [[ -d "$HOME/Android/Sdk" ]]; then
  ANDROID_SDK_PATH="$HOME/Android/Sdk"
elif [[ -f "$ANDROID_LOCAL_PROPERTIES" ]]; then
  ANDROID_SDK_PATH="$(grep '^sdk.dir=' "$ANDROID_LOCAL_PROPERTIES" | sed 's/^sdk.dir=//' | sed 's#\\:#:#g' | sed 's#\\#/#g')"
fi

if [[ -n "$ANDROID_SDK_PATH" ]]; then
  status_ok "Android SDK detected at $ANDROID_SDK_PATH"
else
  status_warn 'Android SDK not found. Open Android Studio and install the Android SDK, platform tools, and a platform image.'
  status_warn 'Then set ANDROID_HOME or create frontend/android/local.properties with sdk.dir=<path-to-sdk>'
fi

printf '\nNext commands once the warnings are cleared:\n'
printf '  export JAVA_HOME="$(/opt/homebrew/bin/brew --prefix openjdk@17)"\n'
printf '  export PATH="$JAVA_HOME/bin:$PATH"\n'
printf '  npm --prefix frontend run cap:sync\n'
printf '  cd frontend/android && ./gradlew assembleDebug\n'
printf '  cd ../ios/App && pod install\n'
printf '  xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator build\n'