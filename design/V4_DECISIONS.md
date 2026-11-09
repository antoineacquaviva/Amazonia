# Première simulation V4 — périmètre approuvé le 9 novembre 2026

Source : demande explicite du propriétaire pour cette mission et
[spécification fournie](Amazonia_v4_specification_regles.md). Ce document ne
verrouille pas l'ensemble du design. La copie de la spécification est conservée
telle que fournie ; les décisions de mission ci-dessous priment sur ses points
ouverts correspondants.

- Matrice : conserver exactement `MASTER_MATRIX_6X6`. Fréquences issues des 36
  cases : 20/10/6 ; 18/10/6/2 ; 16/9/6/3/2 ; 15/9/6/3/2/1 pour N=3/4/5/6.
- Démonstration : trois joueurs, huit tours, seize positions, deux arbres par
  case ; une souche remplace un arbre en case 2 des deux premiers rangs initiaux.
- Ordre initial enregistré explicitement : J1–J2–J3 dans la démonstration ; aucune
  règle générale d'attribution n'est introduite.
- Dépassement : règle toujours ouverte. Refuser une configuration si
  `trackLength < numTurns + 1`, borne exacte conservative avec départ en 1 et
  avance maximale d'une position par tour. Ne jamais bloquer une machine en
  dernière position pour prolonger une configuration refusée.
- Comparaisons : ONE_STEP/FULL_CAPTURE, capacité furtive SINGLE/MULTIPLE et
  sabotage ONE_MACHINE/BOTH_MACHINES, soit huit combinaisons. Aucune combinaison
  n'est présentée comme choix définitif de référence.
- Écologie : A et B indépendants ; B ne touche pas les arbres sans souche.
  Réparation : au plus une unité HS par tour activé, sans attaque ni nouvelle
  usure ; sabotage conservé pendant la récupération.
- Score : tous les arbres debout sur les pistes allouées après conversion
  finale d'au plus une souche en arbre par case. Stock écologique initial =
  arbres debout + au plus une souche régénérable par case ; pertes = ce stock
  moins le score final. Les cases non atteintes sont incluses et diluent donc
  les différences dans le score brut. Pas de seuil de victoire V4 ni reprise
  des métriques cognitives V3.3.

Les pistes de 16 positions sont expérimentales. Les paramètres techniques
acceptés sont 3–6 joueurs, 1–12 tours, 2–64 positions, 2 ou 3 arbres. Les autres
variantes de réparation, usure, écologie et règles conceptuelles sont refusées,
non simulées implicitement. Asymétrie des peuples, apprentissage du Méchant,
explosions historiques et défenseur figé restent hors de ce lot.

## Modèle des bots, distinct des règles humaines

Une seule politique ordinaire est livrée : `V4_PRIVATE_GREEDY_REVISION_1`.
Aucun profil omniscient n'est utilisé ; chaque résultat porte `privileged:false`.

L'observation `V4_PRIVATE_REVISABLE_1` contient le plateau public, l'Œil, les
placements visibles, les paramètres et, hors pénalité aveugle, le seul lancer
personnel. Les DTO sont détachés, construits par liste explicite de propriétés
et gelés récursivement. Les raisons et lancers des partenaires ne sont jamais
transmis. Les lancers complets ne figurent que dans les traces après révélation.

À chaque tour, l'ordre courant de l'Œil est fixé pour la programmation :

1. Chaque premier défenseur est posé chez soi et enregistré définitivement.
2. Chaque second défenseur est posé chez un allié, à titre provisoire.
3. Deux balayages de révision des seconds défenseurs sont effectués dans cet
   ordre. Le jeton révisé est retiré avant de reconstruire ses actions légales.
4. Chaque second jeton est retourné définitivement dans le même ordre ; aucun
   déplacement n'intervient ensuite.

Deux balayages sont un choix de terminaison des bots. La règle humaine conserve
ses révisions illimitées jusqu'à validation. Aucune borne artificielle ne limite
le nombre de défenseurs en combat ni les emplacements explorés : toutes les
cases des pistes admissibles, dans les deux modes et avec les deux choix de
machine, sont examinées. La capacité SINGLE s'applique seulement en furtivité.

Le lancer personnel connu est certain ; les autres lancers sont intégrés sur
les 36 couples équiprobables. Le bot calcule la distribution exacte de puissance
et des machines engagées pour chaque destination (convolution des lancers
indépendants). Sa fonction d'utilité reste heuristique : dégâts A pondérés 0,65,
B sur souche pondéré 1, contribution à une défense incomplète 0,12 divisée par
le nombre de défenseurs encore nécessaires ; sabotage potentiel 0,8 par
machine et piège 0,65/(1+distance). Le risque de découverte est pénalisé à 0,45.
Ces coefficients sont des préférences de bots, pas des règles ni un optimum.
Les égalités suivent l'ordre déterministe des actions. Une action sur un jeton
saturé ne rapporte rien ; la politique tient compte des poses furtives alliées.

Les dés utilisent le RNG historique Mulberry32, dans un flux réservé à
l'environnement. Les bots n'y consomment rien. Une même graine produit donc les
mêmes dés par joueur/tour entre variantes ; les cibles peuvent changer avec
l'Œil. Ce flux est distinct du protocole scientifique SHA256 V1 et n'est pas
présenté comme ce protocole. Graine zéro refusée pour éviter l'alias historique.

## Extension autorisée : étude scientifique durable

La mission suivante ajoute sept familles et le protocole `V4_SCIENTIFIC_1`, sans
modifier les règles de résolution ni les huit variantes. La politique unique
ci-dessus reste celle du premier lot. Le panel, les contrats d'information, la
même convention de deux balayages pour les familles révisables et les familles
sans révision sont documentés dans [V4_SCIENTIFIC.md](../docs/V4_SCIENTIFIC.md).
Les objectifs sont évalués par axes séparés, sans note globale non validée.
