#!/usr/bin/env bash
# Relay watchdog: polls openclaw browser status and logs disconnects
LOG="$(pwd)/ops/relay-watchdog.log"
STATUS_CMD="openclaw gateway status"
SLEEP=${WATCHDOG_SLEEP:-60}
DISCONNECT_THRESHOLD=${DISCONNECT_THRESHOLD:-300} # seconds

mkdir -p "$(dirname "$LOG")"

echo "$(date -u +%FT%TZ) WATCHDOG_START" >> "$LOG"
LAST_UP=0
DISCONNECTED_AT=0
while true; do
  if $STATUS_CMD >/dev/null 2>&1; then
    # gateway up
    if (( LAST_UP==0 )); then LAST_UP=$(date +%s); fi
    if (( DISCONNECTED_AT!=0 )); then
      echo "$(date -u +%FT%TZ) RECONNECTED" >> "$LOG"
      DISCONNECTED_AT=0
    fi
  else
    # gateway down
    NOW=$(date +%s)
    if (( DISCONNECTED_AT==0 )); then DISCONNECTED_AT=$NOW; fi
    ELAPSED=$((NOW-DISCONNECTED_AT))
    echo "$(date -u +%FT%TZ) DISCONNECTED for ${ELAPSED}s" >> "$LOG"
    if (( ELAPSED >= DISCONNECT_THRESHOLD )); then
      # alert once per long disconnect window by touching an alert file
      ALERT_FLAG="$(pwd)/ops/relay-watchdog.alert"
      if [ ! -f "$ALERT_FLAG" ]; then
        echo "$(date -u +%FT%TZ) ALERT_TRIGGERED" >> "$LOG"
        touch "$ALERT_FLAG"
        # write a simple alert file; the assistant will send the WhatsApp message manually
      fi
    fi
  fi
  sleep $SLEEP
done
