# Amazonia — Vision du projet

> **Statut : cadrage validé le 7 novembre 2026.** Publication dans GitHub en attente.

## Finalité

Concevoir et équilibrer *Amazonia*, un jeu de plateau coopératif autour de la protection de la forêt face à des machines. Le travail combine réflexion sur les mécaniques, simulation quantitative et prototypage visuel pour rendre les idées concrètes.

## Méthode de conception

1. **Concevoir avec ChatGPT** : formuler des hypothèses, comparer leurs effets ludiques, distinguer les décisions des pistes de recherche.
2. **Évaluer avec le simulateur Amazonia** : exécuter des parties et campagnes Monte-Carlo reproductibles sur le serveur existant.
3. **Développer avec Codex** : modifier le code ou les outils sur des branches dédiées, avec tests et revue avant fusion.
4. **Documenter dans GitHub** : garder une référence durable et versionnée entre plusieurs conversations.
5. **Visualiser avec une maquette de conception** : montrer le matériel, les règles et leur état d'élaboration. Cette maquette n'a pas vocation à devenir une implémentation jouable.
6. **Tester humainement plus tard dans BGA Studio** : une étape ultérieure distincte, après stabilisation suffisante du concept.

## Principes

- Le moteur simulé représente une **version implémentée**, pas nécessairement la meilleure version future du jeu.
- Une idée discutée n'est pas une règle retenue tant qu'elle n'a pas été explicitement validée.
- Une expérimentation peut comporter plusieurs variantes concurrentes sans imposer de choix.
- Les simulations servent d'aide à la décision ; elles ne remplacent pas le jugement de design ni les futurs tests humains.
- Aucune modification du code officiel ni déploiement ne doit être inféré d'un échange exploratoire.

## Périmètre technique confirmé comme orientation de projet

- Conserver le moteur et les workers sur le serveur Amazonia actuel.
- Construire progressivement une passerelle ChatGPT ↔ simulateur, sans réécrire le moteur.
- Envisager une connexion MCP ; garder une autre voie d'intégration possible si le compte ChatGPT ne prend pas en charge le flux voulu.
- Préserver le dépôt GitHub comme source de vérité technique et documentaire.

## Hors périmètre immédiat

- Jeu numérique jouable et gestion d'une partie interactive.
- Transposition vers BGA Studio.
- Automatisation de l'adoption des règles discutées.
- Refonte complète de l'interface visuelle ou du simulateur avant cadrage des besoins.

## Questions à préciser

- Objectifs ludiques finaux et critères de réussite qualitatifs.
- Forme et granularité de la future maquette visuelle.
- Choix définitif de l'intégration ChatGPT selon les droits disponibles.
