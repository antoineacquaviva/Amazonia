#!/usr/bin/env bash
# New instance only. Run inside the owner's existing opc SSH session, without sudo.
set -euo pipefail
umask 077
[[ "$(id -un)" == opc ]] || { echo 'Compte opc requis' >&2; exit 1; }
: "${V4_BUNDLE:?Archive de release transférée par SSH requise}"
: "${V4_BUNDLE_SHA256:?Empreinte fournie avec la release requise}"
: "${V4_NODE:?Chemin absolu du Node 24 préparé requis}"
[[ "$V4_NODE" == /* && -x "$V4_NODE" && "$V4_BUNDLE" == /* ]] || exit 1
[[ "$("$V4_NODE" -p 'process.versions.node.split(".")[0]')" == 24 ]] || { echo 'Node 24 requis' >&2; exit 1; }
[[ "$(sha256sum "$V4_BUNDLE" | cut -d' ' -f1)" == "$V4_BUNDLE_SHA256" ]] || { echo 'Empreinte archive incorrecte' >&2; exit 1; }
# Reject traversal, absolute members and link/device entries before extraction.
tar -tzf "$V4_BUNDLE" | "$V4_NODE" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{if(s.split("\n").filter(Boolean).some(p=>p.startsWith("/")||p.split("/").includes("..")))process.exit(1)})'
tar -tvzf "$V4_BUNDLE" | "$V4_NODE" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{if(s.split("\n").filter(Boolean).some(p=>!p.startsWith("-")&&!p.startsWith("d")))process.exit(1)})'
instance="$(mktemp -d "$HOME/amazonia-v4-science-XXXXXXXX")"
mkdir -m 700 "$instance/code" "$instance/exports" "$instance/runtime"
tar -xzf "$V4_BUNDLE" -C "$instance/code" --no-same-owner --no-same-permissions
export PATH="$(dirname "$V4_NODE"):$PATH"
[[ -x "$(dirname "$V4_NODE")/npm" ]] || { echo 'npm voisin du Node préparé requis' >&2; exit 1; }
cd "$instance/code"
npm ci --cache "$instance/npm-cache" --no-audit --no-fund
npm run lint
npm run build
# Exact source hashes are checked by the release descriptor when running without .git.
"$V4_NODE" --import tsx -e 'import("./src/v4science/protocol.ts").then(m=>{const p=m.provenance();if(p.dirty||p.commit==="UNAVAILABLE")throw Error("release non vérifiée")})'
"$V4_NODE" -e 'const fs=require("fs"),c=require("crypto");fs.writeFileSync(process.argv[1],c.randomBytes(32).toString("hex"),{flag:"wx",mode:0o600})' "$instance/runtime/access.key"
port="$("$V4_NODE" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
# Values contain no secrets. The token stays in its private file, never in argv.
printf 'V4_INSTANCE_DIR=%q\nV4_ACCESS_KEY_FILE=%q\nV4_PORT=%q\nV4_NODE=%q\n' "$instance/runtime" "$instance/runtime/access.key" "$port" "$V4_NODE" > "$instance/runtime/instance.env"
cp scripts/oracle-v4-control.sh "$instance/control.sh"
chmod 700 "$instance/control.sh"
# Bounded smoke has its own checkpoints and exports, never the active instance's DB.
V4_WORKERS=1 V4_BATCH_SIZE=2 V4_MAX_ACTIVE=1 "$V4_NODE" --max-old-space-size=512 --import tsx scripts/v4-study-pilot.ts "$instance/exports/installation-smoke" --smoke-only
"$instance/control.sh" start
"$instance/control.sh" status
printf 'INSTANCE=%s\nPORT=%s\nAccès SSH seulement. Utilisateur HTTP : amazonia ; mot de passe dans %s\n' "$instance" "$port" "$instance/runtime/access.key"
