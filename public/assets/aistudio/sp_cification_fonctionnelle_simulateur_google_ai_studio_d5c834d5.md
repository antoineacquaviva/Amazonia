# SPÉCIFICATION FONCTIONNELLE ET ALGORITHMIQUE DU JEU — VERSION v3.3

**Document de référence formel pour le simulateur Monte-Carlo & Système Multi-Agents « Amazonia : Dernier Rempart » (v3.3)**

---

## 1. OBJECTIFS DU SYSTÈME & ÉVOLUTIONS MAJEURES v3.3

Le simulateur « Amazonia : Dernier Rempart » modélise un jeu de société coopératif à information asymétrique pour $N \in \{3, 4, 5, 6\}$ joueurs sur $X$ tours, combinant :

1. **Invariants de Règles Figés (issus des campagnes v3.1 et v3.2) :**
   * **Densité initiale par défaut :** $a = 2$ arbres debout par case (`initialTreesPerCell = 2`).
   * **Piste des Tactiques par défaut (`ASSAULT_LOW`) :** `['A1', 'B1', 'A2', 'B2', 'A3', 'B3']` (Abattage/Terrassement sur les cases fréquentes $M=1,2$ ; Assauts sur $M=5,6$).
   * **Bulldozer sur case sans souche (`DESTROY_TREE`) :** Si le Bulldozer attaque une case où `stumps == 0` lors de son premier Terrassement, il détruit définitivement $1$ arbre debout sans laisser de souche.
   * **Souche initiale en Case 2 sur $J_1$ et $J_2$ (`initialStumpCell2 = true`) :** Au départ de la partie, toutes les machines démarrent en case $1$, et la case $2$ des pistes $J_1$ et $J_2$ démarre avec $1$ souche et $a - 1$ arbres debout (soit $1$ souche et $1$ arbre debout pour $a=2$).
   * **Invariants moteurs permanents :** Option D2-Double (`overheatIncludesBaseAction = true`, `assaultIncludesBaseAction = true`), Cumul Surchauffe (`overheatStacksTreeRemoval = true`), Régénération de fin de partie (`endOfGameRegeneration = true`), Réparation Active en Étape 3.1 dès la $2^{\text{e}}$ carte reçue par une machine $\text{HS}$, Purge du Sabotage lors d'une réparation, et Réserve Globale limitée à $\text{Max } N$ jetons Piège/Sabotage simultanés sur le plateau.

2. **Nouveau Levier Fin de Synergie Mise HS (`parryHsRule`) :**
   * `'STANDARD_S3'` : Parade simple à $S == 2 + k_{\text{assault}} + \text{shift}$, Parade + Mise $\text{HS}$ uniquement à $S \ge 3 + k_{\text{assault}} + \text{shift}$.
   * `'SYNERGY_TRAP_SAB'` *(Défaut v3.3)* : Dès que la Parade est atteinte ($S \ge 2 + k_{\text{assault}} + \text{shift}$), si $S \ge 3 + k_{\text{assault}} + \text{shift}$ **OU** si au moins un **Piège** ou un **Sabotage** actif participe au combat ($\text{trapBonus} + \text{sabotageBonus} \ge 1$), le résultat du combat est immédiatement **`PARRY_AND_HS`** (Parade + Mise $\text{HS}$ des machines engagées). Sinon ($S == 2 + k_{\text{assault}} + \text{shift}$ avec uniquement des Défenseurs Tactiques), c'est une `'SIMPLE_PARRY'`.

