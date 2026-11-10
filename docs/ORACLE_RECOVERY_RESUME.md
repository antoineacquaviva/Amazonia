# Reprise ciblée de la tentative lg0r36_7

Ce bloc concerne uniquement /home/opc/amazonia-recovery-lg0r36_7, après le refus de
lecture du fichier d'environnement du portail. Les deux backends doivent rester
arrêtés ; Caddy, LoRA et Forêt actifs avec leurs PID initiaux. Le script contrôle
les versions, fichiers et empreintes avant toute intervention.

Il conserve les sauvegardes, le code échangé, les données et les secrets existants.
Il copie seulement les environnements et la clé dans un nouveau dossier privé
sous /etc, avec les contextes SELinux par défaut, puis teste les deux environnements
sous systemd. Ensuite il ajuste les deux drop-ins, démarre les applications,
recharge le candidat Caddy déjà validé et effectue la recette HTTPS et les refus.
Aucun changement de politique SELinux, de HOME, de Node global, de compte,
de voisin ou de phase P ; aucune campagne automatique.

Coller une seule fois sous opc dans la session SSH habituelle. Garder la session
ouverte. Le prompt sudo peut apparaître ; aucun mot de passe n'est affiché.

```sh
python3 - <<'PY'
import hashlib, os, sys, tempfile, urllib.request
from pathlib import Path
if os.geteuid() == 0 or Path.home() != Path('/home/opc'):
    raise SystemExit('Utiliser la session opc habituelle, sans sudo devant python3.')
os.umask(0o077)
dest = Path(tempfile.mkdtemp(prefix='amazonia-resume-download-', dir=Path.home()))
base = 'https://raw.githubusercontent.com/antoineacquaviva/Amazonia/d1157e7cc8e37d500fcf700964e5b448e7dd2c89/scripts/'
files = {
    'oracle-resume.py': 'c3fb44adc850a4a8813940da56cd13801f021e524db1324345384fe55c429358',
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
os.execv(sys.executable, [sys.executable, '-B', str(dest / 'oracle-resume.py'), '--apply-approved'])
PY
```

Attendre REMISE_EN_SERVICE_RÉUSSIE et transmettre la sortie expurgée. Le chemin
du fichier privé d'accès est affiché ; ne pas transmettre son contenu. Si un
contrôle échoue, ne pas recommencer le bloc ou une installation, ne pas utiliser
le bouton générique et ne pas démarrer les services séparément. Les journaux de
reprise restent privés dans le dossier de la tentative, sans effacer le précédent.

Validation : tests sur fichiers synthétiques, refus de dérive, mode sans activation,
sondes avant démarrage, secrets hors arguments et réutilisation du même lot.
Les opérations privilégiées sont simulées dans ces tests. Le workflow complet
contrôle aussi typage, moteur, build, kit, navigateur et vrai Caddy 2.11.7.
Le démarrage réel sous SELinux doit réussir sur Oracle avant de conclure.
