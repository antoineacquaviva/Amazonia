#!/usr/bin/env python3
"""Build a deterministic allowlisted kit from a clean Git commit."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode = True
from v4_kit import allowed, need, write_kit, read_kit

ROOT = Path(__file__).resolve().parent.parent

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('destination', type=Path)
    args = p.parse_args()
    need(args.destination.is_absolute(), 'DESTINATION_ABSOLUTE')
    need(not git('status', '--porcelain').strip(), 'CLEAN_CHECKOUT_REQUIRED')
    commit = git('rev-parse', 'HEAD').decode().strip()
    names = [n for n in git('ls-tree', '-r', '--name-only', commit).decode().splitlines() if allowed(n)]
    code = 'import("./src/v4science/protocol.ts").then(m=>console.log(JSON.stringify(m.provenance())))'
    result = json.loads(subprocess.check_output(['node', '--import', 'tsx', '-e', code], cwd=ROOT))
    need(result['commit'] == commit and not result['dirty'], 'PROVENANCE_NOT_CLEAN')
    # Read Git blobs, never files ignored/untracked in a working directory.
    files = {n: git('show', commit + ':' + n) for n in names}
    checksum = write_kit(args.destination, commit, result['sourceHash'], files)
    manifest, _, size = read_kit(args.destination, checksum)
    Path(str(args.destination) + '.sha256').open('x').write(checksum + '  ' + args.destination.name + '\n')
    print(json.dumps({'file': args.destination.name, 'sha256': checksum,
                     'commit': commit, 'sourceHash': manifest['sourceHash'],
                     'sourceBytes': size, 'files': len(files)}))

if __name__ == '__main__':
    main()
