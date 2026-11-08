# Mission 1B.2 — Campagnes serveur durables

## Périmètre et dépendances

Base : `main` à jour, incluant la fusion de PR #2 (`9fcb940`). Référence technique v3.3 : `244858f40286678b68a75521813490b11afe549c`.

Ni moteur, ni bots, ni RNG, ni évaluateur, ni worker de simulation, ni fixtures historiques ne sont modifiés. Aucune authentification, modification du portail, migration destructive, campagne de production ou déploiement.

**Node.js 24 minimum** est maintenant requis (`node:sqlite`, fourni par Node ; aucune nouvelle dépendance npm). L'intégration a été testée avec Node 24.22.1. Vérifier cette disponibilité sur Oracle avant toute mise en service. SQLite peut émettre un avertissement expérimental selon la version de Node.

## Architecture

- `campaignPlan.ts` : génération progressive d'un lot à partir du curseur. Le produit de variantes existant reste matérialisé, mais jamais toutes les parties ou tous les lots.
- `campaignManager.ts` : une boucle indépendante du HTTP par campagne ; un seul lot attribué à la fois par campagne, plusieurs campagnes peuvent utiliser le pool partagé.
- `workerPool.ts` : travailleurs limités, file bornée, délai et tentatives bornés, nouveau worker à chaque tentative. Pas de repli de calcul sur le thread principal.
- `durableStore.ts` : transactions SQLite WAL avec `synchronous=FULL`. Un propriétaire par répertoire, acquis dans une transaction ; un autre processus vivant est refusé. Après mort du processus, reprise de propriété seulement si son PID n'existe plus. Un PID réutilisé peut exiger une intervention opérateur, sans effacement automatique d'un propriétaire vivant.

La voie simple retenue limite volontairement une campagne à un worker à la fois. Le multicœur profite aux campagnes distinctes ; ce n'est pas encore l'ordonnanceur parallèle optimal pour une campagne unique. Le renouvellement des workers a aussi un coût de démarrage.

## Données et frontière de validation

Les nouveaux enregistrements utilisent `data/campaigns/orchestration.sqlite` (et ses fichiers WAL/SHM). Les tables contiennent :

- `campaigns` : configuration, génération, curseurs, statut, statistiques bornées et état RNG du générateur de paramètres ;
- `batches` : clé `(identifiant, génération, séquence)`, demande exacte (paramètres, composition, graines, nombre de parties), état, erreurs/tentatives et résultats en attente d'agrégation ;
- `variants` : bilan durable de chaque variante terminée.

Une génération distingue deux utilisations successives du même identifiant. Les lots sont numérotés déterministement dans cette génération ; leur demande enregistrée est réutilisée après interruption.

Avant calcul, le lot devient `RUNNING`. Une transaction unique valide ensuite **résultat/agrégat, curseurs, compteurs et lot `VALIDATED`**. La progression n'est publiée en mémoire qu'après COMMIT. Un résultat non confirmé peut être recalculé : il n'a jamais été compté. Les sommes du stress sont conservées exactement, sans reconstruction depuis des moyennes arrondies.

Les résultats individuels sont conservés seulement pour la table inachevée. À sa clôture, le résumé est enregistré et les résultats intermédiaires libérés dans la même transaction. Les métriques restent calculées par les fonctions historiques, sur les parties triées par graine. La mémoire est donc bornée par une table (plafond de sécurité actuel : 10 000 parties), plus les métadonnées et exports demandés. Le journal de lots croît sur disque, sans réécriture d'un JSON géant. Pas de garantie de RAM totale stricte : les réponses HTTP complètes et les anciens JSON volumineux peuvent encore coûter cher.

Les fichiers JSON historiques restent au même endroit et sont toujours lisibles via les protections de 1B.1. Aucune conversion ni réécriture automatique. Leurs contrôles de reprise sont refusés explicitement : sans lots et RNG sauvegardés, prétendre à une reprise exacte serait faux. Une future importation nécessitera un outil dédié et une validation humaine. La référence calculée automatiquement au démarrage a été supprimée : démarrer une application ne lance plus de campagne implicite.

La suppression est logique, durable et immédiate pour l'API : tombstone + annulation des lots non validés. Les anciens fichiers restent intacts. Les callbacks tardifs d'une ancienne génération ne peuvent pas ressusciter ni modifier la nouvelle. Pas de purge physique automatique ; prévoir une politique de rétention ultérieure.

