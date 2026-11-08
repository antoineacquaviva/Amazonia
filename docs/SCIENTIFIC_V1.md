# Mission 1B.3 — première tranche scientifique

## Périmètre validé

Base : `main` après PR #3 (`71d4edd`). La réponse du propriétaire autorise un cadre testable avec les révisions ambiguës explicitement indisponibles. Cette PR réalise cette première tranche, pas toutes les futures politiques ni le protocole adaptatif.

Deux protocoles coexistent :

- **HISTORICAL_V33** : comportement historique, panel de sept bots, RNG et évaluateur inchangés. Un identifiant absent signifie historique ; aucune conversion implicite. Les limites sont affichées, sans réécrire les anciens résultats.
- **SCIENTIFIC_V1** : conventions de hasard, observations, politiques pilotes, statistiques et provenance distinctes. Aucun résultat scientifique n'est inséré dans les scores historiques.

Le moteur v3.3 reçoit seulement une interface technique optionnelle (`sim/runtime.ts`) pour le RNG d'environnement et la phase de décision. Sans cet adaptateur, le chemin historique est exactement celui d'origine. Aucune règle de résolution ni formule historique n'est changée. Les tests comparent les 21 objets complets, traces et journaux compris ; les fixtures ne sont pas régénérées.

## Décisions de règles encore nécessaires

La spécification `public/assets/aistudio/sp_cification_fonctionnelle_simulateur_google_ai_studio_d5c834d5.md`, section 4.3, décrit une première pose simultanée et définitive, puis évoque sa reprise lors des reconversions. L'ordre exact des observations au cours des révisions n'est pas suffisamment déterminé pour porter ces comportements sans décision de conception.

En conséquence : COORD_NO_DICE et COORD_HYBRID restent disponibles dans l'historique, mais sont refusés explicitement en scientifique. Aucun nouveau langage de signaux ni règle de déplacement n'est inventé. Leur future implémentation demande un contrat de révision validé, une version de politique propre et de nouveaux tests.

## Aléatoire et appariement

Le manifeste scientifique contient :

- `experimentSeed` : identifiant de la famille de mondes expérimentaux ;
- `environmentSeed` : espace de hasard exogène ;
- `policySeed` : espace du hasard décisionnel ;
- les graines unitaires, déterminées par `baseSeed + index + 1` dans la campagne.

`INDEXED_SHA256_V1` indexe chaque dé par expérience/environnement/partie/tour/siège/D1 ou D2. Un rejet des valeurs hors multiple de la largeur évite le biais du modulo. Le mélange initial de piste a son propre index. Chaque décision possède une source distincte, indexée par expérience/politique/partie/tour/siège/étape/version de politique ; ses paramètres sont dans des champs privés JavaScript.

Il s'agit d'un modèle pseudo-aléatoire reproductible, pas d'une preuve d'indépendance physique. Consommer davantage de hasard décisionnel n'affecte ni les dés futurs ni leur ordonnancement. Le RNG historique n'est pas modifié.

Les comparaisons vérifient : unités uniques, mêmes unités des deux côtés, même clé de règles/paramètres/environnement et même empreinte des dés et de la piste effectivement utilisés. Pas de conclusion d'appariement sur la seule égalité d'une graine. La piste mélangée réellement utilisée est celle montrée aux politiques scientifiques.

Deux trajectoires peuvent diverger : le même dé peut concerner une machine détruite dans une partie et encore active dans l'autre. L'appariement porte sur les événements exogènes indexés, pas sur l'identité des états, des combats ou des conséquences. Des versions, nombres de joueurs, horizons ou paramètres différents ne sont pas appariables selon ce contrat.

Rejouer une comparaison : conserver le JSON de campagne, le code correspondant aux empreintes, les options `science`, les paramètres de variante, l'équipe normalisée et les graines. Appeler `runScientificGame` avec ces éléments, puis reconstruire les contrastes par unité. Les versions incompatibles sont refusées à la reprise. Les versions Node/V8 et la plateforme/architecture sont enregistrées et vérifiées à la reprise : leur changement nécessite une validation de compatibilité, sans conversion automatique. Le commit Git et l'état sale des fichiers suivis sont enregistrés lorsque Git est disponible ; les empreintes des sources sont la référence effective, même sans Git.

## Contrat d'observation

