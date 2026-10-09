# Logistique : mode Ventilation v2 (maquettes Bertrand 2026-10-09)

Branche `feat/logistic-ventilation-v2`, partie de `production` (367712de).
Suite de `docs/chantiers/logistic_ventilation/PLAN.md` (v1 en production le 2026-10-09).

## Demandes (deux maquettes « Logistic : Ventilation Mode »)

1. Retirer « Reset de l'inventaire ». À la place, une liste déroulante d'events.
2. Le prochain event est sélectionné par défaut jusqu'à son heure de fin réelle.
3. Choix multiple : libellé « [N] événements » ; les quantités à déposer s'additionnent
   (totaux et par PDV).
4. Chaque event a un PIN prédéfini. Plusieurs events : l'accès QR se fait avec le PIN
   du premier event, qui donne la sélection entière (PIN unique de la sélection).
5. « PIN d'accès : XXXXXX » dans le bandeau, uniquement en Ventilation.
6. Bascule « Par PdV / Par article », uniquement en Ventilation.
7. Filtre Fournisseur (d'où arrivent les articles).
8. Bouton imprimer : Excel / PDF / impression dans une fenêtre, aussi hors Ventilation.
9. Section « Espaces de stockage » en bas de chaque liste de PDV, même sans rien à
   déposer, avec le même bouton « + ».
10. Recherche et onglets : même style que l'Inventaire. Décision Ulrich : toute la page
    Logistique reprend le design de l'Inventaire pré-événement pour les mêmes contenus.
11. Pas de configuration en Ventilation (Ulrich) : puce de configuration masquée,
    périmètre = configurations des events choisis.

## Décisions (Ulrich 2026-10-09)

| Sujet | Décision |
|---|---|
| Reset | Supprimé (demande Bertrand). |
| PIN | Un PIN par COMBINAISON de matchs (A, A + B, B + C, A + B + C…), qui n'affiche que ses matchs. Même combinaison, quel que soit l'ordre = même PIN. Remplace la règle « PIN du premier event » (Ulrich, 2026-10-09). |
| PIN utilisable | Dès qu'il est affiché, jusqu'à la fin réelle du dernier event de la sélection. |
| Dépôt multi-events | Réparti par ordre chronologique : reste à déposer du 1er match d'abord, surplus sur le dernier. Évite la double livraison quand on regarde un seul match ensuite. |
| Fournisseur | Fournisseur retenu dans la feuille de réarmement (étape 3, `shoppingGroups`), repli fiche article. |
| Bascule | « Par article » (menu items) par défaut (Ulrich 2026-10-09), choix mémorisé. |
| Sélecteur d'events | Sur tous les onglets (il pilote aussi « À déposer » des fiches PDV). |
| Imprimer | Fenêtre Excel / PDF / Impression, liste affichée avec les filtres. |

## Lots

- A. Design (bandeau, recherche collée, onglets soulignés) + suppression du Reset.
- B. Ventilation : bascule, section stockages, filtre Fournisseur, fenêtre Imprimer.
- C. Sélecteur multi-events + addition des feuilles + répartition des dépôts.
- D. PIN par event et par sélection (migration, jeton invité, page invitée).

## Livré (2026-10-09, non commité)

### A. Design et Reset
- Reset de l'inventaire supprimé : bouton, fenêtre, action du store, appel API, traductions
  (l'endpoint serveur `POST /logistics/:spaceId/reset` reste, sans appelant front).
- Bandeau à bas carré, recherche collée dessous (PDV + articles, aussi en drill-in), onglets
  soulignés : valeurs de `.si-segrow--band`, `.si-search-wrap`, `.si-subnav` de l'Inventaire.
- Recherche du panneau gauche et recherches internes de By Item / Ventilation retirées :
  une seule barre, sous le bandeau.

### B. Ventilation
- Bascule Par PdV / Par article (défaut Par article, mémorisée sur l'appareil).
- Section « Espaces de stockage » : tous les stockages des configurations des matchs choisis,
  même sans rien à déposer ; dépôt hors feuille possible (Logistique et page des logisticiens,
  serveur : `storageId` + `itemName`, stockage et article vérifiés).
- Filtre Fournisseur : liste déroulante « Tous les fournisseurs » dans la barre de la
  Ventilation, à gauche de la bascule (maquette du 2026-10-09) ; fournisseur de la feuille de
  course, repli fiche article. Le panneau de filtres gauche est masqué en Ventilation.
- Bouton imprimer sur tous les onglets : fenêtre Excel / PDF / Impression de la liste affichée.

### C. Plusieurs matchs
- Sélecteur d'events dans le bandeau (`?events=a,b`), libellé « N événements ». Liste :
  `GET /logistics/:spaceId/ventilation-events` (matchs non terminés, le premier par défaut
  jusqu'à sa fin réelle).
- Feuilles fusionnées (`utils/ventilationPlans.js`) ; une même destination sur deux feuilles
  ne fait qu'une ligne ; un dépôt est réparti entre les feuilles, match le plus proche d'abord,
  packs entiers.
- Correctif au passage : les dépôts comptent pour TOUS les matchs de leur feuille. Avant, une
  feuille couvrant A + B ne retranchait que les dépôts du match ouvert (double livraison possible).

### D. PIN
- `POST /ventilation-access/ensure { spaceId, eventIds }` : fenêtre du premier match non
  terminé créée et ouverte si besoin (PIN prédéfini), autres matchs dans `linkedEventIds`.
  Une fenêtre arrêtée à la main reste arrêtée (« Reprendre l'accès » dans la fenêtre QR).
- Plusieurs accès Ventilation ouverts en même temps ; fermeture à la fin du dernier match.
- « PIN d'accès : XXXXXX » dans le bandeau en Ventilation ; la fenêtre QR lit le même état.
- Page des logisticiens : feuilles de tous les matchs de l'accès, même fusion que Logistique.
- Migration `20261010090000_ventilation_linked_events` (colonne + index partiel recréé sans la
  phase ventilation), appliquée en LOCAL seulement.

## À tester en local (Nantes-Reims, La Beaujoire)
1. Logistique : plus de Reset ; recherche sous le bandeau ; onglets soulignés.
2. Ventilation : PIN dans le bandeau, puce L2 absente ; bascule ; stockages (parvis compris).
3. Choisir deux matchs : « 2 événements », totaux additionnés, même PIN (celui du premier).
4. Déposer sur une destination commune aux deux feuilles : deux mouvements, reste juste.
5. Page QR : se connecter avec le PIN, mêmes chiffres, dépôt dans un stockage vide.
6. Imprimer depuis chaque onglet (Excel, PDF, Impression) ; filtre Fournisseur.

## Relecture indépendante (2026-10-09) et corrections
- Corrigé : dépôt en stockage hors feuille relu (matchs choisis + matchs des feuilles) ;
  stockages lus côté serveur (`GET /logistics/:spaceId/ventilation-storages`), plus selon la
  configuration chargée ; réponse lente d'une ancienne sélection ignorée ; dépôt réparti en
  partie enregistré : saisie fermée et feuille relue (pas de double enregistrement) ; lien vers
  un match terminé retombe sur le prochain ; filtres gauches masqués en Ventilation ; CSS mobile
  en double ; restes (API de statut, calcul inutilisé, traductions et styles morts, commentaires).
- Gardé volontairement : la dernière sélection enregistrée sur le PIN d'un match fait foi ;
  sélection par défaut calculée au chargement de la page.
- Écarts de design laissés selon la maquette de Bertrand (à trancher par Ulrich) : bouton
  imprimer en icône + fenêtre (Inventaire : pilule « Imprimer » + menu dans le bandeau), PIN en
  texte à droite (Inventaire : ligne PIN avec ■ ▶), sélecteur d'events en pilule.

## Révision PIN (Ulrich 2026-10-09, après relecture)
- Un accès et un PIN par combinaison de matchs : `InventoryWindow.selectionKey` (empreinte des ids
  triés) entre dans la contrainte d'unicité ; vide pour les fenêtres d'inventaire. Migration
  `20261010100000_ventilation_selection_key`, appliquée en LOCAL seulement.
- Arrêter / Reprendre / Nouveau PIN visent l'accès (`windowId`), plus le match.
- Une autre combinaison ne modifie jamais l'accès d'une combinaison existante.
- Route `GET /ventilation-access/spaces/:spaceId` supprimée (plus d'appelant).