3. **Modélisation Formelle des 3 Sources d'Information ($I_1, I_2, I_3$) & Boucle Systémique de Révision 2.2 :**
   * Décomposition orthogonale de type Shapley via **7 profils de Bots gradués** (`BLIND`, `PROB_ONLY`, `SOLO_INFORMED`, `COORD_NO_DICE`, `COORD_ONE_SHOT`, `COORD_HYBRID`, `OMNISCIENT`).
   * Mesure exacte des **5 Gains Décisionnels** et de la corrélation de Pearson $r$ entre la pertinence des poses de jetons et la survie de la forêt.
   * Fenêtre de survie valide étendue à **$[45\% \dots 82\%]$** (avec un plateau optimal plein entre **$50\%$ et $80\%$** permettant d'évaluer sans pénalité artificielle aussi bien les variantes « Hardcore » que les variantes « Soutenues »).

---

## 2. VARIABLES ET PARAMÈTRES CONFIGURABLES (`SimulationConfig`)

| Variable | Type | Valeur par défaut v3.3 | Description |
| ----- | ----- | ----- | ----- |
| `numPlayers` ($N$) | Entier $\in \{3, 4, 5, 6\}$ | $4$ | Nombre de joueurs et de groupes de pistes Forêt. |
| `numTurns` ($X$) | Entier $\ge 1$ | $8$ | Nombre total de tours de jeu d'une partie. |
| `initialTreesPerCell` ($a$) | Entier $\in \{2, 3\}$ | $2$ | **Figé à $2$ par défaut en v3.3.** Nombre initial de pions par case. |
| `tacticsTrackPreset` | `'ASSAULT_LOW'` \| `'ASSAULT_HIGH'` | `'ASSAULT_LOW'` | **Figé à `'ASSAULT_LOW'` par défaut** (`['A1','B1','A2','B2','A3','B3']`). |
| `tacticalDefenderCap` | $99$ \| $2$ \| $1$ | $2$ | Plafond de jetons Défenseurs posables sur la Piste Tactique d'une même case par tour. |
| `combatThresholdShift` | $0$ \| $1$ | $0$ | Décalage $+\text{shift}$ appliqué aux seuils de combat $S$. |
| `parryHsRule` | `'SYNERGY_TRAP_SAB'` \| `'STANDARD_S3'` | `'SYNERGY_TRAP_SAB'` | **Nouveau levier v3.3 :** Mise $\text{HS}$ dès la Parade ($S \ge 2+k+\text{shift}$) si au moins un Piège ou Sabotage actif participe au combat. |
| `bulldozerZeroStumpAction` | `'DESTROY_TREE'` \| `'NONE'` | `'DESTROY_TREE'` | **Figé à `'DESTROY_TREE'` par défaut :** si `stumps == 0` au $1^{\text{er}}$ Terrassement, le Bulldozer détruit définitivement $1$ arbre debout. |
| `initialStumpCell2` | Booléen | `true` | **Figé à `true` par défaut :** la case $2$ de $J_1$ et $J_2$ démarre avec $1$ souche et $a-1$ arbres debout. |

---

## 3. MATRICE MAÎTRESSE $2\text{D}6$ & PROBABILITÉS PUBLIQUES ($I_2$)

Lorsqu'un joueur $k$ lance ses deux dés différenciés $D_1 \in \{1..6\}$ (Dé Majeur) et $D_2 \in \{1..6\}$ (Dé Mineur) :

1. **Indice de Tactique :**
   $$M = \min(D_1, D_2) \in \{1, 2, 3, 4, 5, 6\}$$
   Les probabilités exactes sur $36$ tirages équiprobables sont :
   * $P(M=1) = 11/36$ ($30.56\%$), $P(M=2) = 9/36$ ($25.00\%$), $P(M=3) = 7/36$ ($19.44\%$), $P(M=4) = 5/36$ ($13.89\%$), $P(M=5) = 3/36$ ($8.33\%$), $P(M=6) = 1/36$ ($2.78\%$).
   * Avec le preset par défaut `'ASSAULT_LOW'` (`['A1','B1','A2','B2','A3','B3']`), les actions de base $A1/B1$ tombent $20/36$ fois ($55.6\%$), les Surchauffes $A2/B2$ $12/36$ fois ($33.3\%$) et les Assauts $A3/B3$ $4/36$ fois ($11.1\%$).

2. **Matrice Maîtresse $6 \times 6$ de l'Œil du Méchant :**
   * **Ligne $D_1 = 1$ :** `[ J1,  J1,  J1,  J2,  J3, [B] ]`
   * **Ligne $D_1 = 2$ :** `[ J1,  J1,  J1,  J1,  J2,  J3 ]`
   * **Ligne $D_1 = 3$ :** `[ J1,  J1, [C], [A],  J2,  J2 ]`
   * **Ligne $D_1 = 4$ :** `[ J1, [A],  J2,  J1,  J1, [B] ]`
   * **Ligne $D_1 = 5$ :** `[ J2,  J2, [D],  J3,  J1,  J2 ]`
   * **Ligne $D_1 = 6$ :** `[ J3,  J1,  J2,  J3,  J3,  J1 ]`
   * **Zones variables :**
     * `[A]` $\rightarrow J_1$ ($N=3$), $J_4$ ($N=4$), $J_5$ ($N \in \{5,6\}$).
     * `[B]` $\rightarrow J_1$ ($N \in \{3,4\}$), $J_4$ ($N \in \{5,6\}$).
     * `[C]` $\rightarrow J_1$ ($N \in \{3,4,5\}$), $J_6$ ($N=6$).
     * `[D]` $\rightarrow J_2$ ($N \in \{3,4\}$), $J_4$ ($N \in \{5,6\}$).

---

## 4. LES 3 SOURCES D'INFORMATION ET LA BOUCLE SYSTÉMIQUE DE RÉVISION (PHASE 2)

En Phase 2, chaque joueur $k \in \{0 \dots N-1\}$ dispose de **3 sources d'information distinctes** pour placer son $1^{\text{er}}$ jeton (Étape 2.1 sur sa propre piste $P = k$) et son $2^{\text{e}}$ jeton (Étape 2.2 sur une piste alliée $P \ne k$) :

### 4.1. Source $I_1$ — Connaissance Privée ($100\%$ fiable)
Le joueur $k$ connaît avec certitude son propre lancer de dés $2\text{D}6$ : la tactique tirée $T_k \in \{A1, B1, A2, B2, A3, B3\}$ et le joueur ciblé $P_k \in \{0 \dots N-1\}$.

### 4.2. Source $I_2$ — Lecture Probabiliste Publique & État du Plateau
Même sans regarder aucun dé ni aucun jeton allié, tout joueur peut calculer exactement la matrice conjointe des $36$ couples $(D_1, D_2)$ pour chacun desdés inconnus :
* Probabilité exacte qu'un dé inconnu cible la machine $m \in \{A, B\}$ du joueur $p$ avec chacune des $6$ cartes Tactiques.
* Croisement avec la **vulnérabilité écologique réelle** de la case menacée :
  * Nombre d'arbres debout (`standingTrees`) exposés à l'Abatteuse ou à la Surchauffe.
  * Nombre de souches (`stumps`) exposées au Terrassement du Bulldozer (notamment en case $2$ de $J_1$ et $J_2$ dès le Tour $1$), ou risque de destruction directe d'arbre si `stumps == 0` (`DESTROY_TREE`).
  * État `'NORMAL'` vs `'HS'` de la machine : une machine `'HS'` ne bouge pas sur $1$ seule carte (qui la répare en fin de tour), mais si elle reçoit $\ge 2$ cartes au même tour, la $1^{\text{re}}$ provoque une **Réparation Active en Étape 3.1** et les suivantes déclenchent immédiatement un mouvement et un combat en $p+1$.
  * Présence d'un Piège (`hasTrap`) ou d'un Sabotage (`hasSabotage`) déjà posé sur la case, qui abaisse le besoin en Défenseurs Tactiques et permet de déclencher une **Mise $\text{HS}$ par Synergie** (`SYNERGY_TRAP_SAB`).

### 4.3. Source $I_3$ — Boucle Systémique de Communication par les Poses de Jetons
Les joueurs communiquent tacitement par la pose physique de leurs jetons Défenseurs :
1. **Étape 2.1 (Pose simultanée et définitive du $1^{\text{er}}$ jeton sur $P = k$) :**
   * Exécutée en une seule passe simultanée et **indépendante de l'ordre des joueurs** ($k = 0 \dots N-1$).
   * Si le dé privé de $k$ cible sa propre piste ($P_k = k$), sa pose en 2.1 sur la case menacée émet un signal d'alerte à ses coéquipiers.
   * Si le dé privé de $k$ cible un allié ($P_k \ne k$), $k$ protège sa propre case la plus menacée a priori ou ouvre un appel Furtivité $(1/2)$ sur sa piste.

2. **Étape 2.2 (Pose temporaire et boucle de révision itérative du $2^{\text{e}}$ jeton sur $P \ne k$) :**
   * En début d'Étape 2.2, chaque joueur observe l'ensemble des jetons 2.1 et met à jour ses croyances bayésiennes sur les tirages de ses alliés.
   * **Ronde $r = 1$ (Pose initiale temporaire) :** Si $P_k \ne k$ et que son dé privé crée une menace chez l'allié $P_k$, le joueur $k$ pose son $2^{\text{e}}$ jeton sur la case menacée de $P_k$. Même si cette case était vide en 2.1 (ce qui place le jeton seul à $S=1$), ce placement constitue un **signal d'alarme explicite** indiquant au reste de l'équipe : *« Mon dé privé attaque cette machine sur la piste de $P_k$, venez m'aider à atteindre la Parade $S=2$ ! »*.
   * **Rondes $r = 2 \dots 4$ (Révision Best-Response jusqu'à convergence) :**
     Lors de chaque ronde de révision, chaque joueur réévalue la position de son $2^{\text{e}}$ jeton en observant les $(N-1)$ autres seconds jetons temporaires :
     * **Sauvetage d'un signal allié ($S=1 \rightarrow S=2$) :** Si un allié $j$ a posé son $2^{\text{e}}$ jeton Tactique seul sur une piste tierce $P \ne j$, un autre joueur dont le jeton est moins critique déplace son $2^{\text{e}}$ jeton pour compléter la Parade ($S=2$) ou la Mise $\text{HS}$ par Synergie.
     * **Reconversion des Furtivités Orphelines ($1/2 \rightarrow \text{Tactique}$) :** Si un joueur avait proposé un $1^{\text{er}}$ jeton Furtivité $(1/2)$ mais qu'aucun partenaire n'est disponible pour le compléter à $2/2$, il **reprend son jeton en révision** et le reconvertit en renfort Tactique utile (éliminant les jetons Furtivité orphelins).
     * **Élimination des Collisions et de l'Overkill :** Si $\ge 3$ joueurs convergent simultanément sur la même Furtivité ou dépassent le seuil de Mise $\text{HS}$ / la réserve globale $\text{Max } N$, les joueurs en surnombre réallouent leur $2^{\text{e}}$ jeton vers la seconde menace la plus grave du plateau.

---

## 5. LES 7 PROFILS DE BOTS ORTHOGONAUX (`BotProfileId`)

Pour isoler mathématiquement la contribution de chaque source d'information ($I_1, I_2, I_3$) et de la boucle de révision 2.2, le simulateur exécute sur les mêmes graines appariées (`Paired Seeds`) les **7 profils gradués** suivants :

| Rang | Identifiant (`BotProfileId`) | Sources d'Info actives | Description algorithmique |
| ----- | ----- | ----- | ----- |
| **1** | `'BLIND'` | Aucune ($0$) | **Bot Aveugle Naïf :** Ne lit ni son dé 2D6, ni les probabilités de la Piste Tactique/Œil, ni les jetons alliés. Dispersion uniforme naïve. |
| **2** | `'PROB_ONLY'` | $I_2$ seule | **Bot Lecteur Probabiliste :** Ignore son dé privé ($I_1=0$) et les jetons alliés ($I_3=0$), mais calcule la distribution exacte des $36$ tirages sur `tacticsTrack` et l'Œil ainsi que la vulnérabilité des cases pour défendre les cibles à plus forte perte espérée. |
| **3** | `'SOLO_INFORMED'` | $I_1 + I_2$ | **Bot Solo Bayésien :** Combine la lecture probabiliste ($I_2$) et la connaissance exacte de son propre dé 2D6 ($I_1$), mais joue sans lire ni coordonner les jetons alliés ($I_3=0$). |
| **4** | `'COORD_NO_DICE'` | $I_2 + I_3$ (sans $I_1$) | **Bot Coordonné Sans Dé :** Ignore son propre dé 2D6 ($I_1=0$), mais utilise la lecture probabiliste ($I_2$) **et** la boucle complète de coordination et de révision 2.2 ($I_3$). Permet d'isoler par différence la vraie valeur marginale du dé privé au sein d'une équipe coordonnée ! |
| **5** | `'COORD_ONE_SHOT'` | $I_1 + I_2 + I_3$ (1 passe) | **Bot Coordonné 1-Passe :** Utilise $I_1 + I_2$, émet et décode les signaux de l'Étape 2.1, mais pose son $2^{\text{e}}$ jeton en Étape 2.2 en une seule passe définitive sans révision itérative. |
| **6** | `'COORD_HYBRID'` | $I_1 + I_2 + I_3$ (Révisable) | **Bot Coordonné Révisable Bayésien (RÉFÉRENCE) :** Utilise $I_1 + I_2 + I_3$ et exécute jusqu'à $4$ rondes de révision du $2^{\text{e}}$ jeton en Étape 2.2 (sauvetage des signaux alliés $S=1$, zéro Furtivité orpheline, zéro collision). |
| **7** | `'OMNISCIENT'` | Information Parfaite | **Bot Omniscient (Plafond théorique) :** Connaît les $N$ tirages exacts et optimise globalement l'allocation des $2N$ jetons en tenant compte de `parryHsRule`. |

---

## 6. LES 5 GAINS DÉCISIONNELS & MÉTRIQUES D'ÉVALUATION v3.3

À partir des taux de survie moyens $\text{Surv}(\cdot)$ des $7$ profils sur un même lot de graines, l'évaluateur (`src/sim/evaluator.ts`) calcule les **5 Gains Décisionnels** :

1. **Gain de Lecture Probabiliste ($I_2$) :**
   $$\Delta_{I_2} = \text{Surv}(\text{PROB\_ONLY}) - \text{Surv}(\text{BLIND})$$
2. **Gain du Dé Privé en Solo ($I_1 \mid I_2$) :**
   $$\Delta_{I_1,\text{solo}} = \text{Surv}(\text{SOLO\_INFORMED}) - \text{Surv}(\text{PROB\_ONLY})$$
3. **Vrai Gain du Dé Privé en Équipe Coordonnée ($I_1 \mid I_2, I_3$) :**
   $$\Delta_{I_1,\text{team}} = \text{Surv}(\text{COORD\_HYBRID}) - \text{Surv}(\text{COORD\_NO\_DICE})$$
4. **Gain de Coordination 1-Passe (Lecture de l'Étape 2.1) :**
   $$\Delta_{\text{Coord1P}} = \text{Surv}(\text{COORD\_ONE\_SHOT}) - \text{Surv}(\text{SOLO\_INFORMED})$$
5. **Gain de la Boucle Systémique de Révision 2.2 :**
   $$\Delta_{\text{Rév2.2}} = \text{Surv}(\text{COORD\_HYBRID}) - \text{Surv}(\text{COORD\_ONE\_SHOT})$$

En complément, chaque partie mesure :
* `step2RevisionsCount` : Nombre de révisions du $2^{\text{e}}$ jeton effectuées pendant l'Étape 2.2.
* `successfulSignalCompletionsCount` : Nombre de signaux émis (en 2.1 ou en 2.2 ronde 1) sur une menace réelle qui ont été complétés par un allié pour déclencher une Parade, une Mise $\text{HS}$ ou un Piège/Sabotage.
* `placementRelevanceScore` $\in [0, 1]$ et `choiceToSurvivalCorrelation` ($r$ de Pearson) : Mesure directe du lien statistique entre la qualité des choix de placement et la survie finale de la forêt.