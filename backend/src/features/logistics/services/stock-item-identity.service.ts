import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ElementRef } from '../logistics.types';
import { canAdoptStockLevelByName } from '../stock-level-identity';

/**
 * Identité d'un article de stock (ADR-0006), conditionnement et application d'un delta à un niveau.
 */
@Injectable()
export class StockItemIdentityService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ─── Casse de pack / normalisation ───────────────────────────────────────────

  /**
   * Normalise un niveau (packed, loose) : un vrac négatif emprunte des packs
   * (packed −1, loose += unitsPerPack) tant que possible, puis clamp ≥ 0.
   * Le vrac excédentaire n'est jamais re-packé (le vrac reste du vrac).
   */
  normalizeLevel(packed: number, loose: number, unitsPerPack?: number | null) {
    const upp = unitsPerPack && unitsPerPack > 0 ? unitsPerPack : null;
    if (upp && loose < -1e-9 && packed > 0) {
      const needed = Math.ceil((-loose - 1e-9) / upp);
      const borrowed = Math.min(packed, needed);
      packed -= borrowed;
      loose += borrowed * upp;
    }
    if (packed < 0) packed = 0;
    if (loose < -1e-9) loose = 0;
    return { packed, loose: Math.round(loose * 100) / 100 };
  }

  /**
   * Applique un delta signé sur le StockLevel d'un (élément × item), avec casse de
   * pack. `strict` (mouvements manuels) : refuse un delta qui rendrait le niveau
   * négatif — sinon le clamp à 0 désynchroniserait ledger et niveaux (un transfert
   * depuis un élément vide créerait du stock ex nihilo sur la destination).
   */
  async applyLevelDelta(
    tx: Prisma.TransactionClient,
    tenantId: string,
    element: ElementRef,
    itemKey: string,
    packedDelta: number,
    looseDelta: number,
    unitsPerPack: number | null,
    marketPriceId: string | null,
    strict = false,
    // ADR-0006 (chantier 377) : identité stable résolue par l'appelant, écrite en double avec
    // itemKey — null si non résolue (n'écrase jamais une valeur déjà posée par un appel précédent).
    itemIdentity: { itemKind: string; itemRefId: string } | null = null,
  ) {
    // ADR-0006 (chantier 377, étape 5) : identité d'abord, nom en repli SEULEMENT s'il n'entre
    // pas en conflit avec une identité déjà posée — deux ordres de recherche différents selon
    // qu'on connaît ou non l'identité de l'article courant :
    //  1. itemIdentity connue → cherche par itemRefId (précis, insensible à un renommage) ; si
    //     absent, cherche par itemKey MAIS n'adopte la ligne trouvée que si elle est encore
    //     "libre" (itemRefId null, jamais rattachée — cas legacy à guérir) ou déjà rattachée à
    //     CETTE identité, ou si c'est une variante de prix du même produit (deux MarketPrice de
    //     même nom, cf. canAdoptStockLevelByName). Sinon c'est un vrai homonyme (même nom,
    //     article différent) : on ne la touche jamais, une nouvelle ligne est créée.
    //  2. itemIdentity inconnue (résolution échouée) → seul repli possible, comportement
    //     historique inchangé.
    let existing = itemIdentity
      ? await tx.stockLevel.findFirst({
          where: { tenantId, elementId: element.id, itemRefId: itemIdentity.itemRefId },
        })
      : null;
    if (!existing) {
      const byName = await tx.stockLevel.findUnique({
        where: { uniq_stock_level: { tenantId, elementId: element.id, itemKey } },
      });
      if (byName && canAdoptStockLevelByName(byName, itemIdentity)) {
        existing = byName;
      }
    }
    const upp = unitsPerPack ?? existing?.unitsPerPack ?? null;
    const rawPacked = (existing?.packedUnits ?? 0) + packedDelta;
    const rawLoose = (existing?.looseUnits ?? 0) + looseDelta;
    if (strict && (packedDelta < 0 || looseDelta < 0)) {
      const uppOrOne = upp && upp > 0 ? upp : null;
      const insufficient = uppOrOne
        ? rawPacked * uppOrOne + rawLoose < -1e-9 || rawPacked < 0
        : rawPacked < 0 || rawLoose < -1e-9;
      if (insufficient) {
        throw new BadRequestException(
          `Stock insuffisant sur « ${element.name} » pour « ${itemKey} » ` +
            `(disponible : ${existing?.packedUnits ?? 0} packs, ${existing?.looseUnits ?? 0} vrac)`,
        );
      }
    }
    const next = this.normalizeLevel(rawPacked, rawLoose, upp);
    if (existing) {
      return tx.stockLevel.update({
        where: { id: existing.id },
        data: {
          packedUnits: next.packed,
          looseUnits: next.loose,
          unitsPerPack: upp,
          marketPriceId: marketPriceId ?? existing.marketPriceId,
          itemKind: itemIdentity?.itemKind ?? existing.itemKind,
          itemRefId: itemIdentity?.itemRefId ?? existing.itemRefId,
          // Réaligne toujours sur le nom COURANT envoyé par l'appelant — no-op si la ligne a été
          // trouvée par itemKey (déjà égal), auto-guérison si trouvée par itemRefId (renommage).
          itemKey,
        },
      });
    }
    return tx.stockLevel.create({
      data: {
        tenantId,
        spaceId: element.spaceId,
        elementId: element.id,
        itemKey,
        packedUnits: next.packed,
        looseUnits: next.loose,
        unitsPerPack: upp,
        marketPriceId,
        itemKind: itemIdentity?.itemKind ?? null,
        itemRefId: itemIdentity?.itemRefId ?? null,
      },
    });
  }

  /**
   * Résout le pack size (unitsPerPack) d'une denrée par son `itemKey` (= nom du
   * référentiel), tous kinds confondus — miroir des sources utilisées par
   * `itemRefsForMenuItem` pour construire le référentiel `/stock` : MarketPrice
   * (ingredient), MenuComponent (component), MenuItem.inventoryNumberOfUnits
   * (product, readyForSale='Yes'). Sert de repli quand aucun `marketPriceId` n'est
   * fourni au mouvement — le seul cas où `createMovement` pouvait auparavant
   * apprendre `unitsPerPack` (BUG-033/049).
   */
  async resolveUnitsPerPackForItemKey(itemKey: string, tenantId: string): Promise<number | null> {
    const map = await this.resolveUnitsPerPackForItemKeys([itemKey], tenantId);
    return map.get(String(itemKey ?? '').trim()) ?? null;
  }

  /**
   * Version groupée de `resolveUnitsPerPackForItemKey` : trois requêtes pour tout le lot au lieu
   * de trois par nom. Même règle par nom (comparaison insensible à la casse) : la ligne
   * MarketPrice la plus ancienne si son packedUnits est renseigné, sinon le MenuComponent le
   * plus ancien, sinon `inventoryNumberOfUnits` du MenuItem le plus ancien. Plusieurs lignes
   * peuvent partager ce nom (pas de contrainte unique sur itemName/name) : tri déterministe
   * (BUG-133-02). Clés du résultat : noms tels que fournis, après trim.
   */
  async resolveUnitsPerPackForItemKeys(itemKeys: string[], tenantId: string): Promise<Map<string, number | null>> {
    const names = [...new Set(itemKeys.map((k) => String(k ?? '').trim()).filter(Boolean))];
    const result = new Map<string, number | null>();
    if (!names.length) return result;
    const insensitive = <F extends string>(field: F) =>
      names.map((n) => ({ [field]: { equals: n, mode: 'insensitive' as const } }));
    const [marketPrices, components, menuItems] = await Promise.all([
      this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null, OR: insensitive('itemName') },
        select: { itemName: true, packedUnits: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, deletedAt: null, OR: insensitive('name') },
        select: { name: true, packedUnits: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, OR: insensitive('name') },
        select: { name: true, inventoryNumberOfUnits: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    // Plus ancienne ligne correspondant au nom. Prisma traduit `equals` insensible à la casse en
    // ILIKE, où `%` et `_` sont des jokers (ex. « Heineken 0% 33cl » correspond à « Heineken 0%
    // - CAN 33CL ») : on reproduit exactement cette correspondance pour ne rien changer aux
    // résultats. Les rows arrivent déjà triées par createdAt croissant.
    const matcher = (name: string) => {
      if (!/[%_]/.test(name)) {
        const lower = name.toLowerCase();
        return (value: string) => value.toLowerCase() === lower;
      }
      const pattern = name
        .split('')
        .map((ch) => (ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('');
      const re = new RegExp(`^${pattern}$`, 'is');
      return (value: string) => re.test(value);
    };
    for (const name of names) {
      const matches = matcher(name);
      const mp = marketPrices.find((r) => matches(r.itemName));
      if (mp?.packedUnits) { result.set(name, mp.packedUnits); continue; }
      const comp = components.find((r) => matches(r.name));
      if (comp?.packedUnits) { result.set(name, comp.packedUnits); continue; }
      result.set(name, menuItems.find((r) => matches(r.name))?.inventoryNumberOfUnits ?? null);
    }
    return result;
  }

  /**
   * ADR-0006 (chantier 377) : plusieurs MarketPrice peuvent partager un `itemName` (aucune
   * contrainte unique sur ce nom, cf. ADR §diagnostic) — tie-break déterministe partagé par TOUS
   * les appelants qui doivent résoudre un nom vers une ligne MarketPrice (résolution d'identité
   * stock, référentiel catalogue) : la ligne la PLUS ANCIENNE gagne (`orderBy createdAt asc`,
   * premier gagne). Centralisé ici pour ne plus le réimplémenter par appelant — deux copies
   * distinctes de ce même tie-break avaient fini par diverger (l'une "premier gagne", l'autre
   * "dernier gagne"), provoquant un vrai mismatch d'itemRefId entre mouvement de transfert et
   * StockLevel existant sur le cas réel "Badiane" (deux MarketPrice homonymes, constaté le
   * 2026-08-27). Match EXACT (pas insensible à la casse), volontairement, comme le reste de la
   * résolution ADR-0006 : `itemKey`/`itemName` proviennent du nom copié verbatim par le
   * référentiel — les cas non résolus dégradent proprement chez l'appelant.
   */
  async resolveMarketPricesByName(
    names: string[],
    tenantId: string,
  ): Promise<
    Map<string, { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }>
  > {
    const map = new Map<
      string,
      { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }
    >();
    if (!names.length) return map;
    const rows = await this.prisma.marketPrice.findMany({
      where: { tenantId, deletedAt: null, itemName: { in: names } },
      select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const mp of rows) {
      const key = mp.itemName.trim();
      if (key && !map.has(key)) map.set(key, mp);
    }
    return map;
  }

  /**
   * ADR-0006 (chantier 377) — résout (itemKind, itemRefId) pour un lot de `itemKey` en une seule
   * passe batchée (1 requête par table candidate, pas 1 par nom) : double-écriture progressive
   * en remplacement d'`itemKey`, sans jamais bloquer l'écriture existante si la résolution échoue.
   * Priorité miroir de `itemRefsForMenuItem`/`resolveUnitsPerPackForItemKey`
   * (marketPrice > ingredient > packaging > menuComponent > menuItem).
   * Match EXACT (pas insensible à la casse) volontairement : `itemKey` provient historiquement du
   * nom copié verbatim au moment de la construction du référentiel — les cas non résolus dégradent
   * proprement (itemKind/itemRefId restent null, itemKey continue de fonctionner comme aujourd'hui).
   * Ne PAS dupliquer ici la comparaison insensible à la casse déjà présente ailleurs
   * (resolveUnitsPerPackForItemKey, getMarketPricesForItem) — le chantier prévoit de la consolider,
   * pas de l'étendre une 4e fois.
   */
  async resolveItemIdentitiesForKeys(
    itemKeys: string[],
    tenantId: string,
  ): Promise<Map<string, { itemKind: string; itemRefId: string }>> {
    const names = [...new Set(itemKeys.map((k) => String(k ?? '').trim()).filter(Boolean))];
    const result = new Map<string, { itemKind: string; itemRefId: string }>();
    if (!names.length) return result;

    // BUG-133-02 (même classe) : plusieurs lignes peuvent partager un nom (aucune table n'a de
    // contrainte unique sur son nom, cf. ADR-0006 §diagnostic) — tri déterministe pour ne plus
    // dépendre d'un ordre Postgres arbitraire. Sans ça, deux appels successifs peuvent résoudre
    // le même nom vers deux ids DIFFÉRENTS d'un appel à l'autre, ce que la garde anti-homonyme
    // d'`applyLevelDelta`/`reset()` interprète alors À TORT comme un vrai homonyme (constaté en
    // production le 2026-08-27 sur "Badiane", deux MarketPrice réels partageant ce nom).
    const [marketPricesByName, ingredients, packagings, components, menuItems] = await Promise.all([
      this.resolveMarketPricesByName(names, tenantId),
      this.prisma.ingredient.findMany({
        where: { tenantId, deletedAt: null, name: { in: names } },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.packaging.findMany({
        where: { tenantId, deletedAt: null, name: { in: names } },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, deletedAt: null, name: { in: names } },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, name: { in: names } },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const setIfAbsent = <T extends { id: string }>(rows: T[], kind: string, nameOf: (r: T) => string) => {
      for (const r of rows) {
        const key = nameOf(r).trim();
        if (key && !result.has(key)) result.set(key, { itemKind: kind, itemRefId: r.id });
      }
    };
    for (const [itemName, mp] of marketPricesByName) {
      if (!result.has(itemName)) result.set(itemName, { itemKind: 'marketPrice', itemRefId: mp.id });
    }
    setIfAbsent(ingredients, 'ingredient', (r) => r.name);
    setIfAbsent(packagings, 'packaging', (r) => r.name);
    setIfAbsent(components, 'menuComponent', (r) => r.name);
    setIfAbsent(menuItems, 'menuItem', (r) => r.name);
    return result;
  }

  async resolveItemIdentityForKey(
    itemKey: string,
    tenantId: string,
  ): Promise<{ itemKind: string; itemRefId: string } | null> {
    const map = await this.resolveItemIdentitiesForKeys([itemKey], tenantId);
    return map.get(String(itemKey ?? '').trim()) ?? null;
  }
}
