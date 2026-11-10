"""Construire le lanceur autonome depuis le checkout Amazonia. Python 3 + Node 24."""
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

here=Path(__file__).resolve().parent
root=here.parents[1]
modules=['v4/'+n for n in ('pressure','engine','types','config','observations','policies')]
modules+=['v4science/'+n for n in ('types','observations','policies','runner','measures')]
modules+=['scientific/random','sim/rng','sim/i18n','sim/types']
compiler=r"""
const {stripTypeScriptTypes}=require('node:module'),fs=require('node:fs');
let s=fs.readFileSync(process.argv[1],'utf8');
if(process.argv[1].endsWith('/sim/i18n.ts')) s=s.replace(/^import \{/, 'import type {');
process.stdout.write(stripTypeScriptTypes(s,{mode:'transform'}).replace(/from (["'])(\.[^"']+)\1/g,'from "$2.mjs"'));
"""
entry="""import sys, subprocess, tempfile, zipfile
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='amazonia-v41-') as tmp:
    with zipfile.ZipFile(sys.argv[0]) as z: z.extractall(tmp)
    sys.exit(subprocess.call([sys.executable,str(Path(tmp)/'campagne.py')]+sys.argv[1:]))
"""
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('__main__.py',entry)
    for mod in modules:
        z.writestr('moteur/'+mod+'.mjs',subprocess.check_output(
            ['node','--disable-warning=ExperimentalWarning','-e',compiler,str(root/'src'/(mod+'.ts'))]))
    for name in ('campagne.py','analyse.py','protocole.md'):
        z.write(here/name,name)
    z.write(root/'design/V41_PRESSION_MACHINES.md','regles.md')
    docs=['design/VISION.md','design/Amazonia_v4_specification_regles.md','design/V4_DECISIONS.md','docs/V4_SCIENTIFIC.md','docs/V4_MEASURES.md']
    z.writestr('base.json',json.dumps({p:(root/p).read_text() for p in docs},ensure_ascii=False))
    z.writestr('monde.mjs',(here/'monde.mjs').read_text().replace('../../src/','./moteur/').replace(".ts';",".mjs';"))
