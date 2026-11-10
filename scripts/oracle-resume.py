#!/usr/bin/env python3
"""Resume only the owner's stopped lg0r36_7 recovery; never rerun installation."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import traceback

spec=importlib.util.spec_from_file_location('approved_recovery',Path(__file__).with_name('oracle-recover.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
STAGE=Path('/home/opc/amazonia-recovery-lg0r36_7')

def private(path):
    p=Path(path)
    s=p.lstat()
    m.need(p.resolve()==p and p.is_file() and s.st_uid==os.getuid() and
           not s.st_mode & 0o077 and s.st_nlink==1 and s.st_size<8*1024*1024,'PRIVATE_RECOVERY_INPUT')
    return p.read_text()

def root_dropin(path, expected):
    m.trusted_directory(path.parent)
    s=path.lstat()
    m.need(path.resolve()==path and path.is_file() and s.st_uid==0 and
           not s.st_mode & 0o022 and s.st_nlink==1 and path.read_text()==expected,'EXISTING_DROPIN_CHANGED')

def stopped_apps_and_neighbors(current, before):
    for unit in ('amazonia.service','atelier-portail.service'):
        v=current[unit]
        m.need(v.get('ActiveState')=='inactive' and v.get('MainPID')=='0' and v.get('User')=='opc',
               'BACKENDS_MUST_REMAIN_STOPPED')
        m.need(all(not v.get(k) for k in ('ExecStartPre','ExecStartPost','ExecStop','ExecStopPost')),
               'APP_UNIT_HOOK_CHANGED')
    for unit in ('caddy.service','lora-studio.service','foret-lab.service'):
        m.need(current[unit].get('ActiveState')=='active' and
               current[unit].get('MainPID')==before[unit].get('MainPID'),'NEIGHBOR_STATE_CHANGED')

def copied_data_matches(root, expected):
    m.need(root.is_dir() and root.resolve()==root,'COPIED_DATA_ROOT')
    files=set()
    for p in root.rglob('*'):
        m.need(not p.is_symlink() and (p.is_file() or p.is_dir()),'COPIED_DATA_LINK_OR_SPECIAL')
        if p.is_file(): files.add(p.relative_to(root).as_posix())
    m.need(files==set(expected)|{'campaigns/.amazonia-storage'},'COPIED_DATA_FILE_SET_CHANGED')
    for relative,info in expected.items():
        p=root/relative
        m.need(p.stat().st_size==info['size'] and m.file_sha(p)==info['sha256'],'COPIED_DATA_CHANGED')

class Resume(m.Recovery):
    def preflight(self):
        m.need(os.geteuid()!=0 and pwd.getpwuid(os.getuid()).pw_name=='opc' and
               Path.home()==Path('/home/opc'),'RUN_AS_OPC_WITHOUT_SUDO')
        m.trusted_directory(STAGE,os.getuid())
        m.need(not STAGE.stat().st_mode & 0o077,'PRIVATE_STAGE_REQUIRED')
        self.stage=STAGE
        m.need(not (STAGE/'report.json').exists(),'RECOVERY_ALREADY_SUCCEEDED')
        failure=json.loads(private(STAGE/'failure.json'))
        m.need(failure.get('success') is False and failure.get('phase')=='validation-et-activation-ciblée' and
               failure.get('caddyProtectedConfigLoaded') is False and failure.get('targetCommit')==m.TARGET,
               'UNEXPECTED_PRIOR_FAILURE')
        self.before=json.loads(private(STAGE/'units-before.private.json'))
        m.check_services(self.before)
        stopped_apps_and_neighbors(m.snapshots(),self.before)
        m.need(m.git_head(m.AMAZONIA)==m.TARGET and m.git_head(m.PORTAL)==m.PORTAL_COMMIT and
               m.git_head(STAGE/'retired-amazonia')==m.OLD_AMAZONIA,'CHECKOUT_VERSION_CHANGED')
        self.original=json.loads(private(STAGE/'data-before.private.json'))
        m.need(m.data_inventory(STAGE/'retired-amazonia/data')==self.original and
               m.data_inventory(m.HISTORY)==self.original,'ORIGINAL_DATA_CHANGED')
        copied_data_matches(STAGE/'data',self.original)
        m.need((STAGE/'studies').resolve()==STAGE/'studies' and
               (STAGE/'studies').is_dir() and not list((STAGE/'studies').iterdir()),'UNEXPECTED_STUDY_STORAGE')
        record=json.loads(private(STAGE/'runtime-copy.json'))
        self.node=m.SERVICE_RUNTIME_ROOT/'amazonia-runtime-lg0r36_7/node'
        m.trusted_directory(self.node.parent)
        m.need(record.get('copy')==str(self.node) and self.node.resolve()==self.node and
               self.node.stat().st_uid==0 and not self.node.stat().st_mode & 0o022,'SERVICE_RUNTIME_CHANGED')
        self.runtime_sha=record['sha256']
        m.need(re.fullmatch(r'[a-f0-9]{64}',self.runtime_sha) and
               m.file_sha(self.node)==self.runtime_sha,'SERVICE_RUNTIME_HASH_CHANGED')
        self.env=m.env_for(self.node)
        raw=m.command([self.node,'--import','tsx','-e',
            'import("./src/v4science/protocol.ts").then(m=>{const p=m.provenance();if(p.dirty)throw Error("dirty");console.log(JSON.stringify(p))})'],
            cwd=m.AMAZONIA,env=self.env)
        self.provenance=json.loads(raw)
        m.need(self.provenance['commit']==m.TARGET,'CODE_PROVENANCE_CHANGED')
        self.registry_path=Path('/srv/jeu/tools-registry.json')
        private(STAGE/'registry-before.private.json')
        self.registry=(STAGE/'registry-before.private.json').read_bytes()
        m.need(self.registry_path.read_bytes()==self.registry,'REGISTRY_CHANGED')
        self.caddy_before=json.loads(private(STAGE/'caddy-before.private.json'))
        m.need(m.canonical(m.live_caddy())==m.canonical(self.caddy_before),'LIVE_CADDY_CHANGED')
        self.key=private(STAGE/'config/internal-key').strip()
        hashed=private(STAGE/'config/password-hash.private').strip()
        self.candidate=m.helper().protect(self.caddy_before,'amazonia',hashed,self.key)
        m.need(m.canonical(self.candidate)==m.canonical(json.loads(private(STAGE/'config/caddy.private.json'))),
               'CADDY_CANDIDATE_CHANGED')
        access=private(STAGE/'operator-access.private.txt')
        match=re.fullmatch(r'Utilisateur : amazonia\nMot de passe : ([A-Za-z0-9_-]{32})\n',access)
        m.need(match is not None,'ACCESS_FILE_FORMAT')
        self.password=match[1]
        self.caddy_path=Path('/etc/caddy/amazonia-recovery-lg0r36_7.json')
        self.targets={u:Path('/etc/systemd/system')/(u+'.d')/'90-amazonia-recovery.conf'
                      for u in ('amazonia.service','atelier-portail.service','caddy.service')}
        # Refuse any drift from the previously installed, known drop-ins and env files.
        old=m.config_values(self.node,STAGE,STAGE/'config/internal-key')
        for name,values in old.items():
            m.need(private(STAGE/'config'/(name+'.env'))==m.env_text(values),'ORIGINAL_ENV_CHANGED')
            cwd=m.AMAZONIA if name=='amazonia' else m.PORTAL
            root_dropin(self.targets[name+'.service'],m.app_dropin(self.node,cwd,STAGE/'config'/(name+'.env')))
        root_dropin(self.targets['caddy.service'],m.caddy_dropin(self.caddy_path))
        self.service_config_dir=m.service_config_path(STAGE)
        m.need(not self.service_config_dir.exists() and not self.service_config_dir.is_symlink(),
               'SERVICE_CONFIG_ALREADY_EXISTS')
        m.trusted_directory(Path('/etc'))
        m.need(Path('/usr/sbin/restorecon').is_file(),'RESTORECON_REQUIRED')

    def apply(self):
        self.progress('reprise-validée-environnements')
        token=secrets.token_hex(4)
        self.log=(STAGE/('resume-'+token+'.private.log')).open('xb')
        os.chmod(self.log.name,0o600)
        folder=STAGE/('resume-config-'+token)
        folder.mkdir(mode=0o700)
        self.config_sources={}
        for name,values in m.config_values(self.node,STAGE,self.service_config_dir/'internal-key').items():
            source=folder/(name+'.env')
            m.new_file(source,m.env_text(values))
            self.config_sources[name]=source
            cwd=m.AMAZONIA if name=='amazonia' else m.PORTAL
            m.new_file(folder/(name+'.conf'),m.app_dropin(self.node,cwd,self.service_config_dir/(name+'.env')))
        m.refresh_sudo()
        digest=m.sudo(['/usr/bin/sha256sum',self.caddy_path]).decode().split()[0]
        m.need(digest==m.file_sha(STAGE/'config/caddy.private.json'),'INSTALLED_CADDY_CANDIDATE_CHANGED')
        m.command(['/usr/bin/sudo','-n','-H','-u','caddy','--',str(m.CADDY),'validate','--config',self.caddy_path],log=self.log)
        self.install_service_configs()
        stopped_apps_and_neighbors(m.snapshots(),self.before)
        m.need(m.canonical(m.live_caddy())==m.canonical(self.caddy_before),'LIVE_CADDY_CHANGED_BEFORE_START')
        self.backends_touched=True
        self.progress('reprise-démarrage-et-recette')
        for name in ('amazonia','atelier-portail'):
            m.sudo(['/usr/bin/install','-o','root','-g','root','-m','0644',
                    folder/(name+'.conf'),self.targets[name+'.service']],log=self.log)
        # The code, data copy, Caddy candidate, key and browser password are reused.
        self.start_and_verify()

    def fail(self):
        if self.stage:
            try:
                m.new_file(self.stage/('resume-failure-'+secrets.token_hex(4)+'.json'),
                    json.dumps({'success':False,'phase':self.phase,
                                'caddyProtectedConfigLoaded':self.caddy_activated}))
            except OSError:
                pass
        super().fail()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-approved',action='store_true')
    args=parser.parse_args()
    os.umask(0o077)
    recovery=Resume()
    try:
        recovery.preflight()
        if args.apply_approved: recovery.apply()
        else: print('REPRISE_VÉRIFIÉE_AUCUNE_ACTIVATION')
        return 0
    except (Exception,KeyboardInterrupt) as exc:
        if recovery.log:
            recovery.log.write(traceback.format_exc().encode())
            recovery.log.flush()
        print('ARRÊT : '+(str(exc) if isinstance(exc,m.Stop) else 'RESUME_ERROR_SEE_PRIVATE_LOG'),flush=True)
        recovery.fail()
        return 1
    finally:
        recovery.close()

if __name__=='__main__': raise SystemExit(main())
