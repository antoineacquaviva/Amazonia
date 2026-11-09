# Amazonia V4 scientifique — installation privée depuis GitHub

Le kit est maintenant accessible depuis GitHub, sans fichier à récupérer dans
un ancien workspace Codex et sans connexion à ChatGPT sur le PC.

**Pas encore déployé sur Oracle.** Les tests décrits plus bas utilisent des
environnements jetables ; ils ne prouvent pas les droits ou performances Oracle.

## 1. Ouvrir la session Oracle habituelle

Utiliser le moyen SSH déjà connu pour le compte **opc**. Ce document ne fournit
ni adresse, ni clé, ni nouvel accès. Le PC doit permettre SSH en plus de GitHub.

Node 24 et npm doivent être disponibles. Le bloc recherche d'abord, en lecture
seule, le runtime préparé :
/home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin/node.
S'il n'est pas trouvé, il demande son chemin dans le terminal. Rien dans P
n'est modifié et /usr/bin/node n'est pas remplacé.

Prérequis : Python 3.9+, Linux avec /proc, systemctl lisible sans sudo,
accès HTTPS à raw.githubusercontent.com et au registre npm utilisé par le
lockfile. Au moins 4 Gio de marge plus les sources et 30 000 inodes libres
sont contrôlés avant les écritures importantes. Ce budget conservateur ne
remplace pas le suivi du disque pendant de longues campagnes.

## 2. Coller ce seul bloc dans Oracle

Le bloc télécharge une archive de sources figée, vérifie son SHA256 **avant
tout code téléchargé**, puis lance l'installation. Les échecs sont conservés
dans de nouveaux dossiers privés, sans écrasement ni purge.

~~~bash
python3 - <<'PY'
import hashlib
import io
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

os.umask(0o077)
if os.geteuid() == 0 or pwd.getpwuid(os.getuid()).pw_name != "opc":
    raise SystemExit("Compte opc requis, sans sudo.")
if shutil.disk_usage(Path.home()).free < 4 * 1024**3:
    raise SystemExit("Moins de 4 Gio libres : arrêt, aucune purge.")
URL = "https://raw.githubusercontent.com/antoineacquaviva/Amazonia/9da82c2834e5e5cdefd408e2141378b310c19155/distribution/amazonia-v4-fcefe35.tar.gz"
SHA = "f7e819ebe4062bab42ad7c6cde284b7dc14169495acc533cd133738f768d7e3d"
with urllib.request.urlopen(URL, timeout=45) as response:
    raw = response.read(64 * 1024 * 1024 + 1)
if len(raw) > 64 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != SHA:
    raise SystemExit("Archive incorrecte : aucun code téléchargé exécuté.")
stage = Path(tempfile.mkdtemp(prefix="amazonia-v4-download-", dir=Path.home()))
bundle = stage / "amazonia-v4-fcefe35.tar.gz"
bundle.write_bytes(raw)
print("Téléchargement vérifié ; dossier privé :", stage, flush=True)
with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
    for name in ("oracle-v4-install.py", "v4_kit.py"):
        member = archive.getmember("scripts/" + name)
        if not member.isfile() or member.size > 256 * 1024:
            raise SystemExit("Installateur invalide.")
        (stage / name).write_bytes(archive.extractfile(member).read())
