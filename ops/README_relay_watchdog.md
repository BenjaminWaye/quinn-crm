Relay Watchdog

Purpose:
- Polls `openclaw gateway status` and logs disconnect/reconnect events to ops/relay-watchdog.log.
- If a disconnect lasts longer than the threshold (default 300s), creates ops/relay-watchdog.alert as a flag for human/assistant action.

Files:
- scripts/relay-watchdog.sh : the watchdog script
- ops/relay-watchdog.log : runtime log
- ops/relay-watchdog.alert : created when a long disconnect is detected

How to run:
- Start: nohup scripts/relay-watchdog.sh >/dev/null 2>&1 &
- Stop: kill $(cat /tmp/relay-watchdog.pid) && rm /tmp/relay-watchdog.pid

Notes:
- The script does not send messages itself; it creates an alert file so the assistant can send a WhatsApp alert (avoids accidental spams).
- Configure WATCHDOG_SLEEP and DISCONNECT_THRESHOLD via environment variables if desired.
