#!/usr/bin/env python3
"""Met à jour la seule unité Amazonia et lance le programme comparatif."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
LIVE = Path('/srv/jeu/amazonia')
UNIT = 'amazonia.service'
DROP = Path('/etc/systemd/system/amazonia.service.d/zz-v4-programme.conf')
RUNTIME = Path('/home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin')
GIB = 1024 ** 3


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def output(*args):
    return run(*args, stdout=subprocess.PIPE, text=True).stdout.strip()


def systemctl(*args):
    run('sudo', '-n', 'systemctl', *args)


def prop(name):
    return output('systemctl', 'show', UNIT, '-p', name, '--value')


def worker_budget(cpus, memory):
    # Keep two logical CPUs and at least 2 GiB free for the portal, OS and DB.
    return max(0, min(12, cpus - 2, (memory - 2 * GIB) // (512 * 1024**2)))


def snapshot_ready(root, table):
    database = root / 'orchestration.sqlite'
    require(database.is_file(), 'Base attendue absente : ' + str(root))
    with sqlite3.connect(database.as_uri()+'?mode=ro', uri=True) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        require(table in tables, 'Schéma de stockage inattendu')
        column = "$.record.status" if table == "campaigns" else "$.status"
        sql = "SELECT json_extract(body, '"+column+"') FROM " + table
        if table == 'campaigns':
            sql += ' WHERE deleted=0'
        statuses = [r[0] for r in db.execute(sql)]
        require(all(isinstance(s,str) for s in statuses),'Statut de campagne inconnu')
        require(not any(s in ('RUNNING','PAUSED','INTERRUPTED','QUEUED') for s in statuses),
                'Une campagne est active ou en attente de reprise dans ' + str(root))


def request(key, endpoint, body=None):
    origin = 'https://atelierconceptionjeu.fr'
    req = urllib.request.Request('http://127.0.0.1:8083/amazonia/api/'+endpoint,
        data=None if body is None else json.dumps(body).encode(),
        headers={'X-Atelier-Internal':key, 'Origin':origin, 'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def main():
    require(os.getuid() != 0 and Path.home() == Path('/home/opc'), 'Lancer sous opc')
    os.umask(0o077)
    state = Path.home() / 'amazonia-programme-operations'
    state.mkdir(mode=0o700, exist_ok=True)
    lock = (state / 'operation.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    require(ROOT != LIVE and ROOT.is_dir(), 'Utiliser le nouveau checkout')
    sha = output('git','-C',ROOT,'rev-parse','HEAD')
    require(not output('git','-C',ROOT,'status','--porcelain'), 'Le checkout doit être propre')
    require(prop('User')=='opc' and prop('ActiveState')=='active' and prop('WorkingDirectory')==str(LIVE),
            'Unité Amazonia différente de la configuration attendue')
    pid=int(prop('MainPID'))
    env=dict(item.split('=',1) for item in Path('/proc',str(pid),'environ').read_bytes().decode().split('\0') if '=' in item)
    science=Path(env['V4_STUDIES_DIR']).resolve(strict=True)
    legacy=Path(env['AMAZONIA_CAMPAIGNS_DIR']).resolve(strict=True)
    require(all(d.is_absolute() and LIVE not in d.parents and d!=LIVE for d in (science,legacy)),'Données externes requises')
    key=Path(env['ATELIER_INTERNAL_KEY_FILE']).read_text().strip()
    require(re.fullmatch('[0-9a-f]{64,128}',key),'Identité interne incorrecte')
    def launch():
        path=state/(sha+'.request')
        if not path.exists(): path.write_text(str(uuid.uuid4()))
        row=request(key,'v4/studies/programs',{'id':path.read_text().strip(),'repeats':128})
        require(row['status'] in ('RUNNING','COMPLETED'), 'Programme enregistré : '+str(row))
        print('Campagne',row['id'],row['status'],row['completed'],'/',row['total'],flush=True)
    if output('git','-C',LIVE,'rev-parse','HEAD') == sha:
        require(DROP.is_file(),'Révision déjà présente avec un autre réglage des workers')
        launch()
        return
    require(not DROP.exists() and not DROP.with_suffix('.env').exists(),'Une autre mise à jour du programme est déjà configurée')
    snapshot_ready(science,'v4_studies')
    snapshot_ready(legacy,'campaigns')
    require(shutil.disk_usage(science).free >= 8*GIB,'Prévoir 8 Gio disponibles sur le stockage scientifique')
    available=int(re.search(r'^MemAvailable:\s+(\d+)',Path('/proc/meminfo').read_text(),re.M)[1])*1024
    maximum=prop('MemoryMax')
    if maximum.isdigit():
        current=prop('MemoryCurrent')
        require(current.isdigit(),'Mémoire systemd non mesurable')
        available=min(available,max(0,int(maximum)-int(current)))
    workers=worker_budget(len(os.sched_getaffinity(pid)), available)
    require(workers>=1,'Ressources disponibles insuffisantes')
    require((RUNTIME/'npm').is_file() and (RUNTIME/'node').is_file(), 'Runtime de préparation Node 24 introuvable')
    node=Path('/proc',str(pid),'exe').resolve(strict=True)
    require(output(node,'--version').startswith('v24.') and output(node,'--version')==output(RUNTIME/'node','--version'),'Node 24 identique requis')
    stage=Path(tempfile.mkdtemp(prefix='version-',dir=state))
    cp=stage/'candidate'
    run('git','clone','--quiet','--no-local','--no-hardlinks',ROOT,cp)
    require(output('git','-C',cp,'rev-parse','HEAD')==sha,'Révision candidate incorrecte')
    run('git','-C',cp,'remote','set-url','origin','https://github.com/antoineacquaviva/Amazonia.git')
    # Keep historical Node/npm and its configuration files untouched.
    buildenv={**os.environ,'PATH':str(RUNTIME)+':'+os.environ['PATH'],'NODE_ENV':'production'}
    for name in ('USERCONFIG','GLOBALCONFIG'):
        config=stage/(name+'.npmrc');config.touch()
        buildenv['NPM_CONFIG_'+name]=str(config)
    buildenv['NPM_CONFIG_CACHE']=str(stage/'npm-cache')
    for args in [('ci','--include=dev','--no-audit','--no-fund'),('run','lint'),('run','build')]:
        run(RUNTIME/'npm',*args,cwd=cp,env=buildenv)
    settings=stage/'workers.env'
    settings.write_text('V4_WORKERS=%d\nV4_MAX_ACTIVE=1\nV4_BATCH_SIZE=4\n'%workers)
    conf=stage/'workers.conf'
    print(f'Version {sha}, {workers} workers, sauvegardes et retour arrière dans {stage}',flush=True)
    run('sudo','-v')
    retired=LIVE.parent/('amazonia-avant-'+stage.name)
    candidate=LIVE.parent/('amazonia-candidat-'+stage.name)
    require(not retired.exists() and not candidate.exists() and not DROP.exists(),'Destination existante')
    run('sudo','-n','cp','-a','--',cp,candidate)
    require(output('git','-C',candidate,'rev-parse','HEAD')==sha,'Copie candidate incorrecte')
    moved=False; installed=False; changed=False
    try:
        systemctl('stop',UNIT)
        snapshot_ready(science,'v4_studies');snapshot_ready(legacy,'campaigns')
        for folder,label in [(science,'science'),(legacy,'historique')]:
            run(node,'--import','tsx','scripts/v4-study-backup.ts','backup',folder,stage/label,cwd=LIVE)
        run('sudo','-n','mv','--',LIVE,retired);moved=True
        run('sudo','-n','mv','--',candidate,LIVE);installed=True
        if shutil.which('restorecon'): run('sudo','-n','restorecon','-R',LIVE)
        # Keep systemd configuration and its secondary env file root-owned under /etc.
        extra=DROP.with_suffix('.env')
        require(not extra.exists(),'Fichier de configuration existant')
        run('sudo','-n','install','-m','0644',settings,extra)
        changed=True
        conf.write_text('[Service]\nEnvironmentFile='+str(extra)+'\n')
        run('sudo','-n','install','-m','0644',conf,DROP)
        if shutil.which('restorecon'): run('sudo','-n','restorecon',extra,DROP)
        systemctl('daemon-reload');systemctl('start',UNIT)
        for _ in range(40):
            try:
                request(key,'v4/studies/programs');break
            except OSError: time.sleep(1)
        else: raise RuntimeError('Le nouveau serveur ne répond pas')
        newpid=int(prop('MainPID'))
        require(('V4_WORKERS='+str(workers)).encode() in Path('/proc',str(newpid),'environ').read_bytes().split(b'\0'),'Nombre de workers non appliqué')
    except BaseException:
        systemctl('stop',UNIT)
        if installed: run('sudo','-n','mv','--',LIVE,candidate)
        if moved: run('sudo','-n','mv','--',retired,LIVE)
        if changed: run('sudo','-n','rm','-f','--',DROP,DROP.with_suffix('.env'))
        systemctl('daemon-reload');systemctl('start',UNIT)
        raise
    # A lost launch response may mean the program is already running.
    # Retry the same ID on the next invocation, without rolling back committed work.
    launch()


if __name__=='__main__':
    main()
