import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('program_update', Path(__file__).resolve().parents[2]/'scripts/oracle-programme.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class UpdateChecks(unittest.TestCase):
    def test_resources(self):
        self.assertEqual(module.worker_budget(16, 24*module.GIB),12)
        self.assertEqual(module.worker_budget(16, 4*module.GIB),4)
        self.assertEqual(module.worker_budget(2, 4*module.GIB),0)

    def test_preserve_unfinished_work(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            with sqlite3.connect(path/'orchestration.sqlite') as db:
                db.executescript('CREATE TABLE campaigns(body TEXT,deleted INTEGER); CREATE TABLE v4_studies(body TEXT)')
                db.execute('INSERT INTO campaigns VALUES(?,0)',(json.dumps({'record':{'status':'RUNNING'}}),))
                db.execute('INSERT INTO v4_studies VALUES(?)',(json.dumps({'status':'PAUSED'}),))
            for table in ('campaigns','v4_studies'):
                with self.assertRaises(RuntimeError): module.snapshot_ready(path,table)
            with sqlite3.connect(path/'orchestration.sqlite') as db: db.execute('UPDATE campaigns SET deleted=1')
            module.snapshot_ready(path,'campaigns')
