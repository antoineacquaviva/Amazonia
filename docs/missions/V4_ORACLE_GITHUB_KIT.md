# Mission — rendre la V4 scientifique installable depuis GitHub sur Oracle

Demande du propriétaire, 9 novembre 2026. Objectif : depuis un téléphone ChatGPT et un PC ayant accès à GitHub mais pas à ChatGPT/Codex, récupérer un kit public sûr, installer l'instance privée V4 sur Oracle via la session SSH habituelle, puis lancer une campagne scientifique. La demande est de réaliser cette mission, pas seulement de relire ce fichier.

## Acquis à préserver

- La PR #10 est fusionnée. Base de cette mission : main au commit d2413367499764d26ef3e7fa94738e4159ebb381 ou son descendant pertinent.
- Les sept bots, le protocole V4_SCIENTIFIC_1, les mesures, la persistance, les sauvegardes et l'interface sont livrés. Le bilan annonce 127 tests et 280 parties exécutées. Ne pas recommencer cette implémentation.
- Lire AGENTS.md, docs/ORACLE_V4_PRIVATE.md, docs/V4_USE.md, docs/V4_SCIENTIFIC.md, docs/V4_MEASURES.md, docs/V4_SCIENTIFIC_VALIDATION.md et les scripts de release/installation/contrôle.
- L'installation Oracle n'a pas été exécutée. Ne jamais assimiler un essai local à une validation Oracle.
- Le guide dépend de l'archive amazonia-v4-scientific-30da627.tar.gz annoncée dans l'ancien environnement. Aucune GitHub Release n'est publiée au moment de la demande. Cet ancien workspace Codex n'est pas accessible au propriétaire actuellement : ne pas en faire un prérequis.

## Résultat principal

Rendre le kit et la notice accessibles intégralement depuis GitHub, puis fournir un seul bloc d'installation à coller dans la session Oracle opc. Ne demander aucune recopie de gros fichier depuis le téléphone.

1. Construire le kit à partir d'un checkout propre et d'un commit exact, avec lockfile, descripteur de provenance, manifestes et SHA256 réellement calculés. Réutiliser les outils existants.
2. Rendre le kit téléchargeable durablement depuis GitHub : de préférence une release versionnée contenant exclusivement le code distribuable et les métadonnées techniques. La publication de ce kit public est autorisée par cette mission, après inspection des fichiers inclus et validation. Aucun remplacement d'une release ou d'un artefact existant.
3. Si les droits ne permettent pas la publication, livrer un chemin reproductible depuis un commit GitHub exact (sources publiques et scripts versionnés), sans dépendance à un fichier de ton workspace ni à un lien ChatGPT. Signaler précisément la limitation. Un workflow de packaging manuel à permissions minimales peut être ajouté si utile ; ne pas installer une automatisation générale d'agent ou de déploiement.
4. Ne jamais publier de résultats bruts privés, base/checkpoints, archives Oracle, secrets, clés, configurations privées, historiques, journaux, captures ou fichiers d'environnement. Le dépôt est public. Construire l'archive avec une liste explicite de fichiers admis ; pas de tar global du workspace. Aucun secret nouveau nécessaire pour télécharger un kit public.
5. Si une nouvelle version du code ou des outils change l'empreinte de la release, attribuer la nouvelle provenance et refaire les validations affectées. Ne pas réutiliser le checksum de l'ancienne archive, falsifier une empreinte ou réétiqueter un ancien résultat.

## Installation Oracle privée regroupée

Améliorer les scripts existants uniquement là où nécessaire :
- Télécharger/vérifier le kit sans jeton ni identifiant en argument. Épingler version et checksum dans une notice versionnée ; expliquer la confiance dans la source, sans prétendre que deux hashes provenant de la même origine constituent une signature indépendante.
- Le bloc vérifie les prérequis avant les écritures importantes : opc non root, runtime Node24/npm, chemins canoniques, espace/inodes et taille développée/dépendances avec marge. 12,8 Gio libres était un ancien constat, pas une réserve actuelle. Refus explicite si capacité insuffisante ; aucune purge.
- Essayer d'identifier en lecture seule le runtime déjà préparé sous /home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin/node ; le vérifier, ne pas simplement supposer son existence. Demander son chemin uniquement si non résolu. Ne modifier aucun contenu de P, ni installer Node globalement.
- Nouveau dossier privé uniquement, échec sans écraser les tentatives antérieures ; cache npm et fichiers temporaires propres à l'instance. Pas d'environnement de production ou de fichier .env actif hérité.
- Choisir un port loopback libre, détecter une collision réelle au démarrage et ne jamais arrêter un processus étranger pour prendre le port.
- Préserver les mécanismes d'authentification de l'instance privée. Clé seulement en fichier privé ; aucun mot de passe dans une URL, une commande publique, le rapport ou GitHub.
- Démarrage indépendant de la session SSH, commandes status/start/stop/restart vérifiant l'identité du processus avant signal. Conserver pause après interruption et reprise explicite.
- Vérifier les cinq services voisins en lecture seule avant/après, sans les démarrer ni les réparer.
- Toute lecture privilégiée ou prérequis non couvert doit être signalé ; ne jamais appliquer sudo pour contourner un refus.

