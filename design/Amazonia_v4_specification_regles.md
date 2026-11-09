# AMAZONIA : DERNIER REMPART
## Spécification des règles — v4.0, socle symétrique expérimental

**État : 7 novembre 2026 — document de conception consolidé, non encore intégralement verrouillé.**

Cette spécification décrit le jeu et les variantes de règles explicitement retenues pour comparaison. Elle ne décrit ni le fonctionnement ni l'organisation d'un outil de simulation.

### Statut des règles et priorité des sources

- **Référence** : règle applicable dans la version de base décrite ici.
- **Variante** : autre formulation conservée pour comparaison, sans remplacer la référence.
- **À préciser** : décision nécessaire pour clore une spécification sans ambiguïté.
- **Différé / historique** : mécanisme envisagé mais non retenu dans la version de base.

En cas de contradiction, les décisions explicites prises pendant les échanges de conception priment sur `idees.txt`, qui prime lui-même sur la bible HTML v3.3. Les éléments du HTML non remplacés restent des règles héritées **provisoires**, lorsqu'ils sont compatibles avec les nouvelles règles.

---

## 1. Objet du jeu

Amazonia est un jeu **coopératif à communication silencieuse**, pour **3 à 6 joueurs**. Les joueurs défendent les forêts de leurs pistes contre deux types de machines : l'**Abatteuse (A)** et le **Bulldozer (B)**.

Chaque joueur possède une information secrète et certaine sur un résultat de dés du Méchant. Les joueurs doivent exploiter cette information, les probabilités publiques et la position des machines pour placer leurs défenseurs sans se parler pendant la programmation.

Le but est de **maximiser le nombre d'arbres debout** à l'issue du dernier tour, **après la régénération écologique**. La durée de la partie, notée **X**, reste réglable ; les durées explorées dans le document antérieur vont de **6 à 12 tours**. Aucun X unique n'est encore adopté pour la nouvelle version.

L'apprentissage du Méchant, sa dérive progressive vers des tactiques kamikazes et les pouvoirs asymétriques des peuples sont **différés** : ils ne font pas partie de ce socle.

## 2. Matériel, pistes et mise en place

### 2.1. Pistes d'un joueur

Chaque joueur dispose d'une piste principale qui fusionne les anciennes pistes Forêt et Combat :

- À partir de la **position 2**, chaque position est représentée par une **case double** : une sous-case **Tactique** à gauche, portant une flèche entrante et recevant les cartes ; une sous-case **Forêt** à droite, recevant les arbres, les machines et les défenseurs en combat.
- La **première position** fait exception à cette présentation en deux sous-cases.
- Une piste annexe de **Furtivité** longe la piste principale et est décalée d'une demi-case.

**Convention géométrique :** une case furtive **c** se trouve face à la sous-case **Forêt Fₚ** et à la sous-case **Tactique Tₚ₊₁**. Il ne faut donc pas confondre le numéro d'une case furtive et celui d'une position de forêt. Une machine située initialement en **p+1** n'expose pas, du seul fait de cette présence, un défenseur furtif situé en **c**.

Le **nombre total de positions de la piste Forêt** et le traitement de la **fin de piste** restent à préciser explicitement.

### 2.2. Situation initiale héritée du HTML v3.3

Sauf variante :

- Chaque case forestière contient **2 arbres debout**.
- Exception : la **case 2 des joueurs occupant J1 et J2 sur l'Œil** contient **1 arbre debout et 1 souche**.
- Chaque piste accueille **une Abatteuse et un Bulldozer**, tous deux **en position 1 et opérationnels** en début de partie.
- Chaque joueur dispose normalement de **2 jetons Défenseur**, à deux faces : **« Réflexion en cours »** et **« Choix définitif »**.
- Les jetons **Piège** et **Sabotage** sont disponibles **sans limite globale de réserve**, mais leur pose est limitée à **1 piège par case** et **1 sabotage par machine**.

L'ordre initial des personnes sur l'Œil doit être établi lors de la mise en place ; sa méthode d'attribution précise n'est pas encore spécifiée ici.

## 3. Les lancers et l'Œil du Méchant

### 3.1. Lancer 2D6

