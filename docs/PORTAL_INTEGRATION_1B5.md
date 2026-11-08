# Mission 1B.5 — adaptateur personnel Caddy / portail

Base : main `cb80c06`, PR #5 fusionnée. Le portail requiert sa PR 1B.5 associée. Aucun déploiement, changement Oracle, données, moteur, bots ou statistiques. Pas de fusion autorisée.

## Architecture retenue

Navigateur → HTTPS Caddy + Basic Auth (un administrateur) → preuve interne injectée côté serveur → portail ou Amazonia loopback → workers → SQLite externe au code. Le portail peut aussi relayer un sous-chemin explicite vers Amazonia en conservant cette preuve, sans utiliser Referer comme identité ou repli de routage.

Basic Auth est vérifié uniquement par Caddy. Le mot de passe haché et la clé interne ne sont jamais livrés au navigateur ou enregistrés dans GitHub. Pas de second système de comptes ni JWT/OAuth. L'API admin Caddy est désactivée pour ne pas exposer la configuration développée et sa clé en lecture locale.

Le contrat exact utilise `X-Atelier-Internal`, clé hexadécimale aléatoire de 32 octets minimum. Caddy remplace tout header de ce nom fourni par le client après authentification réussie, supprime Basic et les faux headers d'identité avant proxy, et ne transmet la clé qu'au portail et à Amazonia. Les autres outils ne la reçoivent pas. Le backend ne fait jamais confiance au seul localhost, Origin, Referer ou x-user.

## Implémentation Amazonia

`internalAuthorization()` est appelé au démarrage réel et fournit l'adaptateur Authorize de 1B.4. Il lit ATELIER_INTERNAL_KEY_FILE : fichier absolu canonique régulier, sans lien, mode 0400/0600 et secret hexadécimal 64..128 caractères. ATELIER_PUBLIC_ORIGINS contient les origines HTTPS exactes autorisées, séparées par virgules. Une configuration absente maintient 503 ; une configuration invalide fait échouer le démarrage. Une preuve absente/incorrecte rend 403, et la comparaison ne dépend pas d'un en-tête d'identité.

L'administrateur unique possède les quatre permissions read/operate/delete/audit. Les quotas, validations, pool partagé et gardes de 1B.4 restent actifs sur tous les alias API. Les lectures de santé et de campagnes requièrent la preuve ; les mutations exigent aussi Origin de la liste et Content-Type application/json. Cette défense CSRF est nécessaire car Basic est réutilisé automatiquement par les navigateurs ; Origin n'est jamais une autorisation autonome. Aucun cookie de session Amazonia ajouté. Un script client doit lui aussi fournir Origin et JSON via l'entrée Basic Caddy, jamais la clé interne.

## Préparation manuelle Oracle et ordre

La procédure détaillée commune est dans `docs/INTEGRATION_1B5.md` de la PR portail associée. Avant toute intervention, le propriétaire doit la revoir et autoriser l'infrastructure séparément.

1. Inventaire réel : versions et processus, Caddy et ports OCI/hôte, registre des outils, stockage historique et SQLite/WAL/SHM, binaire Node exécuté par systemd. Ne pas déduire le déploiement de main.
2. Sauvegarde préalable complète et restauration isolée vérifiée (outils 1B.4). Conserver JSON/quarantaine et provenance, empreintes, version source et dépendances ; copie hors VM par canal approuvé. Aucun backup réel exécuté ici.
3. Préparer Basic Caddy avec mot de passe fort haché par `caddy hash-password` interactif, sans le publier. Générer la clé en privé, la placer dans l'EnvironmentFile root-owned 0600 de Caddy (ATELIER_INTERNAL_KEY) et dans les fichiers privés séparés du portail et d'Amazonia. Caddy reçoit aussi ATELIER_BASIC_USER et ATELIER_BASIC_HASH. Ni secrets ni hashes réels dans les PR.
4. Préparer le compte `amazonia` sans sudo, Node 24 exact (référence 24.22.1) et stockage externe existant. Dans /etc/amazonia/service.env privé : NODE_ENV=production, AMAZONIA_CAMPAIGNS_DIR, ATELIER_INTERNAL_KEY_FILE et ATELIER_PUBLIC_ORIGINS. Les fichiers et parents doivent être accessibles uniquement aux comptes appropriés. Unités d'un seul écrivain ; l'ancienne unité doit être arrêtée avant la nouvelle.
5. La recette portail prend AMAZONIA_NODE_BINARY absolu et canonique (vérification Node >=24 et import sqlite) et AMAZONIA_CAMPAIGNS_DIR externe ; elle doit correspondre exactement au chemin du service Amazonia. Le Node d'ExecStart est absolu, pas déduit d'engines/PATH. Aucun patch automatique du source/worker, aucun Python statique de secours.
6. Préparer Amazonia avec son adaptateur en mode fermé puis le portail protégé, écouter uniquement loopback ; ne pas réactiver une entrée non protégée pendant la transition. Générer le Caddyfile depuis le registre réel, réconcilier toute configuration locale existante, valider sous l'environnement exact de Caddy, puis installer/redémarrer manuellement après accord. Caddy admin off impose un redémarrage contrôlé ; les campagnes ne dépendent pas du HTTP.
7. Recette : Basic absent/incorrect => 401 partout ; Basic correct => accès et petite campagne ; faux headers et backend direct sans preuve => 403 ; CSRF => refus ; toutes les branches Caddy et outils protégés ; vérifier écoute IPv4/IPv6 et firewall. Fermer le navigateur pendant le calcul, consulter depuis un autre appareil, vérifier anciennes campagnes/checkpoints, progression sans doublon et consommation de ressources.

