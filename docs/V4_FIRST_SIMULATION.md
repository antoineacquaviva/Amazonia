# Première simulation Amazonia V4

## Lancer localement

Depuis la racine du dépôt, Node 24 ou ultérieur, dépendances déjà installées :

```sh
npm run dev:v4
```

Ouvrir <http://127.0.0.1:3104>, sélectionner **V4 expérimentale**, puis lancer une
partie (une graine) ou une petite campagne. L'option de comparaison produit les
huit variantes avec les mêmes graines. L'écran expose les paramètres, les
configurations refusées, l'avancement, les scores moyens et les exports
JSON/Markdown. Les trois variantes peuvent aussi être choisies séparément.

Ce lanceur est réservé au développement et lié à 127.0.0.1. Il utilise un nouveau
répertoire temporaire pour le gestionnaire historique, sans charger `data/` ni
les anciens résultats. Son autorisation locale ne s'applique pas au serveur de
production. `npm run dev` conserve la protection du portail existante.

## Contrat V4 et ressources

- `POST /api/v4/campaigns` : `{config, seeds, allVariants}` ; version de règles et
  ordre initial obligatoires, tous les paramètres explicités. Exemple de
  configuration : `DEFAULT_V4_CONFIG` dans `src/v4/types.ts`.
- `GET /api/v4/campaigns` : liste des campagnes sans résultats détaillés.
- `GET /api/v4/campaigns/:id` : avancement et résultats détaillés disponibles.
- `GET /api/v4/campaigns/:id/export/json` ou `/export/markdown` : téléchargement.
- `DELETE /api/v4/campaigns/:id` : libérer une campagne terminée après export.
- Les alias `/:subpath/api/...` et les contrôles d'autorisation existants
  s'appliquent aussi aux routes V4 ; aucun accès anonyme ajouté en production.

Limites explicites : 64 parties par campagne, une campagne V4 active, quatre
campagnes conservées. Les jobs passent un par un dans le pool partagé existant,
avec ses plafonds de file, mémoire, temps et reprises ; les campagnes historiques
peuvent donc partager les ressources. Le nombre de défenseurs et les calculs de
parade ne sont pas plafonnés. Une entrée non prise en charge reçoit HTTP 400,
les ressources occupées HTTP 409, une erreur de worker termine la campagne en
ERROR et conserve ses résultats partiels.

La conservation V4 est **en mémoire**, sans reprise après arrêt serveur. Exporter
avant redémarrage. Cela constitue une limite de ce premier lot ; les historiques
V3.3, checkpoints SQLite et exports antérieurs ne sont ni migrés ni réinterprétés.
Chaque résultat V4 a sa propre forme et sa version explicite. La première partie
de chaque configuration inclut les traces complètes ; toutes portent paramètres,
graine, versions du bot/observation/RNG et provenance (commit, état modifié,
SHA256 des sources d'exécution et version Node).

## Démonstration reproductible

Utiliser un **nouveau chemin absolu**, dont le parent existe :

```sh
npm run demo:v4 -- /tmp/amazonia-v4-demo-nouveau
```

Le programme mesure une partie pilote puis fixe l'effectif avant la campagne :
8 graines par variante si le pilote prend moins d'une seconde, sinon 2. Il
exécute les huit variantes à travers l'API locale et les workers, puis télécharge
`results.json` et `report.md`. `execution.json` consigne coût mesuré, effectif réel
et provenance. Une borne de 120 secondes fait échouer explicitement l'exécution,
sans changer les règles. Un répertoire existant est refusé, jamais remplacé.
La démonstration est exploratoire, sans conclusion d'équilibrage.

Les choix humains autorisés et le modèle des bots sont détaillés dans
[design/V4_DECISIONS.md](../design/V4_DECISIONS.md). La
[spécification fournie](../design/Amazonia_v4_specification_regles.md) reste un
socle expérimental avec points ouverts.

## Validation

```sh
npm run lint
npm test
npm run build
```

Les tests V4 couvrent moteur, contrats, observations, négociation, reproductibilité,
API et exports. Les fixtures complètes V3.3 restent inchangées. Test navigateur
reproductible avec Playwright 1.56.1 et Chromium installé :

```sh
npm --cache /tmp/amazonia-npm-cache install --prefix /tmp/amazonia-v4-browser --no-package-lock playwright@1.56.1
V4_PLAYWRIGHT_PACKAGE=/tmp/amazonia-v4-browser/package.json npx tsx scripts/v4-ui-test.ts
```

Le test sert le build sur une adresse locale et un port éphémère, avec stockage
isolé. Il vérifie refus de configuration, sélection des trois variantes, lancement
unitaire puis huit variantes, avancement, scores, téléchargements JSON/Markdown,
navigation mobile et absence d'erreurs JavaScript. `V4_CHROMIUM` peut indiquer le
binaire Chromium ; défaut `/usr/bin/chromium`.

## Futur lancement isolé sur Oracle — instructions seulement

Aucun accès ni déploiement Oracle n'est réalisé par cette mission. Ne pas utiliser
le lanceur local sans authentification sur un serveur distant. Préparer une
nouvelle release, indépendante des releases P, puis installer/build/tester dans
son répertoire isolé. Prévoir un nouveau stockage canonique hors code et un
nouveau port de boucle locale, avec l'autorisation du portail existante avant
exposition. Ne pas copier les historiques P vers cette instance, ne pas reprendre
leurs identifiants et ne pas remplacer leurs artefacts. Exporter V4 vers un
nouveau répertoire identifié par version et provenance. Les opérations effectives
sur services, réseau et secrets relèvent d'une mission ultérieure autorisée.

## Suite : campagnes scientifiques durables

Le mode par défaut de l'onglet V4 et de `npm run dev:v4` est désormais décrit dans
[V4_USE.md](V4_USE.md). Les limites « quatre campagnes en mémoire » et le bot
unique ci-dessus concernent exclusivement le mode **Démonstration initiale**,
conservé pour relire ce premier lot. Le protocole scientifique durable a des
formats, versions, ressources et autorisations Oracle propres ; il ne réécrit
pas les résultats présentés dans ce document historique.