À chaque tour, chaque joueur génère un résultat de **deux dés à six faces**, notés **D1** (ligne) et **D2** (colonne). Sauf pénalité de découverte, le joueur en prend connaissance **secrètement** avant de programmer ses défenseurs.

Le résultat détermine :

1. La **tactique** déclenchée par la valeur **M = min(D1, D2)**.
2. Le **rang de l'Œil** de la piste ciblée, selon la matrice publique.

| Valeur M | Carte | Tactique | Puissance | Fréquence sur 36 |
|---|---|---|---:|---:|
| 1 | A1 | Manœuvre de l'Abatteuse | 1 | 11 |
| 2 | B1 | Manœuvre du Bulldozer | 1 | 9 |
| 3 | A2 | Assaut de l'Abatteuse | 2 | 7 |
| 4 | B2 | Assaut du Bulldozer | 2 | 5 |
| 5 | A3 | Furie de l'Abatteuse | 3 | 3 |
| 6 | B3 | Furie du Bulldozer | 3 | 1 |

### 3.2. Matrice de ciblage héritée du HTML v3.3

J1 est le **rang actuellement le plus exposé** et JN le moins exposé. Ces codes désignent des **rangs**, et non des personnes immuables.

| D1 \ D2 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| **1** | J1 | J1 | J1 | J2 | J3 | **B** |
| **2** | J1 | J1 | J1 | J1 | J2 | J3 |
| **3** | J1 | J1 | **C** | **A** | J2 | J2 |
| **4** | J1 | **A** | J2 | J1 | J1 | **B** |
| **5** | J2 | J2 | **D** | J3 | J1 | J2 |
| **6** | J3 | J1 | J2 | J3 | J3 | J1 |

Les quatre cases spéciales dépendent du nombre de joueurs :

| Case spéciale | 3 joueurs | 4 joueurs | 5 joueurs | 6 joueurs |
|---|---|---|---|---|
| **A** | J1 | J4 | J5 | J5 |
| **B** | J1 | J1 | J4 | J4 |
| **C** | J1 | J1 | J1 | J6 |
| **D** | J2 | J2 | J4 | J4 |

**Incohérence relevée dans le HTML v3.3 :** le décompte des 36 cases du tableau recopié ci-dessus donne respectivement **20/10/6** (3 joueurs), **18/10/6/2** (4), **16/9/6/3/2** (5) et **15/9/6/3/2/1** (6). Or le texte du HTML annonce **21/10/5**, **19/10/5/2**, **17/9/5/3/2** et **16/9/5/3/2/1**. Une occurrence est attribuée à **J3** au lieu de **J1** dans toutes les configurations. **Le tableau est reproduit sans correction arbitraire ; la matrice définitive reste à confirmer.**

Ce dispositif conserve l'asymétrie probabiliste de l'Œil. Les conséquences d'une découverte peuvent modifier durablement **qui occupe chaque rang**.

## 4. Programmation silencieuse des défenseurs

Aucune communication verbale n'intervient pendant cette phase.

1. **Premier défenseur :** chaque joueur place son jeton sur **sa propre piste**, en **combat** ou en **furtivité**, directement sur la face **« Choix définitif »**. Cette pose est irréversible.
2. **Second défenseur :** chaque joueur place son jeton sur **une piste alliée**, en combat ou furtivité, sur la face **« Réflexion en cours »**.
3. **Négociation muette :** tant que le second jeton porte « Réflexion en cours », son propriétaire peut le déplacer **autant de fois qu'il le souhaite**, changer de **piste alliée**, de **case** et de **mode**.
4. **Validation individuelle :** le joueur retourne son second défenseur sur **« Choix définitif »**. Le retournement est **irréversible** : ce jeton ne bouge plus, même si d'autres joueurs réfléchissent encore.
5. **Validation collective :** lorsque **tous les seconds défenseurs** présentent « Choix définitif », la programmation est close et les lancers peuvent être révélés.

Il n'existe **aucun plafond supplémentaire de défenseurs sur une case de combat**. Leur concentration est uniquement limitée par le nombre de jetons disponibles et leurs obligations de placement.

Le nombre de défenseurs sur **une même case furtive** n'est pas encore tranché : deux variantes sont conservées en section 11.

