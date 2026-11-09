#!/usr/bin/env bash
# Only this new instance's process. No sudo, systemd, Caddy or network changes.
set -euo pipefail
umask 077
instance="$(cd -- "$(dirname -- "$0")" && pwd -P)"
source "$instance/runtime/instance.env"
pidfile="$instance/runtime/server.pid"
owned_pid() {
 [[ -f "$pidfile" ]] || return 1
 local pid
 read -r pid < "$pidfile"
 [[ "$pid" =~ ^[0-9]+$ ]] || return 1
 kill -0 "$pid" 2>/dev/null || return 1
 # Verify executable arguments before signalling a possibly reused PID.
 "$V4_NODE" -e 'const fs=require("fs");if(!fs.readFileSync(`/proc/${process.argv[1]}/cmdline`,"utf8").split("\0").includes(process.argv[2]))process.exit(1)' "$pid" "$instance/code/scripts/v4-private-server.ts" >/dev/null 2>&1 || return 1
 printf '%s' "$pid"
}
start() {
 if owned_pid >/dev/null; then echo 'Instance déjà active'; return; fi
 cd "$instance/code"
 export NODE_ENV=production V4_INSTANCE_DIR V4_ACCESS_KEY_FILE V4_PORT
 export V4_WORKERS=1 V4_BATCH_SIZE=2 V4_MAX_ACTIVE=1 V4_MAX_GAMES=2000
 export PATH="$(dirname "$V4_NODE"):$PATH"
 nohup "$V4_NODE" --max-old-space-size=512 --import tsx "$instance/code/scripts/v4-private-server.ts" >> "$instance/runtime/server.log" 2>&1 < /dev/null &
 printf '%s\n' "$!" > "$pidfile"
 # Bounded authenticated local readiness check; no token in process arguments or logs.
 "$V4_NODE" --input-type=module -e 'import fs from "node:fs";const token=fs.readFileSync(process.env.V4_ACCESS_KEY_FILE,"utf8").trim();let ok=false;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${process.env.V4_PORT}/api/v4/studies`,{headers:{Authorization:"Basic "+Buffer.from("amazonia:"+token).toString("base64")}});if(r.ok){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ok)throw Error("Instance non prête ; consulter server.log")'
}
stop() {
 local pid
 pid="$(owned_pid)" || { echo 'Aucun processus appartenant à cette instance vérifié'; return; }
 kill -TERM "$pid"
 for ((i=0;i<100;i++)); do owned_pid >/dev/null || return 0; sleep .1; done
 echo 'Arrêt demandé ; processus encore présent, aucune escalade automatique' >&2
 return 1
}
case "${1:-status}" in
 start) start ;;
 stop) stop ;;
 restart) stop; start ;;
 status) if pid="$(owned_pid)"; then printf 'ACTIF pid=%s port=%s boucle locale uniquement\n' "$pid" "$V4_PORT"; else echo 'ARRÊTÉ (ou PID non vérifiable)'; fi ;;
 *) echo 'Usage : control.sh start|stop|restart|status' >&2; exit 1 ;;
esac
