#!/usr/bin/env python3
"""Install only a new private instance, from a checksum-verified source kit."""
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from v4_kit import need, read_kit, extract_files, check_capacity, digest

SERVICES = ('amazonia.service', 'atelier-portail.service', 'lora-studio.service',
            'foret-lab.service', 'caddy.service')
SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
DEFAULT_NODE = Path('/home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin/node')

def base_env(node):
    names = ('HOME', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
             'https_proxy', 'http_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
             'NODE_EXTRA_CA_CERTS')
    env = {k: os.environ[k] for k in names if k in os.environ}
    env.update(PATH=str(node.parent) + ':' + SYSTEM_PATH, NODE_ENV='production',
               V4_WORKERS='1', V4_BATCH_SIZE='2', V4_MAX_ACTIVE='1',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null',
               GIT_TERMINAL_PROMPT='0')
    return env

def service_snapshot():
    result = {}
    for unit in SERVICES:
        p = subprocess.run(['systemctl', 'show', unit,
                            '--property=ActiveState,MainPID', '--no-pager'],
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, text=True, timeout=10,
                           env={'PATH': SYSTEM_PATH, 'LC_ALL': 'C'})
        need(p.returncode == 0, 'SERVICE_READ_FAILED')
        values = dict(x.split('=', 1) for x in p.stdout.splitlines() if '=' in x)
        need(values.get('ActiveState') == 'active' and
             re.fullmatch(r'[1-9][0-9]*', values.get('MainPID', '')), 'NEIGHBOR_NOT_ACTIVE')
        result[unit] = values
    return result

def runtime(raw):
    node = Path(raw).resolve(strict=True)
    need(node.is_file() and os.access(node, os.X_OK), 'NODE_EXECUTABLE')
    env = base_env(node)
    version = subprocess.check_output([str(node), '-p', 'process.versions.node'],
                                      env=env, timeout=10, stderr=subprocess.DEVNULL).decode().strip()
    need(re.fullmatch(r'24\.[0-9]+\.[0-9]+', version), 'NODE24_REQUIRED')
    npm = node.parent / 'npm'
    need(npm.is_file() and os.access(npm, os.X_OK), 'NPM_NEXT_TO_NODE_REQUIRED')
    return node, npm, env

def free_port(requested=None):
    port = int(requested) if requested else 0
    need(port == 0 or 1024 <= port <= 65535, 'PORT_RANGE')
    try:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))
            return sock.getsockname()[1]
    except OSError:
        raise ValueError('PORT_OCCUPIED') from None