## 5. Activation et récupération des machines

### 5.1. Machine opérationnelle

Si une machine opérationnelle reçoit **au moins une carte d'activation** au cours du tour, elle avance **d'une seule position** de **p vers p+1**, indépendamment du nombre de cartes reçues. Toutes les cartes qui l'activent participent à son attaque en **p+1** et sont posées sur la sous-case tactique correspondante.

Sans activation, elle ne bouge pas et n'attaque pas.

### 5.2. Compteur HS : règle de référence

Chaque machine possède un compteur de récupération **HS = 0, 1 ou 2** :

- **T1** : aucune usure.
- **T2** : **1 activation future de récupération**.
- **T3** : **2 activations futures de récupération**.

La contrepartie est imposée **après l'attaque**, que celle-ci ait été **parée ou non**. Si plusieurs cartes concernent la même machine, **seule la plus forte contrepartie** s'applique : les durées ne s'additionnent pas (T2+T2 = HS 1 ; T2+T3 = HS 2 ; T3+T3 = HS 2).

**Réparation simple de référence :** une machine déjà HS au début d'un tour qui reçoit **au moins une activation** réduit son compteur de **1 au maximum pendant ce tour**. Elle **n'avance pas, n'attaque pas**, et les cartes ayant servi à sa récupération **ne produisent ni puissance de combat ni nouvelle usure**. Sans activation, son compteur reste inchangé.

Si le compteur descend à zéro, la machine redevient opérationnelle **pour les tours ultérieurs**, mais ne peut pas combattre au tour qui a permis cette dernière récupération.

Une machine activée uniquement pour récupérer reste dangereuse pour un défenseur furtif situé à son emplacement : **l'activation peut provoquer sa découverte sans déplacement**.

### 5.3. Explosion

L'explosion définitive associée à T3 dans `idees.txt` **n'existe plus dans les règles de référence**. Elle reste une ancienne piste de conception, distincte de la nouvelle échelle d'usure.

## 6. Furtivité et découverte lors d'un tour

Une case furtive **c** est associée à **Fₚ** et **Tₚ₊₁**. **Un seul défenseur suffit pour tenter une action furtive.**

La découverte a toujours priorité sur le sabotage ou le piégeage.

| Situation concernant un défenseur furtif en c | Résolution |
|---|---|
| Une machine activée **part de p** vers p+1 | Défenseur découvert |
| Une machine **arrive en p** à la suite d'une activation | Défenseur découvert |
| Une machine **HS est activée en p** pour récupérer, même sans bouger | Défenseur découvert |
| Une machine est activée en p, une autre y reste immobile | Défenseur découvert ; **aucun sabotage** |
| Machine(s) présente(s) en p, **aucune activée** et aucune arrivée activée | Sabotage possible, même si une machine est HS |
| Aucune machine en p et aucun mouvement/activation dangereux pour c | Piégeage possible |
| Machine initialement en p+1, sans mouvement entrant ou activation concernant p | Aucune incidence directe sur ce défenseur |

Si plusieurs défenseurs occupent une même case furtive exposée, **tous sont découverts** ; chacun des propriétaires concernés subit les pénalités de découverte. Aucun de ces défenseurs ne réalise d'action furtive pendant le tour.

### 6.1. Poser un piège

Quand aucune machine ne se trouve sur la position forestière associée et que le défenseur n'a pas été découvert, il peut poser un piège sur cette position, **si elle n'en contient pas déjà un**. Une tentative sur une case déjà piégée reste sans effet.

Un piège ne peut intervenir dans un combat **avant le tour suivant sa pose**. Il persiste **sans limite de temps** jusqu'au **premier combat sur sa case**, puis est consommé, que la parade réussisse ou non.

### 6.2. Poser un sabotage

Si une ou deux machines restent immobiles à la position associée **sans avoir été activées**, le défenseur non découvert peut poser un sabotage, y compris sur une machine **HS**, dans la limite de **1 sabotage par machine**. Une tentative sur une machine déjà sabotée reste sans effet.

Deux possibilités sont conservées pour une position occupée par **A et B immobiles** : chaque défenseur peut saboter **une seule machine de son choix** ou **les deux**, sous réserve qu'elles ne portent pas déjà de sabotage.

