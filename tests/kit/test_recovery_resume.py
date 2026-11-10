import ast
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('resume_operator',ROOT/'scripts/oracle-resume.py')
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
m=r.m

class ResumeTests(unittest.TestCase):
    def test_env_files_copied_verified_and_probed_before_any_backend_operation(self):
        for outcome in ('success','corrupt','probe_failure'):
            with self.subTest(outcome=outcome), tempfile.TemporaryDirectory() as directory:
                root=Path(directory).resolve()
                stage=root/'amazonia-recovery-fixture'
                (stage/'config').mkdir(parents=True)
                folder=root/'etc-private'
                key=stage/'config/internal-key'
                key.write_text('ab'*32+'\n')
                sources={}
                for name in ('amazonia','atelier-portail'):
                    source=stage/'config'/(name+'.env')
                    source.write_text('PORT=fixture\n')
                    sources[name]=source
                recovery=m.Recovery()
                recovery.stage=stage
                recovery.service_config_dir=folder
                recovery.config_sources=sources
                recovery.node=Path('/usr/local/bin/amazonia-runtime-fixture/node')
                calls=[]
                def sudo(args,**kwargs):
                    calls.append(args)
                    if args[0]=='/usr/bin/install':
                        if '-d' in args: Path(args[-1]).mkdir(mode=0o750)
                        else:
                            shutil.copyfile(args[-2],args[-1])
                            Path(args[-1]).chmod(int(args[args.index('-m')+1],8))
                    if args[0]=='/usr/bin/sha256sum':
                        digest='00'*32 if outcome=='corrupt' else m.file_sha(args[1])
                        return (digest+'  file\n').encode()
                    if args[0]=='/usr/bin/systemd-run' and outcome=='probe_failure':
                        raise m.Stop('fixture')
                    return b''
                with patch.object(m,'service_config_path',return_value=folder), \
                     patch.object(m,'trusted_directory'), patch.object(m,'sudo',side_effect=sudo), \
                     contextlib.redirect_stdout(io.StringIO()):
                    if outcome=='success': recovery.install_service_configs()
                    else:
                        with self.assertRaises(m.Stop): recovery.install_service_configs()
                self.assertFalse(recovery.backends_touched)
                self.assertFalse(any(a[0] in ('/usr/bin/systemctl','/usr/bin/caddy','/usr/bin/mv') for a in calls))
                self.assertEqual(key.read_text(),'ab'*32+'\n')
                self.assertEqual((folder/'internal-key').read_text(),key.read_text())
                self.assertEqual((folder/'internal-key').stat().st_mode & 0o777,0o400)
                self.assertEqual((folder/'atelier-portail.env').stat().st_mode & 0o777,0o600)
                self.assertIn(['/usr/sbin/restorecon','-R',folder],calls)
                probes=[a for a in calls if a[0]=='/usr/bin/systemd-run']
                self.assertEqual(len(probes),2 if outcome=='success' else (0 if outcome=='corrupt' else 1))
                for probe in probes:
                    self.assertIn('--property=User=opc',probe)
                    self.assertNotIn('--pipe',probe)
                    self.assertTrue(any(str(a).startswith('--property=EnvironmentFile='+str(folder)) for a in probe))
                    self.assertNotIn('ab'*32,' '.join(map(str,probe)))
                if outcome=='probe_failure':
                    self.assertTrue(any(a[0]=='/usr/bin/journalctl' for a in calls))
                with patch.object(m,'service_config_path',return_value=folder), patch.object(m,'sudo') as command, contextlib.redirect_stdout(io.StringIO()):
                    with self.assertRaises(m.Stop): recovery.install_service_configs()
                    command.assert_not_called()

    def test_refuses_effective_home_env_before_starting_apps(self):
        recovery=m.Recovery()
        recovery.node=Path('/usr/local/bin/amazonia-runtime-fixture/node')
        recovery.service_config_dir=Path('/etc/amazonia-recovery-fixture')
        show=('User=opc\nWorkingDirectory='+str(m.AMAZONIA)+'\nExecStart={ path='+str(recovery.node)+
              ' ; }\nEnvironmentFiles=/home/opc/private/amazonia.env (ignore_errors=no)\n').encode()
        with patch.object(m,'sudo') as sudo, patch.object(m,'command',return_value=show):
            with self.assertRaisesRegex(m.Stop,'EFFECTIVE_ENVIRONMENT_FILE_MISMATCH'):
                recovery.start_and_verify()
        sudo.assert_called_once_with(['/usr/bin/systemctl','daemon-reload'],log=None)

    def test_resume_state_refuses_running_backend_or_changed_neighbor(self):
        before={u:{'MainPID':str(i+10)} for i,u in enumerate(m.SERVICES)}
        current={u:{'ActiveState':'active','MainPID':before[u]['MainPID']} for u in m.SERVICES}
        for u in m.SERVICES[:2]: current[u].update(ActiveState='inactive',MainPID='0',User='opc')
        r.stopped_apps_and_neighbors(current,before)
        for unit,field,value in [('amazonia.service','ActiveState','active'),
                                 ('atelier-portail.service','MainPID','91'),
                                 ('caddy.service','MainPID','92'),
                                 ('lora-studio.service','ActiveState','inactive'),
                                 ('atelier-portail.service','ExecStartPost','unexpected')]:
            changed=json.loads(json.dumps(current))
            changed[unit][field]=value
            with self.assertRaises(m.Stop): r.stopped_apps_and_neighbors(changed,before)

    def test_copied_history_is_checked_without_initializing_or_repairing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'campaigns').mkdir()
            f=root/'campaigns/old.json'
            f.write_bytes(b'fixture')
            marker=root/'campaigns/.amazonia-storage'
            marker.write_text('existing marker')
            expected={'campaigns/old.json':{'size':7,'sha256':m.file_sha(f)}}
            r.copied_data_matches(root,expected)
            f.write_bytes(b'changed')
            with self.assertRaises(m.Stop): r.copied_data_matches(root,expected)
            self.assertEqual(f.read_bytes(),b'changed')
            self.assertEqual(marker.read_text(),'existing marker')

    def test_private_inputs_refuse_links_and_public_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory).resolve()/'private'
            file.write_text('fixture')
            file.chmod(0o600)
            self.assertEqual(r.private(file),'fixture')
            link=file.with_name('link')
            link.symlink_to(file)
            with self.assertRaises(m.Stop): r.private(link)
            file.chmod(0o644)
            with self.assertRaises(m.Stop): r.private(file)

    def test_apply_reuses_prepared_lot_and_only_repoints_two_app_units(self):
        with tempfile.TemporaryDirectory() as directory:
            stage=Path(directory).resolve()/'amazonia-recovery-lg0r36_7'
            (stage/'config').mkdir(parents=True)
            candidate=stage/'config/caddy.private.json'
            candidate.write_text('{}')
            access=stage/'operator-access.private.txt'
            access.write_text('existing private access')
            key=stage/'config/internal-key'
            key.write_text('ab'*32)
            recovery=r.Resume()
            recovery.stage=stage
            recovery.node=Path('/usr/local/bin/amazonia-runtime-lg0r36_7/node')
            recovery.service_config_dir=m.service_config_path(stage)
            recovery.caddy_path=Path('/etc/caddy/amazonia-recovery-lg0r36_7.json')
            recovery.caddy_before={}
            recovery.targets={name+'.service':stage/(name+'.old.conf') for name in ('amazonia','atelier-portail')}
            before={u:{'ActiveState':'active','MainPID':str(i+10)} for i,u in enumerate(m.SERVICES)}
            for u in m.SERVICES[:2]: before[u].update(ActiveState='inactive',MainPID='0',User='opc')
            recovery.before=before
            calls=[]
            def sudo(args,**kwargs):
                calls.append(args)
                if args[0]=='/usr/bin/sha256sum': return (m.file_sha(candidate)+'  fixture').encode()
                if args[0]=='/usr/bin/install': shutil.copyfile(args[-2],args[-1])
                return b''
            def verify():
                self.assertEqual(len([a for a in calls if a[0]=='/usr/bin/install']),2)
                self.assertEqual(access.read_text(),'existing private access')
                self.assertEqual(key.read_text(),'ab'*32)
            with patch.object(r,'STAGE',stage), patch.object(m,'refresh_sudo'), \
                 patch.object(m,'sudo',side_effect=sudo), patch.object(m,'command'), \
                 patch.object(m,'snapshots',return_value=before), patch.object(m,'live_caddy',return_value={}), \
                 patch.object(recovery,'install_service_configs') as install, \
                 patch.object(recovery,'start_and_verify',side_effect=verify) as start, \
                 patch.object(r.secrets,'token_hex',return_value='fixture'), contextlib.redirect_stdout(io.StringIO()):
                recovery.apply()
                install.assert_called_once()
                start.assert_called_once()
            recovery.close()
            self.assertTrue(recovery.backends_touched)
            self.assertFalse(any(a[0]=='/usr/bin/mv' for a in calls))
            for name in ('amazonia','atelier-portail'):
                text=recovery.targets[name+'.service'].read_text()
                self.assertIn(str(recovery.service_config_dir/(name+'.env')),text)
                self.assertNotIn(str(stage/'config'/(name+'.env')),text)

    def test_resume_bootstrap_verifies_all_three_files_before_execution(self):
        doc=(ROOT/'docs/ORACLE_RECOVERY_RESUME.md').read_text()
        script=doc.split("python3 - <<'PY'\n",1)[1].split('\nPY\n',1)[0]
        ast.parse(script)
        for corrupt in (False,True):
            with tempfile.TemporaryDirectory() as directory:
                def response(url,timeout):
                    name=url.rsplit('/',1)[1]
                    data=(ROOT/'scripts'/name).read_bytes()
                    if corrupt and name=='oracle-recovery-caddy.py': data+=b'corrupted'
                    return contextlib.closing(io.BytesIO(data))
                old_umask=os.umask(0o077)
                try:
                    with patch('pathlib.Path.home',return_value=Path('/home/opc')), \
                         patch('os.geteuid',return_value=1000), patch('tempfile.mkdtemp',return_value=directory), \
                         patch('urllib.request.urlopen',side_effect=response), patch('os.execv') as execute:
                        if corrupt:
                            with self.assertRaises(SystemExit): exec(compile(script,'resume-bootstrap','exec'),{})
                            execute.assert_not_called()
                        else:
                            exec(compile(script,'resume-bootstrap','exec'),{})
                            execute.assert_called_once()
                            self.assertEqual(len(list(Path(directory).iterdir())),3)
                            self.assertEqual(execute.call_args.args[1][-2:],
                                [str(Path(directory)/'oracle-resume.py'),'--apply-approved'])
                finally: os.umask(old_umask)

    def test_default_resume_does_not_apply(self):
        with patch('sys.argv',['oracle-resume.py']), patch.object(r.Resume,'preflight'), \
             patch.object(r.Resume,'apply') as apply, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(r.main(),0)
            apply.assert_not_called()

    def test_configuration_values_only_move_key_and_unit_env_paths(self):
        stage=Path('/home/opc/amazonia-recovery-fixture')
        node=Path('/usr/local/bin/amazonia-runtime-fixture/node')
        folder=m.service_config_path(stage)
        old=m.config_values(node,stage,stage/'config/internal-key')
        new=m.config_values(node,stage,folder/'internal-key')
        for name in old:
            changed=[k for k in old[name] if old[name][k]!=new[name][k]]
            self.assertEqual(changed,['ATELIER_INTERNAL_KEY_FILE'])
        self.assertEqual(new['atelier-portail']['AMAZONIA_NODE_BINARY'],'')
        self.assertEqual(new['amazonia']['V4_STUDIES_DIR'],str(stage/'studies'))
        for name in ('unexpected','amazonia-recovery-invalid space'):
            with self.assertRaises(m.Stop): m.service_config_path(Path('/home/opc')/name)

if __name__=='__main__': unittest.main()
