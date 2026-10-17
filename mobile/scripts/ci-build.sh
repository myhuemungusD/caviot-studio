#!/usr/bin/env bash
# Unsigned simulator build. Signing is intentionally off; TestFlight is a separate script.
set -euo pipefail
cd "$(dirname "$0")/.."
DERIVED="${1:-build/DerivedData}"
PROJECT="ios/App/App.xcodeproj"
xcodebuild -resolvePackageDependencies -project "$PROJECT" -scheme App
xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build
APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
# Simulator install rejects a completely unsigned bundle. Ad-hoc signing uses no certificate.
codesign --force --sign - --deep "$APP"
echo "Built $APP"
