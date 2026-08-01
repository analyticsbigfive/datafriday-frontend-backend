# BUG-262-02 — HrRole.algoKey accepté sans validation côté backend (non exploitable via l'UI actuelle)

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : RH / Staffing
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31
- **Fichiers** : `backend/src/features/hr/hr.service.ts::normalizeRole` (aucune validation),
  `backend/src/features/hr/hr-roles.controller.ts` (DTO `algoKey?: string`, pas de `@IsIn`),
  `frontend/src/components/hr/drawers/HrRoleFormDrawer.vue:165-176` (`<select>` fermé sur
  `ALGO_KEYS`)

## Symptôme

`HrRole.algoKey` accepte n'importe quelle chaîne côté API (`createRole`/`updateRole`), pas
seulement les 8 valeurs valides (`RESPONSABLE_ZONE`, `RESPONSABLE_PDV`, `CAISSIER`, `RUNNER`,
`BARMAN`, `CHEF_DE_PARTIE`, `COMMIS`, `EPR`). Un rôle avec une valeur invalide (ex. faute de casse
`"Caissier"` au lieu de `"CAISSIER"`) est enregistré sans erreur, mais n'est jamais consommé par le
calcul de staffing (`rolesByAlgo.get(key)` cherche une correspondance exacte) — le rôle reste
silencieusement inerte.

**Non exploitable en pratique aujourd'hui** : le champ `algoKey` du formulaire RH
(`HrRoleFormDrawer.vue`) est un `<select>` fermé sur les 8 valeurs exactes (pas de texte libre), donc
ce cas ne peut pas se produire via l'usage normal de l'écran. Le risque n'existe que si un autre
chemin d'écriture apparaît un jour (appel API direct, script, futur import CSV RH) — défense en
profondeur manquante, pas un bug vécu actuellement.

## Cause racine

`HrService.normalizeRole()` valide `contractType`/`rateType` contre des listes figées
(`HR_CONTRACT_TYPES.includes(...)`), mais ne fait ancune vérification équivalente sur `algoKey`
avant de le persister. Le DTO (`hr-roles.controller.ts`) ne porte pas non plus de `@IsIn` sur ce
champ.

## Correction

Non corrigée — faible priorité vu l'absence d'exploitation réelle. Piste triviale si traité :
`@IsIn(ALGO_KEYS)` côté DTO (import de la constante déjà exportée par
`staffing-calculator.service.ts`) + vérification miroir côté service, même schéma que
`HR_CONTRACT_TYPES`/`HR_RATE_TYPES`.

## Risque de régression / à surveiller

Aucun aujourd'hui (fonctionnalité non exploitée). À revalider si un jour un import RH ou un accès
API direct est ouvert (auquel cas ce ticket devient bloquant avant l'ouverture de ce nouveau
chemin).

## Références

- [BUG-261-02](261_02_hrrole_algokey_doublon_silencieusement_ignore.md) (même famille — gap de
  validation sur `algoKey`, celui-ci EST exploitable via l'UI actuelle)
- [BUG-260-02](260_02_hrsinkingrule_conditionattribute_jamais_saisi_builder.md)
