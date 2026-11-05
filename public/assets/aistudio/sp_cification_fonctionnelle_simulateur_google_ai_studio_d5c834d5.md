# SPÉCIFICATION FONCTIONNELLE ET ALGORITHMIQUE DU JEU

**Document de référence pour l'implémentation d'un simulateur (Mode Interactif & Monte-Carlo) sous Google AI Studio**

## 1. OBJECTIF DU SYSTÈME À IMPLÉMENTER

Développer une application web complète (simulateur de jeu de société coopératif pour $3$ à $6$ joueurs) permettant :

1. **Un mode « Partie Interactive / Pas-à-pas » :** visualisation de l'état des pistes Forêt, du plateau du Méchant, lancement des dés $2\text{D}6$, placement manuel ou assisté des Défenseurs, et exécution détaillée de la phase de résolution.

2. **Un mode « Simulation Monte-Carlo (Batch) » :** exécution rapide de $K$ parties (ex. $K = 1\,000$ ou $10\,000$) avec des profils d'IA (heuristiques de placement des Défenseurs) afin de mesurer le taux de survie des arbres, la fréquence des états $\text{HS}$ / Explosions et l'impact des variables d'équilibrage.

## 2. VARIABLES ET PARAMÈTRES CONFIGURABLES (`SimulationConfig`)

Le simulateur doit exposer les variables suivantes dans un panneau de configuration modifiable avant de lancer une partie ou un batch de simulations :

| Variable | Type | Valeur par défaut | Description | 
| ----- | ----- | ----- | ----- | 
| `numPlayers` ($N$) | Entier $\in \{3, 4, 5, 6\}$ | $4$ | Nombre de joueurs (et donc nombre de groupes de pistes Forêt). | 
| `numTurns` ($X$) | Entier $\ge 1$ | $8$ | Nombre total de tours de jeu d'une partie. | 
| `initialTreesPerCell` ($a$) | Entier $\ge 1$ | $3$ | Nombre initial de pions Arbres debout sur chaque case de chaque piste Forêt. | 
| `tacticsTrackSetup` | Tableau de $6$ chaînes | `['A1','B1','A2','B2','A3','B3']` | Ordre des $6$ tuiles Tactiques sur les emplacements $1$ à $6$ de la Piste des Tactiques (peut être fixé manuellement ou mélangé aléatoirement en début de partie). | 
| `initialMachinesState` | Tableau d'objets (taille $N$) | Toutes en case $1$, état `'NORMAL'`, $0$ souche | Configuration de départ pour chaque joueur $J_1 \dots J_N$ : case initiale et état (`'NORMAL'` ou `'HS'`) de l'Abatteuse ($A$) et du Bulldozer ($B$), et nombre de souches initiales en case $1$. | 
| `overheatIncludesBaseAction` | Booléen | `false` | **Variable d'équilibrage D (Surchauffe) :** Si `false` (Option D1), Surchauffe ($A2/B2$) applique uniquement son effet spécial. Si `true` (Option D2), elle réalise en plus l'action de base ($1$ Abattage pour $A2$, $1$ Terrassement pour $B2$) avant l'effet Surchauffe. | 
| `assaultIncludesBaseAction` | Booléen | `false` | **Variable d'équilibrage D (Assaut) :** Si `false` (Option D1), Assaut ($A3/B3$) applique uniquement son effet spécial. Si `true` (Option D2), elle réalise en plus l'action de base ($1$ Abattage pour $A3$, $1$ Terrassement pour $B3$) avant sa mise $\text{HS}$. | 
| `overheatStacksTreeRemoval` | Booléen | `true` | Si une machine reçoit $k \ge 2$ cartes Surchauffe au même tour (sans Assaut), enlève-t-on $k$ pions Arbres (`true`) ou seulement $1$ pion Arbre (`false`) ? | 
| `endOfGameRegeneration` | Booléen | `true` | En fin de partie (fin du tour $X$), toute case ayant au moins $1$ souche retransforme $1$ souche en $1$ arbre debout avant le décompte du score. | 

## 3. MODÈLE DE DONNÉES ET ÉTATS (`State Machine`)

### 3.1. Plateau « Pensées du Méchant »