`OBS_V1_NO_REVISIONS` projette des copies détachées et gelées : plateau public (machines, arbres, souches, pièges/sabotages), piste réellement utilisée, paramètres publics, actions légales, et informations autorisées pour le profil.

- BLIND et PROB_ONLY : aucun dé personnel, aucun dé partenaire.
- SOLO_INFORMED : seul son dé personnel ; pas de lecture des placements collectifs pour sa politique.
- COORD_ONE_SHOT : dé personnel, placements publics de l'étape précédente et historique des placements visibles.
- OMNISCIENT : DTO distinct étiqueté `ALL_CURRENT_ROLLS`, contenant tous les tirages courants.

Les événements visibles contiennent uniquement joueur, étape, piste, case et type de jeton. Aucune raison interne, carte face cachée, intention ou annotation collective privée n'est transmise. L'historique V1 est volontairement limité aux placements, pas à toute la mémoire potentiellement disponible à un humain.

La première pose est simultanée : aucune politique ne voit les premières poses des partenaires avant sa décision. Les secondes poses voient l'état public finalisé de l'étape 2.1 et sont décidées sur cette même photographie. Il n'y a pas de révision. La légalité utilise les contraintes publiques de capacité, même pour les politiques sans lecture volontaire des signaux ; ce n'est pas une suppression de toute information publique.

Les politiques ordinaires ne reçoivent jamais le tableau de tous les secrets. C'est un contrat de circulation des données entre modules de confiance, pas un bac à sable pour du code malveillant capable d'importer des fichiers ou d'utiliser d'autres canaux globaux. Aucun chargement de politique arbitraire par HTTP n'est ajouté.

## Politiques pilotes et équipes

Les identifiants historiques servent de familles ; leurs **versions scientifiques sont de nouvelles politiques pilotes**, pas des portages scientifiquement « corrigés » des stratégies historiques.

| Famille | Version scientifique | Décision |
|---|---|---|
| BLIND | SCI_BLIND_V1 | Case proche d'une machine, décalage aléatoire 1 ou 2 ; pas de lecture du dé ni des probabilités. |
| PROB_ONLY | SCI_PUBLIC_PROB_V1 | Marginales publiques sur les 36 couples, pondération heuristique de vulnérabilité. |
| SOLO_INFORMED | SCI_PERSONAL_V1 | Même base, avec contribution de son propre tirage et N−1 tirages inconnus. |
| COORD_ONE_SHOT | SCI_VISIBLE_ONE_PASS_V1 | Même base, plus bonus heuristique sur des jetons tactiques réellement visibles. |
| OMNISCIENT | SCI_PRIVILEGED_HEURISTIC_V1 | Compte les tirages courants exacts ; reste une allocation heuristique limitée. |

Tous ces pilotes choisissent des poses tactiques ; leur seconde pose cible le siège suivant. Ce sont des restrictions explicites de politique, pas de nouvelles règles du jeu. Elles rendent les poses simultanées légales sans introduire une résolution cachée des collisions. L'exploitation stratégique complète de la furtivité, les révisions et la mémoire humaine sont reportées. Ces politiques sont des pilotes de validation scientifique : leurs performances ne permettent pas encore de conclure à la meilleure variante de règles d’Amazonia. Cet avertissement est commun au configurateur, à la vue des résultats, au Markdown et aux rapports JSON, y compris les tables partielles. Aucun plafond de performance n'est démontré ; le contrôle privilégié peut faire moins bien qu'une autre politique.

Les équipes homogènes et mixtes entre politiques ordinaires sont explicites ; une liste courte est répétée cycliquement jusqu'à N, et l'équipe résultante ainsi que ses versions sont enregistrées. Les rotations de sièges sont testées, sans supposer leur équivalence : la matrice de ciblage est asymétrique. Une table mêlant OMNISCIENT et politiques ordinaires est refusée tant qu'une convention n'est pas validée. Des tables entièrement privilégiées restent comparables comme contrôles séparés.

Le hook de décision supplémentaire utilisé pour tester une consommation excessive d'aléatoire produit des résultats `TEST_OVERRIDE`, non agrégeables comme politiques enregistrées. Il n'est pas exposé dans l'API des campagnes.

## Mesures et méthodes

La population est celle des parties simulées à règles, paramètres et équipe fixés, sous le modèle pseudo-aléatoire déclaré.

