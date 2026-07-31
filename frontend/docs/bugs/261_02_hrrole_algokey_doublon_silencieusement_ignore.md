# BUG-261-02 — Deux HrRole avec le même algoKey : un des deux est silencieusement ignoré par le calcul de staffing

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : RH / Staffing
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31
- **Fichiers** : `backend/src/features/hr/hr.service.ts::normalizeRole` (aucune validation
  d'unicité), `backend/prisma/schema.prisma:618-640` (`HrRole`, aucune contrainte `@@unique` sur
  `algoKey`), `backend/src/features/staffing/staffing.service.ts:124-128` (`rolesByAlgo`, `Map`
  qui écrase silencieusement), `backend/src/features/staffing/staffing.service.ts:278-315`
  (`ALGO_COUNT_FIELDS`, consommateur de `rolesByAlgo`)

## Symptôme

Créer un deuxième `HrRole` avec un `algoKey` déjà utilisé par un rôle existant (ex. deux rôles
`algoKey=CAISSIER`) est accepté sans aucune erreur, ni au moment de la création, ni au moment de la
génération du staffing d'un événement. Un seul des deux rôles est effectivement utilisé pour
staffer TOUS les PDV du tenant — le choix se fait silencieusement, sans avertissement, et peut
changer d'un calcul à l'autre selon l'ordre de retour de la requête Prisma (ex. si le rôle "gagnant"
est modifié entretemps). Le rôle "perdant" reste visible et modifiable dans l'écran RH comme s'il
était opérationnel, alors qu'il n'est jamais consommé par aucun calcul.

**Conséquence concrète** : le coût prédit d'un événement peut être calculé avec le tarif horaire du
mauvais rôle (ex. rôle interne à 12€/h choisi au lieu du rôle Agence à 18€/h attendu), sans qu'aucun
signal n'alerte l'utilisateur — le nombre de postes reste correct (la formule par paliers n'est pas
affectée), seul le rôle/tarif utilisé pour les remplir est potentiellement le mauvais.

## Cause racine

`HrService.normalizeRole()` (`hr.service.ts`) valide `department`, `contractType`, `rateType`,
`fnbCategories` (dynamique, cf. BUG-260 et CFG-2 Étape 4.5) mais **jamais `algoKey`** — ni contre la
liste `ALGO_KEYS` (existence), ni contre les autres rôles du tenant (unicité). Aucune contrainte
`@@unique` en base (`Prisma.HrRole`) n'empêche non plus deux lignes de partager le même `algoKey`.

Au moment du calcul (`StaffingService.loadHrContext()`), `rolesByAlgo` est une `Map<string, any>`
construite par une simple boucle `for (const r of roles) { if (r.algoKey) rolesByAlgo.set(r.algoKey, r) }`
— une `Map.set()` sur une clé déjà présente écrase silencieusement l'entrée précédente. Aucun
contrôle de collision, aucun log, aucun warning.

Vérifié par script isolé (tenant jetable, nettoyé en fin de script) :
`svc.createRole({..., algoKey: 'CAISSIER'})` × 2 → les deux réussissent, `prisma.hrRole.findMany({ where: { algoKey: 'CAISSIER' } })` retourne bien 2 lignes.

## Correction

Non corrigée. Piste : ajouter dans `normalizeRole()` une vérification d'unicité (`algoKey` déjà
utilisé par un AUTRE rôle du même tenant → `BadRequestException`), même idiome que la contrainte
`@@unique([tenantId, name])` déjà existante sur le nom, complétée par `@@unique([tenantId, algoKey])`
en base (Postgres traite plusieurs `NULL` comme distincts, donc les rôles sans `algoKey` ne sont pas
gênés).

**Confirmé côté produit (Bertrand, 2026-07-31)** : le modèle « 1 rôle = 1 `algoKey` » est le bon —
l'hétérogénéité réelle (taux/fournisseur différents pour les N instances générées, ex. 10 caissiers
de sources différentes) n'est PAS censée se résoudre en créant plusieurs `HrRole` avec le même
`algoKey`, mais en ajustant chaque `EventStaffLine` généré individuellement (fournisseur/personne/
taux) dans Event Predict — mécanisme **déjà implémenté** (`StaffingService.patchLine()` +
`EventPredictStaffSection.vue`, champs `supplierType`/`supplierId`/`personId`/`hourlyRate`
éditables par ligne). Ça confirme qu'un blocage strict à la création (pas seulement un warning) est
la bonne direction — dupliquer le rôle n'a jamais été le bon outil pour ce besoin.

## Risque de régression / à surveiller

Avant de bloquer la création : vérifier qu'aucun tenant en production n'a déjà 2 rôles partageant
le même `algoKey` (auquel cas la migration/validation casserait leur sauvegarde future tant que le
doublon existant n'est pas résolu manuellement). Prévoir un script d'audit en lecture seule avant
tout fix bloquant.

## Références

- [BUG-260-02](260_02_hrsinkingrule_conditionattribute_jamais_saisi_builder.md) (même famille : gap
  de validation sur un champ de staffing avancé)
- [`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §7-8 (calcul par paliers, `ALGO_COUNT_FIELDS`)
