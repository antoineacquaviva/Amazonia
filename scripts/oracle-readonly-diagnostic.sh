#!/bin/bash
# Mission 1C.1 : métadonnées seulement, aucun accès HTTP ni ouverture SQLite.
# Ne pas lancer avec sudo, bash -x, ni sourcer ce fichier.
set -uo pipefail
export LC_ALL=C SYSTEMD_PAGER=cat SYSTEMD_COLORS=0 GIT_OPTIONAL_LOCKS=0
unset NODE_OPTIONS NODE_PATH BASH_ENV ENV
units=() repos=() data=() backups=() nodes=()
usage() {
  printf '%s\n' 'Usage: bash oracle-readonly-diagnostic.sh [--unit NOM.service]' \
    '  [--repo /checkout] [--data /campagnes] [--backup /sauvegardes]' \
    '  [--node /binaire/node] (options répétables, chemins connus uniquement)'
}
while (($#)); do
  case "$1" in
    --help) usage; exit 0 ;;
    --unit|--repo|--data|--backup|--node)
      (($# >= 2)) || { usage; exit 2; }
      opt=$1; value=$2; shift 2
      if [[ $opt == --unit ]]; then
        [[ $value =~ ^[a-zA-Z0-9_@.-]+\.service$ && $value != -* ]] || exit 2
        units+=("$value")
      else
        [[ $value == /* && $value != *$'\n'* && $value != *$'\r'* ]] || exit 2
        case "$opt" in
          --repo) repos+=("$value");; --data) data+=("$value");;
          --backup) backups+=("$value");; --node) nodes+=("$value");;
        esac
      fi ;;
    *) usage; exit 2 ;;
  esac
done
if ((EUID == 0)); then
  printf '%s\n' 'STOP : utiliser le compte habituel non root, sans sudo.'; exit 2
fi
unknown() { printf 'INCONNU : %s\n' "$1"; }
meta() {
  printf 'Chemin : %q\n' "$1"
  stat -c 'type=%F mode=%a uid=%u gid=%g taille=%s' -- "$1" 2>/dev/null ||
    unknown 'absent ou inaccessible (aucune conclusion sur son absence réelle)'
}
capacity() {
  df -hP -- "$1" 2>/dev/null || unknown 'capacité inaccessible'
  df -iP -- "$1" 2>/dev/null || unknown 'inodes inaccessibles'
}
printf '%s\n' '=== AMAZONIA 1C.1 — début ===' 'Aucun secret ni contenu de campagne collecté.'
date -u '+UTC %Y-%m-%dT%H:%M:%SZ'
printf '\n=== Système ===\n'
# Liste blanche : ne jamais sourcer un fichier de configuration.
awk -F= '$1=="ID" || $1=="VERSION_ID" {print}' /etc/os-release 2>/dev/null
uname -m
getconf _NPROCESSORS_ONLN
free -m 2>/dev/null || unknown 'RAM (free indisponible)'
capacity /
printf '\n=== Unités : noms et états, sans descriptions ===\n'
if command -v systemctl >/dev/null; then
  systemctl list-units --all --type=service --no-legend --plain --no-pager 2>/dev/null |
    awk '{print $1, $2, $3, $4}' || unknown 'inventaire des services inaccessible ou partiel'
  systemctl list-unit-files --type=service --no-legend --no-pager 2>/dev/null |
    awk '{print $1, $2}' || unknown 'inventaire des unités installées inaccessible ou partiel'
  for unit in "${units[@]}"; do
    printf '\nUnité : %q\n' "$unit"
    for prop in LoadState ActiveState SubState User Group WorkingDirectory MainPID; do
      if value=$(systemctl show "$unit" --property="$prop" --value 2>/dev/null); then
        printf '%s=%q\n' "$prop" "$value"
      else unknown "propriété $prop inaccessible"; fi
    done
    pid=$(systemctl show "$unit" --property=MainPID --value 2>/dev/null) || pid=0
    if [[ $pid =~ ^[1-9][0-9]*$ ]]; then
      for link in exe cwd; do
        if value=$(readlink -- "/proc/$pid/$link" 2>/dev/null); then
          printf 'processus_%s=%q\n' "$link" "$value"
        else unknown "processus $link inaccessible"; fi
      done
    else unknown 'aucun PID principal observable'; fi
  done
else unknown 'systemd indisponible'; fi
printf '\n=== Processus : PID, parent, UID, nom seulement ===\n'
ps -eo pid=,ppid=,uid=,comm= 2>/dev/null |
  awk '$4 ~ /^(node|nodejs|npm|python[0-9.]*|caddy|docker|containerd|PM2.*)$/ {print}'
printf '\n=== Écoutes TCP/UDP : IP masquées, sans processus ===\n'
if command -v ss >/dev/null; then
  ss -H -lntu 2>/dev/null | awk '{
    a=$5; port=a; sub(/^.*:/,"",port);
    scope="interface non-loopback";
    if (a ~ /^127\./ || a ~ /^\[?::1\]?:/) scope="loopback";
    if (a ~ /^(0\.0\.0\.0:|\[::\]:|\*:)/) scope="toutes interfaces";
    print $1, $2, "port=" port, scope
  }' || unknown 'écoutes inaccessibles ou partielles'
else unknown 'ss indisponible'; fi
printf '\n=== Révisions des checkouts explicitement indiqués ===\n'
for dir in "${repos[@]}"; do
  meta "$dir"
  if [[ -d $dir/.git || -f $dir/.git ]]; then
    # Pas de status/diff, hooks, filtres, réseau ou rafraîchissement d'index.
    if sha=$(git -C "$dir" rev-parse --verify HEAD 2>/dev/null) &&
      [[ $sha =~ ^[a-f0-9]{40,64}$ ]]; then printf 'HEAD=%s\n' "$sha"
    else unknown 'révision Git inaccessible'; fi
  else unknown 'pas de .git visible'; fi
done
printf '\n=== Stockages indiqués : dénombrement sans contenu ni noms ===\n'
for dir in "${data[@]}" "${backups[@]}"; do
  meta "$dir"; capacity "$dir"
  if [[ -d $dir && ! -L $dir && -r $dir && -x $dir ]]; then
    # Inventaire borné à deux niveaux, sans suivre les liens ni traverser un montage.
    counts=$(set -o pipefail; find -P "$dir" -xdev -maxdepth 2 \
      -printf '%y %f\n' 2>/dev/null | awk '
      $1=="f" && /\.json$/ {j++}
      $1=="f" && /\.(sqlite|sqlite3|db)$/ {s++}
      $1=="f" && /-wal$/ {w++}
      $1=="f" && /-shm$/ {h++}
      $1=="d" && $2=="quarantine" {q++}
      $1=="f" && $2==".amazonia-storage" {m++}
      $1=="l" {l++}
      END {printf "json=%d sqlite/db=%d wal=%d shm=%d quarantine=%d marqueur=%d liens=%d",j,s,w,h,q,m,l}')
    result=$?; printf '%s\n' "$counts"
    ((result == 0)) || unknown 'inventaire partiel : droits ou parcours incomplets'
  else unknown 'inventaire refusé : lien, droits insuffisants ou répertoire absent'; fi
done
printf '\n=== Node explicitement choisi par le propriétaire ===\n'
for bin in "${nodes[@]}"; do
  meta "$bin"
  if [[ -f $bin && -x $bin ]]; then
    # Binaire de confiance uniquement. Environnement vide : aucun preload applicatif.
    env -i PATH=/usr/bin:/bin LC_ALL=C "$bin" --version 2>/dev/null || unknown 'version Node'
    env -i PATH=/usr/bin:/bin LC_ALL=C "$bin" --input-type=module -e \
      'await import("node:sqlite"); console.log("import node:sqlite OK; aucune base ouverte")' \
      2>/dev/null || unknown 'import node:sqlite impossible'
  else unknown 'binaire absent/inaccessible'; fi
done
printf '\n=== Limites obligatoires ===\n'
printf '%s\n' \
  'Sans option : aucun checkout, stockage ou binaire Node examiné.' \
  'Caddy actif/routage/auth, registre, ExecStart et environnements : revue privée distincte.' \
  'Node du shell ne prouve pas Node du service ; wrappers/enfants à vérifier.' \
  'HEAD ne prouve ni arbre propre ni artefact réellement servi.' \
  'Campagnes actives/interrompues, écrivains et intégrité SQLite : INCONNUS.' \
  'Sauvegardes valides, restauration, pare-feu OCI/hôte : INCONNUS.' \
  'Comptages bornés et instantanés : zéro ne prouve pas une absence globale.' \
  'Ne transmettre aucun fichier privé, journal brut, configuration ou secret.' \
  '=== AMAZONIA 1C.1 — fin (aucun déploiement) ==='
