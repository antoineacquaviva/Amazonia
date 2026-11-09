# Mesures V4 par axe

Aucune agrégation pondérée, fenêtre de survie, seuil de victoire ni note globale.

- Difficulté : arbres debout après régénération (plus haut favorable), pertes
  depuis le stock écologique initial (plus bas favorable), effectif, min/quartiles/
  médiane/max, moyenne, écart-type n−1, erreur standard et IC95 conditionnel.
- Dilution : cases atteintes = préfixes effectivement parcourus depuis 1 ; cases
  attaquées = destinations de combats ; cases potentiellement accessibles =
  1..X+1 (borne supérieure indépendante des dés et de HS). Le reste est hors
  d'atteinte sur cet horizon, intact, et ses arbres sont affichés séparément.
  Arbres/pertes sur préfixe atteint et horizon accessible sont conservés. Un score
  brut élevé avec de nombreux arbres hors d'atteinte n'établit pas la facilité.
- Dynamique par tour : coupes, souches éliminées, combats/parades, activations,
  récupérations HS, pièges/sabotages posés et consommés. Parade rendue possible
  par jeton = parade avec D≤P ; elle ne distingue pas causalement piège et sabotage
  lorsque les deux sont présents. Un jeton consommé n'est pas toujours utile.
- Efficience : défenseurs en combat, défenseurs hors d'un combat effectif,
  concentration maximale par case, actions furtives sans effet, propriétaires
  découverts (dédupliqués par tour), tours aveugles, tentatives de révision et
  changements effectifs du second jeton. Un défenseur en combat n'est pas
  nécessairement marginalement utile ; aucun solveur contrefactuel d'optimalité
  ni mesure de charge cognitive humaine n'est revendiqué.
- Équité : pertes, découvertes, rang initial/final et trajectoire de chaque joueur
  et rang initial, dans chaque strate de configuration. Aucun siège supposé
  équivalent ; les rotations de l'Œil sont des configurations explicites.
- Information/coordination : six contrastes appariés définis dans le protocole,
  en arbres préservés. Une différence entre politiques ne suffit pas à conclure
  qu'une règle est inutile ; performances et coefficients des heuristiques restent
  des limites du modèle des joueurs.

Le JSON contient toutes les mesures brutes par unité, par tour et par joueur.
Les campagnes partielles restent descriptives et signalent les unités manquantes.
Les doublons, violations d'invariant, versions mélangées ou faux appariements
ne sont pas silencieusement agrégés.

L'utilité marginale locale d'un défenseur est comptée quand enlever un seul
jeton ferait échouer une parade effective (piège/sabotage inclus). Le compteur
additionne les défenseurs de ces combats critiques ; ce n'est pas une allocation
optimale ni le nombre minimal nécessaire. La perte écologique cumulée à chaque
fin de tour est calculée sur arbres + au plus une souche régénérable par case ;
sa différence entre tours est le dégât écologique de ce tour. Les machines HS
présentes à chaque fin de tour sont également comptées.
