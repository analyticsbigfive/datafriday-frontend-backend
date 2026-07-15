// Migration v1 → Builder v2 (docs/REFONTE_3D_BUILDER_V2.md §6) — STRICTEMENT ADDITIVE.
//
// Ce que fait le script :
//   1. ZONES    : 1 Zone par (espace, kind, level) — union des niveaux de toutes les
//                 configs ; géométrie (cornerRadius, hole) extraite du JSON de la plus
//                 ancienne config utilisateur qui porte ce niveau.
//   2. ÉLÉMENTS : migration EN PLACE des SpaceElement v1 (floorId/forecourtId/
//                 externalMerchId) → zoneId. LES IDS NE CHANGENT JAMAIS (mappings
//                 Weezevent / MenuAssignment intacts). subtypes ← concat des 7 colonnes
//                 typées ; area ← attributes.area.
//   3. ADHÉSIONS: ConfigurationElement depuis configurationIds du JSON (convention v1
//                 « vide = toutes les configs » matérialisée) ∪ config propriétaire.
//   4. CAPACITÉS: recalcul serveur par config.
//
// Ce que le script NE fait PAS (garanties « sans toucher ») :
//   - ne modifie NI ne supprime Config.data (le builder v1 continue de lire) ;
//   - ne touche pas aux FK v1 (floorId…) — getSpaceShops exclut les éléments migrés
//     de ses branches v1 pour éviter le doublon ;
//   - ne touche pas aux espaces/éléments DÉJÀ v2 (zoneId non nul → ignoré) ;
//   - ne fusionne PAS les doublons hérités de la synchro v1 (rapport seulement).
//
// Usage :
//   DIRECT_URL=... node scripts/migrate-builder-v2.mjs                 # dry-run global
//   DIRECT_URL=... node scripts/migrate-builder-v2.mjs --space <id>    # dry-run un espace
//   DIRECT_URL=... node scripts/migrate-builder-v2.mjs --apply         # exécution
//
// Idempotent : relançable sans effet de bord (zones réutilisées, skipDuplicates).

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const spaceArgIdx = process.argv.indexOf('--space')
const ONLY_SPACE = spaceArgIdx !== -1 ? process.argv[spaceArgIdx + 1] : null

const url = process.env.DIRECT_URL
if (!url) {
  console.error('DIRECT_URL requis (connexion directe 5432, pas le pooler).')
  process.exit(1)
}
const prisma = new PrismaClient({ datasources: { db: { url } } })

const norm = (s) => String(s || '').toLowerCase().trim()

function subtypesOf(el) {
  return [
    ...(el.shopTypes || []), ...(el.storageTypes || []), ...(el.hospitalityTypes || []),
    ...(el.accessTypes || []), ...(el.entertainmentTypes || []), ...(el.entranceTypes || []),
    ...(el.kitchenTypes || []),
  ]
}

