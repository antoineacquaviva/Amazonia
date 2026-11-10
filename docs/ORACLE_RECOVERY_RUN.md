# Exécution regroupée du lot Oracle autorisé

État attendu : Amazonia arrêté, portail et voisins actifs, versions et historiques
exactement décrits dans ORACLE_RECOVERY_PLAN.md. Un écart provoque un arrêt,
pas une réparation improvisée. La phase P reste inchangée. Ce bloc est réservé à un état initial intact,
avec anciens commits et aucun drop-in de récupération. Si l'échange du code a
déjà eu lieu, employer la reprise ciblée ORACLE_RECOVERY_RESUME.md, jamais ce bloc.

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
Les fichiers d'environnement sont installés root:root 0600 et la clé opc:opc 0400
dans un nouveau /etc/amazonia-recovery-*, root:opc 0750. restorecon ne vise que
ce dossier. Les drop-ins pointent vers ces fichiers ; deux sondes systemd testent
leur lecture et celle de la clé avant de changer les unités applicatives.

```sh
python3 - <<'PY'
import hashlib, os, sys, tempfile, urllib.request
from pathlib import Path
if os.geteuid() == 0 or Path.home() != Path('/home/opc'):
    raise SystemExit('Utiliser la session opc habituelle, sans sudo devant python3.')
os.umask(0o077)
dest = Path(tempfile.mkdtemp(prefix='amazonia-recovery-download-', dir=Path.home()))
base = 'https://raw.githubusercontent.com/antoineacquaviva/Amazonia/d1157e7cc8e37d500fcf700964e5b448e7dd2c89/scripts/'
files = {
    'oracle-recover.py': '1d72a4a000034787c6eb1daa1169c53a3a253df3fa8e5ebe7fdfc9bc213fc366',
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