Le générateur portail ne remplace plus automatiquement le Caddyfile actif : il prépare une proposition manuelle. Les archives ZIP HTTP sont désactivées au profit du staging manuel ; execStart/buildCmd HTTP ne sont plus des commandes choisies par le client, et les actions système sont en liste fermée. Ces restrictions sont explicites dans la PR portail.

## Sauvegarde et retour arrière

Réutiliser `scripts/backup.ts` et `docs/SECURITY_DEPLOYMENT_1B4.md`. Snapshot SQLite actif cohérent (WAL pris en compte par API backup), integrity_check et manifeste ; destination nouvelle, aucun écrasement. Pour une ancienne application JSON sans base, copie complète à l'arrêt. Restauration exclusivement dans un nouveau répertoire, après arrêt et vérification des écrivains, sans mélange WAL/SHM ni suppression du bail actif. Préserver les données originales avant bascule ; ne jamais dépendre de reset --hard pour protéger le stockage.

**Cette PR ne modifie pas les sources incluses dans les empreintes scientifiques**, dont campaignManager. Elle ne rajoute donc pas d'incompatibilité de provenance par rapport à 1B.4. Les checkpoints antérieurs à 1B.4 peuvent néanmoins refuser la reprise selon le contrôle existant : conserver l'ancienne release exacte et une copie de données pour recette, ou créer une nouvelle campagne après décision humaine, sans falsifier le manifeste.

Un rollback conserve l'entrée fermée et l'authentification, ou coupe l'accès externe. Ne jamais restaurer un ancien portail ouvert pour résoudre une panne de clé. Vérifier schéma et provenance avant retour de code ; archiver l'état nouveau et restaurer une sauvegarde compatible dans un autre répertoire si nécessaire. Les campagnes créées depuis la sauvegarde doivent rester archivées séparément ; aucune fusion ni purge automatique. Les données réelles ne sont pas manipulées par cette mission.

## Limites et vérifications restantes

Un seul utilisateur, tous droits métier ; Basic ne fournit pas de logout universel, sa rotation reste manuelle et indépendante de la vie des campagnes. Tous les outils de même origine sont supposés de confiance : une XSS peut agir avec les droits Basic. Un service possédant la clé compromise peut usurper l'entrée ; les fichiers privés/comptes séparés réduisent le risque mais ne constituent pas une isolation contre sa compromission. Déployer un dépôt Git autorise l'exécution de son code et scripts npm.

Aucune infrastructure anti-bruteforce réseau ou sandbox de code tiers ajoutée. HTTPS, isolation des ports et des comptes, droits sudo limités du portail et configuration Caddy/Oracle effective sont des prérequis à vérifier, pas des résultats de test locaux. Le localhost seul n'est pas une autorisation. Aucun secret en code, rapport, URL ou log.

## Validation

Test adaptateur avec clé éphémère et Origin fictive : faux headers, preuve incorrecte, absence de preuve/configuration, trois alias API, CSRF et simulation autorisée ; permissions des fichiers contrôlées. Test croisé dans le portail avec vrai Caddy 2.10.2 local (HTTP loopback seulement), Basic fictif, Amazonia et portail temporaires : anonymes/mauvais identifiants refusés, bons identifiants autorisés, campagne dix parties terminée sans polling, lecture après nouvelle connexion et proxy interne, refus direct et Origin externe. Aucun accès au portail public ni à Oracle.

Commandes : `npm test`, `npm run lint`, `npm run build`, `git diff --check` et diff nul sur src/sim, src/scientific, campaignManager, simWorker et fixtures v3.3. Les suites de 1B.4 couvrent aussi sauvegarde/reprise, arrêt/pause, SCIENTIFIC_V1 et appariement. L'intégration locale ne prouve pas que Node 24 ou le stockage correct sont déjà présents sur Oracle.

Résultats : 90 tests Amazonia réussis, typage/build/diff-check réussis ; aucune différence sur les sources scientifiques et historiques protégées. Portail : sept tests réussis avec Caddy local et Chromium, dont une campagne HTTPS de 40 parties encore RUNNING au moment de fermer complètement le navigateur ; un second navigateur neuf retrouve son état COMPLETED et son compteur exact. Certificat local ignoré uniquement pour la recette isolée, sans installation d'autorité système. Les commandes de contrôle pause/reprise/arrêt et DELETE du client incluent désormais JSON vide afin de respecter la défense CSRF ; le POST d'auto-mise à jour du portail est aligné de la même façon. Aucun résultat de production n'est déduit de ces tests.
