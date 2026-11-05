# Refonte Complète du Laboratoire de Simulation Monte-Carlo — Nouvelle Version (Pistes Tactique, Principale & Furtivité)

Cette mise à jour remplace intégralement l'ancien moteur de jeu par la nouvelle spécification algorithmique (Matrice Maîtresse $2\text{D}6$ à zones `[A]`–`[D]`, triple piste par joueur *Tactique / Principale / Furtivité*, états machines `'NORMAL' | 'HS' | 'DESTROYED'`, Surchauffe $A_2/B_2$, Assaut $A_3/B_3$, Explosions, Pièges et Sabotages), tout en conservant l'architecture d'exécution multi-cœurs sur la VM Oracle, la persistance JSON et l'export de bilans structurés pour IA.

## Revue Utilisateur & Décisions Confirmées

> [!IMPORTANT]
> Les choix suivants ont été validés lors de la phase de clarification et gouvernent l'implémentation :

- **Conservation du moteur multi-cœurs VM Oracle & Persistance** : Maintien du pool de `worker_threads` (`os.cpus().length - 1` workers), des sauvegardes asynchrones sur disque JSON, du repli navigateur automatique et de l'export Markdown/JSON prêt pour prompt IA.
- **Indicateurs statistiques & Évaluation sur 100** : Calcul de toutes les métriques descriptives de la spécification (survie et pertes par tour et par joueur $J_1 \dots J_N$, fréquences d'Abattages, Terrassements, Surchauffes, Assauts, Parades $S=2+k_{\text{assault}}$, Mises $\text{HS}$ $S \ge 3+k_{\text{assault}}$, Explosions, Pièges/Sabotages, et matrice comparative D1/D2), complétées par des notes d'équilibrage sur 100 et la capture de parties extrêmes.
- **Périmètre focalisé sur les Campagnes Monte-Carlo & Journaux (`Combat Log`)** : Pas de mode de jeu interactif manuel pas-à-pas dans cette version ; l'interface est dédiée au lancement de campagnes de simulation, au comparateur de variantes d'équilibrage (notamment `overheatIncludesBaseAction` et `assaultIncludesBaseAction`), au stress-test multi-cœurs et à l'inspecteur de journaux de combat détaillés (`Combat Log`).

---

## 1. Vue d'Ensemble & Concept Fondamental

- **Ce que fait l'application** : Un banc d'essai Monte-Carlo haute performance permettant de tester et d'équilibrer la nouvelle règle du jeu coopératif ($3$ à $6$ joueurs) à travers des campagnes paramétriques, des comparaisons directes d'options de règles (Options D1 vs D2) et des stress-tests intensifs.
- **Utilisateurs cibles** : L'auteur du jeu et les analystes d'équilibrage souhaitant mesurer mathématiquement la survie de la forêt, l'asymétrie d'exposition entre $J_1 \dots J_N$ induite par la Matrice Maîtresse $2\text{D}6$, et la synergie entre la Piste Tactique et la Piste Furtivité.
- **Valeur ajoutée** : Purge totale des anciennes règles obsolètes et implémentation stricte de la nouvelle machine à états en 4 étapes séquentielles (3.1 Mouvement & Pose Face Visible/Cachée, 3.2 Combat avec décalage d'Assaut $+k_{\text{assault}}$ et Explosions, 3.3 Furtivité Sabotage/Piège, 3.4 Réparation Face Cachée).

---

## 2. Expérience Utilisateur & Design Visuel

- **Parcours utilisateur principal** :
  1. **Tableau de Bord & Comparateur Monte-Carlo** : Visualisation des résultats de la campagne sélectionnée : courbe et tableau des arbres perdus par tour et par joueur ($J_1 \dots J_N$), bilan des événements de combat (Abattages, Terrassements, Surchauffes, Assauts, Parades simples, Mises $\text{HS}$, Explosions, Pièges, Sabotages), comparaison directe des options D1/D2 (`overheatIncludesBaseAction` $\times$ `assaultIncludesBaseAction`), et notes synthétiques d'équilibrage sur 100.
  2. **Configurateur de Campagnes & Variantes (`SimulationConfig`)** : Panneau permettant de faire varier $N \in \{3..6\}$, $X \ge 1$, $a \ge 1$, l'ordre de `tacticsTrackSetup` (fixe ou mélangé), l'état initial des machines (`initialMachinesState`), ainsi que les 4 interrupteurs d'équilibrage (`overheatIncludesBaseAction`, `assaultIncludesBaseAction`, `overheatStacksTreeRemoval`, `endOfGameRegeneration`) et les politiques de Bots.
  3. **Superviseur Stress-Test Multi-Cœurs (VM Oracle)** : Exploration asynchrone sur tous les cœurs CPU pour vérifier les invariants de la nouvelle règle (ex. impossibilité d'être réparé au tour même d'une mise $\text{HS}$ en combat, conservation des pions arbres/souches, légalité des pièges et sabotages) et capturer les parties extrêmes (explosions multiples, destructions précoces).
  4. **Inspecteur de `Combat Log` & Référence Matrice $2\text{D}6$** : Générateur et lecteur de journaux textuels pas-à-pas détaillant chaque tour (tirages secrets $(D_1, D_2) \to (T_k, P_k)$, placements sur Piste Tactique vs Piste Furtivité, calcul de $S$ et $k_{\text{assault}}$, explosions, piégeages, réparations) + visualisation de la Matrice Maîtresse $6 \times 6$ et de ses zones `[A]`, `[B]`, `[C]`, `[D]`.
- **Identité Visuelle & Thème** :
  - *Direction esthétique* : Console analytique de laboratoire scientifique et d'édition de jeu de plateau, sobre, lisible et structurée sur $1440\text{px}$.
  - *Palette de couleurs (60-30-10)* : Fond neutre clair (`bg-slate-50`) / sombre (`dark:bg-slate-950`), surfaces structurelles à bordures fines $1\text{px}$ (`border-slate-200 dark:border-slate-800`), et accent émeraude (`emerald-700`) réservé aux actions primaires et états actifs.
  - *Typographie & Discipline Tabulaire* : `Plus Jakarta Sans` pour les titres et la navigation, `Public Sans` pour le corps de texte, et `JetBrains Mono` avec `tabular-nums` obligatoire sur toutes les tables statistiques, matrices $2\text{D}6$ et journaux de combat.
  - *Contrat de Barre Supérieure (3 Zones)* : Marque à gauche, 4 liens de navigation concis sur une seule ligne au centre, et 1 bouton d'action primaire à droite ; l'indicateur d'état du serveur (`Serveur VM Actif (X vCPU · Y workers)` vs `Fallback Navigateur Local`) prend place dans la barre d'outils contextuelle sous l'en-tête.

---

## 3. Décisions Produit & Arbitrages Algorithmiques

- **Décision 1 : Implémentation de $4$ Politiques de Bots sur les 2 Pistes (Tactique & Furtivité)**
  - *Approche choisie* :
    1. **Bot Naïf / Aléatoire (`RANDOM`)** : Place ses 2 Défenseurs aléatoirement sur $p$ ou $p+1$ (Piste Tactique ou Furtivité).
    2. **Bot « Combat Pur » Réactif (`COMBAT_PURE`)** : Étape 2.1 en Piste Tactique sur $p+1$ de sa machine `'NORMAL'` menacée (ou de son Abatteuse par défaut) ; Étape 2.2 en Piste Tactique sur $p+1$ de la machine `'NORMAL'` d'un allié ciblé par son propre tirage (ou en soutien sur $J_1$ pour atteindre $S=2$ ou $S=3$).
    3. **Bot « Hybride Furtivité + Combat » Proactif (`HYBRID_STEALTH_COMBAT`)** : Coordonne des paires de Défenseurs en Piste Furtivité ($\ge 2$) sur $p+1$ ou sur une machine `'HS'` pour poser des Pièges/Sabotages, et bascule en Piste Tactique dès qu'un Piège ou Sabotage est en place ou qu'un Assaut est anticipé afin d'atteindre $S = 2 + k_{\text{assault}}$ ou $S = 3 + k_{\text{assault}}$.
    4. **Bot « Omniscient » Borne Haute (`OMNISCIENT`)** : Connaît les $N$ tirages $(T_k, P_k)$ du tour pour optimiser exactement les seuils $S = 2 + k_{\text{assault}}$ (Parade), $S = 3 + k_{\text{assault}}$ (Mise $\text{HS}$) et les paires de Furtivité sans gaspillage.
- **Décision 2 : Évaluation Multicritère (/100) adaptée à la nouvelle mécanique**
  - *Approche choisie* : Calcul de 4 notes sur 100 adaptées aux nouvelles règles :
    1. **Intérêt Stratégique & Synergie Furtivité (`/100`)** : Gain de survie du Bot *Combat Pur* sur le Bot *Aléatoire*, et gain additionnel du Bot *Hybride Furtivité + Combat* sur le Bot *Combat Pur* (mesure si la Piste Furtivité apporte un vrai levier stratégique).
    2. **Tension & Courbe d'Attrition (`/100`)** : Proximité du taux de survie moyen avec la cible d'équilibrage ($55\% \text{–} 75\%$ d'arbres sauvés), fréquence des choix critiques face aux Surchauffes/Assauts et taux d'explosions maîtrisé.
    3. **Impact de la Coordination Étape 2.2 (`/100`)** : Efficacité des soutiens croisés permettant d'atteindre exactement les seuils de Parade ($S=2+k_{\text{assault}}$), de Mise $\text{HS}$ ($S \ge 3+k_{\text{assault}}$) ou de déclenchement de Furtivité ($\ge 2$ jetons).
    4. **Équité d'Exposition sur l'Œil ($J_1 \dots J_N$) (`/100`)** : Mesure de la capacité de l'équipe à compenser la surexposition structurelle de $J_1$ dans la Matrice Maîtresse $2\text{D}6$.

---

## 4. Architecture Technique & Modèle de Données

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   INTERFACE WEB REACT (1440px Desktop)                     │
│  ┌──────────────────┬──────────────────┬────────────────┬───────────────┐  │
│  │ 1. Tableau &     │ 2. Configurateur │ 3. Stress-Test │ 4. Combat Log │  │
│  │    Comparateur   │    Monte-Carlo   │    Multi-Cœurs │    & Matrice  │  │
│  │    D1/D2 & Bots  │    (Variantes)   │    (Invariants)│    2D6        │  │
│  └────────┬─────────┴────────┬─────────┴────────┬───────┴───────┬───────┘  │
└───────────┼──────────────────┼──────────────────┼───────────────┼──────────┘
            │                  │   API REST /     │               │
            ▼                  ▼   Fallback Local ▼               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             ORCHESTRATEUR DE CAMPAGNES (CampaignManager + Express)         │
│  • Gestion des campagnes (Balayage, Comparaison D1/D2, Stress-Test)        │
│  • Sauvegarde disque asynchrone non-bloquante (15s) dans data/campaigns/   │
│  • Générateur de Rapport Markdown IA (.md) & Export JSON complet (.json)   │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ Répartition par lots de graines
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ Worker Thread #1      │ │ Worker Thread #2      │ │ Worker Thread #(C-1)  │
│ • Matrice 2D6 (A..D)  │ │ • Matrice 2D6 (A..D)  │ │ • Matrice 2D6 (A..D)  │
│ • Bots (Naïf/Combat/  │ │ • Bots (Naïf/Combat/  │ │ • Bots (Naïf/Combat/  │
│   Hybride/Omniscient) │ │   Hybride/Omniscient) │ │   Hybride/Omniscient) │
│ • Étapes 3.1 à 3.4    │ │ • Étapes 3.1 à 3.4    │ │ • Étapes 3.1 à 3.4    │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Correspondance Composants & Gestionnaires d'État

- **Moteur `SimulationConfig` & `State Machine`** :
  - Alloue dynamiquement $\max(X + 6, 15)$ cases par piste Forêt pour supporter toute avancée des machines.
  - Implémente exactement la table $6 \times 6$ de la Matrice Maîtresse $2\text{D}6$ avec résolution dynamique des zones `[A]`, `[B]`, `[C]`, `[D]` selon $N \in \{3, 4, 5, 6\}$.
  - Exécute séquentiellement les étapes **3.1** (pose `faceDownCards` en $p$ si `'HS'`, `faceUpCards` en $p+1$ et avancée unique en $p+1$ si `'NORMAL'`), **3.2** (calcul de $S$ et $k_{\text{assault}}$, résolution de `'A'` avant `'B'` pour que le Terrassement de `'B'` rase aussi les souches fraîchement coupées par `'A'` au même tour), **3.3** (Sabotage si machines présentes en $c$ après mouvement, Piège si case vide avant et après mouvement et sans explosion ce tour), et **3.4** (réparation via `faceDownCards` et nettoyage).
- **Nettoyage complet de l'application** :
  - Suppression des fichiers et composants obsolètes de l'ancienne version (`ConservatoryView`, anciens fichiers `targeting.ts`, `i18n.ts` V1/V2, et anciens fichiers JSON dans `data/`).
