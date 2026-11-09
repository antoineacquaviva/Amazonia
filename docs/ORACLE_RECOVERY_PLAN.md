# Remise en service Oracle — lot autorisé

État communiqué le 9 novembre 2026 après utilisation du bouton de déploiement.
Ce document prépare une réparation ciblée. Aucun accès Oracle, secret réel,
sudo, modification de service ou recharge Caddy n'a été effectué par ce travail.

## Faits confirmés

- Portail actif sous opc, code 9fc4a8e63a26aa68deef0547e8e3d41c7dfd819a ;
  réponse « Entrée authentifiée non configurée », aucun EnvironmentFile déclaré.
- Amazonia a été remplacé par fe4c15c2f7cc414f142333912a717880a4dc08ea ;
  échec de module natif avec Node système 20.20.2, arrêté par le propriétaire
  après accord explicite. Ne pas relancer cette boucle.
- Node préparé sous /home/opc/atelier-preparation-1c3-20261109-01/runtime/node/bin/node :
  v24.22.1, module node:sqlite testé et disponible.
- Les 16 fichiers sous /srv/jeu/amazonia/data sont identiques octet pour octet
  à /home/opc/amazonia-data-backup-20261108-125739/data.
- Caddy actif, administration locale lisible 127.0.0.1:2019 ; mémoire :
  cinq proxys locaux 3000/5050/8080/8082/8083, aucun gestionnaire authentication.
- LoRA, Forêt et BGA ne font pas partie de la réparation. BGA reste futur.
  Leur fonctionnement complet après intervention ne se déduit pas de leurs PID.

## Correctif applicatif préparé

Le démarrage standard server.ts peut maintenant recevoir V4_STUDIES_DIR, créer
le gestionnaire scientifique durable et le transmettre à createApp.
Sans cette variable, le comportement indisponible explicite est conservé.
Un chemin relatif ou situé dans le code est refusé avant création.
SIGTERM/SIGINT ferment les gestionnaires proprement ; aucun calcul automatique
n'est ajouté. Les règles, bots et mesures ne changent pas.

Le server.ts figurant dans l'empreinte, ce correctif possède une nouvelle
provenance. Ne pas réétiqueter ou reprendre silencieusement une campagne d'une
ancienne provenance. La vieille distribution privée fcefe35 reste une release
figée autonome, inchangée ; elle n'est pas remplacée par ce correctif.

## Candidat Caddy préparé

scripts/oracle-recovery-caddy.py transforme une copie JSON de la configuration
en mémoire. Ce script ne lit pas les services, ne fait aucun appel HTTP,
ne recharge pas Caddy et n'exécute aucune commande privilégiée.

Le candidat :
- conserve TLS, hôtes, redirections, admin local, réécritures, routes et options ;
- protège uniquement les proxys vers 3000 (portail) et 8083 (Amazonia), chacun
  par Basic Auth avant le proxy ;
- remplace la preuve interne envoyée au backend et retire Authorization et
  les anciennes assertions d'identité sur ces deux branches ;
- conserve les proxys 5050/8080/8082 sans modification ;
- refuse un proxy inconnu/non local, plusieurs upstreams, un proxy manquant,
  une duplication ou une authentification préexistante non réconciliée.

Une protection globale des voisins demanderait sa propre recette de compatibilité.
La réparation ne ferme pas les anciens ports réseau et ne prétend pas traiter
l'exposition des voisins. Les API du portail et d'Amazonia restent protégées
par leur garde interne même en accès direct.

## Intervention autorisée en un lot

Le propriétaire a explicitement autorisé le 9 novembre 2026 la fusion de la
PR #12, la création des secrets privés et les modifications ciblées des services
et de Caddy. Cet accord inclut la préparation du bloc opérateur regroupé ; il
ne vaut pas autorisation de modifier le réseau, les comptes, Node global ou P.
Aucun accès SSH Oracle n'est disponible dans cette discussion : l'activation
reste à exécuter par le propriétaire sur sa session habituelle.

