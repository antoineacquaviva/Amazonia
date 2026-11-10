"""IC normaux marginaux, influence du ratio calculée par monde apparié."""
import gzip
import json
import math
from pathlib import Path
from statistics import mean, stdev

PHASES = [(0, 2), (2, 5), (5, 8)]
RATIOS = {'succesA': ('coupes','actA'), 'succesB': ('terrassements','actB'),
          'BsurSouche': ('arriveesBSouche','attB'), 'paradeMenace': ('paradesMenaces','menaces')}
VARIANTS = ['V4','poursuite','sabotage','combinee']

def estimate(pairs):
    num, den = zip(*pairs)
    if not sum(den):
        return None
    value = sum(num) / sum(den)
    scale = mean(den)
    return value, [(x-value*y)/scale for x,y in pairs]

def linear(terms):
    if any(e is None for _,e in terms):
        return None
    value = sum(c*e[0] for c,e in terms)
    influences = [sum(v) for v in zip(*[[c*x for x in e[1]] for c,e in terms])]
    margin = 1.96*stdev(influences)/math.sqrt(len(influences)) if len(influences)>1 else None
    return {'estimation':value, 'IC95':None if margin is None else [value-margin,value+margin]}

def report(files, ident, root, count):
    output = {}
    for n in range(3,7):
        cells = {}
        seats = {}
        seeds = set()
        for path in sorted(files):
            if not path.name.startswith('n%d-'%n): continue
            with gzip.open(str(path),'rt') as stream:
                for line in stream:
                    row=json.loads(line)
                    assert row['n']==n and row['seed'] not in seeds
                    seeds.add(row['seed'])
                    assert {(a['opening'],a['variant']) for a in row['arms']} == {
                        (o,v) for o in ('libre','combat') for v in VARIANTS}
                    for a in row['arms']:
                        arm=(a['opening'],a['variant'])
                        seats.setdefault(arm,[]).append(a['pertesParSiege'])
                        for i,(lo,hi) in enumerate(PHASES):
                            turns=a['turns'][lo:hi]
                            total={k:sum(t[k] for t in turns) for k in turns[0]}
                            pairs={k:(total[x],total[y]) for k,(x,y) in RATIOS.items()}
                            for k,v in total.items(): pairs[k+'ParTour']=(v,hi-lo)
                            cols=cells.setdefault(arm+(i,),{})
                            for k,pair in pairs.items(): cols.setdefault(k,[]).append(pair)
        assert seeds==set(range(71001,71001+count))
        for o in ('libre','combat'):
            est={(v,i,k):estimate(p) for (opening,v,i),cols in cells.items() if o==opening
                 for k,p in cols.items()}
            group={'cellules':{},'contrastes':{},'pertesMoyennesParSiege':{}}
            output['%dJ/%s'%(n,o)]=group
            for v in VARIANTS:
                group['pertesMoyennesParSiege'][v]=list(map(mean,zip(*seats[o,v])))
                for i,(lo,hi) in enumerate(PHASES):
                    label='%s/T%d-%d'%(v,lo+1,hi)
                    group['cellules'][label]={k:linear([(1,est[v,i,k])]) for k in cells[o,v,i]}
                    primary=set(RATIOS)|{'coupesParTour','terrassementsParTour','pertesParTour'}
                    for k in sorted(primary):
                        e=est[v,i,k]
                        if v!='V4':
                            group['contrastes'][label+'/'+k+'/moinsV4']=linear([(1,e),(-1,est['V4',i,k])])
                        if i:
                            group['contrastes'][label+'/'+k+'/progression']=linear([(1,e),(-1,est[v,i-1,k])])
                        if v=='combinee':
                            group['contrastes'][label+'/'+k+'/interaction']=linear([
                                (1,e),(-1,est['poursuite',i,k]),(-1,est['sabotage',i,k]),(1,est['V4',i,k])])
    return {'version':'V41_PRESSION_1','execution':ident,'parties':count*32,
            'base':json.loads((root/'base.json').read_text()),
            'regles':(root/'regles.md').read_text(),'protocole':(root/'protocole.md').read_text(),
            'resultats':output}