* **`tacticsTrack` (Tableau d'index** $1$ **à** $6$**) :** Associe chaque valeur de $M \in \{1, 2, 3, 4, 5, 6\}$ à une tuile Tactique parmi `{'A1', 'A2', 'A3', 'B1', 'B2', 'B3'}`. Dans cette version, l'ordre est **fixe** pendant toute la partie.

* **`evilEyeTrack` (Tableau d'index** $1$ **à** $N$**) :** Liste ordonnée des joueurs $[J_1, J_2, \dots, J_N]$ du plus exposé (rang $1$) au moins exposé (rang $N$). Dans cette version, l'ordre est **fixe** pendant toute la partie.

### 3.2. Groupes de Pistes Forêt (1 groupe par joueur $i \in \{1 \dots N\}$)

Chaque joueur $i$ possède une piste Forêt de **longueur virtuellement infinie** (en pratique, allouer dynamiquement au moins $X + 5$ cases numérotées $c = 1, 2, 3 \dots$).

Chaque **Case** $c$ d'un joueur $i$ contient les propriétés suivantes :

* `standingTrees` (Entier $\ge 0$) : Nombre de pions sur leur face **Arbre debout** (initialisé à $a$).

* `stumps` (Entier $\ge 0$) : Nombre de pions sur leur face **Souche** (initialisé à $0$, sauf configuration initiale spécifique).

* *(Note : un arbre terrassé ou détruit correspond simplement à la décrémentation de `standingTrees` ou `stumps`).*

* `hasTrap` (Booléen) : Présence d'un jeton **Piège** sur la Piste Principale (maximum $1$ par case, initialisé à `false`).

* `tacticalDefenders` (Entier $\ge 0$) : Nombre de jetons Défenseurs posés sur la **Piste Tactique** de cette case ce tour-ci.

* `stealthDefenders` (Entier $\ge 0$) : Nombre de jetons Défenseurs posés sur la **Piste Furtivité** de cette case ce tour-ci.

* `faceUpCards` (Liste de `TacticType`) : Cartes Tactiques posées **face visible** sur la Piste Tactique en face de cette case ce tour-ci (génèrent un combat).

* `faceDownCards` (Liste de `TacticType`) : Cartes Tactiques posées **face cachée** sur la Piste Tactique en face de cette case ce tour-ci (génèrent une réparation en fin de tour).

* `explodedHereThisTurn` (Booléen) : Marqueur temporaire indiquant si une machine est entrée sur cette case et y a explosé pendant le tour en cours (initialisé à `false` à chaque début de tour).

### 3.3. Les Machines (2 machines par joueur $i \in \{1 \dots N\}$)

Chaque joueur $i$ possède exactement **1 Abatteuse (`type = 'A'`)** et **1 Bulldozer (`type = 'B'`)**.
Chaque machine possède les propriétés suivantes :

* `type` : `'A'` (Abatteuse) ou `'B'` (Bulldozer).

* `status` :

  * `'NORMAL'` : Opérationnelle (face Normale).

  * `'HS'` : Hors Service (face $\text{HS}$, immobilisée sur place).

  * `'DESTROYED'` : Définitivement retirée du jeu (suite à une Explosion).

* `position` (Entier $\ge 1$ ou `null` si `'DESTROYED'`) : Index de la case actuelle $p$ sur la Piste Principale.

* `startOfTurnPosition` (Entier $\ge 1$ ou `null`) : Mémorise la case occupée par la machine au début du tour (avant l'Étape 3.1 de mouvement), indispensable pour vérifier la condition de Piégeage à l'Étape 3.3.

* `hasSabotage` (Booléen) : Indique si la machine porte un jeton **Sabotage** (maximum $1$ par machine, initialisé à `false`).

## 4. MATRICE MAÎTRESSE $2\text{D}6$ (DISPOSITIF DE ROUES)

Lorsqu'un joueur lance ses deux dés différenciés $D_1 \in \{1..6\}$ (Dé Majeur) et $D_2 \in \{1..6\}$ (Dé Mineur) :

1. **Indice de Tactique :**
   

   $$
   M = \min(D_1, D_2) \in \{1, 2, 3, 4, 5, 6\}
   $$

   
   La tactique tirée est `tacticsTrack[M]`.

2. **Rang du joueur ciblé sur l'Œil :**
   Le couple $(D_1, D_2)$ renvoie le rang $r \in \{1 \dots N\}$ du joueur ciblé selon la Matrice Maîtresse $6 \times 6$ suivante (où $D_1$ est la ligne de $1$ à $6$ et $D_2$ la colonne de $1$ à $6$) :

### 4.1. Grille de base ($30$ cases fixes + $6$ cases à zones `[A]`, `[B]`, `[C]`, `[D]`)

* **Ligne** $D_1 = 1$ **:** `[ J1,  J1,  J1,  J2,  J3, [B] ]`

* **Ligne** $D_1 = 2$ **:** `[ J1,  J1,  J1,  J1,  J2,  J3 ]`

* **Ligne** $D_1 = 3$ **:** `[ J1,  J1, [C], [A],  J2,  J2 ]`

* **Ligne** $D_1 = 4$ **:** `[ J1, [A],  J2,  J1,  J1, [B] ]`

* **Ligne** $D_1 = 5$ **:** `[ J2,  J2, [D],  J3,  J1,  J2 ]`

* **Ligne** $D_1 = 6$ **:** `[ J3,  J1,  J2,  J3,  J3,  J1 ]`

### 4.2. Résolution des zones `[A]`, `[B]`, `[C]`, `[D]` selon le nombre de joueurs $N$

* **Zone `[A]` — cases** $(3,4)$ **et** $(4,2)$ **:**

  * Si $N = 3 \implies J_1$

  * Si $N = 4 \implies J_4$

  * Si $N = 5$ ou $N = 6 \implies J_5$

* **Zone `[B]` — cases** $(1,6)$ **et** $(4,6)$ **:**

  * Si $N = 3$ ou $N = 4 \implies J_1$

  * Si $N = 5$ ou $N = 6 \implies J_4$

* **Zone `[D]` — case** $(5,3)$ **:**

  * Si $N = 3$ ou $N = 4 \implies J_2$

  * Si $N = 5$ ou $N = 6 \implies J_4$

* **Zone `[C]` — case** $(3,3)$ **:**

  * Si $N = 3, 4$ ou $5 \implies J_1$

  * Si $N = 6 \implies J_6$

## 5. ALGORITHME SÉQUENTIEL D'UN TOUR DE JEU

Au tout début du tour $t$, pour chaque machine non détruite de chaque piste :

* `machine.startOfTurnPosition = machine.position`

* Pour chaque case $c$ : `cell.explodedHereThisTurn = false`

### PHASE 1 : Programmation secrète des actions du Méchant

Pour chaque joueur $k \in \{1 \dots N\}$ :

1. Tirer aléatoirement $D_1 \in \{1..6\}$ et $D_2 \in \{1..6\}$ (équiprobables).

2. Déterminer la tactique $T_k = \text{tacticsTrack}[\min(D_1, D_2)]$ et le joueur ciblé $P_k = \text{getTargetPlayer}(D_1, D_2, N)$.

3. Le tirage $(T_k, P_k)$ est connu **uniquement** du joueur $k$ pendant la Phase 2.

### PHASE 2 : Placement des Défenseurs (en 2 étapes)

Chaque joueur $k \in \{1 \dots N\}$ dispose de $2$ jetons Défenseur :

* **Étape 2.1 (Défense principale) :** Simultanément, chaque joueur $k$ place son $1^{\text{er}}$ jeton Défenseur sur **sa propre piste Forêt (**$P = k$**)**, en choisissant :

  * Soit une case $c$ de sa **Piste Tactique** (`tacticalDefenders += 1`).

  * Soit une case $c$ de sa **Piste Furtivité** (`stealthDefenders += 1`).

  * *(Interdiction formelle de poser un Défenseur sur la Piste Principale).*

  * Une fois que tous les joueurs ont posé leur $1^{\text{er}}$ jeton, leurs positions sont publiques.

* **Étape 2.2 (Soutien et coordination) :** Simultanément, chaque joueur $k$ place son $2^{\text{e}}$ jeton Défenseur sur la piste Forêt d'un **autre joueur (**$P \ne k$**)**, sur une case $c$ de la **Piste Tactique** ou de la **Piste Furtivité**.

  * *(En mode interactif, les joueurs peuvent déplacer leur* $2^{\text{e}}$ *jeton sur sa face « Réflexion en cours » avant de le verrouiller sur « Choix définitif »).*

### PHASE 3 : Résolution déterministe (en 4 étapes séquentielles)

#### ÉTAPE 3.1 : Révélation des cartes Tactiques et Mouvement des machines

1. **Pose des cartes Tactiques :**
   Pour chaque tirage $(T_k, P_k)$ des $N$ joueurs :

   * Identifier la machine ciblée sur la piste du joueur $P_k$ :

     * Si $T_k \in \{\text{'A1'}, \text{'A2'}, \text{'A3'}\}$, la machine ciblée est l'**Abatteuse (`'A'`)** de $P_k$.

     * Si $T_k \in \{\text{'B1'}, \text{'B2'}, \text{'B3'}\}$, la machine ciblée est le **Bulldozer (`'B'`)** de $P_k$.

   * Vérifier l'état de la machine ciblée (`status`) au début de cette étape :

     * **Cas 1 (`status == 'DESTROYED'`) — Arbitrage C1 (Répit) :** La machine ayant explosé lors d'un tour précédent, le tirage est **sans effet** (aucune carte n'est posée).

     * **Cas 2 (`status == 'HS'`) :** La machine est actuellement en case $p$. On ajoute la carte $T_k$ à la liste **`faceDownCards` (face cachée)** de la **case** $p$ de la piste $P_k$.

     * **Cas 3 (`status == 'NORMAL'`) :** La machine est actuellement en case $p$. On ajoute la carte $T_k$ à la liste **`faceUpCards` (face visible)** de la **case** $p + 1$ de la piste $P_k$.

2. **Mouvement immédiat des machines opérationnelles :**
   Pour chaque piste $i \in \{1 \dots N\}$ et pour chaque machine (`'A'` et `'B'`) :

   * Si la machine est en état `'NORMAL'` en case $p$ **ET** qu'au moins une carte face visible la concernant (`'A*'` pour Abatteuse, `'B*'` pour Bulldozer) se trouve dans `faceUpCards` de la case $p + 1$ :

     * La machine **avance immédiatement d'une seule case** : `machine.position = p + 1` (quel que soit le nombre de cartes face visible qui la ciblent en $p + 1$).

   * Les machines en état `'HS'` (ou `'NORMAL'` non ciblées) ne bougent pas (`machine.position` reste $p$).

#### ÉTAPE 3.2 : Résolution des Combats (Cases avec cartes Face Visible uniquement)

On parcourt chaque piste $i \in \{1 \dots N\}$ et chaque case $c$ où `cell.faceUpCards.length > 0` :

1. **Identification des machines engagées sur la case** $c$ **:**

   * L'Abatteuse `'A'` est dite **engagée** sur la case $c$ si elle se trouve en $c$ et que `cell.faceUpCards` contient au moins une carte `'A1'`, `'A2'` ou `'A3'`.

   * Le Bulldozer `'B'` est dit **engagé** sur la case $c$ s'il se trouve en $c$ et que `cell.faceUpCards` contient au moins une carte `'B1'`, `'B2'` ou `'B3'`.

   * *(Note : une machine présente sur la case* $c$ *mais qui n'a aucune carte `faceUp` à son nom n'est **pas** engagée ; son éventuel jeton Sabotage n'est ni compté ni défaussé).*

2. **Calcul de la valeur de défense** $S$ **de la case** $c$ **:**
   

   $$
   S = \text{cell.tacticalDefenders} + (\text{cell.hasTrap} \text{ ? } 1 : 0) + \sum_{m \in \text{EngagedMachines}(c)} (m.\text{hasSabotage} \text{ ? } 1 : 0)
   $$

3. **Calcul du modificateur pré-combat d'Assaut (**$k_{\text{assault}}$**) :**

   * Compter le nombre total de cartes **Assaut (`'A3'` et `'B3'`)** présentes dans `cell.faceUpCards` :
     

     $$
     k_{\text{assault}} = \text{count}(\text{card} \in \text{cell.faceUpCards} \mid \text{card} \in \{\text{'A3'}, \text{'B3'}\})
     $$

   * Les seuils de défense de la case $c$ sont décalés de $+k_{\text{assault}}$.

4. **Application de l'issue du combat selon** $S$ **et** $k_{\text{assault}}$ **:**

   * **CAS 1 :** $S \le 1 + k_{\text{assault}}$ $\implies$ **ATTAQUE RÉUSSIE (Les machines engagées agissent)**

     * **Sous-étape 4a : Résolution de l'Abatteuse `'A'` (si engagée) :**
       Soit $n_{A1}, n_{A2}, n_{A3}$ le nombre de cartes `'A1'`, `'A2'`, `'A3'` dans `cell.faceUpCards`.

       * **Test d'Explosion (**$n_{A2} \ge 1$ **ET** $n_{A3} \ge 1$**) :**

         * L'Abatteuse explose : `harvester.status = 'DESTROYED'`, `harvester.position = null`, `harvester.hasSabotage = false`.

         * Tous les pions arbres de la case $c$ sont supprimés définitivement : `cell.standingTrees = 0`, `cell.stumps = 0`.

         * Marquer `cell.explodedHereThisTurn = true`.

       * **Sinon (Pas d'explosion de l'Abatteuse) :**

         * *Calcul du nombre d'abattages :*
           

           $$
           n_{\text{abattages}} = n_{A1} + (\text{overheatIncludesBaseAction} \text{ ? } n_{A2} : 0) + (\text{assaultIncludesBaseAction} \text{ ? } n_{A3} : 0)
           $$

         * *Exécution des abattages :*
           Soit $x = \min(\text{cell.standingTrees}, n_{\text{abattages}})$.
           `cell.standingTrees -= x` ; `cell.stumps += x`.

         * *Effet Surchauffe (si* $n_{A2} \ge 1$*) :*
           Soit $r = \text{overheatStacksTreeRemoval} \text{ ? } n_{A2} : 1$.
           Répéter $r$ fois : si `cell.standingTrees > 0` alors `cell.standingTrees -= 1` sinon si `cell.stumps > 0` alors `cell.stumps -= 1`.
           Mettre l'Abatteuse hors service : `harvester.status = 'HS'`.

         * *Effet Assaut (si* $n_{A3} \ge 1$*) :*
           Mettre l'Abatteuse hors service : `harvester.status = 'HS'`.

     * **Sous-étape 4b : Résolution du Bulldozer `'B'` (si engagé, résolu APRÈS l'Abatteuse) :**
       Soit $n_{B1}, n_{B2}, n_{B3}$ le nombre de cartes `'B1'`, `'B2'`, `'B3'` dans `cell.faceUpCards`.

       * **Test d'Explosion (**$n_{B2} \ge 1$ **ET** $n_{B3} \ge 1$**) :**

         * Le Bulldozer explose : `bulldozer.status = 'DESTROYED'`, `bulldozer.position = null`, `bulldozer.hasSabotage = false`.

         * Tous les pions arbres de la case $c$ sont supprimés définitivement : `cell.standingTrees = 0`, `cell.stumps = 0`.

         * Marquer `cell.explodedHereThisTurn = true`.

       * **Sinon (Pas d'explosion du Bulldozer) :**

         * *Calcul du nombre d'actions de base Bulldozer :*
           

           $$
           n_{\text{actionsB}} = n_{B1} + (\text{overheatIncludesBaseAction} \text{ ? } n_{B2} : 0) + (\text{assaultIncludesBaseAction} \text{ ? } n_{B3} : 0)
           $$

         * *Exécution du Terrassement et des* $(n_{\text{actionsB}} - 1)$ *Abattages :*
           Si $n_{\text{actionsB}} \ge 1$ :

           1. **1 Terrassement :** `cell.stumps = 0` (toutes les souches présentes sur la case $c$, y compris celles qui viennent d'être créées par l'Abatteuse à la sous-étape 4a, sont définitivement retirées).

           2. $(n_{\text{actionsB}} - 1)$ **Abattages :** Si $n_{\text{actionsB}} > 1$, soit $y = \min(\text{cell.standingTrees}, n_{\text{actionsB}} - 1)$.
              `cell.standingTrees -= y` ; `cell.stumps += y`.

         * *Effet Surchauffe (si* $n_{B2} \ge 1$*) :*
           Soit $r = \text{overheatStacksTreeRemoval} \text{ ? } n_{B2} : 1$.
           Répéter $r$ fois : si `cell.standingTrees > 0` alors `cell.standingTrees -= 1` sinon si `cell.stumps > 0` alors `cell.stumps -= 1`.
           Mettre le Bulldozer hors service : `bulldozer.status = 'HS'`.

         * *Effet Assaut (si* $n_{B3} \ge 1$*) :*
           Mettre le Bulldozer hors service : `bulldozer.status = 'HS'`.

   * **CAS 2 :** $S == 2 + k_{\text{assault}}$ $\implies$ **PARADE SIMPLE (Arbitrage A1)**

     * Les machines engagées n'agissent pas (aucun arbre abattu/terrassé, aucune explosion).

     * Les machines engagées **restent sur leur face `'NORMAL'`** (même si elles avaient une carte Assaut ou Surchauffe).

   * **CAS 3 :** $S \ge 3 + k_{\text{assault}}$ $\implies$ **PARADE + MISE HS**

     * Les machines engagées n'agissent pas.

     * Toutes les machines engagées sur la case $c$ sont retournées sur leur face Hors Service : pour chaque $m \in \text{EngagedMachines}(c)$, `m.status = 'HS'`.

5. **Nettoyage post-combat des jetons (les cartes restent en place jusqu'à l'Étape 3.4) :**

   * `cell.hasTrap = false`

   * Pour chaque machine $m \in \text{EngagedMachines}(c)$ : `m.hasSabotage = false`.

#### ÉTAPE 3.3 : Résolution de la Piste Furtivité (Piégeages et Sabotages post-combat)

On parcourt chaque piste $i \in \{1 \dots N\}$ et chaque case $c$ où **`cell.stealthDefenders >= 2`** (si `cell.stealthDefenders < 2`, il ne se passe rien) :

1. **Vérification des machines présentes APRÈS mouvement sur la case** $c$ **:**
   Soit `machinesPresentAfter` la liste des machines non détruites (`status !== 'DESTROYED'`) du joueur $i$ telles que `machine.position == c`.

2. **Vérification de l'occupation AVANT mouvement (et hors explosion) :**
   Soit `wasOccupiedBefore` un booléen vrai si au moins une machine du joueur $i$ avait `machine.startOfTurnPosition == c`.

3. **Application des règles de Furtivité :**

   * **Condition de SABOTAGE (`machinesPresentAfter.length >= 1`) — Arbitrage B1 (Double Sabotage) :**

     * Pour **chaque** machine $m \in \text{machinesPresentAfter}$ :
       `m.hasSabotage = true` (maximum $1$ jeton Sabotage par machine).

   * **Sinon, Condition de PIÉGEAGE (`machinesPresentAfter.length == 0` ET `!wasOccupiedBefore` ET `!cell.explodedHereThisTurn`) :**

     * La case $c$ n'avait aucune machine avant mouvement et n'en a aucune après mouvement :
       `cell.hasTrap = true` (maximum $1$ jeton Piège par case).

   * **Sinon (Case quittée par une machine à l'Étape 3.1 ou machine ayant explosé sur la case à l'Étape 3.2) :**

     * **Échec :** Aucun jeton Piège ni Sabotage n'est posé.

#### ÉTAPE 3.4 : Réparation des machines HS (Cartes Face Cachée) et Nettoyage de fin de tour

Pour chaque piste $i \in \{1 \dots N\}$ :

1. **Réparation via cartes Face Cachée :**

   * Pour chaque case $c$ où `cell.faceDownCards.length > 0` :

     * Si l'Abatteuse `'A'` est en case $c$, que `harvester.status == 'HS'` et que `cell.faceDownCards` contient au moins une carte `'A*'`, alors **`harvester.status = 'NORMAL'`**.

     * Si le Bulldozer `'B'` est en case $c$, que `bulldozer.status == 'HS'` et que `cell.faceDownCards` contient au moins une carte `'B*'`, alors **`bulldozer.status = 'NORMAL'`**.

   * *(Rappel fondamental : une machine tombée `'HS'` pendant le combat de l'Étape 3.2 avait ses cartes dans `faceUpCards` et non dans `faceDownCards`. Elle ne peut donc jamais être réparée à la fin du même tour).*

2. **Récupération du matériel :**

   * Pour chaque case $c$ :

     * `cell.faceUpCards = []`

     * `cell.faceDownCards = []`

     * `cell.tacticalDefenders = 0`

     * `cell.stealthDefenders = 0`

     * `cell.explodedHereThisTurn = false`

## 6. FIN DE PARTIE ET DÉCOMPTE DU SCORE

À l'issue de l'Étape 3.4 du dernier tour ($t = X$) :

1. **Régénération de fin de partie (si `endOfGameRegeneration == true`) :**

   * Pour chaque piste $i \in \{1 \dots N\}$ et chaque case $c$ :

     * Si `cell.stumps >= 1` :
       `cell.stumps -= 1`
       `cell.standingTrees += 1`

2. **Calcul du Score Coopératif :**
   

   $$
   \text{Score Total} = \sum_{i=1}^{N} \sum_{c} \text{cell}_{i,c}.\text{standingTrees}
   $$

   
   Calculer également le ratio de survie en pourcentage par rapport au stock initial d'arbres sur les cases visitées ou sur un horizon de référence (ex. $N \times X \times a$ arbres).

## 7. DIRECTIVES POUR L'INTERFACE ET LES BOTS DE SIMULATION (GOOGLE AI STUDIO)

Afin de tirer le meilleur parti du simulateur, implémenter les fonctionnalités suivantes dans une application monopage (HTML/CSS/JS ou React) :

1. **Vue Plateau Interactive :**

   * Affichage du plateau « Pensées du Méchant » (Piste des Tactiques $1..6$ et Piste de l'Œil $J_1..J_N$ avec probabilités associées).

   * Affichage des $N$ groupes de pistes Forêt (chaque groupe affichant clairement en colonnes les cases $c = 1, 2, \dots$ et en lignes : Piste Tactique, Piste Principale avec Arbres/Souches/Pièges/Machines/Sabotages, et Piste Furtivité).

   * Journal de bord détaillé (`Combat Log`) traçant chaque étape de résolution ($S$, modificateurs d'Assaut, arbres abattus/terrassés, pièges/sabotages posés, réparations).

2. **Politiques d'IA (Bots) pour le mode Monte-Carlo :**
   Proposer au moins $3$ stratégies automatiques de placement des Défenseurs en Phase 2 :

   * **Bot Naïf / Aléatoire :** Place ses Défenseurs aléatoirement sur $p$ ou $p+1$.

   * **Bot « Combat Pur » (Réactif) :**

     * Étape 2.1 : Si le tirage du joueur cible sa propre piste sur une machine `'NORMAL'` en $p$, il pose son $1^{\text{er}}$ Défenseur en **Piste Tactique sur** $p+1$. Sinon, il protège sa propre Abatteuse en Piste Tactique sur $p+1$.

     * Étape 2.2 : Il pose son $2^{\text{e}}$ Défenseur en Piste Tactique sur la case $p+1$ de la machine que son propre tirage a ciblée (si $P_k \ne k$ et machine `'NORMAL'`), ou à défaut en soutien sur $J_1$ pour atteindre $S = 2$ (Parade) ou $S = 3$ (Mise $\text{HS}$).

   * **Bot « Hybride Furtivité + Combat » (Proactif) :**

     * Utilise la **Piste Furtivité en** $p+1$ par paires de Défenseurs (coopération Étape 1 + Étape 2) lorsque les machines ne sont pas immédiatement menaçantes ou pour préparer un jeton Sabotage/Piège garanti, et bascule en **Piste Tactique** pour déclencher des Parades ($S=2$) ou des Mises $\text{HS}$ ($S=3$) sur les cases contenant déjà un Piège ou un Sabotage.

3. **Tableau de bord statistique (Mode Monte-Carlo) :**

   * Moyenne et écart-type des arbres perdus par tour et par joueur ($J_1$ à $J_N$).

   * Nombre moyen d'Abattages, de Terrassements, de Surchauffes, d'Assauts, de Parades ($S=2$), de Mises $\text{HS}$ ($S \ge 3$) et d'Explosions par partie.

   * Comparaison directe de l'impact des variables `overheatIncludesBaseAction` et `assaultIncludesBaseAction` (`true` vs `false`).