1. Contrôler à nouveau versions/PID, accès sudo habituel, capacité/inodes,
   services et originalité des fichiers. Conserver intégralement le checkout original, y compris ses modifications
   locales, et refuser une autre topologie Caddy ; aucun reset --hard.
2. Créer un nouveau dossier privé sous /home/opc, hors P et des anciens dossiers.
   Y conserver sauvegardes fraîches des données à froid d'Amazonia, code,
   unités/drop-ins, fichiers de configuration et copie JSON effective de Caddy.
   Ne pas remplacer les sauvegardes historiques. Conserver les octets des
   originaux et vérifier les copies.
3. Copier les 16 fichiers vers un stockage neuf data/campaigns hors code.
   Ne jamais ouvrir les seuls originaux avec un gestionnaire. Le marqueur
   d'initialisation sera créé uniquement dans cette copie approuvée.
   Créer séparément un répertoire privé studies pour la V4 scientifique.
4. Générer localement une clé interne aléatoire et un mot de passe d'accès
   propre à cette entrée. Aucun secret dans GitHub, les arguments ou le chat.
   Caddy 2.11.7 sait lire le mot de passe à hacher sur stdin ; ne pas employer
   l'option --plaintext avec une valeur visible dans la ligne de commande.
   Conserver clé, mot de passe et hash dans des fichiers privés.
5. Préparer deux fichiers d'environnement privés et deux drop-ins dédiés.
   Conserver les comptes opc existants pour cette réparation, sans créer de compte.
   Employer le Node 24 préparé en lecture seule et un ExecStart direct :
   NODE24 --import tsx server.ts, avec le WorkingDirectory actuel de chaque dépôt.
   Variables communes : NODE_ENV=production, clé interne par fichier,
   origines HTTPS exactes atelierconceptionjeu.fr et www.atelierconceptionjeu.fr.
   Amazonia : PORT=8083, AMAZONIA_CAMPAIGNS_DIR=<nouvelle copie>/data/campaigns,
   V4_STUDIES_DIR=<nouveau stockage>/studies, ressources conservatrices.
   Portail : PORT=3000. Ne pas activer son déployeur général dans ce lot.
6. Préparer le candidat Caddy depuis la mémoire actuelle avec l'utilitaire de
   cette PR. Conserver la configuration effective d'origine en privé.
   Valider le candidat avec Caddy 2.11.7 avant activation, avec accès effectif
   de l'utilisateur caddy au fichier final. Préparer le chargement persistant
   du JSON validé pour les futurs démarrages/recharges sans écraser à l'aveugle
   le Caddyfile existant ou ses options.
7. Déployer uniquement le correctif Amazonia validé et les configurations
   approuvées ; ne pas réinstaller arbitrairement les autres applications.
   Redémarrer le portail et démarrer Amazonia avec les nouvelles configurations.
   Vérifier refus des preuves absentes/fausses et lectures internes autorisées.
8. Recharger Caddy avec le candidat, sans arrêter ses services voisins.
   Une recharge peut affecter des connexions : ne pas promettre zéro coupure.
   Vérifier HTTPS, refus anonyme, bon/mauvais mot de passe, racine portail,
   /amazonia/api/v4/studies, absence de fuite de preuve vers les voisins,
   routes existantes et services LoRA/Forêt. BGA : pas de santé backend exigée.
9. Vérifier que les originaux restent identiques, que les historiques sont lus
   depuis la copie et que le stockage scientifique est séparé.
   Fournir un bilan expurgé, le moyen privé de lire le mot de passe et un plan
   de première recette V4 bornée. Une campagne réelle n'est pas lancée par
   une simple sonde de lecture.

## Retour arrière fermé et points d'arrêt

Refus avant activation : conserver les candidats et l'état existant.
Échec d'un backend : arrêter seulement ce backend, conserver ses données et
sa configuration pour diagnostic. Ne pas démarrer l'ancien code sur les seuls
originaux, modifier un manifeste de reprise, restaurer le pare-feu ancien ou
désactiver une garde pour retrouver l'interface.