## Accès depuis le PC et première campagne

Fournir dans une notice courte :
- le lien GitHub de téléchargement ou l'alternative exacte ;
- le bloc Oracle unique, avec messages lisibles et rapport partageable sans secret ;
- la commande de tunnel SSH, sans inventer l'alias, l'adresse ni la clé du propriétaire ; expliquer que le PC doit aussi permettre SSH. Un port client libre différent est acceptable si l'origine et l'authentification du serveur le permettent réellement et sont vérifiées ; ne pas contourner les contrôles d'origine ;
- la méthode privée d'obtention du mot de passe ;
- le chemin des données, exports et sauvegardes ;
- un profil de première recette bornée : 3 joueurs, 8 tours, 16 positions, ordre initial J1-J2-J3, sept familles et huit variantes, une unité par cellule (56 parties), avec graines et plan fixés avant exécution ;
- une estimation mesurée du coût et des instructions permettant ensuite un effectif plus grand, sans lancer automatiquement une campagne massive ;
- les commandes d'état, d'arrêt et de relance et le retrait limité à l'arrêt de cette nouvelle instance.

Réutiliser la recette de 56 parties du script si elle répond déjà à ces critères, sans la dupliquer. Les parties sont exploratoires, sans classement certain ni preuve d'équilibrage.

## Autorisations et exclusions

Autorisé : outils de packaging/diffusion/installation, documentation, tests pertinents et publication du kit de code public vérifié. Une nouvelle instance privée sous opc est couverte si un accès Oracle autorisé existe réellement ; sinon livrer le bloc opérateur et s'arrêter avant son exécution. Aucun SSH ni credential Oracle n'est supposé disponible par GitHub.

Interdit : sudo, modification des services actifs, portail maître, Caddy, pare-feu/OCI, comptes système, données historiques, anciens workspaces/sauvegardes, marqueurs et exports P. Ne pas relancer P. Aucune exposition publique. BGA reste futur. Aucun changement des règles V4, bots, métriques ou protocole scientifique pour faciliter l'installation. Si un défaut fonctionnel hors périmètre apparaît, l'expliquer séparément.

## Validation et autonomie

Effectuer dans un environnement jetable :
- packaging depuis Git propre, inspection du contenu et vérification de provenance après extraction sans .git ;
- installation depuis un téléchargement GitHub réellement disponible si publié ;
- refus checksum incorrect, chemins dangereux, espace insuffisant, collision de port et cible existante, sans mutation des voisins ;
- démarrage privé, authentification, recette bornée, export, arrêt/relance avec données conservées ;
- tests pertinents, typage/build et parcours navigateur affecté, sans répéter inutilement les campagnes scientifiques déjà acquises.

Ne jamais prétendre avoir exercé Oracle ou un téléchargement public quand seul un double local a été testé.

Continue sur la branche de cette PR, actualisée avec main si nécessaire. Ce fichier initial ne constitue pas l'implémentation : ne pas fusionner une PR qui ne contient que la mission. Tu peux modifier code et documentation et créer les commits nécessaires. La fusion après validation des changements effectivement réalisés est autorisée pour cette mission, sans revue manuelle intermédiaire et sans contournement des protections GitHub. Mettre à jour titre/description de la PR et la rendre prête lorsque le résultat est livré. Actualiser AGENTS.md si nécessaire en limitant l'exception à cette mission.

Si le déclencheur GitHub ne permet que des revues, répondre explicitement que la mission n'a pas été exécutée et indiquer ce qui manque pour lancer une tâche de code. Ne pas remplacer l'exécution par une simple revue approuvant le présent texte.

Compte rendu sur cette PR : lien du kit, version/checksum, bloc et notice prêts, tests réels, état de fusion et éventuelle intervention propriétaire restante. Ne poser une question que si une information réellement indispensable manque ; poursuivre les travaux indépendants.
