# Laboratoire de Simulation & de Vérification — « Amazonia : Dernier Rempart »

Application web full-stack de simulation Monte-Carlo, d'évaluation de game design et de vérification formelle par stress-test asynchrone pour le jeu de plateau coopératif **Amazonia : Dernier Rempart**, conçue pour s'intégrer nativement au portail **Atelier Conception Jeu** (Aperçu AI Studio et production sur VM Oracle).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Décisions confirmées lors de la phase de clarification :**
> - **Restitution centrée sur les journaux textuels et statistiques IA** : Pas de visualiseur graphique de plateau pas-à-pas dans cette première version. Toute l'interface et les moteurs de sortie sont concentrés sur des tableaux statistiques de haute précision et des journaux d'exécution textuels structurés (traces détaillées des tours, états et cas limites) directement interprétables par une IA.
> - **Exécution serveur asynchrone & Persistance disque JSON** : Les campagnes (et particulièrement les stress-tests de plusieurs heures sur la VM Oracle) s'exécutent en arrière-plan côté serveur Node.js via des workers dédiés non bloquants, avec sauvegarde automatique et incrémentale sur disque au format JSON afin de survivre aux rafraîchissements de page et de permettre la supervision en temps réel (Pause, Reprise, Arrêt).
> - **Double format d'export pour soumission à une IA** : Chaque campagne permet de télécharger un **Rapport Markdown structuré (Prompt-Ready)** synthétisant la méthodologie, les distributions, les 4 scores de critères, les corrélations entre variantes et les traces textuelles des anomalies, ainsi qu'un **Export JSON complet** contenant toutes les métriques brutes et les graines aléatoires (`seeds`) reproductibles.

---

## 1. Overview & Core Concept