async function main() {
  console.log(`\n=== Migration builder v1 → v2 — mode ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`)

  // Espaces ayant une structure v1 (des Floors/Forecourt/ExternalMerch via leurs configs)
  const spaces = await prisma.space.findMany({
    where: {
      ...(ONLY_SPACE ? { id: ONLY_SPACE } : {}),
      configs: { some: { OR: [{ floors: { some: {} } }, { forecourt: { isNot: null } }, { externalMerch: { isNot: null } }] } },
    },
    select: { id: true, name: true, tenantId: true },
  })
  console.log(`${spaces.length} espace(s) avec structure v1 à examiner.\n`)

  const totals = { zonesCreated: 0, zonesReused: 0, elementsMigrated: 0, elementsSkipped: 0, memberships: 0, duplicates: 0 }

  for (const space of spaces) {
    const configs = await prisma.config.findMany({
      where: { spaceId: space.id },
      orderBy: [{ isSystem: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, isSystem: true, data: true, createdAt: true },
    })
    const configIdSet = new Set(configs.map((c) => c.id))
    const userConfigIds = configs.filter((c) => !c.isSystem).map((c) => c.id)

    // ── Index JSON : configurationIds par élément + géométrie par (kind, level) ──
    const jsonConfigIdsByElement = new Map() // elementId → Set(configId)
    const geometryByZoneKey = new Map() // `${kind}:${level}` → { name, geometry } (1re = plus ancienne user config)
    for (const config of configs) {
      const data = config.data || {}
      const collect = (elements) => {
        for (const el of elements || []) {
          if (!el?.id) continue
          const ids = Array.isArray(el.configurationIds) ? el.configurationIds : []
          const set = jsonConfigIdsByElement.get(el.id) || new Set()
          for (const id of ids) set.add(id)
          jsonConfigIdsByElement.set(el.id, set)
        }
      }
      for (const floor of data.floors || []) {
        const level = typeof floor.level === 'number' ? floor.level : 0
        const key = `FLOOR:${level}`
        if (!geometryByZoneKey.has(key) && !config.isSystem) {
          geometryByZoneKey.set(key, {
            name: floor.name,
            geometry: { cornerRadius: floor.cornerRadius || null, hole: floor.hole || null },
          })
        }
        collect(floor.elements)
      }
      if (data.forecourt) {
        if (!geometryByZoneKey.has('FORECOURT:0') && !config.isSystem) {
          geometryByZoneKey.set('FORECOURT:0', {
            name: data.forecourt.name,
            geometry: { cornerRadius: data.forecourt.cornerRadius || null, hole: null },
          })
        }
        collect(data.forecourt.elements)
      }
      if (data.externalMerch) {
        if (!geometryByZoneKey.has('EXTERNAL:0') && !config.isSystem) {
          geometryByZoneKey.set('EXTERNAL:0', {
            name: data.externalMerch.name,
            geometry: { cornerRadius: data.externalMerch.cornerRadius || null, hole: null },
          })
        }
        collect(data.externalMerch.elements)
      }
    }

    // ── Structure relationnelle v1 ──
    const floors = await prisma.floor.findMany({
      where: { config: { spaceId: space.id } },
      select: { id: true, configId: true, name: true, level: true, width: true, length: true, height: true },
      orderBy: { level: 'asc' },
    })
    const forecourts = await prisma.forecourt.findMany({
      where: { config: { spaceId: space.id } },
      select: { id: true, configId: true, name: true, width: true, length: true },
    })
    const externals = await prisma.externalMerch.findMany({
      where: { config: { spaceId: space.id } },
      select: { id: true, configId: true, name: true, width: true, length: true },
    })
    if (floors.length === 0 && forecourts.length === 0 && externals.length === 0) continue

    console.log(`── Espace « ${space.name} » (${space.id}) — ${configs.length} config(s), ${floors.length} floor(s) v1`)

    // ── 1. Zones à garantir ──
    const wantedZones = new Map() // key → { kind, level, name, width, length, height, geometry }
    for (const f of floors) {
      const key = `FLOOR:${f.level ?? 0}`
      if (!wantedZones.has(key)) {
        const meta = geometryByZoneKey.get(key)
        wantedZones.set(key, {
          kind: 'FLOOR', level: f.level ?? 0,
          name: meta?.name || f.name || (f.level === 0 ? 'RDC' : f.level < 0 ? `Sous-sol ${-f.level}` : `Étage ${f.level}`),
          width: f.width ?? 100, length: f.length ?? 100, height: f.height ?? 4,
          geometry: meta?.geometry || null,
        })
      }
    }
    if (forecourts.length > 0) {
      const meta = geometryByZoneKey.get('FORECOURT:0')
      wantedZones.set('FORECOURT:0', {
        kind: 'FORECOURT', level: 0, name: meta?.name || forecourts[0].name || 'Parvis',
        width: forecourts[0].width ?? 50, length: forecourts[0].length ?? 50, height: 0,
        geometry: meta?.geometry || null,
      })
    }
    if (externals.length > 0) {
      const meta = geometryByZoneKey.get('EXTERNAL:0')
      wantedZones.set('EXTERNAL:0', {
        kind: 'EXTERNAL', level: 0, name: meta?.name || externals[0].name || 'Espace externe',
        width: externals[0].width ?? 50, length: externals[0].length ?? 50, height: 0,
        geometry: meta?.geometry || null,
      })
    }

    const zoneIdByKey = new Map()
    for (const [key, z] of wantedZones) {
      const existing = await prisma.zone.findFirst({
        where: { spaceId: space.id, kind: z.kind, level: z.level },
        select: { id: true },
      })
      if (existing) {
        zoneIdByKey.set(key, existing.id)
        totals.zonesReused += 1
        console.log(`   zone RÉUTILISÉE  ${key} → ${existing.id}`)
      } else if (APPLY) {
        const created = await prisma.zone.create({
          data: {
            spaceId: space.id, kind: z.kind, level: z.level, name: z.name,
            width: z.width, length: z.length, height: z.height,
            geometry: z.geometry ?? undefined,
          },
        })
        zoneIdByKey.set(key, created.id)
        totals.zonesCreated += 1
        console.log(`   zone CRÉÉE       ${key} « ${z.name} » → ${created.id}`)
      } else {
        zoneIdByKey.set(key, `(dry:${key})`)
        totals.zonesCreated += 1
        console.log(`   zone À CRÉER     ${key} « ${z.name} » ${z.width}×${z.length} m${z.geometry?.hole?.enabled ? ' + hole' : ''}`)
      }
    }

    // ── 2 & 3. Éléments + adhésions ──
    const floorById = new Map(floors.map((f) => [f.id, f]))
    const forecourtIds = new Set(forecourts.map((f) => f.id))
    const externalIds = new Set(externals.map((f) => f.id))
    const forecourtOwner = new Map(forecourts.map((f) => [f.id, f.configId]))
    const externalOwner = new Map(externals.map((f) => [f.id, f.configId]))

    const elements = await prisma.spaceElement.findMany({
      where: {
        OR: [
          { floorId: { in: floors.map((f) => f.id) } },
          { forecourtId: { in: [...forecourtIds] } },
          { externalMerchId: { in: [...externalIds] } },
        ],
      },
    })

    const touchedConfigIds = new Set()
    const migratedForDupCheck = []

    for (const el of elements) {
      if (el.zoneId) {
        totals.elementsSkipped += 1
        continue // déjà migré / v2-natif — on ne touche pas
      }
      let zoneKey = null
      let ownerConfigId = null
      if (el.floorId && floorById.has(el.floorId)) {
        const f = floorById.get(el.floorId)
        zoneKey = `FLOOR:${f.level ?? 0}`
        ownerConfigId = f.configId
      } else if (el.forecourtId && forecourtIds.has(el.forecourtId)) {
        zoneKey = 'FORECOURT:0'
        ownerConfigId = forecourtOwner.get(el.forecourtId)
      } else if (el.externalMerchId && externalIds.has(el.externalMerchId)) {
        zoneKey = 'EXTERNAL:0'
        ownerConfigId = externalOwner.get(el.externalMerchId)
      }
      if (!zoneKey || !zoneIdByKey.has(zoneKey)) continue

      // Adhésions : JSON configurationIds ∩ configs valides, sinon TOUTES les configs
      // utilisateur (convention v1 « vide = partout »), toujours ∪ config propriétaire.
      const fromJson = [...(jsonConfigIdsByElement.get(el.id) || [])].filter((id) => configIdSet.has(id))
      const memberIds = new Set(fromJson.length > 0 ? fromJson : userConfigIds)
      if (ownerConfigId) memberIds.add(ownerConfigId)

      const newSubtypes = (el.subtypes || []).length > 0 ? el.subtypes : subtypesOf(el)
      const newArea = el.area ?? el.attributes?.area ?? null

      totals.elementsMigrated += 1
      totals.memberships += memberIds.size
      for (const id of memberIds) touchedConfigIds.add(id)
      migratedForDupCheck.push({ name: norm(el.name), type: el.type, zoneKey, id: el.id })

      if (APPLY) {
        await prisma.spaceElement.update({
          where: { id: el.id },
          data: { zoneId: zoneIdByKey.get(zoneKey), subtypes: newSubtypes, area: newArea },
        })
        await prisma.configurationElement.createMany({
          data: [...memberIds].map((configId) => ({ configId, elementId: el.id })),
          skipDuplicates: true,
        })
      } else {
        console.log(`   élément À MIGRER « ${el.name} » (${el.type}) → ${zoneKey} · ${memberIds.size} adhésion(s)`)
      }
    }

    // ── 4. Rapport doublons (PAS de fusion automatique — validation humaine) ──
    const groups = new Map()
    for (const m of migratedForDupCheck) {
      const key = `${m.name}|${m.type}|${m.zoneKey}`
      groups.set(key, [...(groups.get(key) || []), m.id])
    }
    for (const [key, ids] of groups) {
      if (ids.length > 1) {
        totals.duplicates += 1
        console.log(`   ⚠ DOUBLON SUSPECT (${key}) : ${ids.join(', ')} — héritage synchro v1, fusion à valider à la main`)
      }
    }

    // ── 5. Capacités ──
    if (APPLY && touchedConfigIds.size > 0) {
      const ids = [...touchedConfigIds]
      await prisma.$executeRaw`
        UPDATE "Config" c
        SET capacity = COALESCE((
          SELECT SUM(COALESCE(se.capacity, 0))::int
          FROM "ConfigurationElement" ce
          JOIN "SpaceElement" se ON se.id = ce."elementId"
          WHERE ce."configId" = c.id
        ), 0)
        WHERE c.id = ANY(${ids})
      `
    }
  }

  console.log(`\n=== Bilan ${APPLY ? '(APPLIQUÉ)' : '(dry-run — rien écrit)'} ===`)
  console.log(`   zones créées      : ${totals.zonesCreated}`)
  console.log(`   zones réutilisées : ${totals.zonesReused}`)
  console.log(`   éléments migrés   : ${totals.elementsMigrated}`)
  console.log(`   éléments ignorés (déjà v2) : ${totals.elementsSkipped}`)
  console.log(`   adhésions créées  : ${totals.memberships}`)
  console.log(`   doublons suspects : ${totals.duplicates}${totals.duplicates ? ' (rapport ci-dessus, aucune fusion faite)' : ''}`)
  if (!APPLY) console.log('\nRelancez avec --apply pour exécuter.')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
