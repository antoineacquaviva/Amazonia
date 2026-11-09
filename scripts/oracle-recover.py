#!/usr/bin/env python3
"""Approved targeted recovery. Run as opc; never run this program as root."""
import argparse
import base64
import grp
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import subprocess
import tempfile
import traceback
import urllib.error
import urllib.request

TARGET = 'c0517950f18487faff02744c6409083659e7c495'
OLD_AMAZONIA = 'fe4c15c2f7cc414f142333912a717880a4dc08ea'
PORTAL_COMMIT = '9fc4a8e63a26aa68deef0547e8e3d41c7dfd819a'
AMAZONIA = Path('/srv/jeu/amazonia')
PORTAL = Path('/srv/jeu/atelier-portail-maitre')
HISTORY = Path('/home/opc/amazonia-data-backup-20261108-125739/data')
NODE = Path('/home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin/node')
CADDY = Path('/usr/bin/caddy')
SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
SERVICES = ('amazonia.service', 'atelier-portail.service', 'caddy.service',
            'lora-studio.service', 'foret-lab.service')
ORIGINS = 'https://atelierconceptionjeu.fr,https://www.atelierconceptionjeu.fr'
GIB = 1024**3

class Stop(Exception):
    pass

def need(ok, code):
    if not ok:
        raise Stop(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def env_for(node=None):
    names = ('HOME','LANG','LC_ALL','HTTP_PROXY','HTTPS_PROXY','NO_PROXY',
             'http_proxy','https_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR',
             'NODE_EXTRA_CA_CERTS')
    env = {k:os.environ[k] for k in names if k in os.environ}
    env.update(PATH=(str(node.parent)+':' if node else '')+SYSTEM_PATH,
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null',
               GIT_TERMINAL_PROMPT='0', GIT_OPTIONAL_LOCKS='0', LC_ALL='C')
    return env

def command(args, env=None, cwd=None, log=None, timeout=60, stdin=None):
    try:
        p = subprocess.run([str(x) for x in args], cwd=cwd, env=env or env_for(),
                           input=stdin, stdout=subprocess.PIPE,
                           stderr=log if log is not None else subprocess.DEVNULL,
                           timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('COMMAND_UNAVAILABLE_OR_TIMEOUT') from None
    if log is not None:
        log.write(p.stdout)
        log.flush()
    need(p.returncode == 0, 'COMMAND_FAILED_SEE_PRIVATE_LOG')
    return p.stdout

def refresh_sudo():
    # Keep the usual sudo prompt on the terminal; never capture a password.
    try:
        p = subprocess.run(['/usr/bin/sudo','-v'], env=env_for(), timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('SUDO_AUTHENTICATION_UNAVAILABLE') from None
    need(p.returncode == 0, 'SUDO_AUTHENTICATION_FAILED')

def sudo(args, log=None, timeout=60):
    # No shell, password, secret value, Node program or user Python runs under sudo.
    allowed = {'/usr/bin/tar','/usr/bin/install','/usr/bin/systemctl',
               '/usr/bin/mv','/usr/bin/sha256sum','/usr/bin/caddy','/usr/bin/systemd-run'}
    need(str(args[0]) in allowed, 'PRIVILEGED_COMMAND_NOT_ALLOWED')
    return command(['/usr/bin/sudo','-n','--',*args], log=log, timeout=timeout)

def new_file(path, content, mode=0o600):
    fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL, mode)
    with os.fdopen(fd, 'wb') as out:
        out.write(content.encode() if isinstance(content,str) else content)
        out.flush()
        os.fsync(out.fileno())

def trusted_directory(path, uid=0):
    p = Path(path)
    need(p.is_dir() and p.resolve() == p and p.stat().st_uid == uid and
         not p.stat().st_mode & 0o022, 'UNTRUSTED_DIRECTORY')

def snapshots():
    result = {}
    fields = 'ActiveState,SubState,MainPID,User,WorkingDirectory,ExecStart,ExecStartPre,ExecStartPost,ExecStop,ExecStopPost'
    for unit in SERVICES:
        raw = command(['/usr/bin/systemctl','show',unit,'--property='+fields,'--no-pager']).decode()
        result[unit] = dict(x.split('=',1) for x in raw.splitlines() if '=' in x)
    return result

def check_services(values):
    a = values['amazonia.service']
    need(a.get('ActiveState') == 'inactive' and a.get('MainPID') == '0', 'AMAZONIA_MUST_REMAIN_STOPPED')
    for unit in SERVICES[1:]:
        need(values[unit].get('ActiveState') == 'active' and
             re.fullmatch(r'[1-9][0-9]*',values[unit].get('MainPID','')), 'NEIGHBOR_OR_PORTAL_NOT_ACTIVE')
    for unit, folder in [('amazonia.service',AMAZONIA),('atelier-portail.service',PORTAL)]:
        v = values[unit]
        need(v.get('User') == 'opc' and v.get('WorkingDirectory') == str(folder), 'APP_UNIT_CHANGED')
        need(all(not v.get(k) for k in ('ExecStartPre','ExecStartPost','ExecStop','ExecStopPost')), 'APP_UNIT_HOOK_REQUIRES_REVIEW')
    c = values['caddy.service']
    need(c.get('User') == 'caddy' and 'path=/usr/bin/caddy ' in c.get('ExecStart','') and
         '/etc/caddy/Caddyfile' in c.get('ExecStart','') and '--resume' not in c.get('ExecStart',''),
         'CADDY_UNIT_REQUIRES_REVIEW')

def data_inventory(root):
    need(root.is_dir() and root.resolve() == root, 'DATA_ROOT')
    result = {}
    for p in sorted(root.rglob('*')):
        need(not p.is_symlink(), 'DATA_LINK')
        if p.is_file():
            h=hashlib.sha256()
            with p.open('rb') as f:
                for block in iter(lambda:f.read(1024*1024),b''):
                    h.update(block)
            result[p.relative_to(root).as_posix()] = {'size':p.stat().st_size,'sha256':h.hexdigest()}
        else:
            need(p.is_dir(),'DATA_SPECIAL_FILE')
    need(len(result)==16 and all(x.endswith('.json') for x in result), 'EXPECTED_16_JSON_FILES')
    return result

def copy_data(source, destination, expected):
    need(not destination.exists() and not destination.is_symlink(), 'DATA_DESTINATION_EXISTS')
    need(data_inventory(source)==expected, 'DATA_CHANGED_BEFORE_COPY')
    shutil.copytree(source,destination,copy_function=shutil.copy2)
    for p in [destination,*destination.rglob('*')]:
        p.chmod(0o700 if p.is_dir() else 0o600)
    need(data_inventory(destination)==expected and data_inventory(source)==expected, 'DATA_COPY_MISMATCH')
    campaigns = destination/'campaigns'
    need(campaigns.is_dir(),'CAMPAIGNS_LAYOUT')
    new_file(campaigns/'.amazonia-storage','Approved recovery copy; original JSON retained.\n')

def live_caddy():
    with urllib.request.urlopen('http://127.0.0.1:2019/config/',timeout=10) as r:
        raw=r.read(8*1024*1024+1)
    need(len(raw)<=8*1024*1024,'CADDY_CONFIG_SIZE')
    return json.loads(raw)

def helper():
    file=Path(__file__).with_name('oracle-recovery-caddy.py')
    spec=importlib.util.spec_from_file_location('recovery_candidate',file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def git_head(folder):
    need(folder.is_dir() and folder.resolve()==folder and (folder/'.git').is_dir() and
         not (folder/'.git').is_symlink(),'CHECKOUT_PATH')
    return command(['git','-C',folder,'rev-parse','HEAD']).decode().strip()

def capacity(root, data_bytes, code_bytes):
    required=max(6*GIB,4*GIB+3*data_bytes+2*code_bytes)
    need(shutil.disk_usage(root).free>=required,'DISK_BUDGET')
    need(os.statvfs(root).f_favail>=40000,'INODE_BUDGET')
    return required

def env_text(values):
    lines=[]
    for key,value in values.items():
        need(re.fullmatch(r'[A-Z0-9_]+',key) and
             re.fullmatch(r'[A-Za-z0-9_./,:=+\-]*',str(value)), 'ENV_VALUE')
        lines.append(key+'='+str(value))
    return '\n'.join(lines)+'\n'

def app_dropin(node, folder, file):
    for p in (node,folder,file):
        need(re.fullmatch(r'/[A-Za-z0-9_./-]+',str(p)), 'UNIT_PATH')
    return ('[Service]\nUser=opc\nGroup=opc\nWorkingDirectory='+str(folder)+
            '\nExecStart=\nExecStart='+str(node)+' --import tsx server.ts\n'
            'Environment=\nEnvironmentFile=\nEnvironmentFile='+str(file)+
            '\nUnsetEnvironment=LD_PRELOAD NODE_PATH\nUMask=0077\n')

def caddy_dropin(config):
    need(re.fullmatch(r'/etc/caddy/amazonia-recovery-[a-z0-9_-]+\.json',str(config)), 'CADDY_PATH')
    return ('[Service]\nExecStart=\nExecStart=/usr/bin/caddy run --environ --config '+str(config)+
            '\nExecReload=\nExecReload=/usr/bin/caddy reload --config '+str(config)+
            ' --address 127.0.0.1:2019\n')

def internal_status(port, endpoint, key=None):
    headers={'X-Atelier-Internal':key} if key else {}
    req=urllib.request.Request('http://127.0.0.1:'+str(port)+endpoint,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

def https_status(endpoint, password=None, proof=None):
    config=''
    if password:
        token=base64.b64encode(('amazonia:'+password).encode()).decode()
        config+='header = "Authorization: Basic '+token+'"\n'
    if proof:
        config+='header = "X-Atelier-Internal: '+proof+'"\n'
    # Force the known local listener, preserving hostname, SNI and certificate validation.
    args=['/usr/bin/curl','--silent','--show-error','--max-time','15','--noproxy','*',
          '--resolve','atelierconceptionjeu.fr:443:127.0.0.1','--output','/dev/null',
          '--write-out','%{http_code}','--config','-',
          'https://atelierconceptionjeu.fr'+endpoint]
    return int(command(args,stdin=config.encode()).decode().strip())

class Recovery:
    def __init__(self):
        self.stage=None
        self.log=None
        self.phase='preflight'
        self.backends_touched=False
        self.caddy_activated=False

    def progress(self,label):
        self.phase=label
        print('ÉTAPE : '+label,flush=True)
        if self.stage:
            (self.stage/'progress.json').write_text(json.dumps({'phase':label,'target':TARGET}))

    def preflight(self):
        need(os.geteuid()!=0 and pwd.getpwuid(os.getuid()).pw_name=='opc' and
             Path.home()==Path('/home/opc'),'RUN_AS_OPC_WITHOUT_SUDO')
        for p in (AMAZONIA,PORTAL,Path('/srv/jeu')):
            need(p.resolve()==p,'CHECKOUT_LINK')
        need(git_head(AMAZONIA)==OLD_AMAZONIA and git_head(PORTAL)==PORTAL_COMMIT,
             'CHECKOUT_VERSION_CHANGED')
        self.before=snapshots()
        check_services(self.before)
        self.original=data_inventory(AMAZONIA/'data')
        need(self.original==data_inventory(HISTORY),'HISTORICAL_DATA_CHANGED')
        self.caddy_before=live_caddy()
        # Validate topology without generating or publishing a real credential.
        helper().protect(self.caddy_before,'amazonia','$2a$14$'+'a'*53,'ab'*32)
        self.node=NODE.resolve(strict=True)
        need(self.node.is_file() and os.access(self.node,os.X_OK),'NODE24_MISSING')
        self.env=env_for(self.node)
        version=command([self.node,'-e','require("node:sqlite");console.log(process.version)'],env=self.env).decode().strip()
        need(version=='v24.22.1','PREPARED_NODE_VERSION')
        command([self.node,'--import','tsx','-e','import("express"); import("vite")'],
                env=self.env,cwd=PORTAL)
        need((PORTAL/'dist/index.html').is_file(),'PORTAL_BUILD_REQUIRED')
        self.npm=self.node.parent/'npm'
        need(self.npm.is_file() and os.access(self.npm,os.X_OK),'NPM_NEXT_TO_NODE_REQUIRED')
        need(command([CADDY,'version']).decode().startswith('v2.11.7'),'CADDY_VERSION_CHANGED')
        need(shutil.which('curl',path=SYSTEM_PATH)=='/usr/bin/curl','CURL_REQUIRED')
        for p in (Path('/etc/caddy'),Path('/etc/systemd/system')):
            trusted_directory(p)
        grp.getgrnam('caddy')
        need(grp.getgrnam('opc').gr_gid==pwd.getpwnam('opc').pw_gid,'OPC_GROUP')
        need(Path('/usr/bin/systemd-run').is_file(),'SYSTEMD_RUN_REQUIRED')
        self.targets={u:Path('/etc/systemd/system')/(u+'.d')/'90-amazonia-recovery.conf'
                      for u in ('amazonia.service','atelier-portail.service','caddy.service')}
        for target in self.targets.values():
            need(not target.exists() and not target.is_symlink(),'RECOVERY_DROPIN_ALREADY_EXISTS')
            if target.parent.exists():
                trusted_directory(target.parent)
        need(Path.home().stat().st_dev==AMAZONIA.parent.stat().st_dev,'ATOMIC_SWAP_REQUIRES_SAME_VOLUME')
        code_bytes=int(command(['/usr/bin/du','-sb',AMAZONIA]).decode().split()[0])
        self.required=capacity(Path.home(),sum(x['size'] for x in self.original.values()),code_bytes)
        # Read registry directly, never invoke its loader or an old overview API.
        self.registry_path=Path('/srv/jeu/tools-registry.json')
        self.registry=self.registry_path.read_bytes()
        records=json.loads(self.registry)
        need({r['subpath']:r['port'] for r in records}==
             {'/lora':5050,'/lab':8080,'/bga':8082,'/amazonia':8083} and len(records)==4,
             'REGISTRY_CHANGED')

    def backup(self):
        self.progress('sauvegarde-privée')
        self.stage=Path(tempfile.mkdtemp(prefix='amazonia-recovery-',dir=Path.home()))
        print('DOSSIER_PRIVÉ='+str(self.stage),flush=True)
        for name in ('backups','config','npm-cache','npm-config','studies'):
            (self.stage/name).mkdir(mode=0o700)
        self.log=(self.stage/'operation.log').open('xb')
        os.chmod(self.log.name,0o600)
        new_file(self.stage/'caddy-before.private.json',canonical(self.caddy_before))
        new_file(self.stage/'units-before.private.json',canonical(self.before))
        new_file(self.stage/'registry-before.private.json',self.registry)
        new_file(self.stage/'data-before.private.json',canonical(self.original))
        refresh_sudo()
        # Probe the exact runtime in a transient systemd service under opc before
        # modifying any application, data original, persistent unit or Caddy.
        probe='amazonia-recovery-probe-'+self.stage.name.split('recovery-',1)[1]
        try:
            sudo(['/usr/bin/systemd-run','--unit='+probe,'--wait','--pipe','--collect','--quiet',
                  '--property=User=opc','--property=Group=opc',str(self.node),
                  '-e','require("node:sqlite"); console.log(process.version)'],log=self.log)
        except Stop:
            raise Stop('SYSTEMD_NODE24_PROBE_FAILED_BEFORE_ACTIVATION') from None
        paths=[Path('/etc/caddy'),Path('/usr/lib/systemd/system/caddy.service')]
        for unit in ('amazonia.service','atelier-portail.service','caddy.service'):
            paths.extend([Path('/etc/systemd/system')/unit,Path('/etc/systemd/system')/(unit+'.d')])
        paths=[p for p in paths if p.exists()]
        for name, sources in [('configurations.tar',paths),('code-before.tar',[AMAZONIA,PORTAL])]:
            archive=self.stage/'backups'/name
            sudo(['/usr/bin/tar','--acls','--xattrs','--selinux','--numeric-owner','-cpf',archive,*sources],log=self.log,timeout=600)
            sudo(['/usr/bin/tar','-tf',archive],log=self.log,timeout=120)
            digest=sudo(['/usr/bin/sha256sum',archive],log=None).decode().split()[0]
            new_file(self.stage/'backups'/(name+'.sha256'),digest+'  '+name+'\n')
        need(data_inventory(AMAZONIA/'data')==self.original,'DATA_CHANGED_DURING_BACKUP')
        copy_data(AMAZONIA/'data',self.stage/'data',self.original)

    def prepare_code(self):
        self.progress('préparation-code-validé')
        code=self.stage/'prepared-amazonia'
        command(['git','-c','core.hooksPath=/dev/null','clone','--no-checkout',
                 'https://github.com/antoineacquaviva/Amazonia.git',code],env=self.env,log=self.log,timeout=300)
        command(['git','-C',code,'-c','core.hooksPath=/dev/null','fetch','origin',TARGET],env=self.env,log=self.log,timeout=300)
        command(['git','-C',code,'-c','core.hooksPath=/dev/null','checkout','--detach',TARGET],env=self.env,log=self.log)
        need(git_head(code)==TARGET,'TARGET_COMMIT')
        for label in ('user','global'):
            file=self.stage/'npm-config'/(label+'.npmrc')
            new_file(file,'')
            self.env['NPM_CONFIG_'+label.upper()+'CONFIG']=str(file)
        self.env['NPM_CONFIG_CACHE']=str(self.stage/'npm-cache')
        self.env['NODE_ENV']='production'
        for args in ([self.npm,'ci','--include=dev','--no-audit','--no-fund'],
                     [self.npm,'run','lint'],[self.npm,'run','build']):
            need(shutil.disk_usage(self.stage).free>=4*GIB,'DISK_RESERVE')
            command(args,env=self.env,cwd=code,log=self.log,timeout=600)
        raw=command([self.node,'--import','tsx','-e',
            'import("./src/v4science/protocol.ts").then(m=>{const p=m.provenance();if(p.dirty)throw Error("dirty");console.log(JSON.stringify(p))})'],env=self.env,cwd=code)
        self.provenance=json.loads(raw)
        need(self.provenance['commit']==TARGET,'CODE_PROVENANCE')
        self.prepared_code=code

    def prepare_configs(self):
        self.progress('secrets-et-candidats-privés')
        self.key=secrets.token_hex(32)
        self.password=secrets.token_urlsafe(24)
        new_file(self.stage/'config/internal-key',self.key+'\n',0o400)
        new_file(self.stage/'operator-access.private.txt','Utilisateur : amazonia\nMot de passe : '+self.password+'\n')
        hashed=command([CADDY,'hash-password','--algorithm','bcrypt'],
                       stdin=(self.password+'\n').encode(),log=None).decode().strip()
        new_file(self.stage/'config/password-hash.private',hashed+'\n')
        common={'NODE_ENV':'production','NODE_OPTIONS':'--max-old-space-size=512',
                'PATH':str(self.node.parent)+':'+SYSTEM_PATH,
                'ATELIER_INTERNAL_KEY_FILE':str(self.stage/'config/internal-key'),
                'ATELIER_PUBLIC_ORIGINS':ORIGINS}
        app_env={**common,'PORT':'8083','AMAZONIA_CAMPAIGNS_DIR':str(self.stage/'data/campaigns'),
                 'V4_STUDIES_DIR':str(self.stage/'studies'),'V4_WORKERS':'1','V4_BATCH_SIZE':'2',
                 'V4_MAX_ACTIVE':'1','V4_MAX_GAMES':'2000','AMAZONIA_WORKERS':'1',
                 'AMAZONIA_QUEUE':'2','AMAZONIA_CAMPAIGNS':'1'}
        # Refuse a future generic redeployment before it could mutate a checkout.
        portal_env={**common,'PORT':'3000','AMAZONIA_NODE_BINARY':'','AMAZONIA_CAMPAIGNS_DIR':''}
        for name,values in [('amazonia',app_env),('atelier-portail',portal_env)]:
            file=self.stage/'config'/(name+'.env')
            new_file(file,env_text(values))
            cwd=AMAZONIA if name=='amazonia' else PORTAL
            new_file(self.stage/'config'/(name+'.conf'),app_dropin(self.node,cwd,file))
        candidate=helper().protect(self.caddy_before,'amazonia',hashed,self.key)
        new_file(self.stage/'config/caddy.private.json',canonical(candidate))
        run_id=self.stage.name.removeprefix('amazonia-recovery-')
        self.caddy_path=Path('/etc/caddy')/('amazonia-recovery-'+run_id+'.json')
        new_file(self.stage/'config/caddy.conf',caddy_dropin(self.caddy_path))

    def activate(self):
        self.progress('validation-et-activation-ciblée')
        need(canonical(live_caddy())==canonical(self.caddy_before),'CADDY_CHANGED_BEFORE_ACTIVATION')
        current=snapshots()
        check_services(current)
        for unit in SERVICES[1:]:
            need(current[unit]['MainPID']==self.before[unit]['MainPID'],'SERVICE_CHANGED_DURING_PREPARATION')
        need(git_head(AMAZONIA)==OLD_AMAZONIA and git_head(PORTAL)==PORTAL_COMMIT,'CHECKOUT_CHANGED_DURING_PREPARATION')
        need(data_inventory(AMAZONIA/'data')==self.original,'DATA_CHANGED_BEFORE_ACTIVATION')
        refresh_sudo()
        need(not self.caddy_path.exists() and not self.caddy_path.is_symlink(),'CADDY_TARGET_EXISTS')
        sudo(['/usr/bin/install','-o','root','-g','caddy','-m','0640',
              self.stage/'config/caddy.private.json',self.caddy_path],log=self.log)
        # Validate as the real Caddy account, before changing any unit or code path.
        command(['/usr/bin/sudo','-n','-H','-u','caddy','--',str(CADDY),'validate','--config',str(self.caddy_path)],log=self.log)
        for unit,target in self.targets.items():
            need(not target.exists() and not target.is_symlink(),'DROPIN_APPEARED')
            if not target.parent.exists():
                sudo(['/usr/bin/install','-d','-o','root','-g','root','-m','0755',target.parent],log=self.log)
            trusted_directory(target.parent)
            source=self.stage/'config'/({'amazonia.service':'amazonia.conf',
                     'atelier-portail.service':'atelier-portail.conf','caddy.service':'caddy.conf'}[unit])
            sudo(['/usr/bin/install','-o','root','-g','root','-m','0644',source,target],log=self.log)
        self.backends_touched=True
        sudo(['/usr/bin/mv','--',AMAZONIA,self.stage/'retired-amazonia'],log=self.log)
        sudo(['/usr/bin/mv','--',self.prepared_code,AMAZONIA],log=self.log)
        sudo(['/usr/bin/systemctl','daemon-reload'],log=self.log)
        for unit,cwd in [('amazonia.service',AMAZONIA),('atelier-portail.service',PORTAL)]:
            raw=command(['/usr/bin/systemctl','show',unit,'--property=User,WorkingDirectory,ExecStart']).decode()
            values=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
            need(values.get('User')=='opc' and values.get('WorkingDirectory')==str(cwd) and
                 ('path='+str(self.node)+' ') in values.get('ExecStart',''),'EFFECTIVE_UNIT_MISMATCH')
        caddy_unit=command(['/usr/bin/systemctl','show','caddy.service','--property=ExecStart,ExecReload']).decode()
        need(caddy_unit.count(str(self.caddy_path))>=2,'CADDY_PERSISTENT_UNIT_MISMATCH')
        sudo(['/usr/bin/systemctl','restart','atelier-portail.service'],log=self.log)
        sudo(['/usr/bin/systemctl','start','amazonia.service'],log=self.log)
        # Read-only health probes; retry startup, not failed service deployments.
        import time
        end=time.monotonic()+30
        while True:
            try:
                if internal_status(3000,'/',self.key)==200 and internal_status(8083,'/api/v4/studies',self.key)==200:
                    break
            except OSError:
                pass
            need(time.monotonic()<end,'BACKEND_NOT_READY')
            time.sleep(.25)
        for port,route in [(3000,'/'),(8083,'/api/v4/studies')]:
            need(internal_status(port,route)==403 and internal_status(port,route,'00'*32)==403,'BACKEND_REFUSAL_FAILED')
        need(canonical(live_caddy())==canonical(self.caddy_before),'CADDY_CHANGED_BEFORE_RELOAD')
        sudo([CADDY,'reload','--config',self.caddy_path,'--address','127.0.0.1:2019'],log=self.log)
        self.caddy_activated=True
        self.progress('recette-lecture-et-refus')
        for route in ('/','/amazonia/api/v4/studies'):
            need(https_status(route)==401 and https_status(route,'wrong-fixture')==401 and
                 https_status(route,proof=self.key)==401 and https_status(route,self.password)==200,
                 'HTTPS_AUTH_RECIPE_FAILED')
        after=snapshots()
        for unit in SERVICES:
            need(after[unit]['ActiveState']=='active','SERVICE_NOT_ACTIVE_AFTER_RECOVERY')
        for unit in ('caddy.service','lora-studio.service','foret-lab.service'):
            need(after[unit]['MainPID']==self.before[unit]['MainPID'],'NEIGHBOR_PID_CHANGED')
        need(data_inventory(self.stage/'retired-amazonia/data')==self.original and
             data_inventory(HISTORY)==self.original,'ORIGINAL_DATA_CHANGED')
        need(git_head(AMAZONIA)==TARGET and git_head(PORTAL)==PORTAL_COMMIT,'FINAL_SOURCE_VERSION')
        result={'format':'ORACLE_RECOVERY_RECEIPT_1','success':True,'amazon_commit':TARGET,
                'portal_commit':PORTAL_COMMIT,'node':str(self.node),'node_version':'v24.22.1',
                'sourceHash':self.provenance['sourceHash'],'originalFiles':16,
                'originalsUnchanged':True,'protectedProxyPorts':[3000,8083],
                'neighborPortsUnchanged':[5050,8080,8082],
                'caddyAndNeighborsSamePID':True,'v4StudyDir':str(self.stage/'studies'),
                'legacyCampaignsCopy':str(self.stage/'data/campaigns'),
                'genericAmazoniaDeployer':'BLOCKED_BEFORE_MUTATION',
                'automaticCampaignStarted':False}
        new_file(self.stage/'report.json',json.dumps(result,indent=2)+'\n')
        self.progress('terminé')
        print('REMISE_EN_SERVICE_RÉUSSIE\nRAPPORT='+str(self.stage/'report.json'),flush=True)
        print('Accès : https://atelierconceptionjeu.fr ; utilisateur amazonia.',flush=True)
        print('Mot de passe dans '+str(self.stage/'operator-access.private.txt')+' — à lire en privé uniquement.',flush=True)
        print('Ne pas relancer le bouton générique de déploiement Amazonia : il reste bloqué préventivement.',flush=True)

    def fail(self):
        if self.backends_touched:
            try:
                sudo(['/usr/bin/systemctl','stop','amazonia.service','atelier-portail.service'],log=self.log)
            except Exception:
                print('ARRÊT DES BACKENDS NON CONFIRMÉ : arrêter amazonia et atelier-portail via sudo avant toute autre opération.',flush=True)
        if self.stage:
            report={'success':False,'phase':self.phase,'caddyProtectedConfigLoaded':self.caddy_activated,
                    'targetCommit':TARGET,'attemptPreserved':True}
            try:
                new_file(self.stage/'failure.json',json.dumps(report,indent=2)+'\n')
            except OSError:
                pass
        print('Tentative conservée. Aucun retour automatique vers une entrée non protégée.',flush=True)

    def close(self):
        if self.log:
            self.log.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-approved',action='store_true',help='Accord explicite du propriétaire pour ce lot')
    args=parser.parse_args()
    os.umask(0o077)
    recovery=Recovery()
    try:
        recovery.preflight()
        if not args.apply_approved:
            print('CONTRÔLES_RÉUSSIS_AUCUNE_ÉCRITURE ; activation uniquement avec accord explicite.')
            return 0
        recovery.backup()
        recovery.prepare_code()
        recovery.prepare_configs()
        recovery.activate()
        return 0
    except Exception as exc:
        # Fixed codes only. Never publish raw config, password, hashes, argv or logs.
        if recovery.log:
            recovery.log.write(traceback.format_exc().encode())
            recovery.log.flush()
        code=str(exc) if isinstance(exc,Stop) else 'UNEXPECTED_ERROR_SEE_PRIVATE_LOG'
        print('ARRÊT : '+code,flush=True)
        recovery.fail()
        return 1
    finally:
        recovery.close()

if __name__=='__main__':
    raise SystemExit(main())
