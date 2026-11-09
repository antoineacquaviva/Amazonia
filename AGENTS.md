# Consignes aux agents de développement — Amazonia

> **Document d’organisation validé le 7 novembre 2026.** Ce fichier guide les interventions de Codex et d’autres agents de développement ; il ne donne pas d’autorisation générale de modification ou de déploiement.

## Objet du dépôt

Simulateur et outils de conception du jeu de plateau coopératif *Amazonia*. Le moteur TypeScript existant sur `main` constitue la référence technique implémentée. Des discussions de refonte ludique sont en cours : ne pas les appliquer avant spécification validée.

## Sources de vérité et ordre de priorité

1. Demande explicite du propriétaire pour la mission en cours, dans la limite du périmètre autorisé.
2. Documentation de conception **validée**, notamment `design/DECISIONS.md` et la version de règles expressément référencée.
3. État documenté dans `design/CURRENT_STATE.md` (indicateur de contexte, non substitution au code).
4. Code et tests existants pour déterminer le comportement réellement implémenté.
5. Hypothèses et questions ouvertes : informations exploratoires, jamais des exigences implicites.

En cas d'incohérence entre ces sources, **signaler le conflit plutôt que résoudre silencieusement**.

## Règles d'intervention

- Travailler sur une branche dédiée ; ne pas pousser directement sur `main`.
- Ne jamais modifier les règles de jeu, probabilités, bots, métriques ou variantes sans demande explicite et critères d'acceptation.
- Pour une mission d'infrastructure, préserver le comportement du moteur (`src/sim/`) sauf autorisation particulière.
- Documenter les fichiers modifiés, les risques, les tests exécutés et leurs résultats.
- Préférer des changements modestes, contrôlables, avec tests de non-régression.
- Ne pas déclarer une règle `VALIDÉ` ni réécrire les décisions humaines sans accord explicite.
- Ne pas exécuter de déploiement sur le serveur ni d'opération destructive sans autorisation spécifique.
- Ne jamais publier de secret, jeton ou configuration sensible dans GitHub ou les journaux.

## Qualité et reproductibilité

- Vérifier le typage TypeScript, les tests disponibles et la cohérence des contrats API.
- Pour toute modification du moteur, conserver des scénarios de référence à graine fixe et documenter les différences attendues.
- Associer les résultats expérimentaux aux paramètres, graines, version des bots et commit Git.
- Ne pas présenter des résultats Monte-Carlo comme des certitudes : distinguer métriques, incertitudes et interprétations.

## Mission initiale prévue : passerelle ChatGPT

- Préparer une passerelle distincte vers l'API Express existante, en commençant par `health`, lecture de configuration et simulation unitaire.
- Ne pas exposer directement sur Internet les routes administratives existantes.
- Valider strictement les paramètres et fixer des limites de ressources.
- Envisager MCP avec authentification ; confirmer les modalités d'intégration au compte ChatGPT avant de figer le transport et le déploiement.
- Préparer tests et documentation, sans ajouter d'exécution de commandes arbitraires.

## Livraison attendue pour chaque mission

1. Résumé des changements et des éléments non traités.
2. Liste des fichiers modifiés et des impacts sur les règles.
3. Commandes de validation effectivement exécutées et résultat de chacune.
4. Risques, limites, questions à arbitrer.
5. Pull request soumise à revue, sans fusion automatique, sauf autorisation explicite propre à une mission.

### Exception bornée : première simulation Amazonia V4 (9 novembre 2026)

La mission autorise le moteur V4, les bots, contrats, interface minimale, tests,
documentation et démonstration locale sur branche dédiée. La fusion de sa PR est
autorisée après réussite des contrôles pertinents et résolution des blocages,
sans revue manuelle intermédiaire. Respecter les protections GitHub ; aucun
contournement. Cette exception ne s'étend pas aux autres missions. Aucun accès
ni déploiement Oracle, ni modification des services, réseau, secrets, historiques,
workspaces ou exports de phase P. La spécification V4 reste expérimentale ; les
décisions explicites de cette mission priment sur ses questions encore ouvertes.

### Exception bornée : campagne scientifique V4 durable et instance Oracle privée

Cette mission autorise le panel de sept familles V4, protocole, mesures, stockage,
API, interface, outils et campagnes bornées, puis la fusion après contrôles sans
revue manuelle intermédiaire. Une nouvelle instance Oracle privée indépendante
est autorisée sous `opc`, sans sudo, exclusivement en boucle locale et via SSH,
si un accès existe ; sinon livrer un bloc opérateur. Ne modifier aucun dossier,
script, marqueur ou export de phase P, ni services actifs, portail, Caddy, réseau,
historiques ou comptes système. Cette exception est propre à la présente mission
et remplace son interdiction Oracle de la première mission V4, sans l'étendre.

### Exception bornée : kit Oracle V4 accessible depuis GitHub

La mission `docs/missions/V4_ORACLE_GITHUB_KIT.md` autorise les outils de
packaging, installation privée, tests et documentation, puis leur fusion après
validation sans revue manuelle intermédiaire. Un kit de code public vérifié peut
être publié, sans secrets ni données privées. Aucun changement des règles, bots,
mesures, services existants, réseau, comptes ou artefacts P. Les validations
locales ne constituent jamais un déploiement Oracle.
