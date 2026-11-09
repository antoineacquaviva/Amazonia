#!/usr/bin/env bash
# Only this private instance. Configuration is JSON, never sourced shell code.
set -euo pipefail
instance="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec python3 - "$instance" "${1:-status}" <<'PY'
import base64
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request

os.umask(0o077)
root = Path(sys.argv[1])
action = sys.argv[2]
runtime = root / 'runtime'

def need(ok, message):
    if not ok:
        raise ValueError(message)

def private_json(path):
    s = path.lstat()
    need(path.resolve() == path and path.is_file() and s.st_uid == os.getuid()
         and not s.st_mode & 0o077 and s.st_nlink == 1, 'Fichier privé invalide')
    return json.loads(path.read_text())

config = private_json(runtime / 'instance.json')
node = Path(config['V4_NODE'])
port = int(config['V4_PORT'])
need(node.is_absolute() and node.resolve() == node and node.is_file(), 'Runtime invalide')
need(config['V4_INSTANCE_DIR'] == str(runtime) and
     config['V4_ACCESS_KEY_FILE'] == str(runtime / 'access.key') and
     1024 <= port <= 65535, 'Configuration étrangère')
pidfile = runtime / 'server.pid.json'
script = str(root / 'code/scripts/v4-private-server.ts')

def identity(pid):
    try:
        proc = Path('/proc') / str(pid)
        fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
        if fields[0] == 'Z':
            return None
        return {'pid': pid, 'start': fields[19],
                'uid': proc.stat().st_uid,
                'exe': str((proc / 'exe').resolve(strict=True)),
                'cwd': str((proc / 'cwd').resolve(strict=True)),
                'command': (proc / 'cmdline').read_bytes().split(b'\0')}
    except (OSError, ValueError):
        return None

def owned():
    if not pidfile.exists():
        return None
    record = private_json(pidfile)
    need(type(record.get('pid')) is int and record['pid'] > 1, 'PID invalide')
    current = identity(record['pid'])
    if current is None:
        return None
    need(current['start'] == record.get('start') and current['uid'] == os.getuid()
         and current['exe'] == str(node) and current['cwd'] == str(root / 'code')
         and script.encode() in current['command'],
         'PID vivant non attribuable à cette instance : aucun signal envoyé')
    return current

def stop():
    current = owned()
    if current is None:
        print('ARRÊTÉ')
        return
    os.kill(current['pid'], signal.SIGTERM)
    for _ in range(100):
        time.sleep(.1)
        if owned() is None:
            print('ARRÊTÉ')
            return
    raise ValueError('Arrêt demandé ; toujours actif, aucune escalade automatique')

def start():
    if owned():
        print('Instance déjà active')
        return
    # Readiness must never mistake an unrelated HTTP listener for this process.
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            raise ValueError('Port occupé ; aucun processus étranger arrêté') from None
    keypath = runtime / 'access.key'
    ks = keypath.lstat()
    need(keypath.resolve() == keypath and keypath.is_file() and ks.st_uid == os.getuid()
         and not ks.st_mode & 0o077 and ks.st_nlink == 1, 'Clé privée invalide')
    token = keypath.read_text().strip()
    need(re.fullmatch(r'[a-f0-9]{64}', token), 'Clé privée invalide')
    names = ('HOME', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS')
    env = {k: os.environ[k] for k in names if k in os.environ}
    env.update(config)
    env.update(NODE_ENV='production', V4_WORKERS='1', V4_BATCH_SIZE='2',
               V4_MAX_ACTIVE='1', V4_MAX_GAMES='2000',
               PATH=str(node.parent) + ':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
    with (runtime / 'server.log').open('ab') as log:
        os.chmod(log.name, 0o600)
        child = subprocess.Popen([str(node), '--max-old-space-size=512', '--import', 'tsx', script],
                                 cwd=root / 'code', env=env, stdin=subprocess.DEVNULL,
                                 stdout=log, stderr=log, start_new_session=True)
    # At fork the process may still be Python; wait for the actual Node exec.
    current = None
    for _ in range(50):
        if child.poll() is not None:
            break
        candidate = identity(child.pid)
        if candidate and candidate['exe'] == str(node):
            current = candidate
            break
        time.sleep(.02)
    need(current is not None, 'Démarrage impossible ; consulter le journal privé')
    record = {'pid': child.pid, 'start': current['start']}
    temp = runtime / ('server.pid-' + str(child.pid) + '.new')
    with temp.open('x') as out:
        out.write(json.dumps(record))
    os.replace(temp, pidfile)
    header = 'Basic ' + base64.b64encode(('amazonia:' + token).encode()).decode()
    request = urllib.request.Request('http://127.0.0.1:%d/api/v4/studies' % port,
                                     headers={'Authorization': header})
    for _ in range(70):
        need(child.poll() is None and owned() is not None,
             'Démarrage interrompu ; consulter le journal privé')
        try:
            with urllib.request.urlopen(request, timeout=1) as response:
                if response.status == 200:
                    print('ACTIF port=%d boucle locale uniquement' % port)
                    return
        except OSError:
            pass
        time.sleep(.1)
    # Stop only the child whose identity is still verified.
    stop()
    raise ValueError('Instance non prête ; tentative et journal privés conservés')

try:
    if action == 'start':
        start()
    elif action == 'stop':
        stop()
    elif action == 'restart':
        stop()
        start()
    elif action == 'status':
        print('ACTIF port=%d boucle locale uniquement' % port if owned() else 'ARRÊTÉ')
    else:
        raise ValueError('Usage : control.sh start|stop|restart|status')
except (OSError, ValueError, KeyError):
    # No raw URLs, tokens, process arguments or subprocess logs in public output.
    print('ÉCHEC DU CONTRÔLE : vérifier configuration privée, PID et port. Aucun processus étranger arrêté.', file=sys.stderr)
    sys.exit(1)
PY
