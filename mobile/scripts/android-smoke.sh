#!/usr/bin/env bash
# Emulator smoke + performance run for the debug APK. Used by .github/workflows/android.yml.
# 1) cold start with the smoke flag  2) default template, perf, text design, STL export
# 3) "Open with Caviot" via a VIEW intent for a real STL  4) collect JSON + screenshots.
set -uo pipefail
APK="${1:-app/build/outputs/apk/debug/app-debug.apk}"
OUT="${2:-build/smoke}"
PKG=com.caviot.studio
mkdir -p "$OUT"
adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb install -r -g "$APK"
adb logcat -c || true

read_log() { adb shell run-as $PKG cat files/caviot-smoke.jsonl 2>/dev/null; }
wait_for() { # stage regex, timeout seconds
  local end=$((SECONDS + $2))
  while [ $SECONDS -lt $end ]; do
    if read_log | grep -Eq "\"stage\":\"($1)\""; then return 0; fi
    if read_log | grep -q '"stage":"failed"'; then return 1; fi
    sleep 3
  done
  return 1
}

START=$(adb shell am start -W -n $PKG/.MainActivity --ez caviotSmoke true | tr -d '\r')
echo "$START" | tee "$OUT/am-start.txt"
TOTAL=$(echo "$START" | awk -F': ' '/TotalTime/{print $2}')

ok=1
wait_for 'export-ok' 900 || ok=0
adb exec-out screencap -p > "$OUT/01-after-export.png" || true

# Open with Caviot: copy a real STL into the app cache and send it through the FileProvider.
if [ $ok = 1 ]; then
  adb push ../../dist/templates/ETSYFOLGER.stl /data/local/tmp/smoke-open.stl >/dev/null
  adb shell run-as $PKG mkdir -p cache/smoke-in
  adb shell run-as $PKG cp /data/local/tmp/smoke-open.stl cache/smoke-in/smoke-open.stl
  adb shell am start -n $PKG/.MainActivity -a android.intent.action.VIEW -t model/stl \
    -d content://$PKG.fileprovider/my_cache_images/smoke-in/smoke-open.stl --grant-read-uri-permission
  wait_for 'template-opened' 600 || ok=0
  sleep 5
  adb exec-out screencap -p > "$OUT/02-opened-template.png" || true
fi

read_log > "$OUT/smoke.jsonl"
adb logcat -d -s CAVIOT_SMOKE:I CaviotOpen:W chromium:I Capacitor:W > "$OUT/logcat.txt" || true
node -e '
const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return {raw:l}}});
const pick=s=>lines.find(l=>l.stage===s)||null;
const r={coldStartMs:Number(process.argv[2])||null,ready:pick("ready"),perf:pick("perf"),slider:pick("perf-slider"),export:pick("export-ok"),opened:pick("template-opened"),failed:pick("failed")};
fs.writeFileSync(process.argv[3],JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
if(r.failed||!r.export||!r.opened)process.exit(1);
if(r.ready&&r.ready.template!=="etsyfolger-v1")process.exit(1);
' "$OUT/smoke.jsonl" "$TOTAL" "$OUT/result.json" || ok=0
[ $ok = 1 ] && echo "Android smoke passed" || { echo "Android smoke FAILED"; exit 1; }
