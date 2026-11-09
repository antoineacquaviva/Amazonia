# Installation Oracle privée — release V4 scientifique prête

**Préparée et testée localement ; non déployée sur Oracle.** Aucun accès SSH
Oracle n'est configuré dans cet environnement. Aucune phase P n'a été relancée.

Release exacte : `30da62749220f9396e7b3df64b4c06a424b01ae3`.
Archive livrée : `amazonia-v4-scientific-30da627.tar.gz`.
SHA256 de cette archive :
`c9a2c629b060dc994629fab6fa89cdfced1f12be518d2853ab43ac2f35be0a8a`.
SHA256 des sources d'exécution :
`537b9e9e3d58491410934df1d25af8a4ea36aed3ab27b5e162fb7ee8476cb9ad`.

Télécharger l'archive fournie avec la livraison, puis la transférer par le canal
existant : `scp amazonia-v4-scientific-30da627.tar.gz ALIAS_SSH:~/` et se connecter
avec `ssh ALIAS_SSH`. **ALIAS_SSH est celui déjà utilisé pour le compte opc**,
sans créer d'accès réseau. Le second seul paramètre manquant est le chemin absolu
du Node 24 préparé, avec npm disponible à côté. Aucun secret n'est demandé en chat.

Dans cette session `opc`, exécuter ce seul bloc Oracle :

```bash
set -euo pipefail
umask 077
export V4_BUNDLE="$HOME/amazonia-v4-scientific-30da627.tar.gz"
export V4_BUNDLE_SHA256="c9a2c629b060dc994629fab6fa89cdfced1f12be518d2853ab43ac2f35be0a8a"
read -r -p 'Chemin absolu du Node 24 préparé : ' V4_NODE
export V4_NODE
[[ "$(id -un)" == opc ]] || { echo 'Compte opc requis' >&2; exit 1; }
[[ "$(sha256sum "$V4_BUNDLE" | cut -d' ' -f1)" == "$V4_BUNDLE_SHA256" ]] || {
  echo 'Archive incorrecte : arrêt avant exécution' >&2; exit 1;
}
tar -xOf "$V4_BUNDLE" scripts/oracle-v4-install.sh | bash
```

Le script contrôlé figure dans
[scripts/oracle-v4-install.sh](../scripts/oracle-v4-install.sh). Il crée
exclusivement un nouveau dossier `~/amazonia-v4-science-XXXXXXXX`, sans sudo, puis
installe les dépendances verrouillées, vérifie typage/build et provenance, exécute
56 parties de recette dans un stockage distinct, génère sa clé privée en fichier
0600, choisit un port libre sur **127.0.0.1** et démarre un processus `nohup`.
Ressources initiales : un worker, lots de deux, une campagne active ; limite Node
parent 512 MiB de vieille génération, workers 256 MiB chacun. Ce ne sont pas des
limites absolues de RSS. Échec explicite si l'une des vérifications échoue ; aucun
nettoyage ou remplacement d'ancien dossier n'est effectué.

Le bloc affiche `INSTANCE` et `PORT`. Depuis le poste client, ouvrir le tunnel
**avec le même port local** : `ssh -N -L PORT:127.0.0.1:PORT ALIAS_SSH`, puis
`http://127.0.0.1:PORT`. Si ce port local est occupé, arrêter son propre tunnel ou
choisir une nouvelle instance/port libre ; ne pas changer les services voisins.
Utilisateur HTTP : **amazonia**. Lire le mot de passe uniquement dans le fichier
privé `INSTANCE/runtime/access.key` depuis la session SSH ; ne pas le placer dans
une URL, un argument de commande ou un export.

Contrôles : `INSTANCE/control.sh status`, `stop`, `start` ou `restart`. Le PID est
vérifié avant tout signal, pour ne jamais arrêter un voisin. Fermer SSH ne coupe
pas la campagne. Après relance du processus, une campagne interrompue reste
**PAUSED** jusqu'à une reprise explicite dans l'interface. Aucune unité systemd,
relance au démarrage de la machine, modification du portail/Caddy, règle réseau,
compte système ou exposition publique n'est ajoutée.

Les checkpoints de l'instance sont dans `INSTANCE/runtime/studies`, les exports
de recette dans `INSTANCE/exports/installation-smoke`. Pour les sauvegardes et
exports ultérieurs, utiliser de nouveaux chemins privés ; voir
[V4_USE.md](V4_USE.md). Ne jamais substituer ces fichiers à ceux de phase P.

Validation locale de cette release : extraction sans Git, `npm ci`, typage,
build, empreinte et commit reconnus ; processus détaché avec authentification
Basic en navigateur, refus anonyme, arrêt/relance, checkpoint PAUSED puis reprise
explicite jusqu'à quatre unités validées. La syntaxe des deux scripts shell est
vérifiée. Le compte opc, son binaire Node, les performances et permissions Oracle
restent à vérifier par le bloc ; aucun déploiement Oracle n'est déclaré réalisé.
