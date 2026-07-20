# BUG-100 — (miroir) `manualQuantities` : backend prêt, front ne l'envoyait jamais

- **Statut** : 🟢 Corrigé (fix côté front, 2026-07-18)
- **Sévérité** : 🟠 Majeur (perte de données au changement d'appareil)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : les deux — **fiche canonique : `datafriday-web/docs/bugs/08_manualquantities_jamais_envoye_backend.md`**
- **Découvert le** : 2026-07-15 (front BUG-008) ; miroir créé 2026-07-18
- **Fichiers** : `src/features/events/dto/predict-version.dto.ts:69,142`, `src/features/events/predict-versions.service.ts:41,56`, `prisma/schema.prisma` (`manualQuantities Json @default("{}")`)

## Symptôme / Cause racine

Voir fiche canonique front 08 : la colonne, le DTO (whitelisté) et le service étaient **déjà prêts** côté backend ; seul le payload front omettait le champ.

## Correction

Aucun changement backend nécessaire. Front : `versionToPayload` envoie désormais `manualQuantities` (cf. fiche 08, mise à jour 2026-07-18).

## Références

- `datafriday-web/docs/bugs/08_manualquantities_jamais_envoye_backend.md`
