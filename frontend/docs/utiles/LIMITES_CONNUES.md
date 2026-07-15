# Limites connues — DataFriday × Weezevent

> Document de référence pour présenter les limites actuelles du système.  
> Dernière mise à jour : mai 2026

---

## 1. Filtre "Zones" inopérant

**Symptôme** : Le filtre par zone dans la page Analyse est visible mais vide pour tous les clients.

**Cause** : Le filtre repose sur le champ `SpaceElement.attributes.area` (un libellé libre comme "Tribune Nord", "VIP"…). Aucun écran de l'application ne permet de saisir cette valeur — ni le wizard d'intégration, ni l'éditeur de plan.

**Impact** : Faible. Les filtres par shop, type de shop et menu item fonctionnent normalement. La zone est une dimension optionnelle.

**Correction** : Ajouter un champ "Zone" dans le modal de création de shop (wizard étape 2) et dans le panneau propriétés de l'éditeur de plan. Le backend supporte déjà ce champ sans modification.

---

## 2. Nombre de spectateurs (per capita) non alimenté automatiquement

**Symptôme** : Le KPI "ventes par spectateur" est à 0 ou vide pour tous les événements.

**Cause** : Ce calcul nécessite `ticketsScanned` (nombre de tickets validés à l'entrée). Cette donnée est disponible via l'API WeezPay mais doit être synchronisée manuellement via le bouton **"Sync tickets"** dans l'étape 5 du wizard.

**Impact** : Modéré. Le per capita est un KPI clé pour comparer les événements entre eux. Il est disponible dès que l'opérateur clique sur "Sync tickets".

**Correction long terme** : Configurer un webhook WeezPay type `"scan"` pour alimenter la base en temps réel, sans action manuelle.

---

## 3. Pas de données historiques (comparaisons N-1)

**Symptôme** : Les graphiques de comparaison N-1 sont vides.

**Cause** : Il n'existe pas de données d'événements passés dans la base pour les premiers tenants — la plateforme est nouvelle. Il n'y a pas de mécanisme d'import de données historiques.

**Impact** : Temporaire. Les comparaisons N-1 seront disponibles naturellement après un an d'exploitation.

**Correction** : Si des exports CSV ou des données Weezevent existent pour des saisons passées, un script d'import ad hoc peut être développé.

---

## 4. Nature / sous-nature des produits (WeezPay)

**Symptôme** : Les champs `nature`, `subnature` et `category` des produits WeezPay sont présents dans les données granulaires mais pas encore exposés comme filtres actifs dans l'interface.

**Cause** : Ces champs sont récupérés et stockés (`weezpayNature`, `weezpaySubnature`, `weezpayCategory` dans `shopGranularData`), mais aucun filtre UI n'a été branché dessus.

**Impact** : Faible. Les données sont là — il suffit d'ajouter les sélecteurs dans le panneau de filtres.

---

## 5. Synchronisation des tickets — action manuelle requise

**Symptôme** : `ticketsScanned` ne se met pas à jour automatiquement après un événement.

**Cause** : La synchronisation est déclenchée manuellement (bouton "Sync tickets" dans le wizard étape 5).

**Impact** : Faible en exploitation normale. L'opérateur doit penser à synchroniser après chaque événement.

---

## Résumé

| Limite | Impact | Action requise |
|--------|--------|----------------|
| Filtre Zones vide | Faible | Ajouter champ "Zone" dans 2 formulaires |
| Per capita à 0 | Modéré | Clic "Sync tickets" après chaque event |
| Comparaisons N-1 vides | Temporaire | Attendre 1 an ou import historique |
| Filtres nature/subnature absents | Faible | Brancher les sélecteurs UI |
| Sync tickets manuelle | Faible | Optionnel : webhook WeezPay |
