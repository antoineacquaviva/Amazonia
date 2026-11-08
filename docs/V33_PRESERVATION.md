# Préservation v3.3 — Mission 1B.1

## Référence et preuve

Référence technique : `244858f40286678b68a75521813490b11afe549c`.
Base de branche : `a9788ffad9520d229ac3df316920111f7ae26650` (fusion des seuls documents de gouvernance).
`tests/fixtures/v33.json` a été généré avant toute modification du code, par appel à `runSingleGame(DEFAULT_SIMULATION_CONFIG, [profil], graine, 'historical', true)`, sur les sept profils et les graines 42001, 42002, 42003. Il contient les résultats complets, les traces et journaux. Les tests comparent les objets JSON complets, pas uniquement les scores. Aucun fichier de `src/sim/` n'est modifié.

Exécuter `npm test` et `npm run lint`. Les tests de stockage utilisent seulement `mkdtemp` dans le répertoire temporaire système ; aucun test ne démarre le serveur ou une campagne réelle. Les fixtures ne doivent pas être régénérées automatiquement lors d'un échec.

## Comportements historiques volontairement conservés

- RNG partagé entre dés et décisions BLIND : même graine ne signifie pas mêmes tirages inter-profils.
- `initialMachinesState` ignoré ; les machines commencent normales en case 1.
- Heuristiques, informations et signaux des bots inchangés ; Omniscient non certifié optimal, comportement mixte historique conservé.
- Probabilités des bots non alignées sur la copie de piste mélangée.
- Formules de score, statistiques et limites scientifiques inchangées.

## Stockage

Les fichiers compatibles gardent leur format JSON. Les fichiers invalides/incompatibles restent à leur emplacement original et sont exclus du chargement ; une copie byte pour byte est conservée dans `quarantine/<sha256>.json`. La quarantaine est dédupliquée par contenu. Les liens symboliques ne sont pas suivis. Une erreur est journalisée par fichier, sans interrompre les autres chargements. Une erreur de copie laisse également l'original intact.

Une campagne de référence n'est plus générée automatiquement lorsque des JSON rejetés existent : cela évite d'écraser une ancienne référence incompatible. Une migration de ces fichiers reste manuelle, sans suppression automatique.

Les sauvegardes prennent un instantané à chaque demande et sont sérialisées par identifiant. Écriture dans un fichier temporaire exclusif du même répertoire, synchronisation, fermeture, renommage atomique puis synchronisation du répertoire. Les erreurs restent journalisées par le gestionnaire ; aucune garantie n'est possible si le disque refuse une écriture. Le dernier appel n'est plus abandonné parce qu'une sauvegarde est en cours. La suppression explicite attend les écritures précédentes. Ce mécanisme est prévu pour un seul processus écrivain ; pas de verrou interprocessus ni de garantie contre un acteur local capable de modifier simultanément les répertoires.

## Entrées et changements à revoir avant fusion

Identifiants : 1 à 128 caractères ASCII alphanumériques, tiret ou underscore, premier caractère alphanumérique. Les anciens fichiers hors convention sont préservés mais non chargés.

Nouvelles campagnes : types/profils/domaines validés, 32 tables maximum, 1 à 6 profils par table, nom de 500 caractères maximum, 5 à 10 000 parties par table/variante, budget conservateur de 10 millions de parties, durée maximale de 7 jours, graine entière de 1 à 2^32−1. N=3..6, X=6..12 ; les autres domaines restent ceux du modèle historique. Ces plafonds sont une restriction de sécurité explicite à valider humainement. Les campagnes existantes ne sont ni recalculées ni réécrites au chargement. La simulation unitaire et les règles ne changent pas.

## Accès et limites ouvertes

Aucune authentification ajoutée, aucune modification du portail, aucun déploiement. Avant exposition, vérifier la protection effective du reverse proxy du portail et restreindre les routes de création, contrôle et suppression aux utilisateurs autorisés. Recommandation : réutiliser l'identité et les contrôles d'accès déjà disponibles au portail, avec protection CSRF adaptée si cookies, plutôt qu'imposer un nouveau système. Son architecture exacte doit être validée par son propriétaire.

Restent ouverts : reprise Monte-Carlo après redémarrage, reprise RNG du stress randomisé, quotas CPU globaux, annulation des lots, validation/limitation de simulation unitaire, basculement navigateur sur erreur HTTP, API non authentifiée, statistiques adaptatives et fiabilité scientifique. Les limites par campagne ne bornent pas le nombre de campagnes concurrentes. Le stockage navigateur n'est pas migré ni sécurisé par ce changement.

Pas de changement de dépendances ; l'absence de lockfile reste une limite de reproductibilité des outils. Le gel porte sur le code historique et les sorties enregistrées. Aucun snapshot ni publication cloud n'est effectué par cette mission.

## Évolution 1B.2

La nouvelle orchestration et ses incompatibilités sont décrites dans [LONG_CAMPAIGNS.md](LONG_CAMPAIGNS.md). Les garanties JSON ci-dessus décrivent la couche historique conservée ; les nouvelles campagnes utilisent désormais des checkpoints SQLite transactionnels. Les références scientifiques restent inchangées.
