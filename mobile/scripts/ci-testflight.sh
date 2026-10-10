#!/usr/bin/env bash
# Optional. Runs only when the GitHub Actions job has the signing secrets.
# Nothing here reads or prints the certificate password or the API private key.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${IOS_TEAM_ID:?Set IOS_TEAM_ID to the 10-character Apple Team ID}"
: "${IOS_CERTIFICATE_PASSWORD:?Set IOS_CERTIFICATE_PASSWORD to the .p12 password}"
: "${IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64:?Set the base64-encoded Apple Distribution .p12}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?Set the base64-encoded App Store provisioning profile}"
: "${APPSTORE_API_KEY_ID:?Set APPSTORE_API_KEY_ID}"
: "${APPSTORE_ISSUER_ID:?Set APPSTORE_ISSUER_ID}"
: "${APPSTORE_API_PRIVATE_KEY:?Set APPSTORE_API_PRIVATE_KEY to the AuthKey .p8 contents}"

WORKDIR="$(mktemp -d)"
KEYCHAIN="caviot-signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  rm -f "$HOME/.appstoreconnect/private_keys/AuthKey_${APPSTORE_API_KEY_ID}.p8"
}
trap cleanup EXIT

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"

printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64" | base64 -D > "$WORKDIR/cert.p12"
security import "$WORKDIR/cert.p12" -k "$KEYCHAIN" -P "$IOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null

printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" | base64 -D > "$WORKDIR/profile.mobileprovision"
PROFILE_UUID="$(security cms -D -i "$WORKDIR/profile.mobileprovision" | plutil -extract UUID raw -)"
PROFILE_NAME="$(security cms -D -i "$WORKDIR/profile.mobileprovision" | plutil -extract Name raw -)"
PROFILE_NAME_XML="$(printf '%s' "$PROFILE_NAME" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')"
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$WORKDIR/profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/${PROFILE_UUID}.mobileprovision"

mkdir -p build
cat > build/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${IOS_TEAM_ID}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>uploadSymbols</key>
  <true/>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.caviot.studio</key>
    <string>${PROFILE_NAME_XML}</string>
  </dict>
</dict>
</plist>
EOF

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/CaviotStudio.xcarchive \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  archive

xcodebuild -exportArchive \
  -archivePath build/CaviotStudio.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist build/ExportOptions.plist

mkdir -p "$HOME/.appstoreconnect/private_keys"
umask 077
printf '%s\n' "$APPSTORE_API_PRIVATE_KEY" > "$HOME/.appstoreconnect/private_keys/AuthKey_${APPSTORE_API_KEY_ID}.p8"
IPA="$(find build/export -name '*.ipa' -print -quit)"
if [[ -z "$IPA" ]]; then
  echo "No .ipa was exported" >&2
  exit 1
fi
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$APPSTORE_API_KEY_ID" --apiIssuer "$APPSTORE_ISSUER_ID"
echo "Uploaded to App Store Connect. Processing continues there before the build appears in TestFlight."