def run_logged(args, code, env, log, timeout=600):
    try:
        p = subprocess.run([str(x) for x in args], cwd=code, env=env,
                           stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                           timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('STEP_COMMAND_FAILED_OR_TIMEOUT') from None
    need(p.returncode == 0, 'STEP_COMMAND_FAILED_SEE_PRIVATE_LOG')

def install(bundle, checksum, node, npm, env, parent, before=None, requested_port=None):
    manifest, files, size = read_kit(bundle, checksum)
    parent = Path(parent)
    need(parent.is_absolute() and parent.resolve() == parent and parent.is_dir(), 'PARENT_CANONICAL')
    need(parent.stat().st_uid == os.getuid() and not parent.stat().st_mode & 0o022,
         'PARENT_OWNER_OR_MODE')
    check_capacity(parent, size)
    port = free_port(requested_port)
    instance = Path(tempfile.mkdtemp(prefix='amazonia-v4-science-', dir=parent))
    print('Nouvelle instance privée : ' + str(instance), flush=True)
    for folder in ('runtime', 'exports', 'npm-cache', 'npm-config'):
        (instance / folder).mkdir(mode=0o700)
    extract_files(instance / 'code', files)
    # Independent empty npm config files: no inherited user/global production config.
    for label in ('user', 'global'):
        p = instance / 'npm-config' / (label + '.npmrc')
        p.touch(mode=0o600, exist_ok=False)
        env['NPM_CONFIG_' + label.upper() + 'CONFIG'] = str(p)
    env['NPM_CONFIG_CACHE'] = str(instance / 'npm-cache')
    code = instance / 'code'
    with (instance / 'runtime' / 'installation.log').open('xb') as log:
        os.chmod(log.name, 0o600)
        for label, args in (
            ('Dépendances verrouillées', [npm, 'ci', '--include=dev', '--no-audit', '--no-fund']),
            ('Typage', [npm, 'run', 'lint']),
            ('Compilation', [npm, 'run', 'build']),
        ):
            check_capacity(parent, size)
            print(label + '…', flush=True)
            run_logged(args, code, env, log)
        for name, original in files.items():
            installed = code / name
            need(installed.resolve() == installed and installed.is_file() and
                 digest(installed.read_bytes()) == digest(original), 'INSTALLED_SOURCE_CHANGED')
        check = ('import("./src/v4science/protocol.ts").then(m=>{const p=m.provenance();'
                 'if(p.dirty||p.commit!==process.argv[1]||p.sourceHash!==process.argv[2])'
                 'throw Error("PROVENANCE_MISMATCH")})')
        run_logged([node, '--import', 'tsx', '-e', check, manifest['commit'], manifest['sourceHash']],
                   code, env, log)
        check_capacity(parent, size)
        print('Recette fixe de 56 parties, données séparées…', flush=True)
        run_logged([node, '--max-old-space-size=512', '--import', 'tsx',
                    'scripts/v4-study-pilot.ts', instance / 'exports/installation-smoke',
                    '--smoke-only'], code, env, log, timeout=360)
        receipt = json.loads((instance / 'exports/installation-smoke/execution.json').read_text())
        need(receipt['executions'][0]['total'] == 56, 'SMOKE_INCOMPLETE')
        (instance / 'runtime/access.key').write_text(secrets.token_hex(32) + '\n')
        os.chmod(instance / 'runtime/access.key', 0o600)
        config = dict(V4_INSTANCE_DIR=str(instance / 'runtime'),
                      V4_ACCESS_KEY_FILE=str(instance / 'runtime/access.key'),
                      V4_PORT=str(port), V4_NODE=str(node))
        (instance / 'runtime/instance.json').write_text(json.dumps(config))
        os.chmod(instance / 'runtime/instance.json', 0o600)
        control = instance / 'control.sh'
        control.write_bytes((code / 'scripts/oracle-v4-control.sh').read_bytes())
        control.chmod(0o700)
        # Do not start when any neighbor changed during installation.
        if before is not None:
            need(service_snapshot() == before, 'NEIGHBOR_CHANGED_BEFORE_START')
        run_logged([control, 'start'], code, env, log, timeout=30)
        try:
            # This is an unauthenticated GET only; no token is read or printed.
            with urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=5):
                raise ValueError('ANONYMOUS_ACCESS_NOT_REFUSED')
        except urllib.error.HTTPError as e:
            need(e.code == 401, 'ANONYMOUS_ACCESS_NOT_REFUSED')
        if before is not None and service_snapshot() != before:
            # Stop only this newly created instance; never fix a neighbor.
            run_logged([control, 'stop'], code, env, log, timeout=20)
            raise ValueError('NEIGHBOR_CHANGED_AFTER_START')
    result = {'format': 'V4_INSTALLATION_RECEIPT_1', 'commit': manifest['commit'],
              'sourceHash': manifest['sourceHash'], 'archiveSha256': checksum,
              'port': port, 'host': '127.0.0.1', 'smokeGames': 56,
              'neighborsUnchanged': before is not None}
    (instance / 'runtime/installation.json').write_text(json.dumps(result, indent=2) + '\n')
    os.chmod(instance / 'runtime/installation.json', 0o600)
    print('INSTALLATION_RÉUSSIE\nINSTANCE=%s\nPORT=%s' % (instance, port))
    print('Utilisateur HTTP : amazonia. Mot de passe : fichier privé runtime/access.key.')
    print('Rapport expurgé : runtime/installation.json ; aucun secret à transmettre.')
    return instance

def main():
    os.umask(0o077)
    need(os.geteuid() != 0 and pwd.getpwuid(os.getuid()).pw_name == 'opc', 'RUN_AS_OPC_WITHOUT_SUDO')
    bundle = os.environ.get('V4_BUNDLE', '')
    need(Path(bundle).is_absolute(), 'BUNDLE_ABSOLUTE')
    # Verify archive before invoking any runtime from it or creating an instance.
    read_kit(bundle, os.environ.get('V4_BUNDLE_SHA256', ''))
    raw_node = os.environ.get('V4_NODE') or str(DEFAULT_NODE)
    if not Path(raw_node).exists():
        print('Chemin absolu du Node 24 préparé : ', end='', flush=True)
        # The operator may have pasted a Python here-document: stdin is then exhausted.
        with open('/dev/tty') as terminal:
            raw_node = terminal.readline().strip()
    node, npm, env = runtime(raw_node)
    before = service_snapshot()
    install(bundle, os.environ['V4_BUNDLE_SHA256'], node, npm, env,
            Path.home().resolve(), before, os.environ.get('V4_PORT'))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        # No raw subprocess output, credentials or system logs in shareable output.
        code = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r'[A-Z0-9_]+', str(exc)) else 'INSTALLATION_FAILED'
        print('ARRÊT : ' + code + '. Tentative conservée ; aucune purge.', flush=True)
        raise SystemExit(1)
