# Étudier Amazonia V4 et préparer son instance privée

## Lancement local vérifié

`npm run dev:v4`, puis <http://127.0.0.1:3104>, **V4 expérimentale** →
**Campagne scientifique durable**. Node 24 requis. Le répertoire persistant V4
est `/tmp/amazonia-v4-studies-<uid>` par défaut ; définir `V4_STUDIES_DIR` sur un
nouveau répertoire privé canonique 0700 pour une conservation hors nettoyage de
`/tmp`. Le gestionnaire historique du lanceur reste dans un répertoire temporaire
neuf, sans ouverture de `data/`. L'ancien essai reste consultable via le sélecteur
**Démonstration initiale à bot unique**, sans conversion de ses résultats.

Préparer une configuration seule, ajouter quelques configurations explicites ou
les huit variantes. Les brouillons de paramètres ne remplacent le plan qu'après
un clic d'ajout/remplacement. Le JSON permet des permutations d'Œil et des strates
N=3..6 sans balayage géant imposé. Choisir les familles homogènes, la première
graine, l'effectif par cellule et les trois graines de protocole. **Estimer et
vérifier le plan** est nécessaire avant le lancement. Toute modification du plan
invalide cette estimation. Les limites effectives sont affichées avant le départ.

Les checkpoints sont indépendants du navigateur. Suspendre attend la frontière
du lot en cours ; arrêter conserve les unités confirmées et rejette le lot non
confirmé. Une reprise est toujours explicite, même après arrêt. Une demande de
reprise pendant un lot encore en vol est refusée jusqu'à sa fin. Après
redémarrage serveur, aucun calcul ne repart automatiquement. Les campagnes
sont retrouvées dans la liste (50 par page API), avec statut et progression.

Résultats : difficulté/dilution, distributions, dynamique par tour, efficience,
équité et six contrastes de politiques. Déplier les lignes pour les mesures et
trajectoires. Pas de note globale. L'archive JSON contient toutes les unités et
copies figées des documents ; le Markdown donne un bilan lisible, les définitions
et données détaillées restant dans l'archive autonome.

## API privée

Sous les autorisations existantes, `/api/v4/studies` et `/:subpath/api/v4/studies` :

- `POST /estimate` : valider et estimer `{protocol,name,configs,families,seeds,
  experimentSeed,environmentSeed,policySeed,independentGames}`.
- `POST /` : créer le même plan fixe ; réponse 202.
- `GET /` : études paginées, `?offset=50` pour la suite.
- `GET /:id` et `GET /:id/report` : checkpoint et bilan par axe.
- `GET /:id/samples?offset=200` : mesures unitaires, pages de 200.
- `POST /:id/pause`, `/resume`, `/stop` : commandes explicites, corps JSON `{}`.
- `GET /:id/export/json` ou `/markdown` : archive autonome ou bilan.

Le nouveau serveur privé refuse toutes les pages et API sans sa propre clé,
utilisée en HTTP Basic (`amazonia`), conservée seulement dans un fichier 0600.
Il écoute exclusivement sur 127.0.0.1. Les mutations demandent JSON et l'origine
exacte de cette adresse et de ce port. Le tunnel SSH doit donc conserver le même
numéro de port local et distant. Aucun jeton n'est inscrit dans les arguments,
JavaScript du navigateur, Git, journaux ou exports. L'API existante du portail
n'est ni exposée ni reconfigurée par cette livraison.

## Démonstration et sauvegardes

`npm run pilot:v4 -- /nouveau/chemin/absolu` exécute d'abord 56 parties (sept
familles × huit variantes × une unité), mesure leur coût, puis fixe l'effectif du
pilote à 4 par cellule si le coût moyen est inférieur à 500 ms, sinon 2. Graines
réduites et pilote distinctes. Le plan pilote est écrit avant son exécution.
`--smoke-only` limite la recette à 56 parties. Les checkpoints et exports restent
dans ce nouveau dossier ; il n'est jamais remplacé ni purgé automatiquement.

Sauvegarder : `npm run backup:v4 -- backup /stockage/studies /nouvelle/sauvegarde`.
Restaurer sur une copie neuve : `npm run backup:v4 -- restore /sauvegarde /nouvelle/copie`.
Ces opérations réutilisent la sauvegarde SQLite cohérente (WAL inclus), contrôlent
intégrité et empreintes, n'écrasent aucune destination et ne modifient pas le bail
de l'instance source. La copie restaurée ne reprend aucun calcul sans commande
explicite. Les formats historiques restent dans leur stockage distinct.

## Oracle

Aucune connexion SSH Oracle, identité sortante ou clé SSH n'est disponible dans
cet environnement de développement. Aucun déploiement n'y est prétendu. La
release est préparée par `npm run release:v4 -- /chemin/release.tar.gz` depuis un
commit de sources propre ; elle contient le code exact, le lockfile et un
descripteur d'empreinte vérifié même sans `.git` sur la machine cible.

Le bloc opérateur livré séparément appelle `scripts/oracle-v4-install.sh` après
contrôle SHA256. Il demande seulement le binaire Node 24 préparé et l'archive
transférée via le canal SSH existant, sous `opc`, sans sudo. Le nouveau répertoire
`~/amazonia-v4-science-XXXXXXXX` est créé exclusivement, avec stockage, clé,
exports et journaux distincts. `npm ci`, typage, build et recette bornée de 56
parties précèdent le lancement. Un port de boucle locale libre est choisi. Node
24 est utilisé en lecture seule ; npm doit être disponible à côté de ce binaire.

`INSTANCE/control.sh status|stop|start|restart` gère uniquement le nouveau PID,
vérifié par ses arguments avant signal. `nohup` et les checkpoints rendent le
calcul indépendant du terminal SSH ; aucune unité système ni relance automatique
au démarrage de la machine n'est installée. Après relance, cliquer explicitement
sur Reprendre pour chaque campagne interrompue.

Les services, portail, Caddy, règles réseau, comptes système, dossiers, scripts,
marqueurs et exports de phase P ne sont jamais modifiés. Les seuls paramètres
manquants côté propriétaire sont l'alias SSH existant et le chemin du Node 24
préparé (avec npm voisin). Le port et le chemin de nouvelle instance sont des
sorties du bloc, pas des choix de design à arbitrer.