Pour sauvegarder la base en activité, utiliser une sauvegarde SQLite cohérente ; ne pas copier seulement le fichier principal en ignorant le WAL. Ne pas revenir à une ancienne application en espérant qu'elle interprète les nouveaux checkpoints ou les tombstones.

## Client et protocole de contrôle

Les connexions HTTP n'appartiennent pas à la boucle de calcul. Le navigateur ne fait que lancer des commandes explicites et lire l'état. Fermer l'onglet, le navigateur, la session du portail ou le PC ne demande aucune pause/annulation. Une reconnexion effectue des GET et ne relance rien.

Les fonctions de campagne de `api.ts` n'appellent plus le gestionnaire navigateur. Les erreurs réseau/HTTP sont remontées ; aucun calcul local n'est lancé. Les anciennes données `localStorage` ne sont ni supprimées ni migrées, mais ne sont plus affichées comme campagnes serveur. La simulation unitaire utilise elle aussi exclusivement l'API. Les exports indiquent leur caractère partiel ; les tables inachevées durablement enregistrées sont disponibles via `partialResults`, sans inventer de classement sur des tables manquantes.

Politique :

| Événement | Comportement |
|---|---|
| Pause explicite | Plus de nouveau lot ; le lot déjà attribué, même en file, finit et est validé. L'interface distingue parties durables et lot attribué. |
| Reprise | Continue depuis le curseur ; appels concurrents ne créent pas une seconde boucle. |
| Arrêt explicite | Annule le travail non attribué et les tâches encore en file ; le lot réellement en cours peut finir et être validé. Statut STOPPED conservé ; pas de reprise de cet arrêt volontaire. |
| Redémarrage/interruption | Les lots non confirmés redeviennent en attente ; campagne PAUSED/INTERRUPTED, aucun calcul automatique. Reprise explicite. Un arrêt volontaire reste arrêté. |
| Erreur définitive | ERROR, progression durable antérieure conservée, dernière erreur affichée. Reprise explicite autorisée avec un nouveau budget borné de tentatives. |
| Suppression | Masquage durable et inhibition des écritures tardives ; recréation possible sous une autre génération dans les limites de capacité. |

Une panne de disque peut empêcher d'enregistrer jusqu'à l'erreur elle-même : l'API expose alors l'erreur en mémoire, sans faire avancer la progression durable. Au redémarrage, seul le dernier état réellement enregistré fait foi.

L'état additionnel `orchestration` expose raison, génération, lots validés/en attente/attribués/échoués, reprises de tentative, dernier checkpoint et dernière erreur. Les compteurs d'échec et de tentatives sont cumulatifs. Dans l’API et l’interface, le nombre en attente exclut le lot déjà attribué. Le compteur interne du plan inclut tous les lots non validés ; la projection API soustrait le lot attribué. Les lots annulés non matérialisés sont implicites dans le plan interrompu. Les vitesses utilisent le temps actif des lots, incluant attente et reprises, sans le temps passé en pause ou serveur éteint. Une limite de durée est évaluée à la frontière des lots ; si elle est atteinte avant le nombre de parties prévu, le statut devient COMPLETED/TIME_LIMIT mais le bilan demeure explicitement partiel.

## Reproductibilité du stress

Le RNG historique n'est pas modifié. Un adaptateur externe sauvegarde/restaure son champ d'état pour le générateur de paramètres. Ordre des appels, graines et rotation des sept profils restent identiques à une exécution continue. Le schéma versionné de l'orchestrateur dépend de cette implémentation historique : une évolution future du RNG exigera une version distincte.

Les limites scientifiques déjà documentées restent présentes : RNG des dés partagé avec BLIND, signaux des bots, heuristique omnisciente, métriques et absence de précision adaptative.

## Configuration des ressources

| Variable | Défaut | Domaine |
|---|---:|---|
| `AMAZONIA_WORKERS` | parallélisme disponible moins un, minimum 1 | 1 à ce maximum |
| `AMAZONIA_QUEUE` | 4 | 1 à 64 |
| `AMAZONIA_CAMPAIGNS` | 2 | 1 à 32, au plus workers + queue |
| `AMAZONIA_BATCH_SIZE` | 80 | 1 à 250 ; figé dans chaque nouvelle campagne |
| `AMAZONIA_TIMEOUT_MS` | 120 000 | 1 à 3 600 000 |
| `AMAZONIA_ATTEMPTS` | 3 | 1 à 10, tentative initiale comprise |