Un sabotage posé au tour t n'est applicable qu'à partir du **tour t+1**. Il demeure attaché à la machine jusqu'à son **premier combat ultérieur**, même si celle-ci traverse une période HS et récupère totalement. La récupération HS **ne purge jamais** le sabotage dans la version de référence.

## 7. Résolution des combats

Un combat se déroule sur une position où **au moins une machine opérationnelle a effectivement avancé pour attaquer**. Si A et B attaquent **la même position** au cours d'un tour, elles participent à **un combat unique**. Si elles attaquent des positions différentes, chaque combat est résolu sur sa propre case.

### 7.1. Puissance cumulée

La puissance **P** de l'attaque est la **somme des puissances de toutes les cartes participant à ce combat**. Le nombre de cartes renforce la difficulté de parade, mais ne multiplie pas les dégâts écologiques de chaque machine.

### 7.2. Deux conditions alternatives de parade

Une attaque est **entièrement parée** si :

1. Le nombre **D** de défenseurs en **combat sur la case** satisfait **D > P** ; **ou**
2. Au moins **un défenseur en combat** est présent **avec un piège sur cette case ou un sabotage porté par une machine participant au combat**, quel que soit P.

Il n'existe qu'**une seule catégorie de parade**, avec les **mêmes conséquences** quelle que soit la méthode. Un sabotage sur A suffit, avec un défenseur, à **parer globalement A+B** si les deux attaquent ensemble.

**Parade réussie :** aucun dégât écologique n'est infligé. **L'usure intrinsèque** due aux tactiques T2/T3 **s'applique néanmoins aux machines attaquantes**.

### 7.3. Dégâts écologiques d'une attaque non parée

- **Abatteuse :** transforme **au plus 1 arbre debout** de la case en souche, quel que soit le nombre de cartes A ou leur puissance.
- **Bulldozer :** élimine **toutes les souches retenues pour son attaque**, sans effet supplémentaire sur les arbres debout si aucune souche n'est présente.
- **A+B, règle de référence : effets indépendants.** Le Bulldozer n'élimine que les souches **présentes au début de la résolution de ce combat** ; il ne détruit **pas** la souche créée au cours du même combat par l'Abatteuse.

**Variante de difficulté : synergie destructrice A puis B.** L'Abatteuse transforme d'abord un arbre en souche ; le Bulldozer élimine ensuite **toutes** les souches, **y compris celle nouvellement créée**.

### 7.4. Consommation globale des jetons

À l'issue de chaque combat, indépendamment de sa réussite ou de sa parade :

- Le **piège déjà présent sur la case attaquée** est consommé, même si aucun défenseur ne l'a rendu utile à la parade.
- Le **sabotage porté par chaque machine effectivement engagée** est consommé, même si un autre jeton suffisait à la parade.
- Les sabotages des machines **n'ayant pas participé au combat** restent en place.

Tous ces jetons retournent à la réserve, qui n'est pas limitée. Les jetons posés **après les combats**, pendant la furtivité de ce tour, ne sont jamais consommés par ces combats.

## 8. Ordre de résolution d'un tour

1. **Lancers 2D6**, privés ou aveugles selon les pénalités actives.
2. **Programmation silencieuse** et validation irréversible des deux défenseurs de chaque joueur.
3. **Révélation** des résultats ; détermination des activations, mouvements des machines opérationnelles et récupérations des machines HS.
4. **Découverte** des défenseurs furtifs exposés par un départ, une arrivée ou une activation sur place, y compris pendant une récupération HS.
5. **Combats** sur les positions effectivement attaquées : puissance, parade, dégâts éventuels, usure intrinsèque, consommation des pièges et sabotages existants.
6. **Actions furtives** des défenseurs non découverts : pose de nouveaux pièges ou sabotages, sans effet sur les combats déjà résolus.
7. **Fin de tour** : défausse des cartes, récupération normale des défenseurs, prise en compte des découvertes et préparation des pénalités temporaires pour le prochain tour.

Pour éviter de dépendre de l'ordre matériel de résolution, les découvertes multiples et les modifications correspondantes de l'Œil sont **traitées simultanément**.

