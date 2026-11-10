#!/usr/bin/env python3
"""Campagne autonome Amazonia, Python 3.6+ et Node 24."""
import argparse
import concurrent.futures
import fcntl
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--smoke',action='store_true',help='Un monde par taille, dans un répertoire distinct')
    parser.add_argument('--workers',type=int,default=min(12,len(os.sched_getaffinity(0))))
    parser.add_argument('--node',help='Chemin explicite du Node 24 de la VM')
    args=parser.parse_args()
    if args.workers<1: parser.error('workers doit être positif')
    if not args.node:
        candidates=[shutil.which('node')]
        for exe in Path('/proc').glob('[0-9]*/exe'):
            try:
                node=os.readlink(str(exe))
                if Path(node).name=='node': candidates.append(node)
            except OSError: pass
        for folder, dirs, names in os.walk(str(Path.home())):
            depth=len(Path(folder).relative_to(Path.home()).parts)
            dirs[:]=[x for x in dirs if not x.startswith('.') and x not in ('node_modules','amazonia-v41-resultats') and depth<5]
            if 'instance.json' in names and Path(folder).name=='runtime':
                try: candidates.append(json.loads((Path(folder)/'instance.json').read_text()).get('V4_NODE'))
                except (OSError,ValueError): pass
        for node in candidates:
            if node and Path(node).is_file() and os.access(node,os.X_OK):
                try:
                    if subprocess.check_output([node,'-v']).startswith(b'v24.'):
                        args.node=node
                        break
                except OSError: pass
    if not args.node: parser.error('Indiquer le Node de l’instance avec --node /chemin/vers/node')
    runtime=subprocess.check_output([args.node,'-v']).decode().strip()
    if int(runtime.split('.')[0][1:])!=24: parser.error('Utiliser Node 24 (campagne source sous 24.22.1)')
    count=1 if args.smoke else 512
    out=Path.cwd()/('amazonia-v41-verification' if args.smoke else 'amazonia-v41-resultats')
    out.mkdir(exist_ok=True)
    lock=(out/'campagne.lock').open('a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    signature=hashlib.sha256()
    for p in sorted(list((ROOT/'moteur').rglob('*.mjs'))+[ROOT/'monde.mjs',ROOT/'regles.md',ROOT/'base.json',ROOT/'protocole.md',ROOT/'analyse.py',Path(__file__).resolve()]):
        signature.update(p.read_bytes())
    ident={'empreinte':signature.hexdigest(),'node':runtime,'mondes_par_table':count}
    manifest=out/'plan.json'
    if manifest.exists() and json.loads(manifest.read_text())!=ident:
        raise ValueError('Répertoire de résultats associé à une autre version')
    manifest.write_text(json.dumps(ident))
    def batch(job):
        n,start,size=job
        dest=out/('n%d-%d.jsonl.gz'%(n,start))
        if not dest.exists():
            data=subprocess.check_output([args.node,str(ROOT/'monde.mjs'),str(n),str(start),str(size)])
            lines=data.splitlines()
            assert len(lines)==size
            for i,line in enumerate(lines):
                row=json.loads(line)
                assert (row['n'],row['seed'],len(row['arms']))==(n,start+i,8)
            tmp=dest.with_suffix('.tmp')
            with gzip.open(str(tmp),'wb') as f: f.write(data)
            os.replace(str(tmp),str(dest))
        return dest
    jobs=[(n,71001+i,min(8,count-i)) for i in range(0,count,8) for n in range(3,7)]
    files=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for j,f in enumerate(concurrent.futures.as_completed([pool.submit(batch,x) for x in jobs]),1):
            files.append(f.result())
            print('%d/%d lots disponibles'%(j,len(jobs)),flush=True)
    from analyse import report
    print('Agrégation du bilan apparié…',flush=True)
    bilan=report(files,ident,ROOT,count)
    dest=out/'bilan-IA.json'
    tmp=out/'bilan-IA.tmp'
    tmp.write_text(json.dumps(bilan,ensure_ascii=False))
    os.replace(str(tmp),str(dest))
    print(dest,flush=True)

if __name__=='__main__':
    main()