keep = ("HOME", "PATH", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS", "V4_NODE", "V4_PORT")
env = {k: os.environ[k] for k in keep if k in os.environ}
env.update(V4_BUNDLE=str(bundle), V4_BUNDLE_SHA256=SHA)
raise SystemExit(subprocess.run(
    [sys.executable, "-B", str(stage / "oracle-v4-install.py")], env=env
).returncode)
PY
~~~

L'installation crée exclusivement une nouvelle instance privée sous
/home/opc/amazonia-v4-science-..., installe les dépendances verrouillées, vérifie
typage/build, tous les fichiers de sources et la provenance, puis exécute
**56 parties de recette** dans un stockage distinct : sept familles × huit
variantes × une unité, 3 joueurs, 8 tours, 16 positions, ordre J1–J2–J3.
Le plan et les graines sont ceux du pilote réduit versionné, fixés avant calcul.
Cette recette exploratoire ne démontre pas l'équilibrage.

Elle vérifie en lecture seule l'état et le PID des cinq services connus avant
et après, sans les relancer. Si l'état initial est inattendu ou a changé,
elle s'arrête ; elle ne corrige aucun voisin. Un succès affiche INSTANCE et PORT.

## 3. Ouvrir l'interface depuis le PC

Garder les valeurs INSTANCE et PORT affichées. Dans **un second terminal du PC**,
ouvrir le tunnel existant, en remplaçant PORT et ALIAS_SSH par leurs valeurs :

~~~bash
ssh -N -L PORT:127.0.0.1:PORT ALIAS_SSH
~~~

Puis ouvrir **http://127.0.0.1:PORT**. Le port client doit être le même, car les
mutations vérifient cette origine exacte. Si le port client est occupé, ne pas
arrêter un autre programme sans l'identifier ; demander un port d'instance adapté.
Ne pas ouvrir de port public pour éviter le tunnel.

Utilisateur HTTP : **amazonia**. Dans votre session SSH privée, lire le mot de
passe dans **INSTANCE/runtime/access.key**, par exemple avec cat et le chemin
INSTANCE réellement affiché. Ne pas le coller dans GitHub, dans une URL ou ici.

Choisir **V4 expérimentale**, puis le mode **campagne scientifique durable**.
Le calcul se poursuit si le navigateur ou le tunnel ferme ; rouvrir le tunnel
pour retrouver l'état. Le serveur reste lié uniquement à 127.0.0.1.

## 4. État, arrêt, relance et données

Remplacer INSTANCE par le chemin réellement affiché :

~~~bash
INSTANCE/control.sh status
INSTANCE/control.sh stop
INSTANCE/control.sh start
INSTANCE/control.sh restart
~~~

Un PID n'est signalé qu'après vérification de son propriétaire, exécutable,
répertoire, arguments et instant de création. Une collision de port est refusée,
sans arrêter le programme qui l'occupe. Aucun arrêt forcé automatique.

Après interruption du processus, une campagne inachevée revient **PAUSED** :
sa reprise est une commande explicite dans l'interface. Aucune unité systemd
ou relance au redémarrage de la VM n'est installée.

- Campagnes : INSTANCE/runtime/studies (SQLite, WAL et SHM).
- Recette et exports : INSTANCE/exports/installation-smoke.
- Rapport partageable sans secret : INSTANCE/runtime/installation.json.
- Journaux privés : INSTANCE/runtime/installation.log et server.log.
- Sauvegarde/restauration sur cibles neuves : [V4_USE.md](V4_USE.md).

Ne pas copier seulement le fichier SQLite principal pendant une activité :
utiliser la sauvegarde cohérente existante. Ne pas supprimer les tentatives
ou les anciennes données. Retirer le déploiement signifie arrêter uniquement
cette nouvelle instance, en conservant ses données.

## Kit public, vérification et reproduction

- [Télécharger le kit](https://raw.githubusercontent.com/antoineacquaviva/Amazonia/9da82c2834e5e5cdefd408e2141378b310c19155/distribution/amazonia-v4-fcefe35.tar.gz)
- [SHA256](https://raw.githubusercontent.com/antoineacquaviva/Amazonia/9da82c2834e5e5cdefd408e2141378b310c19155/distribution/amazonia-v4-fcefe35.tar.gz.sha256)
- [Sources exactes](https://github.com/antoineacquaviva/Amazonia/tree/fcefe3568f753371354035ad0c365d488d8cfc75)

Archive : amazonia-v4-fcefe35.tar.gz — 191705 octets.
SHA256 : f7e819ebe4062bab42ad7c6cde284b7dc14169495acc533cd133738f768d7e3d.
Provenance des sources d'exécution : 312e210c4fcb0d969a1f454f0979994e5506ac9ba25d8aa4abccd31d41a0ee8a.

La session ne publie pas de GitHub Release : le kit est conservé comme fichier
versionné sous distribution/, avec liens épinglés sur un commit. Aucun ancien
asset n'est remplacé. Le SHA256 détecte une corruption ; téléchargé depuis
la même origine que l'archive, il n'est pas une signature indépendante.

Le kit contient 78 fichiers admis et un descripteur/manifestes. Sont exclus :
.git, fichiers .env, node_modules, historiques, bases, résultats détaillés,
archives Oracle, captures et logs. Le builder lit les blobs d'un commit Git propre
avec une liste d'admission ; il ne compacte jamais un workspace entier.

Pour reproduire à partir d'un checkout propre **au commit fcefe3568f753371354035ad0c365d488d8cfc75**,
avec ses dépendances déjà installées, choisir une destination absolue inexistante :

~~~bash
python3 -B scripts/v4-kit-build.py /chemin/neuf/amazonia-v4-fcefe35.tar.gz
~~~

Même commit et mêmes sources : mêmes octets d'archive et même checksum.
Un autre commit produit un nouveau descripteur et donc une autre archive ;
ne pas lui attribuer l'ancien checksum.

## Périmètre

Pas de sudo, nouvelle clé SSH, compte système, règle réseau ou exposition
publique. Aucun changement du portail, Caddy, LoRA, Forêt, BGA, services actifs,
historiques, sauvegardes ou artefacts P. Aucun changement des règles, bots ou
mesures scientifiques. L'installation Oracle effective reste à exécuter par
le propriétaire ; voir [le bilan de ce kit](V4_KIT_VALIDATION.md).