## 9. Conséquences d'une découverte

La référence actuelle comporte **deux pénalités**, et non plus trois :

### 9.1. Lancer aveugle au tour suivant

Le propriétaire de chaque défenseur découvert génère toujours son lancer 2D6 lors du tour suivant, **mais n'en connaît pas le résultat pendant la programmation**. L'attaque est maintenue et normalement révélée pendant la résolution. La pénalité dure **un tour** ; une nouvelle découverte la renouvelle pour le tour d'après.

### 9.2. Prise persistante de l'Œil

Le propriétaire d'un défenseur découvert devient plus exposé en changeant de rang sur l'Œil. **Ce changement est permanent** : le rang précédent n'est pas rétabli automatiquement. Deux modalités sont conservées :

- **ONE_STEP — progression d'un rang :** chaque joueur découvert progresse d'**au plus un rang** vers J1. Il ne dépasse jamais un autre joueur découvert. Lorsque plusieurs joueurs découverts occupent des rangs consécutifs, leur groupe progresse ensemble d'au plus un rang, sans modifier leur ordre relatif. Tout est calculé à partir du **même ordre initial**.
- **FULL_CAPTURE — prise complète :** tous les joueurs découverts sont placés en tête de l'Œil, **dans leur ordre relatif initial** ; les autres joueurs conservent également leur ordre relatif.

Exemple à quatre joueurs : ordre **A–B–C–D**, joueurs **B et D** découverts : **B–A–D–C** en ONE_STEP ; **B–D–A–C** en FULL_CAPTURE.

Les découvertes sont **simultanées**. Plusieurs découvertes concernant un même propriétaire au cours d'un tour ne multiplient pas les pénalités ; une découverte ultérieure peut provoquer une **nouvelle** prise de l'Œil.

### 9.3. Pas de défenseur figé dans la référence

Le joueur récupère et place ses deux défenseurs normalement au tour suivant. La règle du **défenseur figé mais actif** est **abandonnée pour l'instant**, car elle complique les obligations de placement. La perte temporaire d'un défenseur et d'autres moyens d'aggraver la découverte demeurent des **pistes différées**, et non des pénalités de référence.

## 10. Fin de partie et régénération

À la fin du tour **X**, chaque case possédant **au moins une souche** régénère **un arbre debout**. La régénération est limitée à **un arbre par case**, même si plusieurs souches sont présentes. Le score écologique porte sur le **nombre d'arbres debout après cette régénération**.

Les modalités précises de victoire ou de classement en fonction de ce score ne sont pas encore arrêtées pour la v4.0. L'objectif général est de maximiser la forêt préservée.

---

## 11. Registre des variantes de règles

**Ces variantes concernent les règles du jeu.** Les indications « non arbitrée » ou « différée » ne signifient pas que leur fonctionnement est déjà complètement défini.

| Domaine | Règle de référence | Variante(s) conservée(s) | Statut |
|---|---|---|---|
| **Effets écologiques A+B** | Indépendants : B ignore les souches créées pendant le combat | Synergie A puis B, B détruit aussi les nouvelles souches | Variante définie |
| **Réparation HS** | Au maximum 1 unité HS par tour avec au moins une activation, aucune attaque | 1 unité par carte sans attaque le tour de réparation ; réparation active autorisant une attaque avec cartes excédentaires | Variantes à affiner pour HS 2 |
| **Contreparties T2/T3** | T2 = HS 1 ; T3 = HS 2, non cumulées, applicables même si parade | Usure aggravée par parade : T2 = HS 2 et T3 = HS 3 si parées | Variante conceptuelle ; implique d'étendre le compteur au-delà de 2 |
| **Devenir des machines après T3** | Surcharge HS 2, aucune explosion | Ancien modèle HS / explosion définitive ; autres contreparties envisagées | Historique / différé |
| **Prise de l'Œil** | Choix non départagé | ONE_STEP / FULL_CAPTURE, toutes deux persistantes et simultanées | Deux variantes définies |
| **Capacité d'une case furtive** | Choix non départagé | 1 défenseur maximum / plusieurs défenseurs autorisés | Deux variantes définies |
| **Sabotage par défenseur** | Choix non départagé | 1 machine au choix / les 2 machines présentes immobiles | Deux variantes définies |
| **Découverte furtive** | Locale : activations et mouvements concernant p | Détection par ciblage global de la piste ; modèle différencié | Étude différée |
| **Conséquences supplémentaires de découverte** | Aucune sur les défenseurs | Perdre 1 défenseur au tour suivant ; autres aggravations simples | Étude différée ; défenseur figé archivé |
| **Arbres initiaux** | 2 par case, sauf exception J1/J2 | 3 par case | Paramètre hérité à réévaluer |
| **Souches initiales J1/J2** | 1 souche + 1 arbre en case 2 | Case 2 sans souche initiale | Paramètre hérité à réévaluer |
| **Durée de partie X** | Non fixée pour v4.0 | Durées de 6 à 12 tours considérées | À calibrer |

