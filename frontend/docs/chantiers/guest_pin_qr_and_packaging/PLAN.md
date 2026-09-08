# Chantier — QR code réel + libellés de conditionnement pour l'accès PIN invité

> Pas de numéro de ticket externe (contrairement aux autres dossiers de `docs/chantiers/`) — créé
> le 2026-09-08 pour ne pas perdre deux TODO explicitement laissés de côté pendant l'implémentation
> de l'accès invité PIN (backend + intégration `SpaceInventoryView.vue` déjà en place, non
> committés). Renommer/numéroter si un ticket est ouvert dessus.

## 1. QR code réel — NON implémenté

**Ce qui existe aujourd'hui** : l'URL stable par PDV+phase (`/login/pin/:slug/:phase`,
`SpaceElement.slug` généré à la création) et le bouton "Générer PIN" par carte. Ce qui manque :
**aucun QR code n'est réellement généré ni imprimable** dans l'app — seule la maquette (Artifact,
hors code) en montrait un factice.

**Pourquoi ce n'est pas fait** : pas un oubli de dernière minute, une vraie sous-tâche à part
entière, mise de côté pour boucler d'abord le parcours PIN fonctionnel (générer/saisir/compter/
geler/révoquer) :
- Choisir et ajouter une lib de génération QR (`qrcode` est le candidat naturel — génère du
  SVG/PNG côté client sans dépendance serveur, licence MIT, très utilisé).
- Construire l'URL complète à encoder (`${origin}/login/pin/${slug}/${phase}`) — trivial une fois
  la lib choisie.
- Construire la fiche imprimable par PDV (pré + post côte à côte, cf. la maquette Artifact déjà
  validée avec l'utilisateur) — un nouveau composant/vue dédié à l'impression, pas juste le QR nu.
- Brancher un bouton "Imprimer les QR" quelque part (retiré de `GuestPinAccessPanel.vue` en
  attendant, pour ne pas afficher un bouton qui ne fait rien).

**Prochaine étape concrète** : ajouter `qrcode` aux dépendances frontend, écrire
`components/space-workspace/inventory/GuestPinQrSheet.vue` (probablement une route d'impression
dédiée, `window.print()`), rebrancher le bouton dans `GuestPinAccessPanel.vue`.

## 2. Libellés de conditionnement invité — dégradation cosmétique connue

`GuestPinAccessService.getInventory()` (backend) ne remonte pas les champs de conditionnement
(nom vu ailleurs dans le code sous `inventoryPackaging`/`inventoryQuantityPackaged` côté
`InventoryCountingInterface.vue`, à vérifier contre le nom réel exposé par
`SpaceMenusService.getShopInventory` avant de les ajouter — pas fait ici par prudence, cf. session
du 2026-09-08). Conséquence : l'écran de comptage invité affiche le libellé générique "Number of
packed units" au lieu de "Number of Cartons of 3", et le total utilise un ratio 1:1 par défaut
(`item.inventoryQuantityPackaged || 1`) au lieu de la vraie taille de carton.

**Pas cassé, juste moins précis** : le comptage fonctionne, se sauvegarde, se compare — seul
l'affichage du libellé et l'exactitude du total "unités" (vs "cartons") sont dégradés.

**Prochaine étape concrète** : confirmer le nom exact du champ conditionnement retourné par
`getShopInventory`, l'ajouter au mapping `items.map(...)` de `getInventory()`
(`backend/src/features/guest-pin-access/guest-pin-access.service.ts`), puis le laisser transiter
tel quel dans `useGuestInventorySession.js::loadGuestInventory()`.
