# Amazonia V4 — campagne guidée, analyse IA et variantes lisibles

Statut : proposition de conception du 10 novembre 2026, à discuter avec le
propriétaire. Ce document prépare la mission complète ; il n'autorise ni fusion,
ni déploiement, ni modification implicite des règles ou des critères ludiques.

## Besoin exprimé

Le propriétaire trouve l'interface complexe. « Utiliser cette configuration
seule » et « Lancer le plan fixe » semblent ne produire aucun effet. Son objectif
est de lancer une campagne aussi complète, fine et combinatoire que possible,
télécharger un bilan optimisé pour analyse IA, puis visualiser et comprendre la
variante recommandée dans un langage humain.

Livrer un parcours de conception, pas un formulaire de paramètres techniques.
La maquette docs/prototypes/campagne-v4.html est une proposition interactive
sans réseau, sans simulation réelle et sans résultats inventés.

## Ce qui est vérifié et ce qui reste à diagnostiquer

Dans V4ScienceView.tsx :
- le remplacement d'une configuration identique ne donne aucune confirmation ;
- le lancement est disabled tant que estimate est nul, sans explication associée ;
- toute modification du formulaire invalide l'estimation ;
- l'estimation ne présente pas d'état d'attente ;
- le bouton de lancement ne change pas de libellé pendant l'envoi ;
- les erreurs sont affichées après l'ensemble du grand formulaire ;
- fetch n'a pas de délai explicite et r.json() suppose une réponse JSON.

Ces observations n'établissent pas la cause réelle sur Oracle. Ne pas présenter
un bouton désactivé comme diagnostic certain. Vérifier le parcours complet sous
le préfixe /amazonia/, avec vraie garde interne et entrée Basic, y compris Origin,
Sec-Fetch-Site, Content-Type, statut HTTP et réponse non JSON. Ne pas demander au
propriétaire d'ouvrir la console développeur. Ne jamais contourner la garde pour
faire fonctionner le bouton. Les tests navigateur existants qui autorisent
artificiellement les requêtes ne suffisent pas à cette recette.

## Parcours visible

1. Préparer : choix d'une profondeur, couverture et budget lisibles, résumé du
   plan généré, vérification serveur ; confirmation explicite de lancement.
2. Suivre : un programme, une progression globale, débit et durée indicative
   fondés sur une mesure identifiée, prochaine sauvegarde, suspendre/reprendre,
   erreur expliquée et action possible. Fermer le navigateur ne bloque rien.
3. Comprendre : bilan IA, comparaisons par axes, fiche de chaque variante et
   shortlist argumentée. Aucun gagnant inventé tant que les critères manquent.

Les réglages de graines, JSON, codes de bots et limites de workers ne doivent pas
occuper l'écran principal. Le détail exact reste consultable et exportable.
Le système ne doit pas faire croire qu'une option avancée absente est testée.

## Couverture proposée, à figer avant calcul

Les huit combinaisons sont le produit complet des trois options binaires déjà
implémentées : Œil ONE_STEP/FULL_CAPTURE, furtivité SINGLE/MULTIPLE,
sabotage ONE_MACHINE/BOTH_MACHINES. Aucune autre idée de règles n'est ajoutée.

Proposition de départ de la maquette :
- 8 combinaisons × 3/4/5/6 joueurs × 2/3 arbres = 64 configurations ;
- 7 familles homogènes par configuration ;
- 8 tours, 16 positions, un ordre initial explicite par effectif ;
- 2, 32 ou 128 graines unitaires communes par cellule selon la profondeur.

Cela représente 896, 14 336 ou 57 344 parties. Il s'agit de couverture de ces
axes, pas d'exhaustivité de tous les paramètres du moteur. Les cases 2 des deux
premiers rangs suivent la mise en place V4 implémentée ; ne pas transformer le
choix de stock en une nouvelle règle de mise en place.

Extension optionnelle des ordres : les rotations cycliques donnent 18 ordres
au total (3+4+5+6). Toutes les permutations en donnent 870 (6+24+120+720).
Avec deux stocks, 8 variantes, 7 familles et 32 graines : respectivement 64 512
et 3 118 080 parties. Ne pas supposer les sièges ou permutations équivalents.

Les durées et longueurs restent des axes distincts à sélectionner explicitement.
Le domaine accepté actuellement est N=3–6, X=1–12, L=2–64, arbres=2/3, avec
L>=X+1 ; « tous les paramètres possibles » peut devenir démesuré. Montrer le
produit combinatoire, le coût et ce qui est exclu avant confirmation. Aucun
rabotage silencieux des configurations ou répétitions pour rentrer dans le budget.

Les 32 et 128 répétitions sont des profondeurs d'exploration proposées, pas une
précision statistique garantie. Une mesure de coût sur lot technique séparé peut
préparer le budget ; elle ne doit pas servir d'arrêt selon les résultats ludiques.
Toute extension guidée par des résultats est exploratoire, et sa confirmation
utilise un nouveau plan fixe et des graines séparées.

## Programme durable, distinct des études bornées existantes

Limites effectivement configurées sur Oracle lors de la remise en service :
2 000 parties par étude, 16 configurations au plus par plan, une campagne active,
un worker. Le lanceur guidé ne peut donc pas simplement envoyer 64 configurations
au contrat actuel ni augmenter les limites pour contourner le problème.

Créer un programme parent durable avec manifeste immuable, totalité des cellules,
graines et découpage déterministe en études bornées. Respecter les limites lues
sur le serveur, sérialiser les études et conserver un curseur transactionnel.
À titre d'exemple, le plan 14 336 peut être découpé en huit strates N×stock de
1 792 parties, chacune avec les huit variantes, sept familles et 32 graines.
Si une strate dépasse le plafond, partitionner les graines avec index explicites,
sans duplication ni trou, puis réunir les résultats validés.