Échec après recharge : maintenir une entrée protégée ou la fermer sur le
périmètre concerné ; ne pas réactiver automatiquement un ancien frontal sans
authentification. La présence de sauvegardes ne garantit pas à elle seule un
retour public immédiat. La procédure opérateur effective devra citer les chemins,
empreintes et versions validés, et refuser toute cible inattendue.

## Validation de préparation

Tests ajoutés : démarrage réel du serveur standard sous Node 24, garde interne,
API scientifique racine/préfixée, exécution d'une partie sur données fictives,
conservation après arrêt/redémarrage, refus de stockage dans le code ;
transformation Caddy sur fixtures et vrai Caddy 2.11.7 pour Basic Auth,
écrasement de preuve et conservation de la branche voisine.

Le workflow contrôle aussi la distribution historique contre son propre commit
Git, plutôt que de lui imposer l'égalité avec toutes les évolutions futures.
La disponibilité de ce correctif dans GitHub n'atteste aucun de ces contrôles
sur Oracle : consulter les checks réels de la PR.

## Opérateur regroupé : scripts/oracle-recover.py

Le script doit être téléchargé avec son compagnon oracle-recovery-caddy.py depuis
un commit Git fixe et vérifié par SHA-256 avant exécution. Il s'exécute sous opc ;
sudo est limité aux commandes système ciblées. Aucun interpréteur utilisateur
ne tourne en root. Sans --apply-approved, il effectue seulement les précontrôles.

La cible applicative reste le merge validé de la PR #12 :
c0517950f18487faff02744c6409083659e7c495.
Le script refuse un autre état de départ, un port/proxy inconnu, une unité avec
hooks, un drop-in de récupération existant, moins de 6 Gio (davantage selon la
taille réelle à sauvegarder) ou 40 000 inodes. Il teste d'abord le Node préparé
dans une unité systemd transitoire sous opc ; un refus SELinux arrête le lot
avant modification persistante, sans désactiver SELinux.

Tout est créé dans un nouveau dossier privé /home/opc/amazonia-recovery-*. Les
archives neuves de configuration et code sont relues et munies d'une empreinte.
Le code Amazonia est cloné dans un emplacement neuf, installé et compilé avec
Node 24 avant échange des dossiers sur le même volume. Le vieux checkout reste
entier sous retired-amazonia ; les 16 JSON sont copiés et vérifiés avant que les
gestionnaires n'ouvrent cette copie. Les originaux ne sont jamais initialisés.

Le Caddyfile original est conservé. Un nouveau JSON root:caddy 0640 sous
/etc/caddy est validé comme utilisateur caddy ; un drop-in fait employer ce même
JSON aux prochains démarrages et recharges. Le processus actuel est rechargé,
pas arrêté. LoRA et Forêt ne sont jamais redémarrés. Les PID identiques sont
contrôlés ; cela ne remplace pas une recette fonctionnelle complète des voisins.

La recette effectue uniquement des lectures : garde interne, liste scientifique,
HTTPS avec certificat vérifié, absence/mauvais mot de passe et preuve usurpée
refusés, bon mot de passe accepté. Elle ne lance aucune campagne réelle et ne
prétend pas résoudre les anciens ports réseau ou le durcissement des comptes.
Les clés et mots de passe sont générés sur Oracle uniquement ; le terminal ne
montre que le chemin du fichier privé à consulter.

En cas d'échec après le début de l'échange des backends, les deux backends sont
arrêtés et l'état privé conservé pour diagnostic. Ne pas relancer le bloc à
l'aveugle ni restaurer automatiquement le frontal non authentifié. Le journal
et les archives peuvent contenir des informations privées : ne pas les publier.
La sortie expurgée et report.json/failure.json suffisent au premier diagnostic.

Validation de l'opérateur : tests Python sur fixtures (états inattendus, copie
historique, liens/écrasements, environnement, commandes privilégiées, refus par
défaut, secrets hors arguments, arrêt ciblé). L'orchestration réelle systemd,
SELinux et les chemins Oracle ne peuvent être certifiés par ces tests : leurs
précontrôles font partie de l'exécution opérateur. Le workflow complet ajoute
les tests applicatifs, typage, build, kit, navigateur et vrai Caddy 2.11.7.
