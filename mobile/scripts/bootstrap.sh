#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v flutter >/dev/null 2>&1 || {
  echo "Flutter stable SDK is required. Install Flutter, then rerun this script." >&2
  exit 1
}
flutter create --platforms=android,windows,macos --org ai.mina --project-name mina_companion .
dart run tool/prepare_platforms.dart
flutter pub get
flutter analyze --fatal-infos
flutter test
