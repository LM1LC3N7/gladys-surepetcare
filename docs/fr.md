# Sure Petcare

Cette intégration amène dans Gladys les appareils connectés **Sure Petcare** :
chatières et portes **SureFlap**, distributeurs **SureFeed** et fontaines
**Felaqua**, reliés au cloud Sure Petcare par leur hub. Elle utilise le même
compte que l'application Sure Petcare. Non officielle, sans lien avec Sure
Petcare.

> **Version de développement (0.1).** Réalisée d'après les clients
> communautaires de l'API Sure Petcare (surepy, utilisé par Home Assistant,
> ioBroker.sureflap) et testée avec des réponses simulées, pas encore avec un
> vrai compte. Vos retours sont les bienvenus sur le dépôt GitHub.

## Ce que vous obtenez

Un appareil Gladys par appareil Sure Petcare, et un par animal :

| Appareil                        | Dans Gladys                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Hub                             | en ligne (oui/non)                                                                            |
| Chatière, porte pour animaux    | mode de verrouillage (réglable), batterie %, en ligne                                         |
| Distributeur SureFeed (Connect) | poids de chaque gamelle (g), dernier repas (g) et l'animal qui l'a pris, batterie %, en ligne |
| Felaqua                         | eau restante (mL), niveau d'eau %, batterie %, en ligne                                       |
| Chaque animal                   | à l'intérieur ou non, depuis combien de minutes, dernier repas (g), dernière boisson (mL)     |

- « À l'intérieur » est enregistré à l'heure du passage par la chatière (ou du
  réglage dans l'application), pas à l'heure de la lecture : l'historique
  montre les vraies heures d'entrée et de sortie. « Depuis le dernier
  passage » compte les minutes depuis ce moment, pratique pour une scène du
  type « le chat est dehors depuis plus de 6 heures ».
- Le dernier repas et la dernière boisson sont datés de l'heure du repas.
  Les grammes sont des capteurs génériques (Gladys n'a pas d'unité de masse),
  d'où le « (g) » dans leur nom.
- La batterie vient de l'application Sure Petcare quand elle la donne, sinon
  de la tension des quatre piles AA (1,25 V vide, 1,6 V pleine, comme Home
  Assistant).
- Le badge de chaque appareil indique `cloud` ; `injoignable` avec un point
  orange quand le hub signale l'appareil hors ligne, `injoignable` tout court
  quand Sure Petcare ne répond pas.

## Installation

1. Installez l'intégration depuis le store de Gladys.
2. Dans l'onglet **Configuration**, saisissez l'e-mail et le mot de passe de
   votre compte Sure Petcare (ceux de l'application), puis enregistrez.
3. L'état indique « Connecté à Sure Petcare : 5 appareils, 2 animaux » et la
   date de fin de la session ouverte par l'intégration.
4. Ouvrez l'onglet **Découverte** et ajoutez les appareils et les animaux que
   vous voulez suivre. Leurs valeurs arrivent dès l'ajout.

Le bouton **Tester la connexion** lit le compte et résume ce qu'il contient
et où se trouve chaque animal.

## Mode de verrouillage et couvre-feu

Le mode de chaque chatière se règle depuis Gladys (tableau de bord, scènes) :

| Mode                 | Effet                                                  |
| -------------------- | ------------------------------------------------------ |
| Ouverte              | entrée et sortie libres                                |
| Garder à l'intérieur | les animaux peuvent entrer mais pas sortir             |
| Garder à l'extérieur | les animaux peuvent sortir mais pas entrer             |
| Fermée               | ni entrée ni sortie                                    |
| Couvre-feu           | les horaires de couvre-feu de la chatière s'appliquent |

Le couvre-feu utilise les horaires réglés dans l'application Sure Petcare :
réglez-les une fois là-bas. Choisir un autre mode désactive le couvre-feu, et
revenir au couvre-feu réactive les mêmes horaires. Le hub met quelques
secondes à appliquer un mode : Gladys affiche le mode demandé, puis la lecture
suivante le confirme.

## Scènes

Trois déclencheurs de scène, pour un animal ou pour tous :

- **Animal sorti** et **Animal rentré** : variables `pet_name`, `flap_name`
  (la chatière utilisée, vide si le changement a été fait à la main dans
  l'application), `by_hand` et `since` (l'heure en UTC). Le filtre peut viser
  un animal et une chatière.
- **Animal a mangé** : un distributeur a vu l'animal manger au moins 1 g ;
  variables `pet_name`, `feeder_name`, `amount` (grammes) et `at`. Le filtre
  peut viser un animal et un distributeur.

Une lecture ne voit que le dernier passage de chaque animal : un chat sorti
puis rentré entre deux lectures donne un seul « Animal rentré ». Les
changements de plus de 15 minutes découverts au démarrage ou après une panne
ne déclenchent rien : ils sont seulement enregistrés.

Les autres valeurs fonctionnent avec le déclencheur habituel « Changement
d'état d'un appareil » (gamelle presque vide, eau sous 20 %, batterie faible,
hub hors ligne…).

## Fréquence de lecture

Tout est lu en une seule requête (`me/start`), toutes les 60 secondes par
défaut (réglable de 30 à 600). Home Assistant lit toutes les 3 minutes,
l'application Sure Petcare plus souvent. En cas d'erreur, l'intégration
attend 1, 2, 5, 10 puis 15 minutes ; si Sure Petcare demande de ralentir, elle
attend le temps indiqué (15 minutes sinon).

## Options

| Option                              | Défaut   | Rôle                                                        |
| ----------------------------------- | -------- | ----------------------------------------------------------- |
| E-mail, mot de passe                | —        | le compte de l'application Sure Petcare                     |
| Intervalle de rafraîchissement (s)  | 60       | fréquence de lecture du compte                              |
| Langue des noms des fonctionnalités | Français | noms des fonctionnalités et des modes des appareils ajoutés |

## Dépannage

- **« Sure Petcare a refusé l'e-mail ou le mot de passe »** : vérifiez-les
  dans l'application, puis dans la configuration. L'intégration ne réessaie
  pas toute seule (des refus répétés peuvent bloquer un compte) : elle attend
  une modification ou un clic sur **Tester la connexion**.
- **« Sure Petcare est injoignable »** : le cloud Sure Petcare ou votre accès
  Internet est en panne (état du service : https://status.surepetcare.io).
- **Un appareil est `injoignable` avec un point orange** : le hub ne le voit
  plus (piles, portée). Vérifiez-le dans l'application.
- **Le poids des gamelles reste vide** : votre distributeur ne donne peut-être
  pas encore ses poids dans la réponse lue (anciens firmwares). Ouvrez un
  ticket sur le dépôt GitHub.
- **Les répéteurs et programmateurs** ne sont pas encore pris en charge.

## Confidentialité

L'e-mail et le mot de passe sont stockés par Gladys comme secret (jamais
renvoyés au navigateur). L'intégration ne les envoie qu'à
`app-api.production.surehub.io`, le cloud de l'application Sure Petcare, pour
ouvrir une session ; elle garde le jeton de session et un identifiant de
client dans son dossier `/data`. Sure Petcare, SureFlap, SureFeed et Felaqua
sont des marques de leur propriétaire ; cette intégration est sans lien avec
Sure Petcare.
