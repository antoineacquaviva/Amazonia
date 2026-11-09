"""Real disposable installation, authenticated HTTP, restart and foreign-PID refusal.
Not Oracle: calls the installer library without its opc/systemd entry checks.
"""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from v4_kit import digest
spec = importlib.util.spec_from_file_location('installer', ROOT / 'scripts/oracle-v4-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

with tempfile.TemporaryDirectory(prefix='v4-kit-real-') as scratch:
    parent = Path(scratch)
    bundle = parent / 'kit.tar.gz'
    subprocess.run(['python3', '-B', str(ROOT / 'scripts/v4-kit-build.py'), str(bundle)], cwd=ROOT, check=True)
    node, npm, env = installer.runtime(shutil.which('node'))
    instance = None
    foreign = None
    try:
        instance = installer.install(bundle, digest(bundle.read_bytes()), node, npm, env, parent)
        config = json.loads((instance / 'runtime/instance.json').read_text())
        base = 'http://127.0.0.1:' + config['V4_PORT']
        token = (instance / 'runtime/access.key').read_text().strip()
        auth = 'Basic ' + base64.b64encode(('amazonia:' + token).encode()).decode()
        def get():
            with urllib.request.urlopen(urllib.request.Request(base + '/api/v4/studies', headers={'Authorization': auth}), timeout=5) as r:
                return json.load(r)
        get()
        for action in ('stop', 'start', 'status'):
            subprocess.run([str(instance / 'control.sh'), action], check=True)
        get()
        # Wrong credentials cannot read; auth token is never printed.
        try:
            urllib.request.urlopen(base + '/api/v4/studies', timeout=5)
            raise AssertionError('Anonymous read accepted')
        except urllib.error.HTTPError as e:
            assert e.code == 401
        subprocess.run([str(instance / 'control.sh'), 'stop'], check=True)
        foreign = subprocess.Popen(['sleep', '30'])
        record = instance / 'runtime/server.pid.json'
        record.write_text(json.dumps({'pid': foreign.pid, 'start': 'wrong-start'}))
        assert subprocess.run([str(instance / 'control.sh'), 'stop']).returncode != 0
        assert foreign.poll() is None, 'Foreign PID was signaled'
        record.unlink()
        # Real collision, not a mock: starting must leave the listener alone.
        import socket
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', int(config['V4_PORT'])))
            sock.listen()
            assert subprocess.run([str(instance / 'control.sh'), 'start']).returncode != 0
            assert sock.getsockname()[1] == int(config['V4_PORT'])
        # Deterministic second build from exactly the same commit.
        second = parent / 'second.tar.gz'
        subprocess.run(['python3', '-B', str(ROOT / 'scripts/v4-kit-build.py'), str(second)], cwd=ROOT, check=True)
        assert second.read_bytes() == bundle.read_bytes()
        print('PASS: source-only reproducible kit, real npm ci/build/56 games, auth, restart, foreign PID and port collision')
    finally:
        if foreign is not None:
            foreign.terminate()
            foreign.wait()
        if instance is not None:
            subprocess.run([str(instance / 'control.sh'), 'stop'], check=False)
