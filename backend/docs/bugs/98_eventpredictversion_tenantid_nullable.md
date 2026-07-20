# BUG-98 — `EventPredictVersion.tenantId` nullable alors que toutes les requêtes scopent par tenant

- **Statut** : ⚪ Diagnostiqué (backfill à décider)
- **Sévérité** : 🟡 Mineur (lignes legacy invisibles)
- **Domaine** : Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `prisma/schema.prisma` (`EventPredictVersion.tenantId String?`), `src/features/events/predict-versions.service.ts`

## Symptôme

Toutes les requêtes du service filtrent `tenantId` : une ligne legacy avec `tenantId=NULL` n'est **retournée par aucune** lecture (invisible pour tout le monde), ne peut être ni patchée ni supprimée via l'API.

## Cause racine

Colonne ajoutée nullable pour ne pas casser les rows existantes, jamais backfillée ni resserrée en NOT NULL.

## Correction

Aucune à ce jour — passer NOT NULL exige un backfill : à quel tenant rattacher les lignes NULL ? (dérivable via `eventId → Event.tenantId` quand l'event existe encore ; orphelines sinon — cf. BUG-76, même famille). Question posée dans `docs/QUESTIONS_A_BERTRAND.md`.

## Risque de régression / à surveiller

Compter les lignes NULL en prod avant de décider (`SELECT COUNT(*) FROM "EventPredictVersion" WHERE "tenantId" IS NULL`).

## Références

- BUG-76 (eventId non vérifié, ⚪ — même cluster d'intégrité EventPredictVersion)
