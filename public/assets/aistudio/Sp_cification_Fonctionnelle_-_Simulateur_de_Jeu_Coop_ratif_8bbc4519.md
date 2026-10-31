# Spécification Fonctionnelle : Simulateur du Jeu « Amazonia : Dernier Rempart »

## 1. Objectif et Périmètre du Document

Ce document constitue la spécification fonctionnelle complète du jeu de plateau coopératif **Amazonia : Dernier Rempart** (inspiré de *Rio 2* et de la *Bataille d'Endor*), dans sa version « cœur de jeu symétrique ».

Il a pour objectif de définir sans ambiguïté :
1. **L'état du jeu, ses entités et son dictionnaire de traduction** (plateaux, pistes, pions, cartes, dés et table de localisation permettant de modifier le vocabulaire thématique sans impacter le moteur).
2. **Le moteur de règles exact** (mise en place, séquencement des phases, calculs de ciblage, matrice de résolution par transaction unitaire sur image figée, évolution dynamique de l'IA du Contremaître).
3. **La variabilisation du système** permettant de tester différentes configurations et équilibrages.
4. **La transposition pour les Bots joueurs**, notamment la modélisation de l'information cachée et de la communication tacite en temps réel lors de la pose des jetons Défenseur.
5. **Les hypothèses fonctionnelles** retenues pour lever les ambiguïtés et couvrir les cas limites (documentées en Annexe).

---

## 2. Modèle Conceptuel, Entités du Jeu et Table de Vocabulaire

### 2.1. Topologie d'un Secteur Forestier
Le plateau principal est divisé en $n$ **Secteurs Forestiers** (un par joueur/Peuple), ordonnés verticalement de haut en bas de l'indice $i = 1$ à $i = n$.

Chaque Secteur Forestier $i \in \{1, \dots, n\}$ est composé de 3 pistes parallèles horizontales (lues de gauche à droite) :
1. **Piste Manœuvres Abatteuses** (en haut) : comporte $q$ emplacements alignés sur les Parcelles numérotées de $1$ à $q$.
2. **Piste Manœuvres Bulldozer** (au milieu) : comporte $1$ emplacement spécial « Casse » (noté d'indice $p = 0$) et $q$ emplacements alignés sur les Parcelles numérotées de $1$ à $q$.
3. **Piste Forêt** (en bas) : comporte $1$ case spéciale « Casse » ($p = 0$) alignée avec celle de la piste Manœuvres Bulldozer, et $q$ **Parcelles** numérotées de $1$ à $q$.

### 2.2. Les Arbres et État d'une Parcelle
Sur chaque Piste Forêt $i \in \{1, \dots, n\}$, chaque Parcelle $p \in \{1, \dots, q\}$ contient initialement $a_{i,p}$ emplacements d'arbres (par défaut, $a_{i,p} = a = 2$ constant pour toutes les Parcelles). La case « Casse » ($p = 0$) ne contient jamais d'arbres ($a_{i,0} = 0$).

Chaque emplacement d'arbre possède 3 états mutuellement exclusifs :
* **Arbre debout** ($T$) : état initial (pion présent sur sa face Arbre).
* **Souche** ($S$) : arbre coupé par une Abatteuse (pion présent retourné sur sa face Souche).
* **Terre rasée** ($E$) : emplacement définitivement terrassé par un Bulldozer (pion retiré du plateau).

À tout instant, sur une Parcelle $(i, p)$ avec $p \ge 1$, on note :
* $T_{i,p} \in \{0, \dots, a\}$ : le nombre d'Arbres debout.
* $S_{i,p} \in \{0, \dots, a\}$ : le nombre de Souches.
* $E_{i,p} = a - T_{i,p} - S_{i,p}$ : le nombre d'emplacements de Terre rasée.

Pour la case « Casse » ($p = 0$), on a toujours $T_{i,0} = 0$ et $S_{i,0} = 0$.

### 2.3. Les Machines du Contremaître
Il existe deux types d'engins de chantier :

#### A. Les Abatteuses
* **Cardinalité** : Il peut y avoir de $0$ à plusieurs Abatteuses sur une même Parcelle $(i, p)$ avec $p \in \{1, \dots, q\}$. Une Abatteuse ne va jamais à la Casse ($p = 0$). On note $H_{i,p} \ge 0$ le nombre d'Abatteuses sur la Parcelle $(i, p)$.
* **Limites de mouvement** : Une Abatteuse se déplace uniquement vers la droite (indices croissants) et ne peut jamais dépasser la Parcelle $q$.
* **Destruction** : Une Abatteuse détruite est retirée de la piste et remise dans la réserve générale (elle peut revenir en jeu ultérieurement).

#### B. Les Bulldozers
* **Cardinalité** : Chaque Piste Forêt $i$ possède **exactement $1$ Bulldozer** qui lui est propre. Sa position sur la piste $i$ est notée $posB_i \in \{0, 1, \dots, q\}$, où $posB_i = 0$ signifie que le Bulldozer est à la « Casse ».
* **Limites de mouvement** : En fin de tour, un Bulldozer actif ($posB_i \ge 1$) peut se déplacer vers l'avant (vers $q$) ou vers l'arrière (vers $1$), sans dépasser les bornes $[1, q]$.
* **Destruction et Réparation** : Un Bulldozer détruit n'est pas retiré du jeu ; il est envoyé sur la case « Casse » de sa piste ($posB_i \leftarrow 0$). S'il est réparé depuis la Casse, il est placé en Parcelle $1$ ($posB_i \leftarrow 1$).

### 2.4. Le Plateau « Le Cerveau du Contremaître »
Ce plateau modélise la logique de ciblage et l'adaptation du Contremaître via deux pistes dynamiques :

1. **La Piste des Tactiques** :
 * Comporte $6$ emplacements (cases) numérotés de $1$ à $6$.
 * Contient les $6$ tuiles Tactiques : $3$ tactiques Abatteuses ($A_1, A_2, A_3$) et $3$ tactiques Bulldozer ($B_1, B_2, B_3$).
 * On note $Tac(k) \in \{A_1, A_2, A_3, B_1, B_2, B_3\}$ la tactique située à l'emplacement $k \in \{1, \dots, 6\}$, et $PosTac(t) \in \{1, \dots, 6\}$ la position actuelle de la tactique $t$.

2. **La Piste « L'Œil du Contremaître »** :
 * Comporte $n$ emplacements numérotés de Rang $1$ à Rang $n$ (de gauche à droite).
 * Contient les $n$ jetons Peuple (un par joueur/Piste Forêt $i \in \{1, \dots, n\}$).
 * On note $Oeil(r) \in \{1, \dots, n\}$ l'identifiant de la Piste Forêt située au Rang $r \in \{1, \dots, n\}$ sur l'Œil, et $RangOeil(i) \in \{1, \dots, n\}$ la position du Peuple $i$ sur cette piste.
 * **Rôle** : Détermine la mise en place initiale et départage toutes les égalités de ciblage entre Pistes Forêt.

### 2.5. Matériel et Entités des Joueurs
Chaque joueur $j \in \{1, \dots, n\}$ incarne un Peuple et est le **Défenseur Principal** de son Secteur Forestier $i = j$. Il possède :
* **2 dés à 6 faces ($2\text{d}6$)** et un gobelet opaque.
* **Un lot de 12 cartes Manœuvre** permettant de matérialiser la tactique tirée ($3 \times A_1, 3 \times A_2, 3 \times A_3$, et $1$ exemplaire double-face de $B_1, B_2, B_3$ avec une face *Terrassement* et une face *Réparation*). *Note : La limite de 3 exemplaires par joueur pour $A_1, A_2, A_3$ est purement matérielle ; si une piste comporte plus de 3 Abatteuses, le joueur emprunte les cartes inutilisées d'un coéquipier afin que chaque machine reçoive sa carte.*
* **2 jetons Défenseur** double-face (une face *« En réflexion »* et une face *« Définitif »*) :
 * Le **1er Défenseur (Défense principale)** : doit obligatoirement être posé directement sur sa face *« Définitif »* sur sa propre Piste Forêt $j$ (sur un emplacement $p \in \{0, 1, \dots, q\}$).
 * Le **2ème Défenseur (Soutien)** : doit obligatoirement être posé sur une Piste Forêt alliée $i \neq j$ (sur un emplacement $p \in \{0, 1, \dots, q\}$), d'abord sur sa face *« En réflexion »*, puis verrouillé sur sa face *« Définitif »*.

### 2.6. Dictionnaire de Traduction et Vocabulaire Modifiable (Fichier `i18n`)
Afin de séparer la logique mathématique du simulateur de l'habillage éditorial, l'interface et les journaux d'exécution (logs) utilisent les clés de traduction suivantes. Modifier ce dictionnaire permet de basculer instantanément du thème *Amazonia* au vocabulaire technique abstrait (ou vers tout autre thème futur) :

| Clé Système (`i18n_key`) | Valeur par défaut (Thème *Amazonia*) | Valeur alternative (Notes techniques d'origine) | Description / Entité liée |
| :--- | :--- | :--- | :--- |
| `game.title` | Amazonia : Dernier Rempart | Simulateur du Jeu de Défense de la Forêt | Titre du jeu / simulateur |
| `entity.villain.name` | Le Contremaître | Le Méchant | L'adversaire automatisé |
| `board.villain.main` | Le Cerveau du Contremaître | Plateau « Pensées du Méchant » | Plateau regroupant les 2 pistes de l'IA |
| `board.villain.tactics` | Piste des Tactiques | Piste des Tactiques | Piste des 6 tuiles $A_1..B_3$ (Cases 1 à 6) |
| `board.villain.eye` | L'Œil du Contremaître | Piste « L'Œil du Méchant » | Piste de priorité/rancune (Rangs 1 à $n$) |
| `entity.faction.name` | Peuple | Peuple / Joueur | Faction incarnée par un joueur ($i \in \{1..n\}$) |
| `entity.faction.list` | `[Mammifères, Insectes, Reptiles, Oiseaux, Humains, Entités magiques]` | `[Peuple 1, Peuple 2, Peuple 3, Peuple 4, Peuple 5, Peuple 6]` | Noms des $n$ factions |
| `board.player.sector` | Secteur Forestier | Secteur Joueur / Plateau Forêt | Ensemble des 3 pistes d'un joueur $i$ |
| `board.player.forest_track` | Piste Forêt | Piste Forêt | Piste inférieure contenant arbres et machines |
| `board.player.cell` | Parcelle | Case Forêt | Subdivision $p \in \{1..q\}$ d'une Piste Forêt |
| `board.player.scrapyard` | La Casse | La Casse | Emplacement spécial $p = 0$ du Bulldozer |
| `tree.state.standing` | Arbre debout ($T$) | Arbre debout ($T$) | Pion arbre sur sa face intacte |
| `tree.state.stump` | Souche ($S$) | Souche ($S$) | Pion arbre retourné après abattage |
| `tree.state.cleared` | Terre rasée ($E$) | Emplacement terrassé ($E$) | Emplacement vidé après passage du Bulldozer |
| `machine.harvester` | Abatteuse | Abatteuse | Machine coupant les Arbres debout en Souches |
| `machine.bulldozer` | Bulldozer | Bulldozer | Machine transformant les Souches en Terres rasées |
| `token.defender` | Jeton Défenseur | Jeton Défenseur | Pion d'action des joueurs (2 par joueur) |
| `token.defender.thinking` | En réflexion | Réflexion en cours | Face temporaire du 2ème Défenseur (Étape 2) |
| `token.defender.locked` | Définitif | Choix définitif | Face verrouillée d'un jeton Défenseur |
| `card.maneuver` | Carte Manœuvre | Carte Manœuvre | Carte matérialisant l'action d'une Tactique |
| `card.bulldozer.clear` | Face Terrassement | Face Terrassement | Face active d'une carte $B$ sur une Parcelle ($p \ge 1$) |
| `card.bulldozer.repair` | Face Réparation | Face Réparation | Face active d'une carte $B$ à la Casse ($p = 0$) |

---

## 3. Paramétrage et Variabilisation du Simulateur

Afin de permettre au simulateur de tester différentes variantes et d'équilibrer le jeu, les variables suivantes sont configurables en entrée d'une campagne de simulation (les valeurs par défaut correspondent aux règles officielles d'*Amazonia : Dernier Rempart*) :

| Catégorie | Nom du Paramètre | Type / Domaine | Valeur par défaut | Description fonctionnelle |
| :--- | :--- | :--- | :--- | :--- |
| **Structure** | $n$ | Entier $\in [3, 6]$ | $4$ | Nombre de joueurs (et de Secteurs Forestiers). |
| **Structure** | $q$ | Entier $\ge 3$ | $6$ | Nombre de Parcelles par Piste Forêt (hors Casse). |
| **Structure** | $a$ | Entier $\ge 1$ | $2$ | Nombre initial d'arbres par Parcelle (ou vecteur $[a_1, \dots, a_q]$ si profils asymétriques). |
| **Structure** | $x$ | Entier $\ge 1$ | $8$ | Nombre total de tours de jeu d'une partie. |
| **Matériel** | $StockAbatteuses$ | Entier ou $\infty$ | $\infty$ | Nombre maximal d'Abatteuses simultanément en jeu sur le plateau. |
| **Tirage** | $ModeTirageDes$ | Enum | $\min(2\text{d}6)$ | Loi de tirage des tactiques : $\min(2\text{d}6)$, $1\text{d}6$ équiprobable, ou $\max(2\text{d}6)$. |
| **Résolution** | $ModeResolutionParcelle$ | Enum | `TRANSACTION_FIGEE` | Mode d'évaluation à l'Étape 3 : `TRANSACTION_FIGEE` (évaluation unitaire sur l'image figée au début de l'Étape 3) ou `SEQUENTIEL` (chaque carte modifie l'état avant la carte suivante). |
| **Résolution** | $OrdreCasse$ | Enum | `AVANT_PARCELLE_1` | Ordre d'évaluation de la Casse ($p=0$) à l'Étape 3 : `AVANT_PARCELLE_1` ou `APRES_PARCELLE_Q`. |
| **Résolution** | $ImmobiliteReparation$ | Booléen | `Vrai` | Si `Vrai` (conforme à `TRANSACTION_FIGEE`), un Bulldozer réparé en $p=0$ qui rejoint $p=1$ ne subit pas la destruction des Défenseurs présents en $p=1$ lors du même tour. |
| **Résolution** | $OrdreMajTactiques$ | Enum | `ORDRE_PISTE_TAC` | Ordre de mise à jour sur la Piste des Tactiques lorsque plusieurs cartes différentes sont résolues sur la même Parcelle : selon leur position actuelle de 1 à 6 (`ORDRE_PISTE_TAC`) ou dans l'ordre fixe $(A_1..B_3)$ (`FIXE`). |
| **Évolution** | $RancuneTerrassementDegrade$ | Booléen | `Faux` | Si `Vrai`, un terrassement dégradé ($1$ Défenseur face à un Bulldozer sur une Parcelle) déclenche aussi une Rancune sur l'Œil. |
| **Évolution** | $GranulariteRancune$ | Enum | `PAR_CASE` | Mode d'incrément de la Rancune : `PAR_CASE` (max $+1$ par emplacement défendu avec succès), `PAR_EVENEMENT` ($+1$ par carte parée et $+1$ par machine détruite), ou `CARTE_ET_DESTRUCTION` ($+1$ par carte parée et $+1$ global si au moins une machine est détruite sur la case). |
| **Fin de partie**| $NbRegeneration$ | Entier $\ge 0$ | $1$ | Nombre de Souches retransformées en Arbres debout par Parcelle contenant au moins une Souche en fin de partie. |

---

## 4. Mise en Place Initiale (Setup)

Au début d'une simulation (avant le Tour $1$) :

1. **Initialisation du Cerveau du Contremaître** :
 * Les $6$ tuiles Tactiques $\{A_1, A_2, A_3, B_1, B_2, B_3\}$ sont mélangées aléatoirement (distribution uniforme) sur les emplacements $1$ à $6$ de la Piste des Tactiques.
 * Les $n$ jetons Peuple $\{1, \dots, n\}$ sont mélangés aléatoirement (distribution uniforme) sur les emplacements Rang $1$ à Rang $n$ de la piste *L'Œil du Contremaître*.

2. **Initialisation des Pistes Forêt (selon le Rang sur l'Œil du Contremaître)** :
 * Sur toutes les pistes $i \in \{1, \dots, n\}$ et toutes les Parcelles $p \in \{1, \dots, q\}$, on place $a$ Arbres debout : $T_{i,p} = a$, $S_{i,p} = 0$, $H_{i,p} = 0$.
 * Puis on applique le déploiement initial en fonction du rang initial $r = RangOeil(i)$ :
 * **Peuple au Rang $r = 1$** :
 * Parcelle $1$ : $1$ Arbre debout est retourné face Souche ($T_{i,1} = a - 1$, $S_{i,1} = 1$).
 * Parcelle $1$ : $1$ Abatteuse est placée en Parcelle $1$ ($H_{i,1} = 1$).
 * Parcelle $1$ : son Bulldozer démarre en Parcelle $1$ ($posB_i = 1$).
 * **Peuple au Rang $r = 2$** :
 * Parcelle $2$ : $1$ Abatteuse est placée en Parcelle $2$ ($H_{i,2} = 1$).
 * Son Bulldozer démarre à la Casse ($posB_i = 0$).
 * **Peuple au Rang $r = 3$** :
 * Aucune Abatteuse sur sa piste ($\forall p, H_{i,p} = 0$).
 * Son Bulldozer démarre à la Casse ($posB_i = 0$).
 * **Peuples aux Rangs $r \in \{4, \dots, n\}$** :
 * Parcelle $1$ : $1$ Abatteuse est placée en Parcelle $1$ ($H_{i,1} = 1$).
 * Leur Bulldozer démarre à la Casse ($posB_i = 0$).

---

## 5. Logique Séquentielle d'un Tour de Jeu (Moteur de Règles)

La partie se déroule en exactement $x$ tours (par défaut $x = 8$). Chaque tour $t \in \{1, \dots, x\}$ suit strictement la séquence de 3 phases et d'une fin de tour décrite ci-dessous.

### 5.1. Phase 1 : Les Plans du Contremaître (Programmation secrète)
Tous les joueurs agissent simultanément et secrètement :
1. Chaque joueur $j \in \{1, \dots, n\}$ lance deux dés à $6$ faces sous son gobelet : $d_{j,1}, d_{j,2} \in \{1, \dots, 6\}$.
2. Il retient uniquement la valeur minimale :
 $$k_j = \min(d_{j,1}, d_{j,2})$$
 *(Note : la distribution de probabilité de $k_j$ est : $P(1) = \frac{11}{36}$, $P(2) = \frac{9}{36}$, $P(3) = \frac{7}{36}$, $P(4) = \frac{5}{36}$, $P(5) = \frac{3}{36}$, $P(6) = \frac{1}{36}$).*
3. La tactique programmée par le tirage du joueur $j$ est $t_j = Tac(k_j)$.
4. **État d'information** : Le joueur $j$ connaît $t_j$ avec certitude, mais ignore les tirages $t_{j'}$ des autres joueurs $j' \neq j$. Plusieurs joueurs peuvent avoir tiré la même valeur et donc programmé la même tactique.

### 5.2. Phase 2 : La Mobilisation des Défenseurs

#### Étape 1 : La Défense Principale (1er jeton Défenseur)
* En simultané, sans aucune communication, chaque joueur $j$ choisit un emplacement $c_{j,1} \in \{0, 1, \dots, q\}$ (Casse ou Parcelle $1$ à $q$) sur **sa propre Piste Forêt $j$** et y place son 1er jeton Défenseur directement sur sa face *« Définitif »*.
* Une fois que tous les joueurs ont posé leur 1er jeton en $c_{j,1}$, ces placements sont publics et définitifs pour le tour.

#### Étape 2 : Le Soutien & la Coordination (2ème jeton Défenseur)
* En simultané et en silence, chaque joueur $j$ doit placer son 2ème jeton Défenseur sur un emplacement $c_{j,2} \in \{0, 1, \dots, q\}$ d'une **autre Piste Forêt $i_j \neq j$**, initialement sur sa face *« En réflexion »*.
* Tant que le 2ème jeton d'un joueur est sur sa face *« En réflexion »*, ce joueur peut le déplacer librement d'une piste alliée ou d'une Parcelle à une autre.
* À tout moment, un joueur peut retourner son 2ème jeton sur sa face *« Définitif »* (action irréversible pour le tour).
* L'étape prend fin dès que les $n$ joueurs ont basculé leur 2ème jeton sur sa face *« Définitif »*.
* À l'issue de cette phase, sur chaque emplacement $(i, p)$ de chaque piste, le nombre total de Défenseurs présents est connu et noté $D_{i,p} \in \{0, \dots, n\}$.

### 5.3. Phase 3 : L'Assaut et la Résolution

#### Étape 1 : Révélation et Pose des Cartes Manœuvre
Tous les joueurs révèlent simultanément la tactique $t_j$ issue de leur tirage de Phase 1 et posent les cartes Manœuvre correspondantes.

**Règle fondamentale de simultanéité (Image figée de l'Étape 1)** : L'évaluation des pistes ciblées par chaque tactique $t_j$ s'effectue sur **l'état figé du plateau au début de l'Étape 1** (avant tout mouvement ou ajout de machine).

##### A. Règles de départage des égalités (Tie-breakers sur *L'Œil du Contremaître*)
* **Pour les tactiques Abatteuses ($A_1, A_2, A_3$)** : En cas d'égalité entre plusieurs Pistes Forêt candidates, on sélectionne la piste $i$ dont le Peuple est le plus proche du **Rang $1$** (le plus à gauche) sur *L'Œil du Contremaître* (minimisant $RangOeil(i)$).
* **Pour les tactiques Bulldozer ($B_1, B_2, B_3$)** : En cas d'égalité entre plusieurs Pistes Forêt candidates, on sélectionne la piste $i$ dont le Peuple est le plus proche du **Rang $n$** (le plus à droite) sur *L'Œil du Contremaître* (maximisant $RangOeil(i)$).

##### B. Détermination de la piste ciblée et pose des cartes pour chaque tactique $t_j$
Pour chaque joueur $j \in \{1, \dots, n\}$ ayant tiré la tactique $t_j$ :

* **Si $t_j = A_1$ (Avancer & Abattre)** :
 * *Ensemble des pistes éligibles* : $\mathcal{I}_{A_1} = \{ i \in \{1, \dots, n\} \mid \sum_{p=1}^{q} H_{i,p} \ge 1 \}$ (pistes ayant au moins une Abatteuse).
 * *Critère de sélection* : Parmi $\mathcal{I}_{A_1}$, on sélectionne la piste $i^*$ maximisant le nombre total d'Arbres debout $\sum_{p=1}^{q} T_{i,p}$ (avec départage minimisant $RangOeil(i)$). Si $\mathcal{I}_{A_1} = \emptyset$, aucune carte n'est posée.
 * *Pose des cartes* : Pour chaque Parcelle $p \in \{1, \dots, q-1\}$ de la piste $i^*$, on pose $H_{i^*,p}$ cartes $A_1$ sur l'emplacement $p+1$ de la Piste Manœuvres Abatteuses de $i^*$. *(Note : les Abatteuses déjà situées en dernière Parcelle $p = q$ ne peuvent plus avancer et ne génèrent aucune carte $A_1$. Il n'y a aucune limite au nombre de cartes posées : si la piste compte plus de 3 Abatteuses, le joueur emprunte les cartes nécessaires aux coéquipiers).*

* **Si $t_j = A_2$ (Abattre sur place)** :
 * *Ensemble des pistes éligibles* : $\mathcal{I}_{A_2} = \{ i \in \{1, \dots, n\} \mid \sum_{p=1}^{q} H_{i,p} \ge 1 \}$.
 * *Critère de sélection* : Parmi $\mathcal{I}_{A_2}$, on sélectionne la piste $i^*$ maximisant la position de son Abatteuse la plus avancée $\max \{ p \in \{1, \dots, q\} \mid H_{i,p} \ge 1 \}$ (avec départage minimisant $RangOeil(i)$). Si $\mathcal{I}_{A_2} = \emptyset$, aucune carte n'est posée.
 * *Pose des cartes* : Pour chaque Parcelle $p \in \{1, \dots, q\}$ de la piste $i^*$, on pose $H_{i^*,p}$ cartes $A_2$ en face de la Parcelle $p$ sur la Piste Manœuvres Abatteuses de $i^*$.

* **Si $t_j = A_3$ (Renforts d'abattage)** :
 * *Ensemble des pistes éligibles* : $\mathcal{I}_{A_3} = \{ i \in \{1, \dots, n\} \mid \sum_{p=1}^{q} T_{i,p} \ge 1 \}$ (pistes ayant au moins un Arbre debout).
 * *Critère de sélection* : Parmi $\mathcal{I}_{A_3}$, on sélectionne la piste $i^*$ minimisant le nombre total d'Abatteuses $\sum_{p=1}^{q} H_{i,p}$ (avec départage minimisant $RangOeil(i)$). Si $\mathcal{I}_{A_3} = \emptyset$, aucune carte n'est posée.
 * *Pose des cartes* : Soit $p^* = \min \{ p \in \{1, \dots, q\} \mid T_{i^*,p} \ge 1 \}$ la première Parcelle (la plus à gauche) contenant au moins un Arbre debout sur la piste $i^*$. On pose $1$ carte $A_3$ en face de la Parcelle $p^*$ sur la Piste Manœuvres Abatteuses de $i^*$.

* **Si $t_j = B_1$ (Nettoyage de grand chantier)** :
 * *Ensemble des pistes éligibles* : Toutes les pistes $\{1, \dots, n\}$.
 * *Critère de sélection* : On sélectionne la piste $i^*$ maximisant le nombre total de Souches $\sum_{p=1}^{q} S_{i,p}$ (avec départage maximisant $RangOeil(i)$).
 * *Pose de la carte* : On pose $1$ carte $B_1$ sur la Piste Manœuvres Bulldozer de $i^*$ en face de l'emplacement actuel du Bulldozer $p^* = posB_{i^*}$ (face *Réparation* si $p^* = 0$, face *Terrassement* si $p^* \ge 1$).

* **Si $t_j = B_2$ (Remise en route des retardataires)** :
 * *Ensemble des pistes éligibles* : Toutes les pistes $\{1, \dots, n\}$.
 * *Critère de sélection* : On sélectionne la piste $i^*$ minimisant la position du Bulldozer $posB_i \in \{0, 1, \dots, q\}$, où la Casse ($0$) est la position la moins avancée possible (avec départage maximisant $RangOeil(i)$).
 * *Pose de la carte* : On pose $1$ carte $B_2$ sur la Piste Manœuvres Bulldozer de $i^*$ en face de l'emplacement $p^* = posB_{i^*}$ (face *Réparation* si $p^* = 0$, face *Terrassement* si $p^* \ge 1$).

* **Si $t_j = B_3$ (Terrain dégagé)** :
 * *Ensemble des pistes éligibles* : Toutes les pistes $\{1, \dots, n\}$.
 * *Critère de sélection* : On sélectionne la piste $i^*$ minimisant le nombre d'Arbres debout sur l'emplacement actuel de son Bulldozer $T_{i, posB_i}$, sachant qu'à la Casse ($posB_i = 0$) il y a $T_{i,0} = 0$ Arbre debout (avec départage maximisant $RangOeil(i)$).
 * *Pose de la carte* : On pose $1$ carte $B_3$ sur la Piste Manœuvres Bulldozer de $i^*$ en face de l'emplacement $p^* = posB_{i^*}$ (face *Réparation* si $p^* = 0$, face *Terrassement* si $p^* \ge 1$).

#### Étape 2 : Mouvement et Entrée en Jeu des Abatteuses
1. **Avancée des Abatteuses ($A_1$)** : Sur chaque piste où au moins une carte $A_1$ a été posée à l'Étape 1, toutes les Abatteuses ayant généré au moins une carte $A_1$ en $p+1$ avancent d'exactement **une seule Parcelle** vers la droite (de $p$ vers $p+1$), même si plusieurs joueurs ont tiré $A_1$ et posé plusieurs cartes $A_1$ pour la même Abatteuse.
 * Formellement, si la piste $i^*$ a été ciblée par au moins une tactique $A_1$ ce tour-ci, alors pour $p$ allant de $q-1$ à $1$ (en décrémentant pour ne pas déplacer deux fois la même machine) :
 $$H_{i^*, p+1} \leftarrow H_{i^*, p+1} + H_{i^*, p} \quad \text{et} \quad H_{i^*, p} \leftarrow 0$$
2. **Déploiement des renforts ($A_3$)** : Sur chaque Parcelle $(i, p)$ ayant reçu $m$ cartes $A_3$ lors de l'Étape 1, on ajoute $m$ nouvelles Abatteuses prises dans la réserve :
 $$H_{i, p} \leftarrow H_{i, p} + m$$

#### Étape 3 : Résolution des Manœuvres et des Défenses (Transaction Unitaire sur Image Figée)

**Principe fondamental d'isolation (Snapshot au début de l'Étape 3)** :
Au début de l'Étape 3 (juste après les mouvements d'Abatteuses de l'Étape 2), on prend une **photographie figée** de l'état du plateau : pour chaque piste $i$ et chaque emplacement $p \in \{0, 1, \dots, q\}$, on note $T_{i,p}^{(0)}$, $S_{i,p}^{(0)}$, $H_{i,p}^{(0)}$ et $posB_i^{(0)}$ l'état initial de référence.
* Toutes les résolutions de l'Étape 3 forment une **transaction unitaire** évaluée sur cet état figé $(T^{(0)}, S^{(0)}, H^{(0)}, posB^{(0)})$ : le résultat d'une opération sur un emplacement (ou d'une première carte sur une Parcelle) n'altère jamais les conditions d'évaluation des opérations ou des cartes suivantes.

On balaie séquentiellement les Secteurs Forestiers de haut en bas ($i = 1$ à $i = n$), et pour chaque secteur $i$, on balaie les emplacements de gauche à droite ($p = 0$ [Casse] puis Parcelles $p = 1$ à $p = q$). Sur chaque emplacement $(i, p)$, on évalue d'abord la ligne des **Manœuvres Abatteuses** (si $p \ge 1$), puis la ligne de **Manœuvre Bulldozer**.

Soient $m_A$ le nombre de cartes Abattage ($A_1, A_2, A_3$) et $m_B$ le nombre de cartes Bulldozer ($B_1, B_2, B_3$) présentes en $(i, p)$ :

##### Matrice de résolution par emplacement $(i, p)$ selon $D_{i,p}$ (Mode `TRANSACTION_FIGEE`) :

* **Cas 1 : $D_{i,p} = 0$ (Aucun Défenseur — Voie libre)**
 1. *Abatteuses ($p \ge 1$, si $m_A \ge 1$)* :
 * Si $T_{i,p}^{(0)} \ge 1$ : **toutes** les $m_A$ cartes Abattage présentes en $(i, p)$ obtiennent le statut **Réussite**. Le nombre d'Arbres debout coupés est borné par le nombre d'arbres disponibles :
 $$\Delta T = \min(m_A, T_{i,p}^{(0)})$$
 $$T_{i,p} \leftarrow T_{i,p}^{(0)} - \Delta T \quad \text{et} \quad S_{i,p} \leftarrow S_{i,p}^{(0)} + \Delta T$$
 * Si $T_{i,p}^{(0)} = 0$ : l'emplacement ne contenait déjà aucun Arbre debout au début de l'Étape 3. **Toutes** les $m_A$ cartes obtiennent le statut **Échec (Sans objet)**.
 2. *Bulldozer (si $m_B \ge 1$)* :
 * Si $p = 0$ (Casse) :
 * Si $posB_i^{(0)} = 0$ : **toutes** les $m_B$ cartes Réparation présentes à la Casse obtiennent le statut **Réussite**, et le Bulldozer est réparé et placé en Parcelle $1$ ($posB_i \leftarrow 1$).
 * Si $posB_i^{(0)} \neq 0$ : **toutes** les $m_B$ cartes obtiennent le statut **Échec (Sans objet)**.
 * Si $p \ge 1$ (Parcelle) :
 * Si $S_{i,p}^{(0)} \ge 1$ (ou si des souches sont présentes) : **toutes** les $m_B$ cartes Terrassement présentes en $(i, p)$ obtiennent le statut **Réussite**, et toutes les Souches de la Parcelle deviennent des Terres rasées ($S_{i,p} \leftarrow 0$).
 * Si la Parcelle ne contient aucune Souche : **toutes** les $m_B$ cartes obtiennent le statut **Échec (Sans objet)**.

* **Cas 2 : $D_{i,p} = 1$ (1 Défenseur — Parade simple)**
 1. *Abatteuses ($p \ge 1$)* : Toutes les $m_A$ cartes Abattage présentes en $(i, p)$ sont **parées**. Elles sont défaussées sans effet avec le statut **Échec (Parade)**.
 2. *Bulldozer* :
 * Si $p = 0$ (Casse) : Toutes les $m_B$ cartes Réparation présentes à la Casse sont **parées** (la réparation est bloquée). Elles sont défaussées avec le statut **Échec (Parade)**.
 * Si $p \ge 1$ (Parcelle — **Terrassement dégradé**) :
 * S'il y a au moins une Souche sur la Parcelle ($S_{i,p} \ge 1$) : **toutes** les $m_B$ cartes Terrassement présentes en $(i, p)$ obtiennent le statut **Réussite**, mais chacune ne retire qu'une seule Souche dans la limite des Souches disponibles :
 $$\Delta S = \min(m_B, S_{i,p}) \quad \text{et} \quad S_{i,p} \leftarrow S_{i,p} - \Delta S$$
 *(Ce terrassement dégradé n'est pas une Parade et ne déclenche pas de Rancune, sauf si `RancuneTerrassementDegrade` = `Vrai`).*
 * S'il n'y a aucune Souche sur la Parcelle ($S_{i,p} = 0$) : **toutes** les $m_B$ cartes obtiennent le statut **Échec (Sans objet)**.

* **Cas 3 : $D_{i,p} = 2$ (2 Défenseurs — Embuscade)**
 1. *Abatteuses ($p \ge 1$)* :
 * Toutes les $m_A$ cartes Abattage présentes en $(i, p)$ sont **parées** et défaussées avec le statut **Échec (Parade)**.
 * Toutes les Abatteuses présentes sur la Parcelle au début de l'Étape 3 ($H_{i,p}^{(0)} > 0$) sont **détruites** et remises dans la réserve ($H_{i,p} \leftarrow 0$), **même si aucune carte Manœuvre ne ciblait cette Parcelle** ($m_A = 0$).
 2. *Bulldozer ($p = 0$ ou $p \ge 1$)* :
 * Toutes les $m_B$ cartes Bulldozer présentes en $(i, p)$ sont **parées** et défaussées avec le statut **Échec (Parade)**. Le Bulldozer lui-même n'est pas détruit.

* **Cas 4 : $D_{i,p} \ge 3$ (3 Défenseurs ou plus — Assaut massif)**
 1. *Abatteuses ($p \ge 1$)* :
 * Toutes les $m_A$ cartes Abattage présentes en $(i, p)$ sont **parées** (**Échec (Parade)**).
 * Toutes les Abatteuses présentes sur la Parcelle ($H_{i,p}^{(0)} > 0$) sont **détruites** ($H_{i,p} \leftarrow 0$), même sans carte Manœuvre sur la Parcelle.
 2. *Bulldozer* :
 * Toutes les $m_B$ cartes Bulldozer présentes en $(i, p)$ sont **parées** (**Échec (Parade)**).
 * Si $p \ge 1$ et que le Bulldozer se trouvait sur cette Parcelle au début de l'Étape 3 ($posB_i^{(0)} = p$), il est **détruit** et immédiatement envoyé à la Casse ($posB_i \leftarrow 0$), même sans carte Manœuvre sur la Parcelle. *(Conséquence directe de l'évaluation sur l'image figée $posB_i^{(0)}$ : un Bulldozer qui était à la Casse au début de l'Étape 3 [$posB_i^{(0)} = 0$] et qui vient d'être réparé vers la Parcelle $1$ avait $posB_i^{(0)} \neq 1$ ; il ne peut donc pas être détruit en Parcelle $1$ lors de ce même tour).*

#### Étape 4 : Évolution du Contremaître (Apprentissage & Rancune)
Au fur et à mesure de la résolution de chaque emplacement $(i, p)$, le plateau *Le Cerveau du Contremaître* est mis à jour :

1. **L'Apprentissage (Piste des Tactiques — 1 carte défaussée = 1 mouvement)** :
 * Si plusieurs cartes de Tactiques différentes (ex. $A_1$ et $A_2$) ont été résolues sur le même emplacement $(i, p)$, leurs mouvements sur la *Piste des Tactiques* sont appliqués dans l'ordre de leur position sur la piste au début de la résolution de cet emplacement (de la case $1$ vers la case $6$, selon `OrdreMajTactiques` = `ORDRE_PISTE_TAC`).
 * Pour chaque carte Manœuvre de type $t \in \{A_1, A_2, A_3, B_1, B_2, B_3\}$ défaussée :
 * Si son statut est **Réussite** et que $PosTac(t) > 1$ : la tuile $t$ avance d'un cran vers la gauche (vers la case $1$) en échangeant sa place avec la tuile située en $PosTac(t) - 1$.
 * Si son statut est **Échec (Parade ou Sans objet)** et que $PosTac(t) < 6$ : la tuile $t$ recule d'un cran vers la droite (vers la case $6$) en échangeant sa place avec la tuile située en $PosTac(t) + 1$.

2. **La Rancune (Piste *L'Œil du Contremaître* — par défaut `PAR_CASE` : 1 emplacement défendu = 1 mouvement)** :
 * À la fin de la résolution d'un emplacement $(i, p)$ (Casse ou Parcelle), si les Défenseurs ont réalisé **au moins une Parade** ($m_A \ge 1$ parée ou $m_B \ge 1$ parée) **OU** **détruit / envoyé à la Casse au moins une machine** ($H_{i,p}^{(0)} > 0$ détruite ou Bulldozer en $posB_i^{(0)} = p$ envoyé à la Casse), alors le jeton du Peuple $i$ avance d'**un seul cran** vers la gauche (vers le Rang $1$) sur *L'Œil du Contremaître* (si $RangOeil(i) > 1$, il échange sa place avec le Peuple situé en $RangOeil(i) - 1$).
 * *Note :* En mode par défaut `PAR_CASE`, même si plusieurs cartes sont parées et plusieurs machines détruites sur le même emplacement $(i, p)$, le Peuple $i$ n'avance que d'un seul cran pour cet emplacement. Un terrassement dégradé ($D_{i,p} = 1$ sur une Parcelle avec Bulldozer) ne constitue pas une Parade et ne déclenche pas de Rancune.

### 5.4. Fin de Tour & Repositionnement des Machines

Une fois tous les Secteurs Forestiers résolus de haut en bas :

1. **Repositionnement automatique des Abatteuses désœuvrées** :
 Sur chaque piste $i \in \{1, \dots, n\}$ et pour chaque Parcelle $p \in \{1, \dots, q-1\}$ contenant des Abatteuses ($H_{i,p} \ge 1$) mais **aucun Arbre debout** ($T_{i,p} = 0$) :
 * On cherche la prochaine Parcelle vers la droite ayant au moins un Arbre debout :
 $$p_{cible} = \min \{ p' \in \{p+1, \dots, q\} \mid T_{i,p'} \ge 1 \}$$
 * Si un tel $p_{cible}$ existe, toutes les Abatteuses de la Parcelle $p$ se déplacent en $p_{cible}$ ($H_{i,p_{cible}} \leftarrow H_{i,p_{cible}} + H_{i,p}$ et $H_{i,p} \leftarrow 0$).
 * Si aucune Parcelle devant elles ne contient d'Arbre debout, elles ne bougent pas.

2. **Repositionnement automatique des Bulldozers désœuvrés** :
 Sur chaque piste $i \in \{1, \dots, n\}$, si le Bulldozer n'est pas à la Casse ($posB_i = p \ge 1$) et que sa Parcelle actuelle ne contient **aucune Souche** ($S_{i,p} = 0$) :
 * Soit $\mathcal{P}_{souches} = \{ p' \in \{1, \dots, q\} \mid S_{i,p'} \ge 1 \}$ l'ensemble des Parcelles de la piste contenant au moins une Souche.
 * Si $\mathcal{P}_{souches} \neq \emptyset$, le Bulldozer se déplace sur la Parcelle $p_{cible} \in \mathcal{P}_{souches}$ qui minimise la distance $|p' - p|$. En cas d'égalité de distance entre deux Parcelles $p - d$ et $p + d$, il donne toujours priorité vers l'avant (vers la droite) et choisit $p + d$.
 * Si $\mathcal{P}_{souches} = \emptyset$, il ne bouge pas. *(Note : un Bulldozer sorti de la Casse en Parcelle 1 durant ce tour applique normalement cette règle de fin de tour s'il n'y a pas de Souche en Parcelle 1).*

3. **Récupération du matériel** :
 Tous les jetons Défenseur et toutes les cartes Manœuvre sont retirés du plateau et rendus aux joueurs pour le tour suivant.

---

## 6. Fin de Partie, Régénération et Calcul du Score

À l'issue de la Fin de tour du tour $x$ (par défaut $8^{\text{e}}$ tour), la partie s'arrête immédiatement :

1. **La Régénération de la Forêt** :
 Sur chaque Piste Forêt $i \in \{1, \dots, n\}$ et chaque Parcelle $p \in \{1, \dots, q\}$, s'il reste au moins une Souche ($S_{i,p} \ge 1$), exactement $1$ Souche (ou $NbRegeneration$) se régénère en Arbre debout :
 $$\Delta = \min(S_{i,p}, NbRegeneration)$$
 $$T_{i,p} \leftarrow T_{i,p} + \Delta \quad \text{et} \quad S_{i,p} \leftarrow S_{i,p} - \Delta$$
 *(Par défaut, $NbRegeneration = 1$. Les emplacements de Terre rasée $E_{i,p}$ ne se régénèrent jamais).*

2. **Décompte du Score Coopératif Final** :
 Le score de l'équipe est la somme totale des Arbres debout sur l'ensemble des pistes :
 $$Score_{brut} = \sum_{i=1}^{n} \sum_{p=1}^{q} T_{i,p}$$
 Pour comparer des configurations avec des nombres de joueurs $n$, des longueurs de piste $q$ ou des densités $a$ différents, le simulateur calcule également le **Taux de Préservation** (et la moyenne d'arbres sauvés par joueur $Score_{moy} = Score_{brut} / n$) :
 $$Score_{norm} = \frac{Score_{brut}}{n \times q \times a} \in [0, 1]$$

 *Barème de référence d'Amazonia (pour $q = 6, a = 2$, soit $12 \times n$ arbres initiaux)* :
 * $Score_{moy} = 12$ ($100\text{ \%}$) : *Miracle écologique !*
 * $9 \le Score_{moy} < 12$ : *Victoire majeure !*
 * $6 \le Score_{moy} < 9$ : *Victoire coûteuse.*
 * $Score_{moy} < 6$ : *Défaite.*

---

## 7. Transposition dans le Simulateur : Modélisation des Bots et de la Communication Muette

Pour simuler fidèlement le comportement des joueurs sans tricher sur l'information cachée, chaque Bot joueur $j$ doit prendre ses décisions uniquement à partir des informations publiques et de son tirage privé $t_j$.

### 7.1. Représentation des Croyances d'un Bot (Belief State)
Au début de la Phase 2, le Bot $j$ connaît :
* L'état complet du plateau et du *Cerveau du Contremaître* (permettant de calculer avec certitude quelle piste et quel emplacement sont ciblés par **chacune** des 6 tactiques $A_1, A_2, A_3, B_1, B_2, B_3$).
* Sa propre tactique tirée $t_j = Tac(k_j)$.
* La loi de probabilité a priori $P(Tac(k))$ que chacun des $n-1$ autres joueurs ait tiré la tactique située à l'emplacement $k \in \{1, \dots, 6\}$ :
 $$P_{priori}(k) = \frac{13 - 2k}{36}$$

### 7.2. Protocole de Simulation de la Phase 2 (Placement & Communication Muette)

#### A. Étape 1 : Placement du 1er Défenseur (Défense principale sur sa piste $j$)
Le Bot $j$ évalue l'utilité marginale $U(j, p)$ de placer son 1er jeton sur chaque emplacement $p \in \{0, 1, \dots, q\}$ de sa propre piste $j$ :
* **Cas de certitude** : Si la tactique $t_j$ qu'il a lui-même tirée cible sa propre piste $j$ sur un emplacement $p^*$, il sait avec une probabilité égale à $1$ qu'une carte Manœuvre y sera posée.
* **Cas probabiliste** : Si $t_j$ cible une autre piste $i \neq j$, le Bot calcule pour chaque emplacement $p$ de sa piste $j$ l'espérance de menace issue des $n-1$ autres tirages inconnus (selon $P_{priori}(k)$) ainsi que l'intérêt de détruire des machines déjà présentes sur sa piste (en anticipant un soutien à $2$ ou $3$ Défenseurs).

#### B. Inférence Bayésienne après l'Étape 1
Une fois les 1ers Défenseurs $c_{1,1}, \dots, c_{n,1}$ révélés publiquement, chaque Bot met à jour ses probabilités sur les tirages des autres joueurs :
* Si un joueur $i$ a placé son 1er Défenseur sur un emplacement $c_{i,1}$ qui correspond à une tactique $t$ ayant une faible probabilité a priori (ex. case $5$ ou $6$ de la Piste des Tactiques) alors qu'une autre Parcelle de sa piste était menacée par la case $1$ ou $2$, les autres Bots augmentent la probabilité estimée que le joueur $i$ ait lui-même tiré la tactique $t$.

#### C. Étape 2 : Modélisation Discrète du Temps Réel (« En réflexion » $\to$ « Définitif »)
Dans le jeu physique, l'Étape 2 est continue : le timing de pose, les hésitations (changements de Parcelle sur la face *« En réflexion »*) et le moment du verrouillage (*« Définitif »*) servent de langage non verbal.

Dans le simulateur, cette étape continue est transposée en une **boucle de $R_{max}$ micro-cycles de négociation synchrone** (par exemple $R_{max} = 5$ impulsions) :

À chaque micro-cycle $r \in \{1, \dots, R_{max}\}$ :
1. Chaque Bot $j$ dont le 2ème jeton n'est pas encore sur sa face *« Définitif »* choisit :
 * Une piste alliée cible $i_j \neq j$ et un emplacement $c_{j,2} \in \{0, 1, \dots, q\}$.
 * Un état de son jeton : rester sur *« En réflexion »* ou basculer sur *« Définitif »*.
2. **Sémantique des signaux (Conventions de communication des Bots)** :
 * **Verrouillage immédiat au cycle $r = 1$ (*Fast Lock*)** : Signale une **certitude absolue**. Si le Bot $j$ n'a pas ciblé sa propre piste avec son dé $t_j$, le fait de poser et verrouiller immédiatement son 2ème jeton sur sa face *« Définitif »* en $(i^*, p^*)$ indique aux autres Bots : *« Mon dé cible exactement $(i^*, p^*)$ »*.
 * **Placement sur « En réflexion » au cycle $r = 1$ (*Tentative / Demande de soutien*)** :
 * Soit le Bot $j$ a tiré un dé qui ciblait sa propre piste $j$ (il n'a donc pas d'information certaine sur les autres pistes et attend de voir où se dirigent les autres, ou pointe une Parcelle où il propose de faire une destruction groupée à $2$ ou $3$ Défenseurs).
 * Soit le Bot $j$ pointe une Parcelle pour inviter un allié à s'y joindre afin d'atteindre le seuil de $2$ (destruction d'Abatteuses / parade de Bulldozer) ou $3$ Défenseurs (destruction de Bulldozer).
 * **Déplacement du jeton au cycle $r \ge 2$ (*Désengagement / Réallocation*)** : Si deux Bots ont pointé la même Parcelle au cycle $r=1$ alors qu'un seul Défenseur suffit (ex. parade d'Abatteuse sans intérêt de destruction), l'un des Bots déplace son jeton *« En réflexion »* vers une seconde menace pour éviter le sur-investissement (*overkill*).
3. La boucle s'arrête dès que tous les Bots sont sur leur face *« Définitif »*, ou au plus tard au cycle $R_{max}$ (où tous les jetons restants sont forcés sur *« Définitif »*).

### 7.3. Profils Stratégiques de Bots (Personas à implémenter)
Le simulateur doit permettre d'instancier plusieurs niveaux ou profils de Bots :
1. **Bot Aléatoire (Baseline)** : Pose ses jetons uniformément au hasard (sert uniquement à valider le moteur de règles et établir la borne basse de score).
2. **Bot Égoïste / Myope (Niveau 1)** : Protège uniquement la menace la plus probable sans chercher à détruire les machines et sans décoder les signaux des autres joueurs à l'Étape 2.
3. **Bot Coopératif Communicant (Niveau 2)** : Utilise le protocole de signalisation (verrouillage rapide si certitude externe, évitement des doublons inutiles, recherche des seuils de destruction à $D=2$ pour les Abatteuses et $D=3$ pour les Bulldozers).
4. **Bot Stratège « Méta-Contremaître » (Niveau 3)** : Intègre dans sa fonction d'évaluation l'impact de ses défenses sur **l'Apprentissage et la Rancune**. Par exemple, il peut choisir de parer une tactique dangereuse située en case $1$ ou $2$ pour la faire reculer vers la case $6$, ou éviter de déclencher une Rancune inutile si cela place un Peuple critique en position défavorable pour le départage des égalités du tour suivant.
5. **Bot Omniscient (Borne Haute Théorique)** : Connaît les dés tirés par tous les joueurs (triche contrôlée). Permet de mesurer la perte d'efficacité liée à l'information incomplète et d'établir le score maximal théoriquement atteignable pour une graine aléatoire donnée.

---

## 8. Métriques et Indicateurs de Sortie du Simulateur

Pour l'analyse d'équilibrage, le simulateur doit agréger sur $N$ parties simulées (ex. $N = 10\,000$) :
* **Distribution du Score** : Moyenne, médiane, écart-type, déciles du nombre d'arbres sauvés ($Score_{brut}$, $Score_{moy}$ et $Score_{norm}$) et répartition dans les 4 tranches du barème de victoire d'*Amazonia*.
* **Asymétrie liée au Rang initial sur l'Œil** : Score final moyen par piste en fonction du Rang initial $r \in \{1, \dots, n\}$ sur *L'Œil du Contremaître* (vérifie si le Peuple au Rang 1 ou au Rang 2 est trop pénalisé par la mise en place).
* **Dynamique des Machines** : Nombre moyen d'Abatteuses en jeu par tour, nombre d'Abatteuses générées par $A_3$, nombre d'Abatteuses détruites, nombre d'allers-retours des Bulldozers à la Casse.
* **Efficacité des Défenses** : Taux de cartes Manœuvre parées, taux de cartes annulées « sans objet », fréquence des seuils $D=1, 2, \ge 3$, et taux de gaspillage de jetons Défenseur (jetons posés sur des emplacements où rien ne se passe).
* **Stabilité de la Piste des Tactiques** : Fréquence de présence de chaque tactique ($A_1..B_3$) à la case $1$ (mesure si certaines tactiques s'auto-alimentent en réussite et restent bloquées en tête de piste).

---

## 9. Annexe : Registre des Cas Limites et Règles Retenues

Cette annexe documente l'ensemble des cas limites et les règles retenues pour garantir une cohérence totale entre le simulateur et le livret de règles d'*Amazonia : Dernier Rempart*.

### Hypothèse H1 : Éligibilité et sélection des pistes lorsqu'une condition est vide ($A_1, A_2, A_3$)
* **Constat** :
 * $A_1$ cible « la piste avec le plus d'Arbres debout parmi celles qui possèdent au moins une Abatteuse ». Que se passe-t-il s'il n'y a plus aucune Abatteuse sur l'ensemble du plateau ? Ou si toutes les pistes ayant une Abatteuse ont $0$ Arbre debout ?
 * $A_2$ cible « la piste où se trouve l'Abatteuse la plus avancée ». Que se passe-t-il s'il n'y a aucune Abatteuse en jeu ?
 * $A_3$ cible « la piste comptant le moins d'Abatteuses parmi celles qui possèdent au moins un Arbre debout ». Que se passe-t-il s'il n'y a plus aucun Arbre debout sur le plateau ?
* **Règle retenue** :
 * Pour $A_1$, toute piste ayant $\ge 1$ Abatteuse est éligible, même si son nombre d'Arbres debout est $0$ (le maximum vaut alors $0$, départagé par *L'Œil*). En revanche, si aucune piste n'a d'Abatteuse ($\forall i, \sum_p H_{i,p} = 0$), aucune carte $A_1$ n'est posée.
 * Pour $A_2$, si aucune piste n'a d'Abatteuse, aucune carte $A_2$ n'est posée.
 * Pour $A_3$, si aucune piste n'a d'Arbre debout, aucune carte $A_3$ n'est posée.
 * **Impact sur l'Apprentissage** : Seule une carte Manœuvre effectivement posée puis défaussée à l'Étape 3 fait évoluer sa tuile Tactique. Si une tactique ne permet de poser aucune carte à l'Étape 1 (ex. $A_1$ avec seulement une Abatteuse en dernière Parcelle $q$, ou aucune Abatteuse en jeu), aucune carte n'est posée ni défaussée, donc la tuile Tactique ne bouge pas.

### Hypothèse H2 : Superposition de plusieurs cartes Abattage sur une même Parcelle et principe de l'image figée
* **Constat** : Supposons qu'à l'Étape 3, sur une Parcelle sans Défenseur ($D = 0$), il n'y ait qu'**un seul Arbre debout** ($T_{i,p}^{(0)} = 1$), mais **deux cartes Abattage** (par exemple une carte $A_1$ et une carte $A_2$).
* **Règle retenue (`ModeResolutionParcelle` = `TRANSACTION_FIGEE`)** :
 * Conformément au principe de **transaction unitaire sur image figée**, toutes les cartes ciblant une même Parcelle évaluent la présence d'Arbres debout sur l'état de la Parcelle au début de l'Étape 3 ($T_{i,p}^{(0)}$).
 * Dès lors que $T_{i,p}^{(0)} \ge 1$, **toutes** les cartes Abattage non parées sur cette Parcelle ont une cible valide et obtiennent le statut **Réussite** (elles participent conjointement à l'abattage, et le nombre d'arbres physiquement coupés est plafonné à $\min(m_A, T_{i,p}^{(0)})$).
 * Une carte Abattage non parée n'obtient le statut **Échec (Sans objet)** que si la Parcelle ne comptait **déjà aucun Arbre debout au début de l'Étape 3** ($T_{i,p}^{(0)} = 0$, par exemple lorsqu'une Abatteuse située sur une Parcelle déjà vide a fui vers la droite à l'Étape 2 via $A_1$ en laissant une carte $A_2$ derrière elle).
 * Pour mettre à jour la *Piste des Tactiques* lorsque deux cartes différentes (ex. $A_1$ et $A_2$) ont agi sur la même Parcelle, on déplace leurs tuiles dans l'ordre de leur position sur la *Piste des Tactiques* au début de la résolution de cette Parcelle (de la case $1$ vers la case $6$, `OrdreMajTactiques` = `ORDRE_PISTE_TAC`).

### Hypothèse H3 : Superposition de plusieurs cartes Bulldozer sur un même emplacement (Parcelle ou Casse)
* **Constat** : Deux joueurs peuvent tirer des tactiques Bulldozer qui ciblent le même Bulldozer (ex. deux joueurs tirent $B_1$, ou l'un tire $B_1$ et l'autre $B_2$ qui désignent le même Bulldozer). Deux cartes Bulldozer sont alors posées sur le même emplacement.
* **Règle retenue (`ModeResolutionParcelle` = `TRANSACTION_FIGEE`)** :
 * **À la Casse ($p = 0$) avec $D_{i,0} = 0$** : Comme le Bulldozer était bien à la Casse au début de l'Étape 3 ($posB_i^{(0)} = 0$), **toutes** les cartes Réparation présentes sur la Casse obtiennent conjointement le statut **Réussite** (et le Bulldozer est placé en Parcelle $1$).
 * **Sur une Parcelle ($p \ge 1$) avec $D_{i,p} = 0$ ou $D_{i,p} = 1$** : Dès lors que la Parcelle contenait au moins une Souche ($S_{i,p}^{(0)} \ge 1$), **toutes** les cartes Terrassement présentes sur cette Parcelle obtiennent le statut **Réussite** (avec $D_{i,p} = 0$, toutes les Souches sont retirées ; avec $D_{i,p} = 1$, $\min(m_B, S_{i,p}^{(0)})$ Souches sont retirées). Elles n'échouent « sans objet » que si la Parcelle ne contenait déjà aucune Souche ($S_{i,p}^{(0)} = 0$).

### Hypothèse H4 : Bulldozer réparé à la Casse et interaction avec la Parcelle $1$
* **Constat** : À l'Étape 3, la Casse ($p = 0$) est résolue avant la Parcelle $1$ ($p = 1$). Si un Bulldozer y est réparé ($D_{i,0} = 0$), il est placé en Parcelle $1$. Que se passe-t-il si les joueurs avaient placé $3$ Défenseurs en Parcelle $1$ ($D_{i,1} \ge 3$) ?
* **Règle retenue (`ImmobiliteReparation` = `Vrai`, conforme à l'image figée)** :
 * En vertu du principe de **transaction unitaire sur image figée**, la présence d'une machine à détruire en Parcelle $1$ est testée sur l'état du plateau au début de l'Étape 3 ($posB_i^{(0)}$).
 * Comme le Bulldozer réparé était à la Casse au début de l'Étape 3 ($posB_i^{(0)} = 0 \neq 1$), il ne figurait pas en Parcelle $1$ sur l'image figée : il rejoint bien la Parcelle $1$ suite à sa réparation, mais ne peut pas être détruit par les Défenseurs de la Parcelle $1$ lors de ce même tour.

### Hypothèse H5 : Terrassement dégradé ($D = 1$) et déclenchement de la Rancune
* **Constat** : Avec $1$ Défenseur face à un Bulldozer sur une Parcelle ($p \ge 1$), chaque carte Bulldozer déclenche un « terrassement dégradé » ($1$ seule Souche retirée par carte au lieu de toutes).
* **Règle retenue** :
 * Tant qu'il y avait au moins $1$ Souche sur la Parcelle ($S_{i,p}^{(0)} \ge 1$), le terrassement dégradé est une **Réussite** pour l'Apprentissage (la tactique $B$ avance vers la case $1$) et **ne constitue pas une Parade** : il ne déclenche donc **aucune Rancune** sur *L'Œil du Contremaître* (`RancuneTerrassementDegrade` = `Faux`).
 * En revanche, à la Casse ($p = 0$) avec $1$ Défenseur, la réparation est intégralement bloquée : c'est une **Parade** (Échec de la tactique + Rancune sur *L'Œil*).

### Hypothèse H6 : Comptabilisation de la Rancune par emplacement (`PAR_CASE`)
* **Constat** : Que se passe-t-il si, sur une même Parcelle, les Défenseurs parent plusieurs cartes Manœuvre et détruisent simultanément une ou plusieurs machines ?
* **Règle retenue (`GranulariteRancune` = `PAR_CASE`)** :
 * Conformément aux règles d'*Amazonia*, la Rancune s'évalue **par emplacement** (Parcelle ou Casse) : dès qu'au moins une carte est parée OU qu'au moins une machine est détruite (ou envoyée à la Casse) sur un emplacement $(i, p)$, le Peuple $i$ avance d'**un seul cran** vers le Rang $1$ sur *L'Œil du Contremaître* pour cet emplacement.
 * Les modes `PAR_EVENEMENT` ($+1$ par carte parée et $+1$ par machine détruite) et `CARTE_ET_DESTRUCTION` restent disponibles en tant que paramètres de test dans le simulateur.

### Hypothèse H7 : Destruction préventive sur une Parcelle sans carte Manœuvre (et cas d'une Parcelle vide)
* **Constat** : Avec $2$ Défenseurs (pour les Abatteuses) ou $3$ Défenseurs (pour un Bulldozer), la destruction des machines présentes sur la Parcelle a lieu *même si aucune carte Manœuvre ne ciblait cette Parcelle ce tour-ci*. Qu'en est-il si les joueurs placent $2$ ou $3$ Défenseurs sur un emplacement totalement vide (ni carte Manœuvre, ni machine) ?
* **Règle retenue** :
 * Si au moins une machine est effectivement détruite (même sans carte Manœuvre), il y a défense active et la Rancune est déclenchée ($+1$ cran sur *L'Œil*).
 * En revanche, si aucune carte n'est parée et qu'aucune machine n'est détruite sur l'emplacement, aucune défense active n'a eu lieu : aucune Rancune n'est déclenchée.