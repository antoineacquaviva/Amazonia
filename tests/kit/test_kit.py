import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import v4_kit as kit
spec = importlib.util.spec_from_file_location('installer', ROOT / 'scripts/oracle-v4-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class KitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT.parent)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.files = {n: b'fixture\n' for n in kit.ROOT_FILES | kit.DOC_FILES | kit.SCRIPT_FILES}
        self.files['src/v4/types.ts'] = b'export const example = 1;\n'
    def bundle(self, name='kit.tar.gz'):
        p = self.root / name
        sha = kit.write_kit(p, 'a' * 40, 'b' * 64, self.files)
        return p, sha
    def test_reproducible_exact_contents_and_readonly_inspection(self):
        a, sa = self.bundle()
        b, sb = self.bundle('second.tar.gz')
        self.assertEqual(sa, sb)
        self.assertEqual(a.read_bytes(), b.read_bytes())
        before = a.stat()
        manifest, files, size = kit.read_kit(a, sa)
        self.assertEqual(set(files), set(self.files) | {'.release.json'})
        self.assertEqual(manifest['commit'], 'a' * 40)
        self.assertGreater(size, 0)
        self.assertEqual(a.stat().st_mtime_ns, before.st_mtime_ns)
        with self.assertRaises(FileExistsError):
            self.bundle()
    def test_excludes_private_data_results_and_non_source_files(self):
        for name in ('data/campaigns/a.json', '.env', 'scripts/key.env',
                     'docs/v4-demo-2026-11-09/results.json', 'src/.secret.ts',
                     'src/../../secret.ts', '/src/x.ts', 'node_modules/x.ts',
                     'runtime/access.key', 'src/private.json'):
            self.assertFalse(kit.allowed(name), name)
        with self.assertRaisesRegex(ValueError, 'ALLOWLIST'):
            kit.write_kit(self.root / 'bad.tar.gz', 'a'*40, 'b'*64, {'.env': b'SECRET'})
        self.assertFalse((self.root / 'bad.tar.gz').exists())
    def test_checksum_rejected_before_any_extraction(self):
        p, _ = self.bundle()
        with self.assertRaisesRegex(ValueError, 'CHECKSUM_MISMATCH'):
            kit.read_kit(p, 'f' * 64)
        self.assertEqual(len(list(self.root.iterdir())), 1)
    def test_types_paths_duplicates_and_member_integrity(self):
        for kind in ('symlink', 'traversal', 'duplicate', 'tamper', 'bomb'):
            p, sha = self.bundle(kind + '.original.tar.gz')
            raw = []
            with tarfile.open(p) as archive:
                for m in archive:
                    raw.append((m, archive.extractfile(m).read()))
            out = self.root / (kind + '.tar.gz')
            with tarfile.open(out, 'w:gz') as archive:
                for m, data in raw:
                    if kind == 'tamper' and m.name == 'server.ts':
                        data = b'changed\n'
                        m.size = len(data)
                    archive.addfile(m, io.BytesIO(data))
                if kind in ('symlink', 'traversal', 'duplicate', 'bomb'):
                    m = tarfile.TarInfo('server.ts' if kind == 'duplicate' else '../escaped')
                    if kind == 'symlink':
                        m.type, m.linkname = tarfile.SYMTYPE, '/etc/passwd'
                    elif kind == 'bomb':
                        m.name, m.size = 'src/bomb.ts', kit.MAX_BYTES + 1
                    archive.addfile(m, io.BytesIO(b'\0' * m.size) if kind == 'bomb' else None)
            with self.assertRaises((ValueError, tarfile.TarError)):
                kit.read_kit(out, kit.digest(out.read_bytes()))
            self.assertFalse((self.root.parent / 'escaped').exists())
    def test_extract_refuses_existing_destination_without_repair(self):
        dest = self.root / 'code'
        dest.mkdir()
        sentinel = dest / 'keep'
        sentinel.write_text('unchanged')
        with self.assertRaisesRegex(ValueError, 'DESTINATION_EXISTS'):
            kit.extract_files(dest, self.files)
        self.assertEqual(sentinel.read_text(), 'unchanged')
    def test_disk_and_inodes_refuse_without_mutations(self):
        initial = list(self.root.iterdir())
        with patch.object(kit.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(100, 99, 1)):
            with self.assertRaisesRegex(ValueError, 'DISK_BUDGET'):
                kit.check_capacity(self.root, 100)
        with patch.object(kit.os, 'statvfs') as stat:
            stat.return_value.f_favail = 1
            with patch.object(kit.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(10**12, 0, 10**12)):
                with self.assertRaisesRegex(ValueError, 'INODE'):
                    kit.check_capacity(self.root, 100)
        self.assertEqual(list(self.root.iterdir()), initial)
    def test_port_collision_is_refused_without_signals(self):
        import socket
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            with self.assertRaisesRegex(ValueError, 'PORT_OCCUPIED'):
                installer.free_port(sock.getsockname()[1])
    def test_environment_does_not_inherit_runtime_or_npm_injection(self):
        with patch.dict(os.environ, {'NODE_OPTIONS':'SECRET', 'LD_PRELOAD':'SECRET',
                                     'NPM_TOKEN':'SECRET', 'AMAZONIA_DATA_DIR':'/active'}):
            env = installer.base_env(Path('/new/node/bin/node'))
        self.assertNotIn('SECRET', json.dumps(env))
        self.assertNotIn('AMAZONIA_DATA_DIR', env)
        self.assertTrue(env['PATH'].startswith('/new/node/bin:'))
    def test_wrong_operator_refused_before_reads_or_writes(self):
        with patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'read_kit') as read:
            with self.assertRaisesRegex(ValueError, 'RUN_AS_OPC'):
                installer.main()
            read.assert_not_called()
    def test_neighbors_must_be_active_and_snapshot_is_filtered(self):
        with patch.object(installer.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = 'ActiveState=active\nMainPID=123\n'
            states = installer.service_snapshot()
            self.assertEqual(set(states), set(installer.SERVICES))
            self.assertTrue(all(call.args[0][1] == 'show' for call in run.call_args_list))
            run.return_value.stdout = 'ActiveState=inactive\nMainPID=0\n'
            with self.assertRaisesRegex(ValueError, 'NEIGHBOR_NOT_ACTIVE'):
                installer.service_snapshot()

if __name__ == '__main__':
    unittest.main()
