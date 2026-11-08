# Mission 1B.4 — sécurité et mise en service préparée

Complète [l'audit croisé](AUDIT_CROISE_1B4.md). Aucun accès Oracle, déploiement ou changement du portail. Les versions GitHub ne sont pas supposées présentes en production.

## État vérifié et modifications

Inventaire source : Express, API JSON, client relatif, Vite pour le frontend, tsx pour le backend, Node >=24 / node:sqlite / WAL / propriétaire unique. Ressources existantes : workers disponibles moins un, queue 4, campagnes 2, lots 80, timeout 120 secondes, tentatives 3 ; domaines complets dans LONG_CAMPAIGNS. Main de départ db338cf (PR #4). Le service Oracle, ses chemins, le routage et l'identité effectifs restent inconnus.

Implémenté dans cette PR :

- Garde commune avant parsing et avant les deux montages API. Sans adaptateur serveur d'autorisation, toutes les API répondent 503, y compris santé détaillée, exports et audits. Faux en-têtes, Referer et accès local ne donnent aucun droit. Aucun adaptateur de production n'est activé.
- Interface serveur `Authorize(req, permission)` : l'intégrateur doit vérifier une preuve cryptographique ou la session commune authentifiée ; il ne doit pas simplement lire un en-tête d'identité. Résultat faux : 403 ; intégration absente/exception : 503. L'interface n'est pas un système de comptes. Les tests injectent explicitement une politique locale ; aucun drapeau HTTP ou environnement ne la désactive.
- Aucun CORS permissif. Fetch Metadata cross-site refusé en complément, cache API no-store, Express sans X-Powered-By. CSRF reste obligatoire dans le futur adaptateur si cookies : vérifier un jeton lié à la session et la provenance. Aucun login ou cookie n'est accepté par défaut aujourd'hui. Ne pas présenter Fetch Metadata comme une autorisation ou protection CSRF autonome.
- Corps JSON limité à 256 Kio, erreurs de parsing génériques (413 pour dépassement), validation numérique sans coercition pour la création, validation bornée des simulations. Pas d'initialMachinesState arbitraire dans l'API unitaire (champ historiquement ignoré par le moteur).
- Plafond global par instance : 300 lectures/minute et 30 mutations/minute, partagé entre chemins et identités ; pas de clé IP falsifiable ni de table non bornée d'identifiants. Toute mutation, même invalide après autorisation, consomme le budget. Cela n'est pas un quota journalier par utilisateur ni une défense DDoS réseau ; l'entrée doit limiter les connexions anonymes et les corps.
- Simulation unitaire : paramètres N=3..6, tours=6..12, arbres=2..3, graine entière 1..2^32−1, 1..6 profils connus, piste exactement six cartes, domaines historiques ; validation des conventions SCIENTIFIC_V1 existantes. Calcul dans le même WorkerPool que les campagnes, un seul appel unitaire en vol, refus si pool plein ou queue déjà occupée. Timeout, mémoire et retries identiques aux lots ; aucun worker additionnel ni file unitaire illimitée. Réponse sérialisée plafonnée à 2 Mio ; le calcul ne reçoit que des paramètres bornés. La sérialisation reste sur le thread HTTP, mais le calcul est déplacé.
- Production : écoute loopback uniquement ; `AMAZONIA_CAMPAIGNS_DIR` absolu, existant, canonique, accessible et initialisé explicitement. Sans base, `.amazonia-storage` doit être préparé manuellement après inventaire ; aucune création implicite dans un répertoire arbitraire. Hors production, défaut historique maintenu pour développement ; les tests passent des répertoires temporaires explicites. Le compte doit posséder les permissions appropriées, sans sudo. Aucun lien symbolique de racine.

Les campagnes ne s'arrêtent pas lors d'un refus d'autorisation, logout ou fermeture de connexion. Les contrôles d'accès s'appliquent aux nouvelles requêtes HTTP, pas à la boucle de calcul déjà acceptée. Reprise après redémarrage exclusivement explicite, sans nouvelle campagne sur reconnexion.

## Matrice API cible et effective dans la PR

Toutes les lignes sont montées sous `/api` et `/:subpath/api`. Dans la PR, aucun droit n'est accordé sans intégration ; le coût est contrôlé après autorisation.

| Méthode et suffixe | Effet / exposition | Coût potentiel | Permission demandée |
|---|---|---|---|
| GET /health | Télémétrie CPU/RAM/file/environnement | faible | read |
| GET /campaigns | États et bilans de toutes les campagnes | mémoire/réponse proportionnelles aux bilans | read |
| GET /campaigns/:id | Configuration, état, résultats et traces | idem | read |
| GET /campaigns/:id/export/json | Résultats et manifeste | sérialisation potentiellement importante | read |
| GET /campaigns/:id/export/markdown | Rapport historique ou scientifique | génération potentiellement importante | read |
| GET /campaigns/:id/scientific-audits/:variant/:table | Observations détaillées et données privilégiées | lecture d'un témoin | audit |
| POST /campaigns | Nouvelle campagne et travail durable | CPU/stockage, admission existante | operate |
| POST /campaigns/:id/pause | Suspend attribution | faible, checkpoint | operate |
| POST /campaigns/:id/resume | Relance explicite | CPU/stockage | operate |
| POST /campaigns/:id/stop | Arrêt explicite | checkpoint | operate |
| DELETE /campaigns/:id | Suppression logique durable | transaction | delete |
| POST /simulate-single | Partie et journal détaillé | worker partagé et réponse <=2 Mio | operate |

Les rôles métier réels et la visibilité entre utilisateurs attendent une décision du propriétaire. `read` permet actuellement aussi les traces incluses dans les bilans historiques : réserver ce droit aux personnes habilitées aux informations complètes du jeu. Pas de redaction inventée. La pagination et les exports en flux restent à prévoir pour des bilans de grande taille ; les plafonds actuels des campagnes ne sont pas une garantie de taille maximale d'export.

## Contrat portail à faire approuver

Un seul fournisseur d'identité. Recommandation de l'audit : preuve courte signée, aud=Amazonia, issuer connu, sujet, droits read/operate/delete/audit, expiration, validation backend et rotation de clé publique. Le portail doit filtrer les en-têtes client, conserver l'auth dans sa génération Caddy, et protéger ses propres opérations privilégiées. Aucun de ces éléments n'est supposé installé. L'adaptateur devra inclure les vérifications CSRF si session cookie et des tests de preuves invalides, expirées, révoquées et de mauvaise audience. Aucun jeton partagé ajouté au code ou au navigateur.

L'application démarrée par `npm start` est volontairement fermée aux API tant que cet adaptateur n'est pas livré et validé. Ce blocage est un résultat attendu, pas un motif pour ajouter `authorize: () => true` au service réel. Les fichiers de test le font uniquement pour leurs serveurs temporaires.

## Diagnostic Oracle à exécuter ultérieurement en lecture seule

Après autorisation du propriétaire, relever sans exposer de secrets :

1. Révision du code actuel (`git rev-parse HEAD`, `git status --short`) et version affichée par le portail ; ne pas déduire le déploiement des fusions GitHub.
2. `systemctl show UNITE --property=User,WorkingDirectory,ExecStart,MainPID` et inventaire des processus Node/PM2/conteneurs. Examiner toute unité contenant des secrets localement, sans les copier dans le rapport. Vérifier qu'un seul processus possède la base.
3. Avec le binaire exact d'ExecStart, `node --version`, `node -p 'JSON.stringify({execPath:process.execPath,arch:process.arch,platform:process.platform})'`, import de `node:sqlite` avec base `:memory:`. Référence de recette : Node 24.22.1 ; vérifier sa disponibilité Oracle, pas seulement engines.
4. `uname -m`, `/etc/os-release`, `id COMPTE`, capacité CPU/RAM (`getconf _NPROCESSORS_ONLN`, `free -m`), espace/inodes (`df -h`, `df -i`) sur le volume des données.
5. Résoudre cwd et chemins de campagnes réels, propriétaires/modes de chaque parent, fichiers JSON, quarantine, SQLite/WAL/SHM ; vérifier qu'aucun montage temporaire ou lien symbolique ne porte l'unique copie. Ne pas ouvrir le gestionnaire pour un simple inventaire, car il initialise le stockage.
6. Inventorier Caddy et les règles OCI/pare-feu/ports d'écoute, sans les modifier ; relever protections existantes, auth et redirections, y compris www, sous-chemin sans slash et API racine. Aucune requête intrusive au portail.

## Sauvegarde et restauration

Outil livré : `node --import tsx scripts/backup.ts backup SOURCE_ABSOLUE DESTINATION_NOUVELLE`, puis opération `restore` avec les mêmes arguments. Usage local uniquement pendant cette mission.

Sauvegarde : destination externe inexistante, parent canonique, création exclusive 0700 ; API backup SQLite pour un instantané cohérent incluant WAL actif, integrity_check ; retrait du bail uniquement dans la copie ; JSON historiques, quarantaine et marqueur copiés sans liens ; manifeste d'empreintes SHA-256, version Node et provenance logicielle. Fichiers en 0600. Source jamais modifiée ni bail libéré. Une erreur laisse un dossier partiel à examiner : ne pas l'utiliser comme archive valide. Sauvegardes historiques copiées pendant activité : arrêter les changements de fichiers historiques le temps de la copie ; la base est cohérente mais il n'y a pas de transaction multi-fichiers externe.

Restaurer : arrêter d'abord tous les services écrivains et conserver l'état existant, avec autorisation ; vérifier leur absence indépendamment du PID enregistré. Vérifier le manifeste et les empreintes, l'intégrité et l'absence de bail/WAL/SHM dans l'archive ; extraire exclusivement vers un nouveau répertoire propre. Aucun écrasement d'un chemin existant. Ne jamais supprimer un bail de la base active ni mélanger des anciens WAL/SHM. Le bail vide appartient uniquement à l'archive préparée. Vérifier liste des campagnes, générations, compteurs et états via le nouveau service de recette ; reprise explicite seulement. Le script ne démarre aucun gestionnaire ni campagne.

Le manifeste identifie des sources compatibles, il ne les embarque pas : conserver séparément le commit et l'artefact de release exacts. En exploitation, copier la sauvegarde vérifiée hors VM par un canal approuvé, protéger/chiffrer cette copie selon les données, enregistrer sa rétention et tester une restauration isolée. Ni transfert, ni planification, ni restauration de production ne sont exécutés ici. Les scripts conservent les contenus et resserrent les permissions ; l'administrateur doit affecter le compte propriétaire approprié sur la destination avant démarrage.

## Premier déploiement manuel : points d'arrêt humains

1. Approbation de la revue et de la politique d'identité ; sécuriser d'abord le portail dans une intervention distincte. Aucun déploiement Amazonia ouvert avant cela.
2. Diagnostic ci-dessus, inventaire des campagnes (y compris JSON/quarantaine), du code et de tous les processus ; identifier leurs chemins réels et les sauvegardes disponibles.
3. Sauvegarde complète préalable des données existantes, configurations et version logicielle ; integrity_check et restauration isolée. Pour une ancienne version JSON sans SQLite, sauvegarder les fichiers à l'arrêt sans lancer cet outil qui exige une base SQLite ; ne jamais créer une base uniquement pour sauvegarder les JSON.
4. Préparer release hors données, Node exact, dépendances, build/tests ; configurer compte sans sudo, budgets, écoute locale et autorisation commune refusant par défaut. Vérifier manifest backend explicite : ne pas laisser le portail traiter Amazonia comme un site statique ni patcher son source.
5. Arrêt contrôlé ancien service après accord ; vérifier aucun autre écrivain. Copier les données dans le nouveau stockage persistant réservé, garder les originaux et leur sauvegarde. Préparer explicitement le marqueur si première initialisation ; aucune migration/destruction automatique de JSON.
6. Activer manuellement unité et routage préalablement revus. Les checkpoints historiques restent lisibles. **Les checkpoints SCIENTIFIC_V1 de PR #4 peuvent refuser la reprise**, car l'empreinte inclut campaignManager modifié dans cette PR. Aucun contournement ni réécriture : consulter/exporter, conserver l'ancien code exact en recette isolée pour leur reprise, ou décider d'une nouvelle campagne. Ne pas déclarer une reprise compatible sans essai sur copie. Ce changement de provenance ne modifie ni les règles ni les métriques.
7. Vérifier refus anonymes, faux en-têtes et accès directs, rôles autorisés, préfixes et erreurs ; vérifier anciennes campagnes/compteurs et absence d'effacement. Une sonde d'API doit confirmer backend réel et version attendue ; une page HTML en 200 ne suffit pas. Client index non mis en cache à l'entrée ; ressources fingerprintées propres à la release, aucune page/API d'une autre version servie silencieusement.
8. Après autorisation spécifique, petite campagne de recette : fermer le navigateur, consulter depuis un second appareil, vérifier checkpoints, pause/reprise ; pas de campagne massive. Surveiller CPU/RAM/disque et WAL. Acceptation : auth sur tous les chemins, aucune perte historique, cohérence compteurs, ressources bornées, sauvegarde restaurable, reprise explicite et compatibilité documentée.

## Retour arrière

Conserver code, dépendances, unité et Caddy de la release précédente ainsi que les sauvegardes. Si configuration erronée avant écriture : arrêter, corriger ou revenir à la release compatible. Si nouveaux checkpoints créés : ne jamais faire un simple git reset vers l'ancien code ; archiver l'état nouveau, vérifier les versions de schéma/provenance puis restaurer une sauvegarde compatible dans un autre répertoire et basculer après validation humaine. Les campagnes créées après la sauvegarde ne figureront pas dans l'ancien service : les conserver dans leur archive et décider de leur récupération séparée. Aucune fusion de bases, purge ou migration irréversible automatique. Le portail actuel reset --hard et sa restauration dist ne constituent pas ce rollback.

## Vérifications restant ouvertes

Identité et rôles à choisir/valider ; adaptateur à implémenter et tester une fois le contrat réel vérifié ; permissions Caddy/OCI et isolation inter-outils ; binaire Node/SQLite dans systemd ; durée/quotas adaptés à la VM ; compatibilité des checkpoints scientifiques existants ; sauvegarde hors VM et procédure de restauration opérateur. Aucun succès local ne signifie que le portail ou Oracle a été sécurisé. La fusion et la mise en service sont deux autorisations distinctes.

## Livraison et validation locale

Fichiers : `server.ts` (garde, limites HTTP, worker unitaire, écoute et cache HTML), `src/api.ts` (préfixe et diagnostic), `src/server/apiSecurity.ts`, `singleValidation.ts`, `storageConfig.ts`, `campaignManager.ts` (admission commune et stockage), `scripts/backup.ts`, `.env.example`, les deux rapports de mission ; `tests/security.test.ts` et adaptations explicites d'autorisation dans les trois fixtures/tests HTTP existants. Aucun fichier `src/sim/`, `src/scientific/`, `simWorker.ts` ou fixture v3.3 modifié.

Recette sous Node 24.22.1 : `npm test` (88 tests), `npm run lint`, `npm run build`, `git diff --check` et diff scientifique/historique nul. Les neuf nouveaux tests portent sur les refus et faux en-têtes, les permissions et erreurs d'adaptateur, préfixes et quotas HTTP, validation unitaire, partage du pool, stockage explicite/permissions/liens, backup WAL actif et restauration exclusive/intègre, reprise explicite restaurée, et client sans repli de chemin/calcul. Les tests historiques couvrent déjà déconnexion HTTP, second client, SIGKILL, reprise et non duplication, erreurs workers/checkpoints et protocoles scientifiques. Ce ne sont pas des essais du portail Oracle réel. Un test de restauration a révélé la création de WAL/SHM sur une archive en mode WAL : corrigé en finalisant la copie seule en journal DELETE avant son manifeste ; SQLite actif source reste WAL.

Installation locale des dépendances : `npm install --ignore-scripts --package-lock=false --legacy-peer-deps --cache /tmp/amazonia-npm-cache`. Le cache par défaut était inaccessible et la résolution normale rencontrait le conflit peer esbuild/Vite préexistant. Aucun changement de dépendance ni lockfile ajouté ; la reproductibilité des outils demeure limitée par les plages de versions existantes.

Un appel unitaire réserve aussi une place dans l'admission globale du gestionnaire : les nouvelles campagnes/reprises ne peuvent pas surremplir la capacité pendant ce calcul transitoire. Les campagnes déjà acceptées conservent leurs checkpoints et leur pool. HEAD applique les mêmes droits que GET. Les bilans scientifiques antérieurs restent protégés par leur contrôle de provenance strict, sans migration implicite.
