"""Recovery safety contracts with synthetic files and no host privilege."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('operator_recovery',ROOT/'scripts/oracle-recover.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def state():
    result={unit:{'ActiveState':'active','MainPID':str(i+100)} for i,unit in enumerate(m.SERVICES)}
    result['amazonia.service'].update(ActiveState='inactive',MainPID='0')
    for unit,folder in [('amazonia.service',m.AMAZONIA),('atelier-portail.service',m.PORTAL)]:
        result[unit].update(User='opc',WorkingDirectory=str(folder))
    result['caddy.service'].update(User='caddy',ExecStart='{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile ; }')
    return result

class OperatorTests(unittest.TestCase):
    def test_refuses_changed_runtime_services_and_unit_hooks(self):
        original=state()
        m.check_services(original)
        for unit,field,value in [('amazonia.service','MainPID','19'),
                                 ('atelier-portail.service','ActiveState','failed'),
                                 ('lora-studio.service','MainPID','0'),
                                 ('foret-lab.service','ActiveState','inactive'),
                                 ('amazonia.service','User','root'),
                                 ('atelier-portail.service','ExecStartPre','shell hook'),
                                 ('caddy.service','ExecStart','/usr/bin/caddy --resume')]:
            with self.subTest(unit=unit,field=field):
                changed=copy.deepcopy(original)
                changed[unit][field]=value
                with self.assertRaises(m.Stop): m.check_services(changed)

    def test_historical_originals_stay_identical_marker_only_on_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory).resolve()
            source=base/'original'
            (source/'campaigns').mkdir(parents=True)
            for i in range(16):
                (source/'campaigns'/f'{i}.json').write_bytes(b'' if i<2 else b'{"id":"fixture"}')
            before=m.data_inventory(source)
            dest=base/'copy'
            m.copy_data(source,dest,before)
            self.assertEqual(m.data_inventory(source),before)
            self.assertFalse((source/'campaigns/.amazonia-storage').exists())
            self.assertTrue((dest/'campaigns/.amazonia-storage').is_file())
            for p in dest.rglob('*'):
                self.assertEqual(p.stat().st_mode & 0o777,0o700 if p.is_dir() else 0o600)
            with self.assertRaises(m.Stop): m.copy_data(source,dest,before)
            (source/'campaigns/0.json').write_bytes(b'changed')
            with self.assertRaises(m.Stop): m.copy_data(source,base/'second',before)
            self.assertFalse((base/'second').exists())
            (source/'campaigns/link.json').symlink_to(source/'campaigns/1.json')
            with self.assertRaises(m.Stop): m.data_inventory(source)

    def test_private_file_never_overwrites_existing_file_or_link(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'private'
            m.new_file(file,'fixture')
            self.assertEqual(file.stat().st_mode & 0o777,0o600)
            with self.assertRaises(FileExistsError): m.new_file(file,'replacement')
            link=Path(directory)/'link'
            link.symlink_to(file)
            with self.assertRaises(FileExistsError): m.new_file(link,'replacement')
            self.assertEqual(file.read_text(),'fixture')

    def test_process_env_drops_injection_and_credentials(self):
        with patch.dict(os.environ,{'NODE_OPTIONS':'--require /tmp/hook','LD_PRELOAD':'bad',
                                    'GITHUB_TOKEN':'secret','GIT_CONFIG_COUNT':'1',
                                    'NPM_CONFIG_REGISTRY':'https://bad.invalid','HOME':'/home/opc'},clear=True):
            env=m.env_for(Path('/runtime/bin/node'))
        for key in ('NODE_OPTIONS','LD_PRELOAD','GITHUB_TOKEN','GIT_CONFIG_COUNT','NPM_CONFIG_REGISTRY'):
            self.assertNotIn(key,env)
        self.assertTrue(env['PATH'].startswith('/runtime/bin:'))
        self.assertEqual(env['GIT_CONFIG_GLOBAL'],'/dev/null')

    def test_no_privileged_interpreter_or_shell(self):
        with patch.object(m,'command') as run:
            for binary in ['/bin/sh','/usr/bin/python3','/usr/bin/node','/bin/rm']:
                with self.assertRaises(m.Stop): m.sudo([binary,'anything'])
            run.assert_not_called()
            m.sudo(['/usr/bin/systemctl','stop','amazonia.service'])
            self.assertEqual(run.call_args.args[0],['/usr/bin/sudo','-n','--','/usr/bin/systemctl','stop','amazonia.service'])

    def test_boot_and_reload_use_same_config_and_apps_keep_opc(self):
        config=Path('/etc/caddy/amazonia-recovery-test_ab.json')
        text=m.caddy_dropin(config)
        self.assertEqual(text.count(str(config)),2)
        self.assertIn('--address 127.0.0.1:2019',text)
        app=m.app_dropin(Path('/runtime/bin/node'),m.AMAZONIA,Path('/home/opc/private/app.env'))
        self.assertIn('User=opc\nGroup=opc',app)
        self.assertIn('ExecStart=\nExecStart=/runtime/bin/node --import tsx server.ts',app)
        self.assertIn('Environment=\nEnvironmentFile=\nEnvironmentFile=',app)
        self.assertIn('UMask=0077',app)
        for unsafe in ['/etc/caddy/../other.json','/etc/caddy/bad name.json']:
            with self.assertRaises(m.Stop): m.caddy_dropin(Path(unsafe))
        with self.assertRaises(m.Stop): m.env_text({'KEY':'foo\nExecStart=/bin/sh'})
        self.assertIn('BLOCK=\n',m.env_text({'BLOCK':''}))

    def test_browser_secrets_use_stdin_and_tls_verification(self):
        password='fixture-secret'
        proof='ab'*32
        with patch.object(m,'command',return_value=b'200') as run:
            self.assertEqual(m.https_status('/amazonia/api/v4/studies',password,proof),200)
        args=run.call_args.args[0]
        self.assertNotIn('-k',args)
        self.assertNotIn('--insecure',args)
        self.assertNotIn(password,' '.join(args))
        self.assertNotIn(proof,' '.join(args))
        self.assertIn('Authorization: Basic ',run.call_args.kwargs['stdin'].decode())
        self.assertIn(proof,run.call_args.kwargs['stdin'].decode())

    def test_failure_stops_only_backends_and_preserves_protection(self):
        recovery=m.Recovery()
        with tempfile.TemporaryDirectory() as directory, patch.object(m,'sudo') as run, contextlib.redirect_stdout(io.StringIO()):
            recovery.stage=Path(directory)
            recovery.backends_touched=True
            recovery.caddy_activated=True
            recovery.fail()
            run.assert_called_once_with(['/usr/bin/systemctl','stop','amazonia.service','atelier-portail.service'],log=None)
            report=json.loads((recovery.stage/'failure.json').read_text())
            self.assertTrue(report['caddyProtectedConfigLoaded'])
            self.assertFalse(report['success'])
        with patch.object(m,'sudo') as run, contextlib.redirect_stdout(io.StringIO()):
            m.Recovery().fail()
            run.assert_not_called()

    def test_default_mode_never_activates(self):
        with patch('sys.argv',['oracle-recover.py']), patch.object(m.Recovery,'preflight'), \
             patch.object(m.Recovery,'backup') as backup, patch.object(m.Recovery,'activate') as activate, \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(m.main(),0)
            backup.assert_not_called()
            activate.assert_not_called()

if __name__=='__main__': unittest.main()
