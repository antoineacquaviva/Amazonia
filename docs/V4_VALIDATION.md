# Validation de la première livraison V4 — 9 novembre 2026

## Exécution réelle

Source exécutée : commit `1d8d99ba3b18b17dd036dbee4a94556899652c0a`, sources
propres, Node v24.22.1. SHA256 :
`44e445573f6dd34edb0ab47aebc154b30313d94534627a73f7661f7a2a5b0017`.
Les commits documentaires suivants ajoutent les résultats sans changer ce code.

Commande effectivement exécutée :

```sh
npm run demo:v4 -- /workspace/Amazonia/docs/v4-demo-2026-11-09
```

Pilote : 79,56 ms ; effectif fixé ensuite à **8 graines par configuration**, soit
**64 parties** pour les huit combinaisons, en environ **12,26 secondes**. Trois
joueurs, huit tours, seize positions, deux arbres, ordre initial J1–J2–J3,
graines 42001 à 42008 communes. Parcours effectif HTTP local → pool de workers
partagé → résultats → téléchargement des deux exports.

- [Bilan Markdown](v4-demo-2026-11-09/report.md)
- [Résultats JSON, paramètres, provenance et traces](v4-demo-2026-11-09/results.json)
- [Mesure et effectif réel](v4-demo-2026-11-09/execution.json)

Chaque configuration donne ici une moyenne de 94,375 arbres debout sur un stock
écologique initial de 96 (perte moyenne 1,625). Les scores identiques sur ce petit
échantillon ne démontrent aucune équivalence entre variantes. Les tests de
scénarios, distincts de la démonstration, exercent les différences de règles.
Aucune conclusion d'équilibrage, aucun seuil de victoire V4.

Les exports ont été relus : 64 résultats, huit configurations distinctes, mêmes
huit graines, mêmes dés bruts entre configurations sur les traces, comptage
écologique cohérent, provenance présente sur chaque partie, aucun profil
privilégié. La première partie par configuration conserve sa trace complète.

`npm run dev:v4` a également été lancé ; `/api/health` répond à
<http://127.0.0.1:3104>. Le stockage du gestionnaire historique est un nouveau
répertoire temporaire, sans lecture ni écriture des données antérieures.

## Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| `npm run lint` | Réussi (TypeScript) |
| `npm test` | 112 tests réussis ; 0 échec, 0 ignoré, 0 annulé |
| Références V3.3 | Résultats complets et traces des 21 fixtures inchangés, plus scénarios historiques |
| `npm run build` | Réussi (Vite) |
| `V4_PLAYWRIGHT_PACKAGE=/tmp/amazonia-v4-browser/package.json npx tsx scripts/v4-ui-test.ts` | Réussi, Chromium local, Playwright 1.56.1 |
| Copie de la spécification | Identique octet pour octet à la pièce jointe |
| `git diff --check` | Réussi |

Les 20 scénarios moteur V4 couvrent notamment récupération sans combat, avance
unique, puissance cumulée, usure maximale non cumulée y compris après parade,
D strictement supérieur à P, sabotage A seul parant A+B, consommation globale,
effets A+B indépendants, géométrie décalée et activation HS dangereuse,
changements simultanés de l'Œil et pénalité aveugle d'un tour, persistance des
jetons, absence de fuite des lancers et propriétés privées injectées, capacité
furtive, initialisation selon les rangs, régénération et reproductibilité.

Les deux tests API V4 couvrent autorisation sur les deux préfixes, rejet des
paramètres et graines invalides, campagne concurrente refusée, huit variantes
réellement exécutées par workers et comparées au moteur, exports et suppression,
sans création d'historique V3.3. Le parcours navigateur vérifie les trois
sélecteurs, erreurs de configuration, une partie puis huit variantes, scores,
progression finale, téléchargements réels et navigation mobile, sans erreur JS.
Aucun contrôle prévu n'est déclaré indisponible ou ignoré.

## Périmètre et limites

Moteur, bots, observations et contrats : nouveaux modules `src/v4/`, sans
modification de `src/sim/` ni des fixtures V3.3. Intégration : un type de job ajouté
aux workers, une méthode dans le gestionnaire partagé, routes V4 sous les gardes
existants, composant V4 et entrée de navigation. Outils : lanceurs locaux,
démonstration et test navigateur. Documentation : copie de la spécification,
décisions et politique des bots, lancement, préparation Oracle et exception de
gouvernance limitée à cette mission.

Limites explicites : stockage V4 en mémoire, sans reprise serveur ; exporter
avant redémarrage. Une seule politique heuristique de bots ordinaires, aucun
optimum ni étude d'équilibrage. Les limites de domaine et de ressources sont
refusées explicitement, sans compléter les règles ouvertes. Aucun accès ni
déploiement Oracle et aucune modification des services, réseau, secrets,
historiques, workspaces ou exports de phase P.