L'orchestration doit continuer sans onglet ouvert, survivre à un redémarrage
avec reprise explicite, ne pas exécuter un bloc deux fois et ne pas mélanger des
provenances incompatibles. Préserver les études et résultats déjà présents.
Le programme doit distinguer « toutes les études calculées » de « données
complètes, valides et comparables ». Suspendre/arrêter ne doit jamais effacer.

## Exports pour analyse IA

Bouton principal « Télécharger le bilan pour analyse IA » : Markdown structuré,
avec résumé de taille maîtrisée et données agrégées référencées, accompagné d'un
paquet ZIP documenté si nécessaire. Garder l'archive brute comme export expert
séparé ; ne pas obliger l'utilisateur à joindre des millions de lignes pour une
première analyse.

Inclure : question de conception ; critères fournis ou non définis ; couverture
exacte, unités manquantes et exclusions ; matrice des variantes en français ;
versions/provenance ; paramètres et graines ; résultats par strate/famille ;
comparaisons appariées et incertitudes ; limites des bots ; index des fichiers ;
instructions IA demandant des conclusions sourcées et des limites explicites.
Les tableaux lisibles doivent relier un nom humain au configId complet.

Restituer difficulté sur forêt accessible (sans dilution par forêt hors d'atteinte),
coopération/information, équité, dynamique et efficience, en conservant les
mesures existantes et leurs définitions. Les interactions des trois options
binaires sont un ajout analytique à spécifier et tester sur le plan factoriel
complet, pas une simple juxtaposition de huit moyennes. Ne pas confondre
contraste apparié et preuve causale sur des joueurs humains.

Les comparaisons entre N, durées, stocks et longueurs restent des strates
identifiées ; ne pas les agréger en moyenne brute trompeuse. Refuser les données
manquantes, mélangées ou dupliquées pour les comparaisons exigeant la complétude.
Les intervalles et analyses multiples doivent exposer leurs hypothèses et limites.

Ne pas inclure secrets, chemins privés sans intérêt, environnements ou journaux
serveur dans le dossier IA. Aucun appel payant à une API IA ni secret supplémentaire
n'est nécessaire pour ce besoin : le propriétaire télécharge et transmet le bilan.

## Variante recommandée et lisibilité humaine

Aucune cible de difficulté, pondération ou métrique de plaisir n'a été validée.
Ne pas optimiser automatiquement le seul nombre d'arbres restants, inventer une
victoire, une note /100, un optimum omniscient ou une mesure cognitive.

Présenter d'abord les compromis non dominés et les résultats incertains. Une
recommandation doit citer les priorités du propriétaire, ses preuves par strate,
les alternatives proches et les réserves. Si elle repose sur une analyse IA,
la distinguer d'une décision validée et enregistrer sa provenance/manifeste.
Ne pas déclarer de règle validée sans décision humaine.

Une fiche par variante :
- nom humain stable, trois règles qui changent, règles communes clairement liées ;
- exemple de l'Œil vérifié : A–B–C–D avec B,D découverts devient B–A–D–C en
  ONE_STEP et B–D–A–C en FULL_CAPTURE ;
- représentation visuelle et chronologie d'un exemple réel issu des traces,
  avec graine et contexte, plutôt qu'une partie imaginaire vendue comme preuve ;
- difficulté, coopération, équité, robustesse et incertitudes en langage courant ;
- fiche imprimable ou exportable pour préparer un test humain.

La maquette illustre les règles seulement et n'affiche aucun faux résultat.

## Livraison proposée en deux lots cohérents

A. Corriger le lancement et les retours d'état, remplacer le formulaire principal
par un parcours guidé, tester l'authentification réelle et rendre la couverture
exacte compréhensible. Une erreur est visible près du bouton et accessible sans
scroll ; chaque clic produit attente, succès, refus explicite ou explication.
Pas de double lancement ; délai d'attente traité avec vérification de l'étude
éventuellement créée avant de proposer de réessayer (idempotence serveur).

B. Programme durable multi-études, synthèse inter-études vérifiée, interactions
factorielle spécifiées, export IA et fiches explicatives. Ne pas afficher un
programme complet/recommandation comme disponible tant que le backend ne le fait
pas réellement. Le découpage technique n'est pas à gérer par le propriétaire.

Vérifications minimales : flux réel entrée authentifiée→estimation→lancement→
progression→export sous /amazonia/ ; vrais refus d'origine/preuve/auth ; budget
et validation ; absence de double comptage après interruption ; découpages
conservant exactement les cellules ; exports complets et sans secrets ; exemples
de règles conformes ; erreurs visibles et navigation mobile/clavier ; moteur et
historiques préservés. Ne pas tester uniquement avec authorize:()=>true.

## Déploiement et état de cette proposition

Cette PR ne modifie aucune application de production : uniquement le cadrage,
la maquette et ses tests. Le lancement actuellement signalé n'est pas déclaré
réparé. Ne pas demander de relancer l'installateur générique du portail, la phase P
ou les scripts de récupération maintenant que la remise en service a réussi.

Après implémentation validée, préparer une mise à jour Amazonia ciblée avec
sauvegarde, données scientifiques hors code conservées, validation des versions
et retour arrière ; tenir compte d'une campagne active avant tout redémarrage.
La mise en production de cette nouvelle mission demande un accord propre ; ne
pas étendre tacitement l'autorisation de la remise en service à cette refonte.
