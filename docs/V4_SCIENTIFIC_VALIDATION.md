# Livraison scientifique V4 durable — validation du 9 novembre 2026

Sources exécutées : commit `30da62749220f9396e7b3df64b4c06a424b01ae3`, propres.
Empreinte : `537b9e9e3d58491410934df1d25af8a4ea36aed3ab27b5e162fb7ee8476cb9ad`.
Node 24.22.1, environnement Linux de développement. Les commits documentaires
suivants ne modifient pas le code de cette release.

## Ce qui est effectivement livré

Le moteur de règles V4 est inchangé. Sept familles homogènes utilisent des
versions propres, avec combat et furtivité, observations privées ou privilégiées
explicites et révisions déterministes. Les six familles informées partagent
l'évaluateur d'actions ; BLIND est une référence naïve assumée. Un contrôle
omniscient heuristique n'est jamais appelé optimum ou plafond.

Les objectifs de difficulté, information, coordination, révisions et équité sont
présentés par axes. Les anciennes prétentions causales, Shapley, poids 25/30/30/15,
fenêtres de survie et notes /100 ne sont pas transplantées. Le champ de score
global reste indisponible. Les compteurs de révision ne sont pas une mesure de
charge cognitive humaine. Une politique inefficace ne démontre pas l'inutilité
d'une règle. Définitions : [V4_MEASURES.md](V4_MEASURES.md) ; contrats, appariements
et limites : [V4_SCIENTIFIC.md](V4_SCIENTIFIC.md).

Les études sont durables, avec lots atomiques, pause/reprise/arrêt, progression
sans double comptage et reprise explicite après interruption. Les sources sont
revérifiées au lancement, à la reprise et dans chaque worker avant exécution.
Les unités et événements exogènes sont conservés, les exports autonomes incluent
les documents figés. Aucun stockage historique ou artefact P n'est ouvert par
les essais de cette mission. `src/sim/` et ses 21 fixtures sont inchangés.

## Exécutions réelles

Commande : `npm run pilot:v4 -- /workspace/amazonia-v4-scientific-results-2026-11-09`.

| Étape | Plan | Effectif réel | Coût mesuré |
|---|---|---:|---:|
| Test réduit | 7 familles × 8 variantes × 1 unité | 56 parties | 8,409 s, environ 150 ms/partie |
| Pilote fixé après coût réduit | 7 familles × 8 variantes × 4 unités | 224 parties | 31,805 s, environ 142 ms/partie |

N=3, X=8, L=16, deux arbres ; ordre initial J1–J2–J3. Graines unitaires réduites :
51001 ; pilote : 61001–61004. Graines expérience/environnement/décision : 71/73/79.
Le plan pilote a été écrit avant son exécution ; aucun arrêt sur les scores ou
sur une significativité. Les huit variantes ont les mêmes dés par unité et siège,
mais leurs conséquences et cibles peuvent diverger.

Archives relues : 56 cellules par campagne, unités uniques, provenance propre,
aucune violation d'invariant, toutes les empreintes exogènes communes vérifiées,
48 contrastes de politiques appariés par campagne. Les deux checkpoints ont été
sauvegardés puis restaurés dans une copie neuve : deux campagnes COMPLETED,
280 unités et zéro calcul repris automatiquement. Les témoins de trace et copies
figées des documents sont inclus dans les JSON autonomes.

**Les archives détaillées restent privées hors Git**, le dépôt étant public :
`/workspace/amazonia-v4-scientific-results-2026-11-09/` contient `pilot.json`,
`pilot.md`, `reduced-56.json`, `reduced-56.md`, `pilot-plan.json`, `execution.json`,
les checkpoints, sauvegarde et copie restaurée. Elles n'ont pas été poussées dans
la PR. Effectifs exploratoires trop faibles pour un bilan d'équilibrage ou un
classement certain ; les intervalles marginaux sont volontairement prudents.

Coût de domaine supplémentaire, distinct des analyses : une partie N=6, X=12,
L=64, COORD_HYBRID s'est exécutée en environ 2,80 s sans violation. Ce seul point
ne constitue pas un benchmark de charge Oracle.

## Contrôles exécutés

- `npm run lint` : réussi.
- `npm test` : **127 réussis, 0 échec, 0 ignoré, 0 annulé**, dont les 21 références
  historiques complètes. Les six tests de durabilité ont ensuite été rejoués
  après l'ajustement purement technique de normalisation du coût : tous réussis.
- `npm run build` : réussi.
- `scripts/v4-study-ui-test.ts`, Chromium/Playwright 1.56.1 : plan invalide refusé,
  estimation, sept profils, 14 unités effectives, suspension/reprise/arrêt,
  navigateur entièrement fermé pendant le calcul puis reconnecté, six contrastes,
  résultats par axe, dilution, téléchargements JSON/Markdown, mobile, aucune erreur JS.
- `scripts/v4-ui-test.ts` : ancien parcours de démonstration V4 toujours réussi.
- Tests ciblés : chaque famille d'observation, absence de fuites, DTO gelés,
  contraintes publiques incompressibles, hasard décisionnel supplémentaire sans
  effet sur les dés, comparaisons connues, faux événements/appariements refusés,
  doublons et paramètres incompatibles, IC absents en partiel, scénarios N=3..6.
- Persistance : fermeture/recréation du gestionnaire, **SIGKILL d'un vrai processus**,
  rollback SQLite après première insertion d'un lot, erreur avant checkpoint,
  reprise exacte sans doublon, arrêt d'un lot en vol, bail exclusif, sauvegarde
  WAL et restauration réelle, reprise incompatible refusée.
- Release extraite hors Git : `npm ci`, typage/build et empreinte exacte réussis.
  Recette locale du processus privé détaché : HTTP Basic, navigateur authentifié,
  arrêt/start, interruption PAUSED, reprise explicite et quatre unités complètes.
- `bash -n` sur les scripts Oracle et `git diff --check` : réussis.

Accès local actuel vérifié : <http://127.0.0.1:3104> → V4 expérimentale ; les deux
campagnes réelles y sont conservées via `V4_STUDIES_DIR` pointant sur leur
checkpoint privé. Relancer :
`V4_STUDIES_DIR=/workspace/amazonia-v4-scientific-results-2026-11-09/checkpoint npm run dev:v4`.
Le lancement sans cette variable utilise un nouveau stockage V4 persistant sous
`/tmp`, qui ne constitue pas une archive à long terme.

## Oracle et limites restantes

[Bloc privé Oracle prêt](ORACLE_V4_PRIVATE.md), release exacte et checksum fournis.
Aucun SSH Oracle configuré ici : installation Oracle **non exécutée**, et non
présentée comme réussie. La recette locale ne prouve ni les droits opc, ni le
Node préparé, ni la charge ou le comportement du serveur Oracle réel. Le bloc
n'utilise que de nouveaux fichiers/processus, sans sudo, en boucle locale et via
le canal SSH existant ; aucune opération sur phase P, services, portail ou réseau.

Équipes homogènes seulement, heuristiques non optimales, effectifs limités,
intervalles marginaux sans correction de multiplicité, aucun score global ni
inférence cognitive humaine. Pas de haute disponibilité, reprise automatique ou
preuve de capacité pour des millions de parties. Les limites de ressources sont
explicites et configurables ; aucune archive n'est purgée automatiquement.
Aucun arbitrage de règles supplémentaire n'a été nécessaire.