| Mesure | Formule et unité | Sens favorable |
|---|---|---|
| Survie sur horizon | `clamp(1 − pertes / (N × X × a), 0, 1)`, ratio | Plus haut |
| Pertes finales | Somme par joueur de `max(0, potentiel écologique alloué − arbres debout après régénération)`, arbres | Plus bas |
| Défaite | Indicateur `survie < 0,45`, fréquence | Plus bas |
| Contraste apparié | Moyenne de `survie(gauche, unité) − survie(référence, unité)`, ratio | Positif favorable à gauche |

La première table réellement sélectionnée est la référence ; pas de remplacement d'un profil absent. Les rapports distinguent `selectedProfiles` (politiques implémentées et sélectionnées), `unselectedProfiles` (implémentées mais non sélectionnées) et `unavailableProfiles` (non implémentées : COORD_NO_DICE et COORD_HYBRID). Une politique absente du plan, telle qu’OMNISCIENT, n’est pas pour autant indisponible.

- Moyenne et moments : algorithme de Welford, écart-type d'échantillon avec dénominateur n−1.
- Erreur standard : écart-type d'échantillon / √n ; indisponible pour n<2.
- Moyennes bornées : intervalle de Hoeffding à 95 %, rayon `(borne haute − borne basse) × sqrt(log(40)/(2n))`, intersecté avec le domaine de la mesure. Méthode conservatrice, sans hypothèse normale, sous indépendance et échantillon fixé.
- Survie appariée : même calcul sur les différences par unité, domaine [−1,1]. La variance empirique nulle ne produit pas un intervalle artificiellement certain.
- Fréquences : Wilson score à niveau nominal 95 %, y compris zéro ou toutes les occurrences. Ce n'est pas un intervalle exact à couverture uniforme pour toute petite taille ; une fréquence observée nulle n'est jamais présentée comme impossibilité.

Les données manquantes sont comptées. Une moyenne descriptive des valeurs disponibles peut être montrée, mais aucun intervalle n'est produit avec des observations manquantes. Aucun intervalle n'est produit si l'indépendance n'est pas déclarée ou si le plan à effectif fixé n'est pas complet. Les unités dupliquées, profils/implémentations mélangés et configurations de règles mélangées sont refusés.

Les indicateurs historiques de pertinence, de gains I1/I2/I3 et la prétendue Shapley ne deviennent pas des mesures corrigées dans ce protocole. Les contrastes décrivent les différences entre **politiques**, pas l'effet causal isolé d'une information. Les différences appariées de pertes et les contrastes de fréquences restent à ajouter ; cette première tranche publie les contrastes de survie et les trois mesures par équipe.

Les intervalles sont marginaux, sans correction de multiplicité ni garantie globale de classement. `analysis` et `familyId` sont des déclarations ; le champ CONFIRMATORY ne constitue pas un enregistrement préalable ni une validation automatique d'un protocole confirmatoire. Le nombre de contrastes de cette variante est enregistré, sans prétendre dénombrer toute une famille inter-variantes. Les résultats par unité conservés permettent de futurs ajustements ; aucun p-value ou protocole adaptatif n'est ajouté.

## Campagnes, stockage et reprise

L'orchestration 1B.2 est conservée. Les nouvelles campagnes scientifiques portent une supervision de schéma **2**, un manifeste et une empreinte de configuration. Les campagnes historiques conservent le schéma 1. Toute absence d'identifiant scientifique reste historique.