### Règles écartées de la référence, sans variante prioritaire

- **Plafond de défenseurs en combat** : supprimé ; pas de limite artificielle par case.
- **Stock global de pièges/sabotages limité à N** : supprimé ; réserve illimitée.
- **Plusieurs pièges sur une même case** : non ; maximum un.
- **Plusieurs sabotages sur une machine** : non ; maximum un.
- **Purge automatique du sabotage à la réparation** : non ; sabotage persistant.
- **Consommation minimale des jetons en combat** : non ; consommation globale.
- **Piège/sabotage actif dès sa pose** : non ; effet à partir du tour suivant.
- **Parade par machine séparée dans une attaque A+B** : non ; parade globale.
- **Parades classique et furtive aux conséquences différentes** : non ; même résultat.
- **Immobilisation d'un défenseur après découverte** : non dans cette version.

## 12. Points encore ouverts pour une règle intégralement déterministe

Ces questions restent expressément ouvertes ; la présente spécification ne leur attribue pas une réponse implicite.

1. **Réconcilier le tableau 2D6 et les fréquences de ciblage du HTML** : ils diffèrent d’une occurrence entre J1 et J3.
2. **Longueur exacte des pistes forestières** et sort d'une machine qui devrait progresser au-delà de la dernière position.
3. **Mode d'attribution de l'ordre initial** des joueurs sur l'Œil.
4. **Choix de référence entre ONE_STEP et FULL_CAPTURE** pour la prise de l'Œil, ou maintien de deux versions équivalentes à comparer.
5. **Choix de référence pour la capacité furtive** (un seul défenseur ou plusieurs par case).
6. **Choix de référence pour le sabotage simultané de deux machines** par un seul défenseur.
7. **Règle de traitement d'une action furtive sans effet**, par exemple lorsque la case est déjà piégée ou toutes les machines accessibles sont déjà sabotées : l'action est simplement perdue selon la règle actuelle, mais la disponibilité d'autres actions n'a pas été étudiée.
8. **Durée X et éventuelles conditions de victoire** à partir du score écologique.
9. **Définition complète de certaines variantes historiques** (notamment réparation active compatible avec HS 2 et escalade des contreparties) avant toute comparaison effective.

## 13. Principes de conception maintenus

- **Préserver la valeur du lancer privé** : chaque joueur doit pouvoir anticiper la nature intrinsèque de son attaque, sans cascades de conséquences écologiques entre machines dans la règle standard.
- **Éviter les effets secondaires auto-contradictoires** : une parade doit être **au moins aussi favorable** aux défenseurs qu'une attaque non parée ; si un dégât écologique aurait été infligé, la parade doit être préférable.
- **Séparer les rôles des mécaniques** : puissance des tactiques = difficulté de parade ; effets des machines = dégâts écologiques ; usure T2/T3 = indisponibilité ultérieure.
- **Protéger la négociation silencieuse** : premier placement définitif, second librement révisable jusqu'à un retournement irréversible.
- **Conserver les variantes susceptibles de modifier la difficulté**, sans multiplier les exceptions dans le socle de règles.
- **Différer l'apprentissage du Méchant** et la montée en comportement kamikaze pour ne pas bloquer la mise au point du socle symétrique.

**Fin de la spécification v4.0 — état de conception, sous réserve des points ouverts ci-dessus.**
