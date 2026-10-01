# BUG-391-02 : Generate Staff ignore le CA prédit affiché (miroir backend)

- **Statut** : 🟡 Corrigé non déployé (branche `fix/bug-391-02-staff-ca-ecran`, non commité, 2026-10-01)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : RH Staffing (`features/staffing`)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-10-01
- **Fichiers** : `src/features/staffing/staffing.service.ts:156` (`resolvePredictedRevenueByElement`), `:292` (`generate`), `src/features/staffing/staffing.controller.ts:74`

Fiche complète côté front : `frontend/docs/bugs/391_02_staff_generate_ignore_ca_predit_affiche.md`.

Résumé : `generate` ne reçoit que l'`eventId`. Il lit le CA dans la version Event Predict par défaut, sinon dans
`ElementPerformance.revenue`, que rien n'alimente en pratique. Sur un match sans version enregistrée (SFP-Montpellier,
vérifié en production le 2026-10-01), le CA vaut 0 partout et aucune ligne n'est créée.

Part backend du fix : `GenerateStaffingDto { predictedRevenueByElement?: Record<string, number> }` en corps optionnel,
priorité corps > version par défaut > ElementPerformance, clés hors configuration ignorées, message
`AUCUNE_LIGNE_GENEREE` qui distingue « CA absent » de « CA sous l'objectif TPE », tests dans
`staffing.service.spec.ts`.

## Mise en œuvre (2026-10-01)

Branche `fix/bug-391-02-staff-ca-ecran` : voir la fiche front.
