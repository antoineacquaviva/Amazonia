#!/usr/bin/env python3
"""Prepare a private JSON candidate; never reload Caddy or change services."""
import argparse
import copy
import json
import os
from pathlib import Path
import re

PORTS = {3000, 5050, 8080, 8082, 8083}
PROTECTED = {3000, 8083}

def need(ok, message):
    if not ok:
        raise ValueError(message)

def private_file(name):
    p = Path(name)
    s = p.lstat()
    need(p.is_absolute() and p.resolve() == p and p.is_file() and
         s.st_uid == os.getuid() and not s.st_mode & 0o077 and s.st_nlink == 1,
         'PRIVATE_INPUT_REQUIRED')
    need(s.st_size < 8 * 1024 * 1024, 'INPUT_TOO_LARGE')
    return p.read_text()

def protect(config, user, password_hash, key, expected_ports=None, protected_ports=None):
    expected_ports = set(PORTS if expected_ports is None else expected_ports)
    protected_ports = set(PROTECTED if protected_ports is None else protected_ports)
    need(re.fullmatch(r'[A-Za-z0-9_-]{1,40}', user), 'USERNAME')
    need(re.fullmatch(r'\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}', password_hash), 'BCRYPT_HASH')
    need(re.fullmatch(r'[a-f0-9]{64,128}', key), 'INTERNAL_KEY')
    out = copy.deepcopy(config)
    seen, protected = [], []
    def walk(value):
        if isinstance(value, list):
            return [walk(v) for v in value]
        if not isinstance(value, dict):
            return value
        need(value.get('handler') != 'authentication', 'EXISTING_AUTH_REQUIRES_REVIEW')
        if value.get('handler') == 'reverse_proxy':
            upstreams = value.get('upstreams', [])
            need(len(upstreams) == 1, 'UPSTREAM_TO_REVIEW')
            dial = upstreams[0].get('dial', '')
            match = re.fullmatch(r'(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]+)', dial)
            need(match is not None, 'NON_LOCAL_UPSTREAM')
            port = int(match[1])
            need(port in expected_ports, 'UNEXPECTED_PORT')
            seen.append(port)
            if port not in protected_ports:
                return value  # Neighbor handler is byte-for-byte equivalent as JSON.
            protected.append(port)
            request = value.setdefault('headers', {}).setdefault('request', {})
            sets = request.setdefault('set', {})
            for field in list(sets):
                if field.lower() in ('x-atelier-internal', 'authorization',
                                      'x-user', 'x-forwarded-user', 'remote-user'):
                    del sets[field]
            sets['X-Atelier-Internal'] = [key]  # Set overwrites every client value.
            deletes = request.setdefault('delete', [])
            deletes[:] = [x for x in deletes if x.lower() != 'x-atelier-internal']
            for field in ('Authorization', 'X-User', 'X-Forwarded-User', 'Remote-User'):
                if field.lower() not in [x.lower() for x in deletes]:
                    deletes.append(field)
            auth = {'handler': 'authentication', 'providers': {'http_basic': {
                'accounts': [{'username': user, 'password': password_hash}],
                'hash': {'algorithm': 'bcrypt'},
                'realm': 'Atelier Amazonia',
            }}}
            return {'handler': 'subroute', 'routes': [
                {'handle': [auth]}, {'handle': [value]},
            ]}
        return {k: walk(v) for k, v in value.items()}
    out = walk(out)
    need(sorted(seen) == sorted(expected_ports), 'PROXY_SET_CHANGED_OR_DUPLICATED')
    need(sorted(protected) == sorted(protected_ports), 'PROTECTED_PROXY_SET')
    return out

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--effective-json', required=True)
    p.add_argument('--key-file', required=True)
    p.add_argument('--hash-file', required=True)
    p.add_argument('--user', default='amazonia')
    p.add_argument('--output', required=True)
    a = p.parse_args()
    config = json.loads(private_file(a.effective_json))
    result = protect(config, a.user, private_file(a.hash_file).strip(),
                     private_file(a.key_file).strip())
    dest = Path(a.output)
    parent = dest.parent
    need(dest.is_absolute() and parent.resolve() == parent and
         parent.is_dir() and parent.stat().st_uid == os.getuid() and
         not parent.stat().st_mode & 0o077, 'PRIVATE_OUTPUT_PARENT')
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('CANDIDATE_CREATED_NOT_ACTIVATED')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError):
        print('CANDIDATE_REFUSED_NO_ACTIVATION')
        raise SystemExit(1)
