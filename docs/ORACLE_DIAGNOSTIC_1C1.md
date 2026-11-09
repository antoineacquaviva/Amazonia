# Mission 1C.1 — diagnostic Oracle préparé, sans déploiement

## État de cette livraison

Les documentations Amazonia `SECURITY_DEPLOYMENT_1B4.md`,
`PORTAL_INTEGRATION_1B5.md` et portail `docs/INTEGRATION_1B5.md` ont été lues
avant la préparation. Base Amazonia : `efdb787ad3edad845dfc60c6124f6bca2cd4dd6e`
(fusion de #6). Documentation portail consultée sur main, blob
`8b3a38992dc10740205246cfd166e58c36d22d26`.

L'environnement Codex disponible n'est pas la VM Oracle. Aucun secret, identité
sortante, accès SSH Oracle ou route TCP privée n'y est configuré. Aucun accès
Oracle autorisé n'est donc établi ; aucune connexion SSH, sonde publique ou
requête applicative n'a été tentée. Aucun contournement demandé ou essayé.
Les fusions GitHub ne prouvent aucune version déployée.

La livraison contient uniquement le script et cette procédure. Aucun changement
des règles, moteurs, bots, données, dépendances ou configurations de service.
La branche et la PR de diagnostic ne doivent pas être fusionnées automatiquement.

## Procédure pour le propriétaire

1. Faire relire le script et valider son exécution. Cette validation concerne le
   diagnostic seulement ; elle n'autorise aucun déploiement.
2. Ouvrir sa session habituelle sur Oracle avec son accès existant, sans nous
   communiquer de clé SSH. Si aucun accès n'existe, s'arrêter ici.
3. Transférer manuellement le script relu dans son dossier personnel sous le nom
   `oracle-readonly-diagnostic.sh`. Ce transfert crée ce seul fichier ; il est
   distinct du diagnostic. Ne pas faire de mise à jour Git du site pour l'obtenir.
4. Dans cette session Oracle, exécuter exactement :

   ```bash
   bash --noprofile --norc "$HOME/oracle-readonly-diagnostic.sh"
   ```

   Aucun `chmod`, installation ou `sudo` nécessaire. Le script refuse root.
   Ne pas utiliser `bash -x`, ne pas le sourcer. La sortie reste dans le terminal :
   aucune redirection ni fichier de rapport créé par le script.
5. Copier la sortie entre les marqueurs début/fin après relecture. Masquer au
   besoin noms d'unités, comptes, chemins et volumes internes avec des alias
   cohérents. Ne jamais ajouter une configuration, un log brut ou un secret.

Le premier passage donne ressources, unités et écoutes. Il ne devine pas les
chemins. Après identification privée des vrais chemins/unités, un second passage
peut ajouter des options répétables. Syntaxe illustrative uniquement :

```text
bash --noprofile --norc "$HOME/oracle-readonly-diagnostic.sh" \
  --unit NOM_REEL.service --repo /CHEMIN_REEL_DU_CODE \
  --data /CHEMIN_REEL_DES_CAMPAGNES --backup /CHEMIN_REEL_DES_SAUVEGARDES \
  --node /CHEMIN_REEL_DU_BINAIRE_NODE
```

Remplacer les exemples avant exécution. Indiquer aussi le portail et chaque autre
outil avec leurs propres `--unit` et `--repo`. Fournir plusieurs `--data` si des
historiques sont dans un ancien checkout. Aucun chemin par défaut n'est supposé
exister. Ne jamais mettre un secret dans un argument. `--node` doit désigner un
binaire Node de confiance déjà installé, identifié par l'opérateur ; le script
l'exécute pour sa version et un import de module, sans ouvrir aucune base,
même en mémoire. Ne pas fournir un script npm ou un exécutable inconnu.

## Ce que fait le script

Il appelle des commandes d'observation système et affiche seulement des champs
choisis. Il ne lit pas les environnements, lignes de commande complètes,
fichiers d'authentification, Caddyfiles, unités brutes, registres, JSON de
campagnes ou fichiers SQLite. Il ne contacte ni API, ni service HTTP, ni API
admin Caddy ; ne lance pas l'application, le gestionnaire ou l'outil de backup.

Les chemins de processus viennent de `/proc/PID/exe` et `cwd`, sans `cmdline`.
Les adresses d'écoute sont remplacées par loopback/toutes interfaces/autre
interface, avec protocole et port. Les compteurs de stockage portent sur deux
niveaux du répertoire explicitement indiqué, sans suivre les liens ni franchir
les montages. Aucun nom de campagne n'est publié. SQLite/WAL/SHM sont seulement
dénombrés par nom : aucun fichier n'est ouvert par SQLite.

Aucune commande d'écriture, gestion de service, migration ou installation n'est
exécutée. Comme toute observation sur un système vivant, les lectures peuvent
actualiser des métadonnées d'accès selon le montage ; le système peut journaliser
l'exécution et les services continuent leur activité. Ce n'est pas une acquisition
forensique garantissant zéro écriture du système entier.

## Informations obtenues et limites

| Sujet | Script | Ce qui reste inconnu |
|---|---|---|
| Linux / architecture / ressources | ID/version OS, architecture, CPU logiques, RAM, espace et inodes racine et volumes indiqués | Charge future et dimensionnement réel des campagnes |
| systemd | Unités chargées/installées ; pour les unités choisies : état, utilisateur/groupe, cwd, PID et exécutable observables | ExecStart exact, wrappers, enfants, PM2/conteneurs, privilèges effectifs ; erreurs d'accès signalées |
| Node | Chemin réel du processus principal ; version et import sqlite pour les binaires explicitement choisis | Le rapprochement service/binaire, Node 24 absent du PATH, compatibilité ABI/libc si binaire non testé ; import réussi ne prouve pas le stockage utilisable |
| Versions | HEAD des checkouts indiqués | Modifications locales, artefacts dist, release vraiment servie, version affichée du portail |
| Réseau | Écoutes TCP/UDP IPv4/IPv6, port et portée locale | Correspondance précise port/service, pare-feu hôte et règles OCI |
| Données | Modes/UID/GID du répertoire, volume, comptages JSON/SQLite/WAL/SHM/quarantine/marqueur/liens | Emplacement effectif tant que non confirmé ; état RUNNING/PAUSED/interrompu, écrivain unique, contenu/intégrité et provenance |
| Sauvegardes | Métadonnées et capacité des emplacements connus indiqués | Inventaire des archives non reconnues, validité, taille nécessaire, rétention, copie hors VM, restauration réellement testée |
| Caddy / portail / autres outils | État/PID/exécutable via les unités choisies | Config active, version Caddy, routes, Basic, secrets privés, registre, déploiement actuel, compatibilité fonctionnelle |

Un refus d'accès ne prouve pas une absence. Une unité active ne prouve pas la santé
applicative. La présence de WAL/SHM ne prouve ni corruption ni activité ; leur
absence ne prouve pas l'absence d'écrivain. Aucun état de campagne n'est déduit
de leur date ou de l'état systemd. Les résultats ne sont pas un instantané atomique.

## Vérification manuelle distincte, à approuver avant intervention privilégiée

Cette liste est une proposition de revue locale par le propriétaire ou son
administrateur. Le script ne l'exécute pas et ne demande jamais de privilèges.
Si un élément exige plus de droits, noter « inconnu — droits supplémentaires
nécessaires » et faire approuver séparément sa consultation en lecture seule.
Ne pas transmettre les fichiers consultés, seulement les conclusions ci-dessous.

- **Services et comptes** : relever localement le lancement exact et tous les
  superviseurs/enfants ; identifier Node réel de chaque backend, chemin de code,
  compte dédié, groupes et permissions de chaque parent. Vérifier un seul écrivain
  Amazonia sans ouvrir la base, et confirmer backend Node ou serveur statique.
  Ne pas publier ExecStart, Environment, EnvironmentFile ou `/proc/*/environ`.
- **Caddy actif** : identifier le binaire et sa version, le fichier utilisé par
  le processus, les imports et éventuel démarrage `--resume` ; ne pas confondre
  fichier sur disque et configuration en mémoire. Relever sous forme de tableau
  hôte/sous-chemin/service/port/retrait du préfixe/protection, sans valeurs de
  headers ou identifiants. Inclure www, `/api`, slash final, redirects et routes
  propres aux autres outils. Si impossible de prouver la config active, le noter.
  Ne pas appeler l'API admin, `caddy adapt`, `validate` ou `reload` pendant ce
  diagnostic : configuration développée et logs peuvent révéler des secrets.
- **Portail réel** : examiner en privé le registre local, les scripts de
  déploiement et unités/drop-ins. Rapporter uniquement alias, port, sous-chemin,
  chemin de code/données et mode Git/ZIP/statique/backend ; jamais commandes
  build/exec, logs, URL de dépôt contenant des credentials ni registre complet.
  Comparer version affichée déjà connue, HEAD et artefact ; les défauts du code
  GitHub ne constituent pas un inventaire Oracle.
- **Données** : confirmer les racines effectives (dont anciens JSON/quarantaines),
  montages persistants et séparation du checkout. Pour les campagnes actives ou
  interrompues, utiliser seulement une information déjà connue du propriétaire.
  Sinon laisser inconnu : ne pas lancer de gestionnaire, API ou lecture SQLite
  pour compléter le rapport. Aucun essai de reprise.
- **Préparation 1B.5** : constater seulement présence/type/mode/propriétaire et
  accès des dossiers parents des fichiers privés déjà identifiés, sans lire leurs
  contenus. Clés portail/Amazonia : fichiers absolus canoniques réguliers sans
  lien, 0400/0600, comptes séparés ; EnvironmentFile Caddy root-owned 0600.
  Valeurs attendues, à préparer dans une mission ultérieure :
  `ATELIER_BASIC_USER`, `ATELIER_BASIC_HASH`, `ATELIER_INTERNAL_KEY` côté Caddy ;
  `ATELIER_INTERNAL_KEY_FILE` et `ATELIER_PUBLIC_ORIGINS` côté backends ;
  `AMAZONIA_NODE_BINARY` côté portail et `AMAZONIA_CAMPAIGNS_DIR` identique des
  deux côtés, externe au code, avec `NODE_ENV=production` côté Amazonia.
  Ne pas générer de clé/hash, comparer/lire de secrets ou modifier de permissions.
  Présence de fichiers ne prouve pas égalité des clés ni chargement effectif.
- **Réseau et outils voisins** : revue privée des règles OCI et pare-feu hôte,
  IPv6 inclus, sans export intégral. Recenser les outils ayant leur propre
  `Authorization`, headers réservés, API racine dépendant du Referer, cookies
  partagés, redirects, uploads, WebSocket/SSE. Prévoir leur recette future ;
  ne pas lancer de tests fonctionnels pendant les campagnes.

## Sauvegarde et restauration à préparer ultérieurement

Aucune sauvegarde ni restauration n'est exécutée par cette mission. Un simple
copier-coller du fichier SQLite actif n'est pas une sauvegarde cohérente : le WAL
doit être pris en compte via l'API backup prévue en 1B.4, dans une intervention
autorisée séparément. Les historiques externes nécessitent aussi une cohérence
multi-fichiers ; leur copie peut exiger un arrêt autorisé. Pour une ancienne
version JSON seule : copie complète à l'arrêt, sans créer de base pour sauvegarder.

Prévoir destination nouvelle, place pour données + WAL + copie/archives et marge,
inodes, copie hors VM, manifeste/empreintes, contrôle d'intégrité et restauration
isolée testée. Le diagnostic ne calcule pas une taille complète ni un seuil
universel de capacité : l'inventaire et le besoin restent à confirmer.
Conserver code exact, dépendances, artefacts, configurations privées protégées,
propriétaires et provenance scientifique.

Restaurer exige arrêt approuvé de tous les écrivains, préservation de l'état
courant, nouveau répertoire propre et versions compatibles. Ne jamais supprimer
le bail actif, mélanger d'anciens WAL/SHM, écraser l'original ou fusionner des bases.
Les campagnes postérieures à la sauvegarde restent à archiver séparément.
Les checkpoints antérieurs à 1B.4 peuvent refuser la reprise : ne pas falsifier
leur manifeste ; conserver l'ancienne release et vérifier sur copie.

## Risques du code consulté, sans correction dans cette mission

- Le portail main `server.ts`, fonction `loadToolsRegistry`, appelle
  `saveToolsRegistry(DEFAULT_TOOLS)` si registre absent/invalide/vide. Ce dernier
  utilise `writeFileSync`. Une lecture applicative ne constitue donc pas une
  observation garantie sans écriture. Ne pas lancer le portail ni ses endpoints
  overview/diagnose pour cet inventaire. Source consultée : blob
  `f4d4604843600f8487ce12931bb07ef7dc655298`, lignes 114–143.
- Le déploiement Git et les scripts npm peuvent exécuter du code ; les opérations
  Git destructives et un remplacement de checkout peuvent perdre des données
  placées dans le code. Le stockage doit être identifié et protégé avant toute
  bascule. Un reset Git ou une restauration du seul dist ne protège pas les données.
- La documentation portail confirme l'incompatibilité d'un `Authorization`
  applicatif avec Basic commun sur le même header ; le retrait du repli Referer
  peut casser les clients appelant `/api` hors sous-chemin. Recette de chaque outil
  indispensable ; les tests sur outil témoin ne valident pas les outils Oracle.
- La clé partagée donne des droits d'administration ; les outils de même origine
  partagent le risque XSS. Basic ne fournit ni logout universel ni protection
  anti-bruteforce réseau. Ces limites documentées ne prouvent pas une exposition
  actuelle sur Oracle. Ne pas rétablir une entrée ouverte lors d'un rollback.

Les indications anciennes de 1B.4 sur l'adaptateur encore absent sont historiques :
1B.5 décrit l'adaptateur partagé livré ensuite. Cela ne prouve pas son activation.

## Modèle à transmettre à ChatGPT

```text
MISSION 1C.1 — DIAGNOSTIC UNIQUEMENT
Date/heure UTC :
Exécuté sur Oracle par le propriétaire : oui / non
Options employées (alias possibles, aucun secret) :
Sortie relue et expurgée : [coller entre les marqueurs début/fin]

Constats privés (répondre inconnu si non vérifié) :
- Amazonia : unité / compte / chemin code / HEAD / backend ou statique :
- Portail : unité / compte / chemin code / HEAD / version affichée connue :
- Node du service : chemin / version / import sqlite / rapprochement confirmé :
- Campagnes : racines / hors checkout / persistance / propriétaire :
- États déjà connus : nombre actives / interrompues / source du constat :
- Un seul écrivain confirmé sans ouvrir SQLite : oui / non / inconnu :
- Routes Caddy : alias outil | hôte | sous-chemin | port | préfixe retiré | auth :
- Config active Caddy identifiée / version / API admin activée :
- Autres outils à préserver et modes d'auth (jamais leurs valeurs) :
- Pare-feu hôte/OCI et IPv6 vérifiés :
- Fichiers privés : présence / modes / propriétaires / droits des parents seulement :
- Sauvegardes : alias emplacement / capacité / hors VM / dernière restauration testée :
- Déploiement actuel : Git / ZIP / autre / inconnu ; données exposées à un remplacement :
- Vérifications impossibles et droits supplémentaires nécessaires :
- Autres inconnues / risques constatés :
Aucun déploiement, arrêt, migration ou campagne de recette autorisé par ce rapport.
```

## Points bloquants avant toute proposition de déploiement

1. Versions servies, lancement réel, registre/routage/protections et outils voisins
   non établis ; risque de casser ou d'exposer un outil existant.
2. Campagnes en cours, stockage persistant hors code et écrivain unique inconnus.
3. Sauvegarde cohérente hors VM et restauration isolée compatible non démontrées.
4. Node 24 réel (référence de recette 24.22.1), import sqlite, capacité, comptes,
   permissions, Basic et fichiers privés non confirmés dans les services réels.
5. Compatibilité des autres outils, fermeture des ports et plan coordonné de
   bascule/retour arrière conservant l'authentification à valider.

Après réception : analyser le rapport avec ChatGPT, résoudre les inconnues, puis
attendre explicitement la validation du propriétaire avant toute intervention
de déploiement. Cette procédure ne constitue pas cette validation.

## Validation effectuée dans Codex uniquement

- `bash -n scripts/oracle-readonly-diagnostic.sh` et `git diff --check` : réussis.
- Exécution locale avec fixtures temporaires : JSON, SQLite factice, WAL/SHM,
  quarantaine, marqueur, lien et chemin absent ; comptages attendus, secret témoin
  absent de la sortie, contenu/modes/propriétaires/tailles/mtime inchangés.
- Arguments invalides refusés ; révision du checkout correctement relevée ;
  import `node:sqlite` sous Node 24.22.1 réussi sans ouverture de base.
- Commandes systemd et ss simulées : seules les propriétés prévues sont demandées,
  descriptions sensibles exclues, IPv4/IPv6 classées et adresses masquées ;
  un `NODE_OPTIONS` avec preload invalide n'est pas transmis au binaire Node.

Ces contrôles ne sont pas des observations Oracle. Les suites applicatives
TypeScript/build ne sont pas exécutées pour ces deux fichiers Bash/Markdown ;
aucun code applicatif ni dépendance n'a changé.
