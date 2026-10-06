/**
 * Ventes faites DEPUIS un comptage, retirées avant l'envoi vers Logistic.
 *
 * Les comptages partent vers Logistic regroupés à la minute (document Bertrand « Pre et
 * Post event Inventory cycle », 2026-10-06, D22). Le recalage pose le niveau compté à
 * l'heure de l'ENVOI : sans correction, les ventes de l'article sur ce PDV entre le
 * comptage et l'envoi disparaissaient du registre (stock affiché trop haut). On envoie
 * donc « compté − vendu depuis le comptage ».
 *
 * Les heures de comptage sont regroupées par tranches de BUCKET_MS par PDV (une requête de
 * ventes par tranche, au plus MAX_ROUNDS) : l'écart résiduel est au plus d'une tranche.
 */

export interface PushLine {
  elementId: string;
  itemKey: string;
  itemRefId: string;
  countedPacked: number;
  countedLoose: number;
}

export interface ConsumptionLine {
  elementId: string;
  itemKey: string;
  quantity: number;
  itemRefId?: string | null;
}

const BUCKET_MS = 10 * 1000;
const MAX_ROUNDS = 6;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function subtractSalesSinceCount<T extends PushLine>(
  lines: T[],
  countedAtOf: (line: T) => Date | null,
  deps: {
    /** Ventes postérieures à l'instant donné, pour les seuls PDV de la carte. */
    consumption: (sinceByElement: Map<string, Date>) => Promise<ConsumptionLine[]>;
    unitsPerPack: Map<string, number>;
    normalize: (v: unknown) => string;
  },
): Promise<{ lines: T[]; adjusted: number; soldUnits: number }> {
  // Tranches d'heure de comptage par PDV, de la plus ancienne à la plus récente.
  const bucketsByElement = new Map<string, Array<{ since: Date; lines: T[] }>>();
  for (const line of lines) {
    const at = countedAtOf(line);
    if (!at) continue;
    const key = Math.floor(at.getTime() / BUCKET_MS);
    const buckets = bucketsByElement.get(line.elementId) ?? [];
    let bucket = buckets.find((b) => Math.floor(b.since.getTime() / BUCKET_MS) === key);
    if (!bucket) {
      bucket = { since: at, lines: [] };
      buckets.push(bucket);
    }
    if (at < bucket.since) bucket.since = at;
    bucket.lines.push(line);
    bucketsByElement.set(line.elementId, buckets);
  }
  for (const buckets of bucketsByElement.values()) {
    buckets.sort((a, b) => a.since.getTime() - b.since.getTime());
    // Au-delà de MAX_ROUNDS tranches : les plus récentes rejoignent la dernière tranche gardée.
    while (buckets.length > MAX_ROUNDS) {
      const extra = buckets.pop()!;
      buckets[buckets.length - 1].lines.push(...extra.lines);
    }
  }

  const soldByLine = new Map<T, number>();
  const rounds = Math.max(0, ...[...bucketsByElement.values()].map((b) => b.length));
  for (let r = 0; r < rounds; r++) {
    const sinceByElement = new Map<string, Date>();
    for (const [elementId, buckets] of bucketsByElement) {
      if (buckets[r]) sinceByElement.set(elementId, buckets[r].since);
    }
    const sold = await deps.consumption(sinceByElement);
    if (!sold.length) continue;
    for (const [elementId, buckets] of bucketsByElement) {
      const bucket = buckets[r];
      if (!bucket) continue;
      for (const line of bucket.lines) {
        const wanted = deps.normalize(line.itemKey);
        const qty = sold
          .filter(
            (c) =>
              c.elementId === elementId &&
              ((c.itemRefId && c.itemRefId === line.itemRefId) || deps.normalize(c.itemKey) === wanted),
          )
          .reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
        if (qty > 0) soldByLine.set(line, qty);
      }
    }
  }

  let adjusted = 0;
  let soldUnits = 0;
  const out = lines.map((line) => {
    const sold = soldByLine.get(line);
    if (!sold) return line;
    adjusted += 1;
    soldUnits += sold;
    let packed = line.countedPacked;
    let loose = round2(line.countedLoose - sold);
    const upp = deps.unitsPerPack.get(line.itemRefId);
    // Vrac négatif : on entame les colis quand le conditionnement est connu ; sinon (ou
    // plus rien à entamer) le vrac reste à 0, jamais un stock négatif.
    while (loose < 0 && upp && packed > 0) {
      packed -= 1;
      loose = round2(loose + upp);
    }
    if (loose < 0) loose = 0;
    return { ...line, countedPacked: packed, countedLoose: loose };
  });
  return { lines: out, adjusted, soldUnits: round2(soldUnits) };
}
