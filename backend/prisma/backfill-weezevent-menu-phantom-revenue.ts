/// <reference types="node" />
/**
 * Backfill one-shot — corrige le CA fantôme des lignes "menu/formule" Weezevent.
 *
 * Cause : Weezevent envoie parfois, dans une même transaction, une ligne "menu/formule"
 * (ex. "MENU BURGER BOEUF FRITE BOISSONS") avec un unitPrice au prix catalogue plein MAIS
 * un `rawData.payments` vide — pendant que ses composants réels (ex. "BURGER BOEUF +
 * FRITES", "DEMI BIERE 25cl") portent chacun, dans la même transaction, un `payments` non
 * vide qui couvre déjà tout l'argent réellement encaissé. Toutes les requêtes d'agrégation
 * (SUM(unitPrice*quantity) sur WeezeventTransactionItem) comptaient alors deux fois le même
 * argent : une fois via la ligne menu, une fois via ses composants.
 *
 * Règle de correction, validée à 100% sur les transactions "mixtes" en base de prod (au
 * moins une ligne payée + au moins une ligne sans paiement propre dans la même transaction) :
 * quand au moins une ligne d'une transaction porte un `payments` non vide, les lignes SANS
 * `payments` propre ne représentent aucun encaissement réel et leur `unitPrice` stocké doit
 * être mis à 0 pour le calcul du CA (le prix catalogue reste lisible dans `rawData` pour
 * référence/affichage). Les transactions où AUCUNE ligne n'a de `payments` (paiement
 * cashless/badge non itemisé par Weezevent) restent inchangées — c'est le comportement
 * historique, déjà fiable à 99,998% sur ce sous-ensemble.
 *
 * Scope STRICT Weezevent : la requête de repérage des transactions "mixtes" filtre
 * explicitement sur le provider WEEZEVENT, même si l'ingestion Digifood
 * (digifood-ingestion.service.ts) n'écrit jamais de `payments` au niveau item et n'est de
 * toute façon jamais impactée par ce fix — défense en profondeur pour ne jamais toucher une
 * ligne Digifood par erreur.
 *
 * Perf : ne parcourt PAS les millions de SalesTransactionItem un par un. Une première requête
 * SQL brute (le même filtre que la validation manuelle) repère directement les transactions
 * "mixtes" ; seules celles-là sont ensuite chargées et corrigées.
 *
 * Sécurité — snapshot de rollback : avant la moindre écriture, l'état actuel (id, unitPrice
 * actuel, quantity) de CHAQUE ligne qui va être mise à 0 est écrit dans
 * prisma/backfill-snapshots/<horodatage>.json (jamais commité, cf. .gitignore). Aucune ligne
 * n'est modifiée tant que ce fichier n'est pas intégralement écrit sur disque. En cas de
 * problème après coup, rejouer EXACTEMENT ce fichier avec --restore annule la correction.
 *
 * Usage :
 *   npx tsx prisma/backfill-weezevent-menu-phantom-revenue.ts                    # dry-run
 *   npx tsx prisma/backfill-weezevent-menu-phantom-revenue.ts --apply            # écrit + snapshot
 *   npx tsx prisma/backfill-weezevent-menu-phantom-revenue.ts --restore <fichier> # annule un run --apply
 *
 * Idempotent (dry-run et --apply) : une ligne déjà à unitPrice=0 n'est jamais réécrite ni
 * comptée. Ré-exécutable sans risque. --restore, lui, réapplique l'ancien prix sans condition
 * (voir avertissement dans restoreFromSnapshot).
 *
 * ⚠️ Ne corrige QUE `SalesTransactionItem.unitPrice`. Les tables d'agrégation dérivées
 * (SpaceRevenueMinuteAgg, SpaceProductRevenueDailyAgg, SpaceRevenueMinuteItemAgg) doivent
 * être recalculées séparément après ce backfill (pipeline `aggregation.service.ts`) pour que
 * les écrans (Analyse, Live, Rapport J+1, EventPredict) reflètent la correction — et re-recalculées
 * de nouveau si jamais on doit revenir en arrière avec --restore.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const RESTORE_INDEX = process.argv.indexOf('--restore');
const RESTORE_FILE = RESTORE_INDEX !== -1 ? process.argv[RESTORE_INDEX + 1] : null;
const TX_BATCH_SIZE = 200;
const SNAPSHOT_DIR = path.join(__dirname, 'backfill-snapshots');

interface PaymentsShape {
  payments?: unknown;
}

interface SnapshotEntry {
  id: string;
  transactionId: string;
  productName: string | null;
  previousUnitPrice: string; // Decimal sérialisé en string, pas en number (précision financière)
  quantity: number;
}

function hasNonEmptyPayments(rawData: unknown): boolean {
  const payments = (rawData as PaymentsShape | null)?.payments;
  return Array.isArray(payments) && payments.length > 0;
}

async function findMixedTransactionIds(): Promise<string[]> {
  // Même filtre que la validation manuelle : transactions Weezevent où au moins une ligne
  // a un payments non vide ET au moins une autre ligne n'en a pas (les seules candidates au
  // double comptage — cf. règle documentée en tête de fichier).
  //
  // ⚠️ Jointure sur le nom de table PHYSIQUE "WeezeventIntegration", pas "Integration" (le nom
  // du modèle Prisma `Integration`, sans @@map, dans ce schema.prisma) : au 2026-09-03, la
  // migration de renommage n'est pas appliquée sur cette base (`_prisma_migrations` contient
  // des lignes "rename_merchant_element_to_location_shop"/"add_event_integrationid" avec
  // finished_at NULL — migration bloquée). Si cette migration passe un jour, remplacer par
  // "Integration" ici.
  const rows = await prisma.$queryRaw<{ transactionId: string }[]>(Prisma.sql`
    SELECT ti."transactionId"
    FROM "WeezeventTransactionItem" ti
    JOIN "WeezeventTransaction" t ON t.id = ti."transactionId"
    JOIN "WeezeventIntegration" i ON i.id = t."integrationId" AND i.provider = 'WEEZEVENT'
    GROUP BY ti."transactionId"
    HAVING
      bool_or(jsonb_array_length(COALESCE(ti."rawData"->'payments', '[]'::jsonb)) > 0)
      AND bool_and(jsonb_array_length(COALESCE(ti."rawData"->'payments', '[]'::jsonb)) > 0) = false
  `);
  return rows.map((r) => r.transactionId);
}

async function restoreFromSnapshot(filePath: string) {
  console.log(`♻️  Restauration depuis ${filePath}`);
  const entries: SnapshotEntry[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`ℹ️  ${entries.length} ligne(s) à restaurer`);

  // ⚠️ Restauration inconditionnelle : ne vérifie pas que la ligne vaut encore 0 (elle a pu
  // être retouchée entre-temps par une resynchro Weezevent normale, auquel cas ce restore
  // écraserait cette valeur plus récente). À n'utiliser que pour annuler CE backfill, dans la
  // foulée, avant toute nouvelle synchro sur les transactions concernées.
  for (let i = 0; i < entries.length; i += TX_BATCH_SIZE) {
    const batch = entries.slice(i, i + TX_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((e) =>
        prisma.salesTransactionItem.update({
          where: { id: e.id },
          data: { unitPrice: new Prisma.Decimal(e.previousUnitPrice) },
        }),
      ),
    );
    console.log(`… ${Math.min(i + TX_BATCH_SIZE, entries.length)}/${entries.length} restaurée(s)`);
  }
  console.log('✅ Restauration terminée. Penser à relancer aggregation.service.ts.');
}

async function main() {
  if (RESTORE_FILE) {
    await restoreFromSnapshot(path.isAbsolute(RESTORE_FILE) ? RESTORE_FILE : path.join(process.cwd(), RESTORE_FILE));
    return;
  }

  console.log(`🔧 Backfill CA fantôme menus Weezevent — début (${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  const mixedTransactionIds = await findMixedTransactionIds();
  console.log(`ℹ️  ${mixedTransactionIds.length} transaction(s) Weezevent "mixte(s)" repérée(s) (Digifood exclu explicitement)`);

  if (mixedTransactionIds.length === 0) {
    console.log('✅ Rien à corriger.');
    return;
  }

  // ── Phase 1 : calcul pur, aucune écriture — on rassemble TOUT avant d'écrire quoi que ce
  // soit, pour pouvoir figer un snapshot complet avant la première mutation.
  let mixedTx = 0;
  const toZero: { id: string; transactionId: string; productName: string | null; unitPrice: Prisma.Decimal; quantity: number }[] = [];

  for (let i = 0; i < mixedTransactionIds.length; i += TX_BATCH_SIZE) {
    const batchIds = mixedTransactionIds.slice(i, i + TX_BATCH_SIZE);
    const items = await prisma.salesTransactionItem.findMany({
      where: { transactionId: { in: batchIds } },
      select: { id: true, transactionId: true, productName: true, unitPrice: true, quantity: true, rawData: true },
    });

    const itemsByTx = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByTx.get(item.transactionId) ?? [];
      list.push(item);
      itemsByTx.set(item.transactionId, list);
    }

    for (const [, txItems] of itemsByTx) {
      const anyHasPayment = txItems.some((it) => hasNonEmptyPayments(it.rawData));
      if (!anyHasPayment) continue; // ne devrait pas arriver ici vu le pré-filtre SQL, garde défensive
      const txToZero = txItems.filter((it) => !hasNonEmptyPayments(it.rawData) && !it.unitPrice.isZero());
      if (txToZero.length === 0) continue;
      mixedTx++;
      toZero.push(...txToZero);
    }

    console.log(`… repérage ${Math.min(i + TX_BATCH_SIZE, mixedTransactionIds.length)}/${mixedTransactionIds.length} transaction(s) candidates`);
  }

  const phantomRevenueEuros = toZero.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));

  console.log(`ℹ️  ${mixedTx} transaction(s) "mixtes" affectées par le bug`);
  console.log(`ℹ️  ${toZero.length} ligne(s) ${APPLY ? 'à corriger' : 'détectée(s)'}`);
  console.log(`ℹ️  CA fantôme détecté : ${phantomRevenueEuros.toFixed(2)} €`);

  if (!APPLY) {
    console.log('✅ Dry-run terminé. Relancer avec --apply pour écrire en base.');
    return;
  }

  if (toZero.length === 0) {
    console.log('✅ Rien à écrire.');
    return;
  }

  // ── Phase 2 : snapshot AVANT toute écriture ────────────────────────────────
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snapshotPath = path.join(SNAPSHOT_DIR, `weezevent-menu-phantom-revenue-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const snapshot: SnapshotEntry[] = toZero.map((item) => ({
    id: item.id,
    transactionId: item.transactionId,
    productName: item.productName,
    previousUnitPrice: item.unitPrice.toString(),
    quantity: item.quantity,
  }));
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`💾 Snapshot de rollback écrit : ${snapshotPath} (${snapshot.length} ligne(s))`);

  // ── Phase 3 : écriture réelle, seulement une fois le snapshot sur disque ──
  for (let i = 0; i < toZero.length; i += TX_BATCH_SIZE) {
    const batch = toZero.slice(i, i + TX_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.salesTransactionItem.update({
          where: { id: item.id },
          data: { unitPrice: new Prisma.Decimal(0) },
        }),
      ),
    );
    console.log(`… ${Math.min(i + TX_BATCH_SIZE, toZero.length)}/${toZero.length} ligne(s) corrigée(s)`);
  }

  console.log(`✅ Backfill terminé. ${toZero.length} ligne(s) corrigée(s), ${phantomRevenueEuros.toFixed(2)} € de CA fantôme retiré.`);
  console.log(`   Rollback si besoin : npx tsx prisma/backfill-weezevent-menu-phantom-revenue.ts --restore "${snapshotPath}"`);
  console.log('   Penser à relancer aggregation.service.ts sur la période concernée pour rafraîchir les écrans.');
}

main()
  .catch((e) => {
    console.error('❌ Backfill CA fantôme menus Weezevent — échec', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