Chaque worker a une limite de vieille génération V8 de 256 MiB (pas une limite absolue du RSS). Les échecs, sorties inattendues et délais expirés font terminer/remplacer le worker. Au-delà du budget, campagne ERROR. Un délai doit être dimensionné sur Oracle pour des lots légitimes ; pas de benchmark lourd exécuté ici.

Les plafonds conservateurs 1B.1 restent temporaires, notamment 10 millions de parties. La journalisation par lots n'en fait pas une limite permanente de conception. Avant plusieurs centaines de millions de parties : pagination de supervision/export, agrégation réellement en flux, rétention/compactage du journal, plan d'admission et essais de volume restent nécessaires. Cette PR ne prétend pas démontrer cette échelle.

## Validation exécutée

- `npm test` : 53 tests, incluant les 30 tests de 1B.1 et les 21 références complètes v3.3.
- `npm run lint` : réussi.
- `npm run build` : réussi.
- `git diff --exit-code origin/main -- src/sim/ src/server/simWorker.ts tests/fixtures/v33.json` : aucune différence.
- Empreintes SHA-256 des campagnes préexistantes : inchangées ; aucune base d'orchestration créée dans les données existantes pendant les tests.
- Essai ponctuel Playwright avec Chromium système : création via navigateur, fermeture complète de Chromium, terminaison des dix parties côté serveur, ouverture d'un second navigateur, récupération des cinq lots validés ; aucune erreur JavaScript.

Tous les serveurs, workers et bases des essais utilisent des répertoires temporaires et des ports locaux éphémères. Les fixtures v3.3 ne sont pas régénérées.

### Correspondance aux tests obligatoires de la mission

| Exigences | Démonstration |
|---|---|
| A1–A6 | Serveur HTTP isolé sans polling pendant le calcul, connexions clients jetables, deux lecteurs indépendants ; essai Chromium fermé puis second navigateur. |
| A7 | API hors ligne : rejet sans appel local ni accès à un stockage navigateur ; aucun repli importé. |
| B8–B10 | Monte-Carlo arrêté/repris, gestionnaire recréé, lot non confirmé rejoué, nombre de validations et résumés vérifiés. |
| B11–B12 | Faute avant checkpoint, base en lecture seule et COMMIT injecté en échec ; pas de progression fantôme, résultats précédents conservés. SIGKILL d'un processus serveur réel puis redémarrage. |
| B13 | Suite exacte de demandes de stress comparée au plan continu ; agrégats comparés à une campagne ininterrompue. |
| C14–C16 | Deux campagnes simultanément en cours puis pause/reprise ; arrêt en file et pendant calcul ; interruption après arrêt. |
| C17–C20 | Workers dédiés qui lèvent une erreur, sortent ou bloquent ; budget borné, ERROR ; worker remplaçant qui réussit et lot compté une fois. |
| D21–D22 | Campagnes partageant le pool, admission bornée, saturation de file et contrôle du nombre de workers. |
| D23–D25 | Tests 1B.1 de sauvegardes simultanées/suppression, suppression en calcul, nouvelle génération et vérification après redémarrage. Les opérations SQLite sont synchrones et transactionnelles : pas de fenêtre asynchrone sauvegarde/suppression. |
| D26 | Échecs de checkpoint, d'écriture et de COMMIT. |
| E27–E31 | Tests historiques, lecture d'anciens JSON, comparaison de deux variantes sur les sept tables avec l'évaluateur historique, diff scientifique nul et typage/build. |

## Vérifications humaines avant fusion / limites réelles

1. Node 24 et accès au SQLite/WAL sur le disque Oracle ; politique de sauvegarde et comportement fsync du stockage réel.
2. Protection effective du portail/reverse proxy : aucune authentification nouvelle ; les routes administratives restent à protéger.
3. Accepter les changements : JSON historiques en lecture seule, suppression logique, absence de calcul local/initialisation automatique, une voie de calcul par campagne.
4. Dimensionner travailleurs, file, nombre de campagnes et délais ; vérifier consommation réelle et réactivité sur Oracle, sous charge maîtrisée.
5. Confirmer les chemins/préfixes et la session du portail. L'indépendance au logout est établie par l'absence de lien client-calcul, mais aucune session de production n'a été déconnectée pour un test.

Non démontrés : haute disponibilité de la VM, coupure matérielle de son disque, charge de plusieurs jours ou centaines de millions de parties, performances du portail réel. Aucun déploiement ni changement d'environnement publié par cette mission. Attendre revue et validation explicite avant fusion.