Évolution additive : tables SQLite `scientific_samples` (mesures et identifiants par unité) et `scientific_audits` (observations et environnement d'une partie témoin). Les insertions sont dans la même transaction que les lots, les agrégats et la progression. Aucun fichier réel n'est migré ou réécrit par la mission.

Les rapports scientifiques sont dans `scientificResults`, les tables inachevées dans `scientificPartial`, séparés de `variantResults` historique. L'export Markdown scientifique utilise ses propres intitulés et dictionnaire. Le JSON inclut le manifeste, les rapports et la provenance ; il ne constitue pas encore une archive autonome de toutes les mesures unitaires. Ces mesures restent conservées en base et les graines permettent le rejeu.

Pour ne pas réécrire des observations volumineuses dans chaque checkpoint, les audits détaillés sont séparés des résumés. Les témoins sont ceux enregistrés par le plan existant (première partie de chaque table, pour les douze premières variantes). Endpoint de lecture : `GET /api/campaigns/:id/scientific-audits/:variantIndex/:tableId` (index à partir de zéro). Un témoin absent répond 404 ; il n'est pas fabriqué. Un audit privilégié est explicitement identifié.

La reprise vérifie versions, empreintes de sources et manifeste. Une incompatibilité place la campagne en erreur et refuse sa reprise ; aucun recalcul sous une autre implémentation n'est silencieusement effectué. Un changement de mise en forme des sources peut donc aussi exiger une stratégie de compatibilité validée. Les anciens checkpoints 1B.2 non étiquetés sont testés en reprise historique. Les nouveaux schémas scientifiques ne doivent pas être ouverts avec une ancienne application 1B.2 : tout retour arrière demande une procédure sauvegardée et validée.

Les plans scientifiques à arrêt temporel sont refusés ; les tables d’une variante encore partielle restent descriptives, sans intervalle, même si l’une d’elles a atteint son propre effectif. Les stress tests historiques restent inchangés. Le stress randomisé SCIENTIFIC_V1 est explicitement refusé dans cette première tranche ; les expériences scientifiques utilisent des plans Monte-Carlo fixes. Les plafonds de sécurité 1B.1 restent temporaires. Le volume des mesures unitaires peut devenir important : une politique de stockage, d'export en flux et de rétention sera nécessaire à grande échelle.

Une violation d'invariant du moteur empêche la validation du résultat scientifique. Les mécanismes de retry/ERROR du runner restent bornés. Le navigateur n'effectue aucun calcul ni reprise automatique ; le sélecteur de protocole est explicite, le défaut reste historique. Les CIs sont désactivés dans l'interface tant que l'utilisateur n'a pas déclaré l'indépendance.

## Validation et limites

Les tests couvrent : références historiques complètes ; dés communs entre politiques et malgré consommation décisionnelle supplémentaire ; piste mélangée ; observations indiscernables malgré changements de secrets/métadonnées ; conséquences légitimes du plateau visible ; contrats mixtes et rotations ; contrôle privilégié ; moments connus, Wilson aux extrêmes, petits effectifs, données manquantes, différences appariées de variance nulle, refus des faux appariements ; reprise scientifique exacte, manifestes altérés, ancien checkpoint historique, API et audits durables.

Les essais utilisent exclusivement des campagnes et des répertoires temporaires. `npm test`, `npm run lint`, `npm run build` sont les commandes de validation. Résultat final après revue : 79 tests réussis, typage et compilation réussis. Un essai Chromium isolé vérifie le sélecteur explicite, l’absence des politiques de révision indisponibles, dix parties serveur, le contraste apparié avec IC95 et l’accès à un audit, sans erreur JavaScript.

Non démontrés : indépendance mathématique du pseudo-aléatoire, couverture empirique de tous les modèles de jeu, optimalité ou réalisme humain des pilotes, causalité I1/I2/I3, classement global corrigé, charge de production et comportement du portail Oracle. Aucun déploiement, nouvelle authentification ou changement du portail.

## Architecture future, sans implémentation prématurée

Les archives d'analyse devront devenir autonomes et inclure des copies figées de vision, décisions, règles, variantes, protocole et résultats. Les empreintes seules de cette PR ne satisfont pas encore cette exigence d'archive autonome.

Les futures versions devront articuler moteur commun, descriptions de versions, modules de règles et bibliothèques de politiques. L'adaptateur de cette PR est un point technique limité ; aucun méta-moteur ni règle v4.0 n'est implémenté. La v3.3 historique doit rester rejouable selon ses conventions et ses références.

Avant fusion : valider les conventions de politiques pilotes, le caractère volontairement incomplet de la première tranche, les méthodes et hypothèses statistiques, la séparation des formats et les conditions de reprise. Attendre ensuite les règles validées des révisions pour la tranche suivante.

Contrôles complémentaires : `git diff --check` réussi ; diff nul sur bots, RNG, évaluateur, i18n et fixtures historiques. Les empreintes SHA-256 des campagnes existantes sont inchangées ; aucune base scientifique n’a été créée dans leur répertoire.

Ajustement de revue PR #4 : classification et avertissements uniquement ; aucune modification de la logique des checkpoints. Comme avant, les empreintes incluent `reports.ts` : leur changement conserve la règle de compatibilité stricte à la reprise, sans migration ni contournement automatique des checkpoints scientifiques antérieurs. Les archives dépourvues des nouveaux champs de classification sont signalées comme antérieures dans la présentation.
