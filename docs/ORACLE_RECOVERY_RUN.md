# Exécution regroupée du lot Oracle autorisé

État attendu : Amazonia arrêté, portail et voisins actifs, versions et historiques
exactement décrits dans ORACLE_RECOVERY_PLAN.md. Un écart provoque un arrêt,
pas une réparation improvisée. La phase P reste inchangée.

Dans le terminal SSH habituel connecté sous `opc`, coller ce bloc une seule fois.
Le prompt sudo habituel peut apparaître. La préparation peut prendre plusieurs
minutes ; garder la session ouverte. Ce bloc télécharge les deux scripts depuis
le commit fixe indiqué et contrôle leurs empreintes avant toute exécution.
Le script effectue les sauvegardes, prépare le code et les configurations puis
redémarre le portail, démarre Amazonia et recharge Caddy dans le périmètre autorisé.
Il crée une copie root:root 0755 du seul binaire Node préparé dans un nouveau
dossier /usr/local/bin/amazonia-runtime-*/node, compare les empreintes, applique
restorecon uniquement à ce nouveau dossier puis teste cette copie sous systemd.
Le Node système, les liens globaux, les comptes et les artefacts P ne changent pas.
La tentative précédente arrêtée avant activation reste conservée ; ce nouveau
bloc utilise un nouveau dossier et refait ses contrôles, sans reprendre à l'aveugle.

```sh
python3 - <<'PY'
import hashlib, os, sys, tempfile, urllib.request
from pathlib import Path
if os.geteuid() == 0 or Path.home() != Path('/home/opc'):
    raise SystemExit('Utiliser la session opc habituelle, sans sudo devant python3.')
os.umask(0o077)
dest = Path(tempfile.mkdtemp(prefix='amazonia-recovery-download-', dir=Path.home()))
base = 'https://raw.githubusercontent.com/antoineacquaviva/Amazonia/db5c861663631c2951ceade8acf0065794725b47/scripts/'
files = {
    'oracle-recover.py': 'f0f7e1a797f528d7db97e0b1fb7e6cd04a6024d580c2f40d314c92ebc05d0ce8',
    'oracle-recovery-caddy.py': '3b79020bd1116c96570d40bda28c4e49fcfb8a964267d624ab573c75f567f2b8',
}
for name, expected in files.items():
    with urllib.request.urlopen(base + name, timeout=45) as response:
        data = response.read(200001)
    if len(data) > 200000 or hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit('Téléchargement refusé : empreinte incorrecte ; aucune activation.')
    with (dest / name).open('xb') as output:
        output.write(data)
os.execv(sys.executable, [sys.executable, '-B', str(dest / 'oracle-recover.py'), '--apply-approved'])
PY
```

Attendre `REMISE_EN_SERVICE_RÉUSSIE`. La sortie donne le chemin du rapport
expurgé et celui du fichier privé contenant le mot de passe du compte
`amazonia` pour https://atelierconceptionjeu.fr. Lire ce dernier uniquement dans
votre terminal privé ; ne pas le transmettre dans le chat ou GitHub.

Si le bloc s'arrête, transmettre seulement sa sortie expurgée. Ne pas relancer
le bouton générique Amazonia, le bloc, les services ou une restauration à l'aveugle.
Le lot ne lance aucune campagne : après confirmation du rapport Oracle, une
petite recette V4 puis une campagne bornée restent à effectuer dans l'interface.
