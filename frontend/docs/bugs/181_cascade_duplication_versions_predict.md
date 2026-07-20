# BUG-181 — EventPredict : cascade historique de versions dupliquées, tenue par des workarounds fragiles

- **Statut** : ⚪ Diagnostiqué (vrai fix = contrainte DB + nettoyage des doublons prod, à valider)
- **Sévérité** : 🟠 Majeur (fragilité structurelle ; jusqu'à 76 doublons observés historiquement)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : les deux (front = siège des workarounds ; backend = siège du vrai fix)
- **Découvert le** : 2026-07-18 (formalisation)
- **Fichiers** : `src/composables/useEventPredictVersions.js:44-102, 267-312` (réconciliation, signatures, single-flight, 404-upsert)

## Symptôme

Historiquement, la réconciliation localStorage→DB re-POSTait des versions quand le GET rendait vide après un POST → duplication en cascade. Aujourd'hui contenu par une pile de défenses : signatures persistées (`versionSignature`), single-flight `load()`/`setDefault()`, registre `dbBackedIds`, upsert-sur-404 avec remap d'id, garde anti-écrasement de liste sur 401 transitoire.

## Cause racine

Aucune contrainte d'unicité en DB (`EventPredictVersion` : pas d'unique `(eventId, name)` ni de numéro de version) + double source de vérité localStorage/DB. La correction par contrainte est bloquée : **les doublons legacy feraient échouer la migration**.

## Correction

Aucune cette session. Plan cible : (1) inventorier les doublons prod, (2) valider leur nettoyage (→ `docs/QUESTIONS_A_BERTRAND.md`), (3) contrainte unique (p.ex. `(tenantId, eventId, signature)` ou numéro de version serveur), (4) démonter progressivement les workarounds front. Chaque étape dépend de la précédente — ne PAS retirer les défenses actuelles avant la contrainte.

## Risque de régression / à surveiller

Les gardes actuelles reposent sur des collisions de signature — tout refactor de `versionSignature` (`:257`) doit être traité comme du code de sécurité des données.

## Références

- Backend BUG-13/76 (famille intégrité EventPredictVersion), backend BUG-98
