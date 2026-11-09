# V4_SCIENTIFIC_1

Document de protocole livré avec les archives. Les règles restent celles de
`V4_EXPERIMENTAL_2026_11_09`, sans changement de résolution. La première démo
Mulberry32 et SCIENTIFIC_V1 historique gardent leurs formats et identifiants.

Sept familles homogènes, identifiants et versions `V4_<FAMILLE>_SHARED_GREEDY_1` :
BLIND (`V4_BLIND_NAIVE_1`), PROB_ONLY, SOLO_INFORMED, COORD_NO_DICE, COORD_ONE_SHOT, COORD_HYBRID,
OMNISCIENT. Les équipes mixtes sont indisponibles dans ce lot. Les six familles
informées partagent intégralement l'évaluateur greedy V4 (mêmes actions combat et
furtivité, mêmes coefficients et exploration exhaustive) ; seuls DTO et droit
à révision changent. BLIND tire uniformément une action légale parmi case/mode,
puis une machine si furtivité, sans lire le plateau à des fins stratégiques.
PROB_ONLY et COORD_NO_DICE n'ont aucun lancer personnel. SOLO_INFORMED et
PROB_ONLY ignorent volontairement les placements. ONE_SHOT valide immédiatement
son second jeton, sans révision. HYBRID et NO_DICE ont deux balayages. OMNISCIENT
utilise la même recherche et les mêmes révisions que HYBRID avec tous les lancers
courants, y compris ceux masqués aux joueurs aveugles. Contrôle privilégié,
heuristique, sans optimum ni plafond garanti.

Convention `EYE_ORDER_OWN_FINAL_ALLY_R2_V1` : premiers défenseurs définitifs dans
l'ordre courant de l'Œil ; seconds définitifs directement pour les familles sans
révision, sinon provisoires puis deux balayages dans ce même ordre, enfin
validation irréversible. La règle humaine conserve des révisions illimitées.
Aucun plafond de défenseurs de combat ni raccourci de parade n'est ajouté.

Observations `V4_PANEL_PRIVATE_1` : copies explicites détachées et gelées. Aucun
secret, intention, raison ou annotation partenaire n'est transmis. Les familles
non coordonnées reçoivent un tableau de placements vide, mais les actions
légales tiennent compte des contraintes publiques SINGLE : cette information de
capacité est incompressible, elle ne constitue pas une suppression de toute
information publique. Les lancers personnels sont absents en cas de pénalité
aveugle, sauf contrôle privilégié distinct.

## Hasard et analyses

`V4_INDEXED_SHA256_REJECTION_1` : chaque dé est indexé par protocole, graines
expérience/environnement, unité (graine), nombre de joueurs/tours, tour, siège et
D1/D2. Rejet pour éviter le biais du modulo. Le hasard décisionnel est indexé
séparément par graine de politique, unité, tour, siège, étape, ronde et version.
Le nombre de décisions ne peut modifier les événements exogènes.

Chaque unité conserve identifiants, dés réellement utilisés et empreinte. Les
contrastes vérifient ces événements contre le plan, l'unicité et la complétude,
les empreintes de sources, versions, runtime et paramètres. Les cibles et autres
conséquences peuvent diverger avec l'Œil. Une graine égale ne suffit jamais.

Comparaisons : POLICY conserve tous les paramètres ; RULE_VARIANT permet
uniquement eyeMode, stealthCapacity, sabotageMode, à famille identique ; EYE_ORDER
permet uniquement initialEyeOrder, à famille identique. N, durée, longueur ou
arbres initiaux différents sont des strates distinctes, non appariées. Les
comparaisons de configurations sont ciblées contre la première, sans produit de
toutes les paires. Le plan accepte 1–16 configurations explicites pour étudier
3–6 joueurs ou des permutations d'Œil sans présumer leur équivalence.

L'effectif est fixé avant le lancement. Une mesure de coût distincte peut guider
un futur plan, jamais arrêter l'analyse selon ses résultats. IC95 de Hoeffding
sur domaines bornés, conservateurs, sous indépendance déclarée et plan complet.
Moments d'échantillon et distributions sont descriptifs. Pas d'IC avec données
manquantes, campagne partielle ou indépendance non déclarée. Les contrastes sont
gauche − droite en arbres préservés, pas des effets causaux purs ; BLIND diffère
aussi par sa règle naïve. Les six contrastes sont marginaux, non corrigés pour
multiplicité ; pas de classement global certain, de Shapley ni de note /100.

## Conservation

SQLite WAL/FULL privé distinct, bail à écrivain unique réutilisé du stockage
existant. Les tables v4_* ne contiennent aucun historique V3.3. Chaque lot borné
valide unités, curseur et statut dans une transaction unique. Après interruption,
RUNNING devient PAUSED et requiert une reprise explicite. Un lot non confirmé
peut être recalculé, jamais compté deux fois. Pause à la frontière du lot ; arrêt
rejette le lot non confirmé. La reprise refuse des sources, règles, politiques,
runtime ou manifeste incompatibles. Aucun archivage n'est effacé automatiquement.
Les exports JSON autonomes incluent le checkpoint, toutes les mesures unitaires,
événements, paramètres, provenance et copies figées des documents de conception.

Ressources : par défaut 1 worker, lots de 2, 1 campagne active, 2 000 parties
par campagne. `V4_WORKERS`, `V4_BATCH_SIZE`, `V4_MAX_ACTIVE`, `V4_MAX_GAMES`
configurables (bornes respectives parallélisme disponible moins un minimum 1,
1–8, 1–4, 1–20 000). Au plus 1 000 unités par cellule et 16 configurations.
Les rapports chargent seulement une cellule (ou deux pour un contraste) à la
fois ; les unités sont paginées et l'export JSON est écrit en flux avec
contre-pression. Les documents et témoins restent bornés par le plan. La mémoire
et le débit disque réels doivent être vérifiés avant de grands effectifs ; pas
de garantie de disponibilité pour des millions de parties. Admission refusée
sous 256 MiB de disque libre ; aucune suppression automatique des archives.

Le coût préalable utilise une référence N=3, X=8, L=16 puis le facteur indicatif
(X/8)×(L/16)×(N/3)², recalibré par le dernier lot effectivement mesuré. Il ne
préjuge ni les scores ni le temps maximal ; il est annoncé comme estimation.
