#!/usr/bin/env python3
"""Small source-only kit format. No dependencies, service management or network."""
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tarfile

FORMAT = 'AMAZONIA_V4_SOURCE_KIT_1'
MANIFEST = '.kit-manifest.json'
MAX_BYTES = 64 * 1024 * 1024
ROOT_FILES = {'package.json', 'package-lock.json', 'server.ts', 'index.html',
              'tsconfig.json', 'vite.config.ts'}
DOC_FILES = {'design/VISION.md', 'design/Amazonia_v4_specification_regles.md',
             'design/V4_DECISIONS.md', 'docs/V4_SCIENTIFIC.md',
             'docs/V4_MEASURES.md', 'docs/V4_USE.md'}
SCRIPT_FILES = {'scripts/v4-private-server.ts', 'scripts/v4-study-pilot.ts',
                'scripts/v4-study-backup.ts', 'scripts/oracle-v4-control.sh',
                'scripts/oracle-v4-install.sh', 'scripts/oracle-v4-install.py',
                'scripts/v4_kit.py', 'scripts/backup.ts'}

def need(ok, code):
    if not ok:
        raise ValueError(code)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def allowed(name):
    if name in ROOT_FILES | DOC_FILES | SCRIPT_FILES | {'.release.json'}:
        return True
    p = PurePosixPath(name)
    return (len(p.parts) > 1 and p.parts[0] == 'src' and
            all(re.fullmatch(r'[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*', s)
                and not s.startswith('.') for s in p.parts) and
            p.suffix in ('.ts', '.tsx', '.css'))

def unique_object(pairs):
    out = {}
    for k, v in pairs:
        need(k not in out, 'DUPLICATE_JSON_KEY')
        out[k] = v
    return out

def read_kit(bundle, checksum):
    need(re.fullmatch(r'[a-f0-9]{64}', checksum or ''), 'CHECKSUM_FORMAT')
    p = Path(bundle)
    need(p.is_file() and not p.is_symlink() and p.stat().st_size <= MAX_BYTES, 'ARCHIVE_FILE')
    raw = p.read_bytes()
    need(digest(raw) == checksum, 'CHECKSUM_MISMATCH')
    files = {}
    total = 0
    # Iterate and read bounded members rather than unbounded gzip.decompress().
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for m in archive:
            need(m.isfile() and not m.issym() and not m.islnk(), 'ARCHIVE_TYPE')
            need(m.name not in files and len(files) < 1000, 'ARCHIVE_DUPLICATE_OR_COUNT')
            need(m.name == MANIFEST or allowed(m.name), 'ARCHIVE_MEMBER')
            need(not m.name.startswith('/') and '..' not in PurePosixPath(m.name).parts,
                 'ARCHIVE_PATH')
            total += m.size
            need(0 <= m.size <= MAX_BYTES and total <= MAX_BYTES, 'ARCHIVE_SIZE')
            files[m.name] = archive.extractfile(m).read()
    need(MANIFEST in files, 'MANIFEST_MISSING')
    manifest = json.loads(files.pop(MANIFEST), object_pairs_hook=unique_object)
    need(set(manifest) == {'format', 'commit', 'sourceHash', 'files'} and
         manifest['format'] == FORMAT and
         re.fullmatch(r'[a-f0-9]{40}', manifest['commit']), 'MANIFEST_FORMAT')
    need(isinstance(manifest['files'], dict) and
         set(manifest['files']) == set(files), 'MANIFEST_MEMBERS')
    need(ROOT_FILES | DOC_FILES | SCRIPT_FILES | {'.release.json'} <= set(files), 'KIT_INCOMPLETE')
    for name, content in files.items():
        need(manifest['files'][name] == digest(content), 'MEMBER_CHECKSUM')
    release = json.loads(files['.release.json'], object_pairs_hook=unique_object)
    need(release == {'commit': manifest['commit'], 'sourceHash': manifest['sourceHash']},
         'RELEASE_MISMATCH')
    return manifest, files, total

def write_kit(destination, commit, source_hash, files):
    need(Path(destination).is_absolute(), 'DESTINATION_ABSOLUTE')
    need(all(allowed(n) for n in files), 'PACKAGING_ALLOWLIST')
    entries = dict(files)
    entries['.release.json'] = canonical({'commit': commit, 'sourceHash': source_hash}) + b'\n'
    manifest = {'format': FORMAT, 'commit': commit, 'sourceHash': source_hash,
                'files': {n: digest(v) for n, v in sorted(entries.items())}}
    entries[MANIFEST] = canonical(manifest) + b'\n'
    # Exclusive publication: existing output is never truncated or replaced.
    with Path(destination).open('xb') as output:
        os.chmod(destination, 0o600)
        with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                for name, content in sorted(entries.items()):
                    item = tarfile.TarInfo(name)
                    item.size, item.mode, item.mtime = len(content), 0o644, 0
                    archive.addfile(item, io.BytesIO(content))
    return digest(Path(destination).read_bytes())

def check_capacity(parent, source_bytes):
    # npm install/build plus receipt, DB, export and failure reserve. No archive deletion.
    required = 2 * source_bytes + 4 * 1024**3
    need(shutil.disk_usage(parent).free >= required, 'DISK_BUDGET_4GIB_PLUS_SOURCES')
    need(os.statvfs(parent).f_favail >= 30000, 'INODE_BUDGET')
    return required

def extract_files(destination, files):
    destination = Path(destination)
    need(not destination.exists() and not destination.is_symlink(), 'DESTINATION_EXISTS')
    destination.mkdir(mode=0o700)
    for name, content in files.items():
        p = destination / name
        p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with p.open('xb') as out:
            os.chmod(p, 0o600)
            out.write(content)
