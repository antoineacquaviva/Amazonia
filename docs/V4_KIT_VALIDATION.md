# Kit Oracle V4 — validation du 9 novembre 2026

## Livraison

Le kit public est versionné dans distribution/amazonia-v4-fcefe35.tar.gz.
Ses sources exactes sont fcefe3568f753371354035ad0c365d488d8cfc75 ; les commits
suivants ajoutent des tests, le fichier distribué et la notice sans changer
les fichiers d'exécution inclus dans l'archive.

SHA256 de l'archive :
f7e819ebe4062bab42ad7c6cde284b7dc14169495acc533cd133738f768d7e3d.

Provenance scientifique des sources :
312e210c4fcb0d969a1f454f0979994e5506ac9ba25d8aa4abccd31d41a0ee8a.

191 705 octets compressés. 78 fichiers sources admis, plus .release.json et
.kit-manifest.json. Aucun changement de règle, bot, mesure ou protocole.
Les scripts d'installation font partie de l'empreinte existante : cette
livraison a donc sa propre provenance ; ne pas modifier les anciennes
campagnes ou leur attribuer cette version.

## Vérifications locales

- 10 tests Python réussis : contenu exact/reproductibilité, données exclues,
  checksum, membres malveillants, destination existante, disque/inodes,
  collision de port, environnement filtré et garde opc/services.
- Build Vite réussi ; vérification TypeScript JavaScript 5.9.3 réussie.
- Le typage natif 7 et certains tests du projet ne peuvent pas fonctionner
  normalement dans le sandbox local sans /proc (notamment mémoire RSS).
  Ils n'ont pas été présentés comme réussis ici ; validation complète ci-dessous.
- Téléchargement HTTPS **réel** de l'archive publique depuis le commit de
  publication 9da82c2834e5e5cdefd408e2141378b310c19155 : SHA256 et l'ensemble
  des membres relus, provenance exacte retrouvée.
- Syntaxe du bloc Python de la notice et contrôles de diff vérifiés.

## GitHub Actions, Linux standard, pas Oracle

Workflow .github/workflows/v4-kit.yml, Ubuntu 24.04 et Node 24.22.1.
Permissions contents:read ; actions checkout/setup-node épinglées,
aucun credential persistant, aucun accès Oracle ni secret de déploiement.

[Exécution du parcours complet avec reprise réelle](https://github.com/antoineacquaviva/Amazonia/actions/runs/42642101218/job/129245576633)
— consulter également les checks attachés à cette PR pour la dernière version.

Contrôles réellement réussis :
- npm ci, typage natif du projet, **127 tests réussis, zéro échec/ignoré**, build ;
- les 10 tests Python du kit ;
- construction de deux archives identiques depuis un même commit ;
- extraction et installation réelle hors Git, npm ci, typage/build,
  vérification complète des fichiers/provenance ;
- recette réduite réelle de **56 parties**, exports et checkpoint ;
- processus détaché, accès HTTP authentifié et refus anonyme ;
- création d'une campagne de **16 parties** dans l'instance installée,
  arrêt/relance, checkpoint PAUSED sans calcul automatique, reprise explicite,
  achèvement et 16 unités uniques ;
- refus de signaler un vrai PID étranger et refus d'une vraie collision de port ;
- Chromium/Playwright 1.56.1 : parcours scientifique, commandes de campagne,
  reconnexion, résultats/exports et mobile, sans erreur JavaScript.

Les tests ultérieurs comparent aussi tous les fichiers du kit publié aux
sources testées (hors descripteur de commit, volontairement figé).
Les journaux et résultats des tests sont jetables et ne figurent pas dans le kit.

## Limites opérationnelles

Aucune connexion ni installation Oracle n'a été réalisée. Le contrôle opc,
l'état réel des cinq services, le runtime déjà préparé, les permissions,
l'espace/inodes et les performances du serveur réel restent à observer
lors de l'exécution du bloc opérateur.

Les tests d'installation appellent la bibliothèque dans un environnement
jetable ; ils ne prétendent pas exercer systemd/opc Oracle. Les lectures
systemctl et leurs refus sont exercés par fixtures. Le bloc réel les exige.

L'archive ne contient pas les dépendances npm : le réseau vers le registre
du lockfile reste nécessaire. Pas de GitHub Release créée ; kit durable
téléchargeable directement depuis le dépôt public, liens de téléchargement
épinglés et SHA256 fourni (intégrité, pas signature indépendante).

Aucune nouvelle unité systemd ou reprise au reboot de la VM, pas de garantie
de RSS absolu, de haute disponibilité ou de charge de millions de parties.
Un worker scientifique et des ressources conservatrices sont conservés.
Aucune purge ou reprise automatique des calculs. Pas de modification de P,
des données historiques, des cinq services, de Caddy, du portail ou du réseau.

Notice opérateur : [ORACLE_V4_PRIVATE.md](ORACLE_V4_PRIVATE.md).
