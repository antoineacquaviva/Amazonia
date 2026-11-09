# Diagnostic Vite / esbuild — 9 novembre 2026

Base examinée : `main`, commit `efdb787ad3edad845dfc60c6124f6bca2cd4dd6e`.
Vérifications dans un worktree isolé, sous Linux x86_64, avec Node
`24.22.1` et npm `11.19.1`. Aucun accès à Oracle ni modification du portail.

## Cause et reproduction

Le dépôt ne contient aucun lockfile. `package.json` déclare directement Vite
`^8.3.0` dans les dépendances et esbuild `^0.25.0` dans les dépendances de
développement. Une installation normale résout respectivement `8.3.6` et
`0.25.12`, puis échoue avec `ERESOLVE` :

```text
Found: esbuild@0.25.12
  dev esbuild@"^0.25.0" from the root project
Could not resolve dependency:
  peerOptional esbuild@"^0.27.0 || ^0.28.0" from vite@8.3.6
```

Le caractère facultatif du peer permet son absence, mais pas une version
incompatible lorsqu'il est présent. Les plages n'ont aucune intersection :
`^0.25.0` exclut les versions `0.27.x` et `0.28.x`.
Ce conflit provient de la déclaration directe du projet, pas d'une exigence
du moteur de jeu ni d'une incompatibilité de Node. Vite 8.3.6 accepte Node
`^20.19.0 || >=22.12.0` ; Node 24.22.1 satisfait aussi le `>=24.0.0` du projet.
La déclaration d'esbuild existe depuis le scaffolding initial (`e70d3d8`).

Les métadonnées ont été vérifiées avec `npm view vite@8.3.6` et
`npm view esbuild@0.25.12`. La reproduction utilise `npm install --no-audit
--no-fund` dans le checkout propre, avec le cache placé dans un répertoire
temporaire accessible. Aucun `--force`, `--legacy-peer-deps` ni
`--ignore-scripts` n'a été utilisé.

## Correction minimale

Supprimer seulement `devDependencies.esbuild`. Aucun import d'esbuild, appel
à `transformWithEsbuild` ni script invoquant esbuild n'existe dans le code du
dépôt. Vite 8 utilise Rolldown ; la configuration actuelle n'active aucun
traitement esbuild explicite. `tsx`, nécessaire au serveur et aux tests,
conserve sa dépendance transitive esbuild.

Après cette suppression, la même installation réussit. `npm ls vite esbuild
tsx @vitejs/plugin-react @tailwindcss/vite` réussit et donne :

| Paquet | Version résolue |
| --- | --- |
| vite | 8.3.6 |
| tsx | 4.23.15 |
| esbuild (via tsx, partagé avec le peer Vite) | 0.28.2 |
| @vitejs/plugin-react | 6.3.0 |
| @tailwindcss/vite | 4.3.5 |

Aucune plage de version restante n'est modifiée. Il ne s'agit pas de choisir
une nouvelle version directe d'esbuild : sa déclaration inutilisée est retirée.
Rétrograder Vite ou imposer un nouvel esbuild direct ajouterait une contrainte
sans besoin identifié dans le code.

## Vérifications exécutées après correction

Toutes les commandes npm suivantes utilisent npm 11.19.1 et Node 24.22.1 :

| Vérification | Résultat |
| --- | --- |
| `npm install --no-audit --no-fund` depuis un checkout sans node_modules ni lockfile | Réussite, 179 paquets ajoutés |
| `npm ls vite esbuild tsx @vitejs/plugin-react @tailwindcss/vite` | Réussite, aucun paquet invalide |
| Transformation TypeScript avec `esbuild.transformSync` | Réussite, binaire natif opérationnel |
| `npm test` | 90 tests réussis, 0 échec, 0 ignoré ; environ 30 secondes |
| `npm run lint` (`tsc --noEmit`) | Réussite |
| `npm run build` (`vite build`) | Réussite avec Vite 8.3.6, 1670 modules transformés |
| `git diff --check` | Réussite |

Les tests incluent les résultats et traces historiques v3.3 pour les sept
profils de bots et les graines 42001, 42002 et 42003, ainsi que les campagnes,
la persistance, le protocole scientifique et les contrôles de sécurité.
Les campagnes de test utilisent des répertoires temporaires ; aucune donnée
historique du checkout initial n'a été copiée ou modifiée.

npm 11.19.1 signale des scripts d'installation non encore autorisés pour
`@google/genai`, `protobufjs` et `esbuild`. Aucune autorisation supplémentaire
n'a été ajoutée ; la transformation esbuild, les tests et le build réussissent
dans cet état. L'usage réel de l'API Google n'a pas été testé.

## Périmètre, limites et suite

Seuls `package.json` et ce compte rendu sont modifiés. Aucun changement du
moteur, des règles, des bots, de l'interface, des fixtures ou des données de
campagne n'est nécessaire. Les tests historiques passent, sans constituer
une preuve exhaustive de tous les scénarios possibles.

Le lockfile généré pour le diagnostic n'est pas ajouté à cette correction
minimale. Les versions ci-dessus décrivent la résolution vérifiée à cette
date ; les plages non verrouillées pourront produire d'autres versions.
`npm ci` n'est donc pas applicable au dépôt livré sans lockfile. Un éventuel
verrouillage complet des dépendances mérite une intervention séparée.
Ni Oracle Linux, ni une autre architecture, ni un déploiement, ni une recette
manuelle du navigateur n'ont été testés. Les tests/lint/build présents ont
tous été exécutés ; aucun audit de vulnérabilités n'est revendiqué.

La PR doit rester sans fusion automatique. Après revue et fusion, le commit
cible d'Amazonia dans `atelier-portail-maitre` devra être mis à jour vers un
commit contenant cette correction avant toute nouvelle préparation Oracle.
Cette mise à jour du portail ne fait pas partie de cette mission et n'a pas
été effectuée. Aucun déploiement n'a été réalisé.