- **Ce que fait l'application** :
  1. **Moteur de règles déterministe (Graine aléatoire contrôlée)** : Implémente l'intégralité de la spécification d'*Amazonia : Dernier Rempart* (topologie à $n$ secteurs et $q$ parcelles + Casse, tirage secret sous gobelet, phase de mobilisation en 2 étapes avec micro-cycles de négociation silencieuse, ciblage et résolution par transaction unitaire sur image figée, apprentissage sur la Piste des Tactiques et rancune sur L'Œil du Contremaître, repositionnement de fin de tour et régénération finale).
  2. **Simulateur multi-agents (5 Profils de Bots)** : Modélise l'information cachée, les croyances a priori ($P(k) = \frac{13-2k}{36}$), l'inférence bayésienne après la pose du 1er Défenseur et le protocole de communication tacite en $R_{max}$ micro-cycles (« En réflexion » $\leftrightarrow$ « Définitif ») à travers 5 personas : *Aléatoire (Baseline)*, *Égoïste / Myope (Niveau 1)*, *Coopératif Communicant (Niveau 2)*, *Stratège Méta-Contremaître (Niveau 3)* et *Omniscient (Borne Haute Théorique)*.
  3. **Campagne Type 1 — Équilibrage Multi-Variantes & Évaluation des 4 Critères** : Permet de définir des plages de variation sur les 13 paramètres du jeu et de tester automatiquement plusieurs configurations de table (nombres de joueurs et compositions d'équipes de bots homogènes ou mixtes) en calculant les 4 indices analytiques : *Simplicité & Ergonomie*, *Intérêt Stratégique*, *Tension (Choix difficiles)* et *Intérêt à Collaborer Efficacement*.
  4. **Campagne Type 2 — Stress-Test Asynchrone Longue Durée (VM Oracle)** : Utilise la puissance serveur en tâche de fond (pendant plusieurs minutes ou plusieurs heures) pour explorer des millions de tours, vérifier les invariants mathématiques du jeu, mesurer la couverture des cas limites (Hypothèses H1 à H7) et traquer toute situation inextricable, cyclique ou dégénérée.
- **Public cible** : Auteur et développeurs du jeu au sein du portail *Atelier Conception Jeu*, utilisant les bilans générés pour affiner l'équilibrage ou soumettre les résultats à un grand modèle de langage.

---

## 2. User Experience & Visual Design

### Parcours Utilisateur Principal
1. **Sélection du Mode & Dictionnaire (`i18n`)** : Bascule instantanée entre le vocabulaire thématique (*Amazonia : Dernier Rempart*) et le vocabulaire technique abstrait (*Notes d'origine*), et navigation entre les 4 espaces de travail :
   - **Nouvelle Campagne d'Équilibrage (Multi-Variantes)** : Configuration des plages de paramètres (valeurs fixes ou listes de valeurs à croiser), sélection des configurations de table (ex. 3 à 6 joueurs, équipes homogènes N1/N2/N3/Omniscient ou équipes mixtes), nombre de parties par variante et lancement.
   - **Stress-Test & Vérification des Règles (Longue Durée)** : Paramétrage d'une exploration intensive en arrière-plan (durée cible ou nombre maximal de parties, balayage aléatoire des variantes, seuils d'alerte sur les invariants) avec console de supervision temps réel.
   - **Résultats, Critères & Comparateur de Variantes** : Tableaux comparatifs haute densité des variantes testées, décomposition des 4 critères sur 100, distributions des scores (Miracle, Victoire majeure, Victoire coûteuse, Défaite), asymétrie selon le Rang initial sur l'Œil et dynamique de la Piste des Tactiques.
   - **Journaux Textuels & Export IA** : Inspecteur de traces textuelles détaillées tour par tour (parties échantillonnées ou anomalies capturées avec leur graine aléatoire) et génération en un clic du **Rapport Markdown pour IA** et du **JSON complet**.

### Identité Visuelle & Thème (SaaS Analytique & Laboratoire de Conception)
- **Direction Esthétique** : Console d'ingénierie et de laboratoire statistique sobre, lisible et rigoureuse, respectant la règle 60-30-10 et la hiérarchie typographique tabulaire.
- **Palette de Couleurs** :
  - *Surface dominante (60%)* : Ardoise claire très neutre (`#F8FAFC`) en mode clair / Ardoise profonde (`#0F172A`) en mode sombre.
  - *Surfaces structurelles (30%)* : Conteneurs plats (`#FFFFFF` / `#1E293B`) délimités par des filets fins d'un pixel (`#E2E8F0` / `#334155`), sans imbrication de cartes dans des cartes.
  - *Budget d'accentuation (10%)* : Vert forêt analytique (`#15803D` / `#22C55E`) pour les actions primaires et états nominaux, Ambre (`#D97706`) pour les avertissements de cas limites, et Cramoisi (`#DC2626`) pour les violations d'invariants ou défaites critiques.
- **Typographie & Discipline Tabulaire** :
  - *Titres & Navigation* : `Plus Jakarta Sans` (SemiBold 600 / Bold 700).
  - *Corps & Descriptions* : `Public Sans` (Regular 400 / Medium 500) pour une lisibilité optimale sur les grilles denses.
  - *Données, Métriques & Journaux Textuels* : `JetBrains Mono` avec `font-variant-numeric: tabular-nums` obligatoire sur tous les tableaux statistiques, pourcentages, compteurs de supervision et traces de parties.

---

## 3. Key Product Decisions & Trade-Offs

### A. Modélisation Mathématique des 4 Critères d'Évaluation (Sur 100)

Chaque variante et configuration de table est évaluée sur 4 axes quantitatifs explicites (dont les formules et sous-composantes sont détaillées dans le rapport destiné à l'IA) :

1. **Simplicité et Ergonomie (Fluidité & Charge de Manipulation)** :
   - **Taux de résolution directe** : Proportion de cartes Manœuvre produisant un effet net immédiat (par opposition aux cartes défaussées « Sans objet » ou aux tours sans cible valide H1).
   - **Sobriété des manipulations du Contremaître** : Inverse normalisé du nombre moyen de permutations par tour sur la Piste des Tactiques et sur l'Œil du Contremaître, ainsi que du nombre de repositionnements automatiques en fin de tour.
   - **Convergence de la coordination** : Vitesse moyenne de verrouillage des jetons Défenseur à l'Étape 2 (nombre de micro-cycles nécessaires avant accord définitif).

2. **Intérêt Stratégique (Profondeur, Maîtrise & Équité)** :
   - **Écart de compétence (*Skill Gap*)** : Gain de taux de préservation entre le *Bot Stratège (Niveau 3)* et le *Bot Égoïste (Niveau 1)*, ainsi qu'entre le *Bot Égoïste (Niveau 1)* et le *Bot Aléatoire*. Un jeu stratégiquement riche récompense fortement l'anticipation de l'Apprentissage et de la Rancune.
   - **Renouvellement tactique (Entropie de Shannon)** : Diversité de passage des 6 tactiques ($A_1..B_3$) en case 1 de la Piste des Tactiques au cours d'une partie, pénalisant les variantes où une seule tactique reste verrouillée en tête toute la partie.
   - **Équité des Rangs initiaux sur l'Œil** : Faible écart-type du taux de survie des arbres entre le secteur démarrant au Rang 1 et les secteurs démarrant aux Rangs $2..n$.

3. **Tension et Choix Difficiles (Dilemmes & Courbe Dramatique)** :
   - **Indice de dilemme décisionnel** : Fréquence à laquelle l'écart d'utilité marginale entre le meilleur choix et le second meilleur choix d'un Bot est inférieur à $15\%$ (indiquant un arbitrage tendu entre deux menaces critiques ou entre parer et détruire).
   - **Ratio Pression / Capacité** : Rapport entre le nombre de Parcelles menacées par tour et le nombre de jetons Défenseur disponibles ($2n$), pondéré par la survie d'arbres en fin de partie (une tension maximale correspond à des victoires acquises sur le fil, dans la zone $50\% - 80\%$ d'arbres sauvés, sans victoire triviale à $100\%$ ni écrasement systématique à $0\%$).
   - **Intensité de fin de partie** : Proportion de parties dont l'issue (bascule entre deux paliers du barème d'*Amazonia*) se joue lors des 2 derniers tours ou grâce à la régénération finale.

4. **Intérêt à Collaborer Efficacement (Gain Coopératif & Signalisation)** :
   - **Gain pur de communication tacite** : Différence de score normalisé entre une table de *Bots Coopératifs Communicants (Niveau 2)* et une table de *Bots Égoïstes / Myopes (Niveau 1)* à paramètres identiques.
   - **Efficacité des seuils collectifs ($D=2$ et $D \ge 3$)** : Fréquence et rentabilité des embuscades à 2 Défenseurs (destruction d'Abatteuses) et des assauts massifs à 3 Défenseurs (destruction de Bulldozer, impossible à réaliser sans le soutien d'au moins un allié).
   - **Coordination anti-gaspillage** : Réduction du taux de sur-investissement (*overkill* : défenseurs surnuméraires inutiles ou jetons posés sur des cases vides) entre le cycle $r=1$ (« En réflexion ») et le verrouillage final, rapportée à la borne haute du *Bot Omniscient*.

### B. Vérification Formelle, Invariants et Détection des Situations Inextricables

Lors des campagnes de **Stress-Test Asynchrone (Type 2)**, le moteur vérifie à chaque étape de chaque tour une liste d'invariants et de détecteurs d'anomalies :
- **Invariant I1 (Conservation des emplacements d'arbres)** : $\forall (i,p) \in \{1..n\} \times \{1..q\}, \; T_{i,p} \ge 0, S_{i,p} \ge 0, T_{i,p} + S_{i,p} \le a_{i,p}$ et $T_{i,0} = S_{i,0} = 0$.
- **Invariant I2 (Intégrité des machines)** : $\forall i, \; posB_i \in \{0, \dots, q\}$, $H_{i,0} = 0$, $\sum_{i,p} H_{i,p} \le StockAbatteuses$.
- **Invariant I3 (Bijection du Cerveau du Contremaître)** : La Piste des Tactiques est toujours une permutation exacte de $\{A_1, A_2, A_3, B_1, B_2, B_3\}$ et L'Œil du Contremaître est toujours une permutation exacte de $\{1, \dots, n\}$.
- **Invariant I4 (Légalité des Défenseurs)** : Chaque joueur $j$ pose exactement 1 jeton en $(j, c_{j,1})$ et 1 jeton en $(i_j \neq j, c_{j,2})$, soit $\sum_{i,p} D_{i,p} = 2n$.
- **Détecteurs de situations dégénérées ou sans issue** :
  - *Verrouillage cyclique / Stagnation* : Tour complet où aucune carte Manœuvre ne produit d'effet et aucune machine ne se déplace alors qu'il reste des arbres et des tours.
  - *Impossibilité mathématique précoce (Dead-End)* : État atteint avant le tour $x$ où même le *Bot Omniscient* ne peut plus atteindre le seuil minimal de victoire ($Score_{moy} \ge 6$), ou destruction totale de la forêt ($Score_{brut} = 0$) dès la première moitié de la partie.
  - *Monopole de Tactique* : Une même tuile Tactique reste bloquée en case 1 pendant $100\%$ des tours d'une partie.
  - *Couverture des cas limites H1 à H7* : Comptabilisation exacte du nombre d'occurrences de chaque cas limite de l'Annexe (ex. H1 piste sans abatteuse, H2 superposition sur 1 seul arbre, H3 double carte Bulldozer, H4 réparation + 3 défenseurs en Parcelle 1, H5 terrassement dégradé, H6 rancune multiple, H7 destruction préventive sans carte).

### C. Respect Strict du Contrat d'Intégration au Portail « Atelier Conception Jeu »
- **Port dynamique** : Le serveur Express écoute sur `Number(process.env.PORT) || 3000` sur `0.0.0.0`.
- **Sous-chemin dynamique (`--base=/<sous-chemin>/`)** : Tous les appels réseau du frontend vers l'API utilisent des URL relatives préfixées par `import.meta.env.BASE_URL` afin que le reverse-proxy Caddy (`handle_path /<sous-chemin>/*`) achemine les requêtes sans erreur 404.
- **Exécution non-bloquante & Persistance locale** : Les campagnes tournent dans des Workers / boucles asynchrones découpées par lots (`setImmediate` / `worker_threads`) et écrivent leur état dans un dossier local `data/campaigns/` sur la VM pour garantir une résilience totale.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Diagramme des Composants

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   INTERFACE WEB (React 19 + Tailwind CSS)                    │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐  │
│  │  Configurateur de    │ │  Supervision Live    │ │ Analyseur des 4      │  │
│  │  Variantes & Tables  │ │  Stress-Test (VM)    │ │ Critères & Journaux  │  │
│  └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘  │
└─────────────┼────────────────────────┼────────────────────────┼──────────────┘
              │ REST API (Base URL relative compatible Caddy)   │
┌─────────────▼────────────────────────▼────────────────────────▼──────────────┐
│                     SERVEUR NODE.JS / EXPRESS (PORT dynamique)               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Gestionnaire de Campagnes & Persistance Disque JSON (data/campaigns/)  │  │
│  └──────────────────┬──────────────────────────────────┬──────────────────┘  │
│                     │                                  │                     │
│  ┌──────────────────▼─────────────────┐ ┌──────────────▼──────────────────┐  │
│  │ Moteur de Campagne Multi-Variantes │ │ Runner Asynchrone Stress-Test   │  │
│  │ (Grille Paramètres × Config Tables)│ │ (Fuzzing, Invariants I1-I4, H1-7│  │
│  └──────────────────┬─────────────────┘ └──────────────┬──────────────────┘  │
│                     └────────────────┬─────────────────┘                     │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │           COEUR DE SIMULATION « AMAZONIA : DERNIER REMPART »           │  │
│  │  • Moteur de Règles (Setup, Tirage 2d6, Transaction Figée, Rancune)    │  │
│  │  • 5 Profils de Bots (Inférence Bayésienne & Négociation R_max cycles) │  │
│  │  • Calculateur des 4 Critères & Générateur de Rapports Markdown / JSON │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Modèle de Données & Gestion d'État
- **`GameConfig`** : Regroupe les 13 paramètres variabilisables ($n, q, a, x, StockAbatteuses, ModeTirageDes, ModeResolutionParcelle$, etc.) ainsi que la configuration des $n$ sièges de la table (affectation des profils de Bots $1..5$).
- **`GameState` & `TurnTrace`** : État complet du plateau (matrices $T_{i,p}, S_{i,p}, H_{i,p}$, vecteur $posB_i$, permutations $Tac$ et $Oeil$), accompagné d'un journal textuel structuré tour par tour enregistrant les dés tirés, les croyances bayésiennes, les micro-cycles de l'Étape 2, les résolutions sur image figée et les mouvements d'Apprentissage/Rancune.
- **`CampaignRecord`** : Fichier JSON persisté sur le serveur contenant l'état d'avancement (`running`, `paused`, `completed`, `stopped`), les compteurs de performance (parties jouées, vitesse en parties/sec), les agrégats statistiques par variante, les 4 scores de critères, le compteur de couverture des hypothèses H1–H7, la liste des anomalies/invariants détectés et les traces textuelles échantillonnées.

### Mapping des Composants Interactifs
- **Barre de Navigation & Sélecteur `i18n`** : Permet de basculer entre les vues (*Campagne Équilibrage*, *Campagne Stress-Test VM*, *Tableau de Bord Analytique*, *Journaux & Exports IA*) et de changer à la volée le dictionnaire d'affichage (*Thème Amazonia* vs *Vocabulaire Technique Abstrait*).
- **Éditeur de Grille de Variantes** : Permet de sélectionner pour chaque paramètre soit une valeur unique, soit plusieurs valeurs à tester en produit cartésien (ex. $n \in \{3, 4, 5\}$, $x \in \{7, 8, 9\}$, `GranulariteRancune` $\in \{\text{PAR\_CASE}, \text{PAR\_EVENEMENT}\}$), et de cocher les configurations de table à confronter.
- **Contrôleur de Supervision Asynchrone** : Affiche en temps réel la progression des tâches de fond sur le serveur, avec boutons fonctionnels *Mettre en pause*, *Reprendre*, *Arrêter et consolider*, et *Supprimer la campagne*.
- **Générateur de Bilan IA** : Prévisualise directement dans l'interface le rapport Markdown structuré (avec prompt système pré-rédigé pour demander à une IA une analyse critique de l'équilibrage et des cas limites) et propose les boutons *Copier le Prompt Markdown*, *Télécharger `.md`* et *Télécharger `.json`*.
