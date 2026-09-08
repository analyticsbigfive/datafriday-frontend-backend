# Chantier — QR code réel + catalogue invité incomplet + libellés de conditionnement

> Pas de numéro de ticket externe (contrairement aux autres dossiers de `docs/chantiers/`) — créé
> le 2026-09-08 pour ne pas perdre deux TODO explicitement laissés de côté pendant l'implémentation
> de l'accès invité PIN (backend + intégration `SpaceInventoryView.vue` déjà en place, non
> committés). Renommer/numéroter si un ticket est ouvert dessus.

## 1. QR code réel — NON implémenté

**Ce qui existe aujourd'hui** : UN SEUL lien stable par PDV (`/login/pin/:slug` — décision produit
2026-09-08, revenue sur un schéma `/:slug/:phase` à deux liens : le même QR sert avant ET après
l'événement, la fenêtre actuellement ouverte détermine la phase côté serveur), `SpaceElement.slug`
généré à la création, et le bouton "Générer PIN" par carte. Ce qui manque : **aucun QR code n'est
réellement généré ni imprimable** dans l'app — seule la maquette (Artifact, hors code) en montrait
un factice (et cette maquette datait du schéma à 2 liens — la fiche imprimable n'aura plus qu'UN
SEUL QR par PDV à mettre à jour en conséquence).

**Pourquoi ce n'est pas fait** : pas un oubli de dernière minute, une vraie sous-tâche à part
entière, mise de côté pour boucler d'abord le parcours PIN fonctionnel (générer/saisir/compter/
geler/révoquer) :
- Choisir et ajouter une lib de génération QR (`qrcode` est le candidat naturel — génère du
  SVG/PNG côté client sans dépendance serveur, licence MIT, très utilisé).
- Construire l'URL complète à encoder (`${origin}/login/pin/${slug}`) — trivial une fois la lib
  choisie.
- Construire la fiche imprimable par PDV (UN SEUL QR désormais, plus pré/post côte à côte) — un
  nouveau composant/vue dédié à l'impression, pas juste le QR nu.
- Brancher un bouton "Imprimer le QR" quelque part (retiré de `GuestPinAccessPanel.vue` en
  attendant, pour ne pas afficher un bouton qui ne fait rien).

**Prochaine étape concrète** : ajouter `qrcode` aux dépendances frontend, écrire
`components/space-workspace/inventory/GuestPinQrSheet.vue` (probablement une route d'impression
dédiée, `window.print()`), rebrancher le bouton dans `GuestPinAccessPanel.vue`.

## 2. Catalogue invité incomplet/différent du staff — CORRIGÉ le 2026-09-08

Constaté le 2026-09-08 en test réel (Auxerre, PDV "1 A") : le STAFF voyait **15 articles** à
compter pour ce PDV (dont "BARRE CHOCOLATEE"), l'INVITÉ en voyait **13** pour le MÊME PDV/événement,
avec un article ("Badiane") absent côté staff. Deux causes cumulables :

**2a.** `GuestPinAccessService.getInventory()` appelait `SpaceMenusService.getShopInventory(...)`
sans `configId` → repli arbitraire sur la première config adhérente au lieu de celle de
l'événement réellement ouvert.

**2b.** `getShopInventory` ne faisait **aucune explosion BOM** (combo → constituants →
sous-composants) — retournait les ingrédients/emballages/composants au premier niveau seulement,
alors que le STAFF (`frontend/src/utils/inventoryUtils.js::buildConsolidatedInventory`) fait une
explosion récursive complète (BUG-002/Q18, BUG-292-01). Deux algorithmes différents = deux
catalogues différents pour le même PDV, irréparable en corrigeant juste le configId.

**Fix retenu (option 1 du choix précédent)** : l'invité appelle désormais **la même fonction**
`buildConsolidatedInventory` que le staff, côté client
(`frontend/src/composables/useGuestInventorySession.js::loadGuestInventory`), nourrie par un
nouvel endpoint `GET /guest-pin/catalog` (`GuestPinAccessService.getCatalog`,
`backend/src/features/guest-pin-access/guest-pin-access.service.ts`) qui renvoie les MÊMES données
brutes que le staff charge (`MenuItemsService.getRecipes` — même `buildRecipeComponents` que
`/menu-items/recipes`, `MarketPricesService.findAll`, `MenuComponentsService.findAll`), scopées au
PDV+config de l'événement ouvert (résolution `configId` copiée de
`SpaceMenusService.resolveShopConfigId`, dupliquée volontairement plutôt que de toucher
`space-menus.service.ts`). Plus aucune logique d'explosion dupliquée côté backend — un seul
algorithme, deux appelants. `GuestPinAccessService.getInventory()` ne renvoie plus que les
comptages déjà sauvegardés (`savedCounts`), plus le catalogue.

`toRecipeDto` (`menu-items.service.ts`) a été étendu (champ additif) pour inclure
`picture`/`inventoryNumberOfUnits`/`inventoryPackagingType`, absents du contrat recette existant
mais nécessaires à `buildConsolidatedInventory`.

## 3. Libellés de conditionnement invité — résolu par le fix #2

Puisque l'invité construit désormais son `consolidatedInventory` avec la MÊME fonction que le
staff, à partir des MÊMES catalogues (`marketPrices`/`components`), les champs
`inventoryPackaging`/`inventoryQuantityPackaged`/`picture` sont résolus normalement — plus de
valeurs codées en dur à `null`. Rien à faire en plus ici.
