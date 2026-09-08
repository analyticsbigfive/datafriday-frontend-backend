import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomInt } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AuditService } from '../../core/audit/audit.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { InventoryService } from '../inventory/inventory.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { MarketPricesService } from '../market-prices/market-prices.service';
import { MenuComponentsService } from '../menu-components/menu-components.service';
import { CreateWindowDto } from './dto/create-window.dto';
import { SaveGuestCountDto } from './dto/save-guest-count.dto';
import type { GuestPinUser } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';

const PIN_LOGIN_MAX_ATTEMPTS = 8;
const PIN_LOGIN_WINDOW_SECONDS = 15 * 60;
const PIN_GENERATION_MAX_RETRIES = 5;

export type GuestLoginResult =
  | {
      state: 'ok';
      token: string;
      phase: string;
      spaceId: string;
      spaceName: string | null;
      elementId: string;
      elementName: string | null;
      eventId: string;
    }
  // PIN qui ne correspond pas au PIN partagé de la fenêtre ouverte pour ce PDV —
  // l'écran "Code PIN incorrect" des maquettes (distinct de 'inactive' : ce dernier
  // couvre l'absence de fenêtre ouverte/de PIN généré, PAS comparé, donc jamais
  // compté dans le rate-limit).
  | { state: 'not_found'; attemptsRemaining: number }
  | { state: 'inactive' }
  | { state: 'locked'; retryAfter: number };

export interface GuestPinPublicContext {
  elementName: string | null;
  /** Une fenêtre "open" a une ligne GuestPinAccess active pour ce PDV+phase. */
  active: boolean;
}

@Injectable()
export class GuestPinAccessService {
  private readonly logger = new Logger(GuestPinAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly inventoryService: InventoryService,
    private readonly menuItems: MenuItemsService,
    private readonly marketPrices: MarketPricesService,
    private readonly menuComponents: MenuComponentsService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly configService: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** STAFF/VIEWER limités à leurs espaces accordés (SpaceAccessGuard ne s'applique
   *  pas ici : les routes directeur n'exposent spaceId que sur certaines d'entre
   *  elles). Même règle que SpaceAccessGuard, appliquée manuellement. */
  private async assertSpaceAccess(user: CurrentUserData, spaceId: string): Promise<void> {
    const allowed = await this.spaceAccess.canAccessSpace(user, spaceId);
    if (!allowed) {
      throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
    }
  }

  private hashPin(pin: string): string {
    const secret = this.configService.getOrThrow<string>('GUEST_PIN_HMAC_SECRET');
    return createHmac('sha256', secret).update(pin).digest('hex');
  }

  private hashDeviceId(deviceId: string): string {
    return createHash('sha256').update(deviceId).digest('hex');
  }

  private rateLimitKey(ip: string): string {
    return `guestpin:login-fail:${ip}`;
  }

  /** Select minimal pour résoudre le spaceId d'un SpaceElement (builder v1 : floor/
   *  forecourt/externalMerch ; builder v2 : zone) — copie volontaire de
   *  SpaceMenusService.resolveShopSpaceId (privée), même justification que
   *  resolveShopConfigId ci-dessous : ne pas toucher space-menus.service.ts pour un
   *  besoin invité. */
  private readonly elementSpaceSelect = {
    id: true,
    name: true,
    floor: { select: { config: { select: { spaceId: true } } } },
    forecourt: { select: { config: { select: { spaceId: true } } } },
    externalMerch: { select: { config: { select: { spaceId: true } } } },
    zone: { select: { spaceId: true } },
  } as const;

  /** Résout le PDV depuis le slug scanné + son spaceId — nécessaire pour trouver LA
   *  fenêtre ouverte de son espace (le PIN n'identifie plus le PDV, cf. login ci-dessous,
   *  seul le slug de l'URL le fait désormais). */
  private async resolveElementBySlug(
    slug: string,
  ): Promise<{ id: string; name: string; spaceId: string | null } | null> {
    const element = await this.prisma.spaceElement.findUnique({
      where: { slug },
      select: this.elementSpaceSelect,
    });
    if (!element) return null;
    const el = element as any;
    const config = el.floor?.config ?? el.forecourt?.config ?? el.externalMerch?.config ?? null;
    const spaceId = config?.spaceId ?? el.zone?.spaceId ?? null;
    return { id: el.id, name: el.name, spaceId };
  }

  // ── Invité : contexte public (avant PIN) ────────────────────────────────────

  /**
   * Résout le PDV depuis l'URL scannée (/login/pin/:slug), SANS PIN : nom à afficher
   * avant saisie, et si une fenêtre (pré OU post, peu importe laquelle) est active
   * pour ce PDV (permet d'afficher "Accès inactif" immédiatement plutôt que d'attendre
   * une tentative de PIN). Ne révèle jamais le PIN ni son statut détaillé.
   *
   * UN SEUL lien par PDV (décision produit 2026-09-08) : le même QR sert avant ET après
   * l'événement — en pratique jamais les deux fenêtres ouvertes en même temps (le
   * directeur clôture le pré-event avant d'ouvrir le post-event), donc la phase se
   * déduit de LA fenêtre actuellement ouverte, pas de l'URL.
   */
  async getPublicContext(slug: string): Promise<GuestPinPublicContext> {
    const element = await this.resolveElementBySlug(slug);
    if (!element || !element.spaceId) return { elementName: element?.name ?? null, active: false };

    const window = await this.prisma.inventoryWindow.findFirst({
      where: { spaceId: element.spaceId, status: 'open' },
      select: { id: true, pinLookupHash: true },
    });
    if (!window || !window.pinLookupHash) return { elementName: element.name, active: false };

    // Ce PDV précis a pu être révoqué individuellement — la fenêtre reste ouverte
    // pour les autres, mais l'écran de connexion doit refléter SON statut à lui.
    const access = await this.prisma.guestPinAccess.findUnique({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId: element.id } },
      select: { status: true },
    });
    const active = !access || access.status === 'active';
    return { elementName: element.name, active };
  }

  // ── Invité : login ───────────────────────────────────────────────────────────

  /**
   * UN SEUL PIN pour TOUS les PDV d'une fenêtre (décision produit 2026-09-08, revenue
   * sur "un PIN par PDV") : le PIN ne fait plus qu'authentifier "cette personne
   * connaît le code de la fenêtre" — c'est le SLUG de l'URL scannée qui détermine
   * QUEL PDV elle obtient. La ligne GuestPinAccess (suivi par PDV) est désormais
   * auto-créée ici au premier login réussi, plus provisionnée à l'avance par le
   * directeur (il n'y a plus rien à "générer" par PDV).
   */
  async login(
    pin: string,
    deviceId: string | undefined,
    ip: string,
    slug: string,
  ): Promise<GuestLoginResult> {
    const rlKey = this.rateLimitKey(ip);
    const attempts = await this.redis.get<number>(rlKey);
    if ((attempts ?? 0) >= PIN_LOGIN_MAX_ATTEMPTS) {
      const retryAfter = await this.redis.ttl(rlKey);
      return { state: 'locked', retryAfter: Math.max(retryAfter, 1) };
    }

    const element = await this.resolveElementBySlug(slug);
    const window = element?.spaceId
      ? await this.prisma.inventoryWindow.findFirst({ where: { spaceId: element.spaceId, status: 'open' } })
      : null;

    // PDV inconnu, pas de fenêtre ouverte pour son espace, ou fenêtre sans PIN encore
    // généré — même écran "Accès inactif" (déjà annoncé par getPublicContext avant
    // toute saisie). Pas de compteur d'échec ici : rien à brute-forcer, aucun PIN
    // n'est comparé.
    if (!element || !window || !window.pinLookupHash) {
      return { state: 'inactive' };
    }
    // `window` n'a été résolu que quand `element.spaceId` était non-null (ligne
    // ci-dessus) — TS ne le déduit pas à travers deux variables distinctes.
    const spaceId = element.spaceId as string;

    if (this.hashPin(pin) !== window.pinLookupHash) {
      const count = await this.registerLoginFailure(rlKey);
      return { state: 'not_found', attemptsRemaining: Math.max(PIN_LOGIN_MAX_ATTEMPTS - count, 0) };
    }

    let access = await this.prisma.guestPinAccess.findUnique({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId: element.id } },
    });
    // Ce PDV précis a été révoqué par le directeur — le PIN partagé reste valide
    // pour les AUTRES PDV, mais pas pour celui-ci.
    if (access && access.status !== 'active') {
      return { state: 'inactive' };
    }
    if (!access) {
      access = await this.prisma.guestPinAccess.create({
        data: {
          tenantId: window.tenantId,
          windowId: window.id,
          spaceId,
          elementId: element.id,
          status: 'active',
        },
      });
    }

    const [space, eventRow] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
      this.prisma.event.findUnique({ where: { id: window.eventId }, select: { id: true } }),
    ]);

    // Décision produit 2026-09-08 : le PIN seul donne l'accès, pas de restriction à un
    // seul appareil. boundDeviceHash/boundAt sont écrasés à CHAQUE login réussi
    // ("dernière connexion vue"), diagnostic uniquement — jamais comparés/rejetés.
    const deviceHash = deviceId ? this.hashDeviceId(deviceId) : null;
    await this.prisma.guestPinAccess.update({
      where: { id: access.id },
      data: {
        boundDeviceHash: deviceHash,
        boundAt: new Date(),
        lastLoginAt: new Date(),
      },
    });

    const token = await this.jwt.signAsync(
      { sub: access.id },
      {
        secret: this.configService.getOrThrow<string>('GUEST_PIN_JWT_SECRET'),
        expiresIn: this.configService.get<string>('GUEST_PIN_JWT_TTL') || '1d',
      },
    );

    return {
      state: 'ok',
      token,
      phase: window.phase,
      spaceId,
      spaceName: space?.name ?? null,
      elementId: element.id,
      elementName: element.name,
      eventId: eventRow?.id ?? window.eventId,
    };
  }

  private async registerLoginFailure(rlKey: string): Promise<number> {
    const count = await this.redis.incr(rlKey);
    if (count === 1) {
      await this.redis.expire(rlKey, PIN_LOGIN_WINDOW_SECONDS);
    }
    return count;
  }

  // ── Invité : session / inventaire ───────────────────────────────────────────

  async getSession(user: GuestPinUser) {
    const [space, element] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: user.spaceId }, select: { name: true } }),
      this.prisma.spaceElement.findUnique({ where: { id: user.elementId }, select: { name: true } }),
    ]);
    return {
      phase: user.phase,
      spaceId: user.spaceId,
      spaceName: space?.name ?? null,
      elementId: user.elementId,
      elementName: element?.name ?? null,
      eventId: user.eventId,
      showExpected: user.showExpected,
      submittedAt: user.submittedAt,
      validatedAt: user.validatedAt,
    };
  }

  /** Comptages déjà sauvegardés pour le PDV de l'invité, keyés par itemId — le
   *  catalogue (quels items existent) vient désormais de `getCatalog` (même
   *  algorithme que le staff), plus de ce endpoint. */
  async getInventory(user: GuestPinUser) {
    const merged = await this.inventoryService.getBySpaceAndEvent(
      user.spaceId,
      user.eventId,
      user.tenantId,
      user.phase as 'pre-event' | 'post-event',
    );
    const blob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    return { elementId: user.elementId, savedCounts: blob[user.elementId] ?? {} };
  }

  /**
   * Config effective d'un PDV — copie volontaire de
   * SpaceMenusService.resolveShopConfigId (privée, non exportée) : configId
   * explicite (l'événement de l'invité) > config du parent v1 > première
   * adhésion v2. Dupliquer ces ~5 lignes plutôt que toucher space-menus.service.ts
   * (fichier dense, chargé d'historique de bugs staff) pour un besoin invité.
   */
  private resolveShopConfigId(
    shop: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string | null,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config;
    return v1Config?.id ?? shop.configurationElements?.[0]?.configId ?? null;
  }

  /** Items menu ACTIVÉS pour ce PDV, dans la config de l'événement réellement
   *  ouvert — même résolution que SpaceMenusService.getShopInventory (shop +
   *  menuAssignments filtrées par configId+enabled), extraite ici pour ne
   *  renvoyer que les ids (le catalogue complet vient de getRecipes ensuite). */
  private async getEnabledMenuItemIds(elementId: string, explicitConfigId?: string | null) {
    const shop = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      select: {
        name: true,
        floor: { select: { config: { select: { id: true } } } },
        forecourt: { select: { config: { select: { id: true } } } },
        externalMerch: { select: { config: { select: { id: true } } } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    });
    if (!shop) return { elementName: null, enabledIds: [] as string[] };
    const effectiveConfigId = this.resolveShopConfigId(shop as any, explicitConfigId);
    const enabledIds = [
      ...new Set<string>(
        ((shop as any).menuAssignments ?? [])
          .filter((a: any) => (a.configId ?? null) === effectiveConfigId && a.enabled)
          .map((a: any) => String(a.menuItemId)),
      ),
    ];
    return { elementName: shop.name, enabledIds };
  }

  /**
   * Catalogue du PDV de l'invité — MÊMES données brutes que le staff, pour que
   * le front appelle la MÊME fonction `buildConsolidatedInventory` (pas de
   * resucée de l'explosion combo/BOM côté backend) :
   *  - `availableMenuItems` : items activés sur ce PDV dans la config de
   *    l'événement ouvert (mêmes champs que /menu-items/recipes = `menuItem.components`
   *    fusionné ingrédients+composants+packaging, format identique à ce que le
   *    staff obtient de /menu-items + normalizeMenuItem, cf. buildRecipeComponents).
   *  - `allMenuItemsData` : catalogue COMPLET du tenant (mêmes champs), nécessaire
   *    à la récursion combo (un constituant peut ne pas être lui-même assigné à ce PDV).
   *  - `marketPrices` / `components` : catalogues tenant bruts, mêmes endpoints que
   *    ceux que le staff charge (aucune transformation supplémentaire).
   */
  async getCatalog(user: GuestPinUser) {
    const event = await this.prisma.event.findUnique({
      where: { id: user.eventId },
      select: { configurationId: true },
    });
    const { elementName, enabledIds } = await this.getEnabledMenuItemIds(
      user.elementId,
      event?.configurationId,
    );

    // getRecipes([]) = catalogue ENTIER du tenant (pas de filtre `id`, cf.
    // menu-items.service.ts::getRecipes) — jamais l'appeler avec `enabledIds` vide
    // en pensant obtenir "aucun item", ça renverrait l'inverse.
    const [availableRecipes, allRecipes, marketPricesPage, componentsPage] = await Promise.all([
      enabledIds.length
        ? this.menuItems.getRecipes(enabledIds, user.tenantId)
        : Promise.resolve({ items: [], suppliers: [] }),
      this.menuItems.getRecipes([], user.tenantId),
      this.marketPrices.findAll(user.tenantId, 1, 5000),
      this.menuComponents.findAll(user.tenantId, 1, 5000),
    ]);

    return {
      elementName,
      availableMenuItems: availableRecipes.items,
      allMenuItemsData: allRecipes.items,
      marketPrices: marketPricesPage.data,
      components: componentsPage.data,
    };
  }

  // Décision produit 2026-09-08 : toujours montré, pas d'option — `showExpected`
  // (InventoryWindow) n'est plus lu ici (le champ reste en base, juste plus vérifié).
  async getBaseline(user: GuestPinUser) {
    const baseline =
      user.phase === 'pre-event'
        ? await this.inventoryService.getPreEventBaseline(user.spaceId, user.eventId, user.tenantId)
        : await this.inventoryService.getPostEventBaseline(user.spaceId, user.eventId, user.tenantId);
    const expectedBlob = (baseline?.expected ?? {}) as Record<string, unknown>;
    return {
      ...baseline,
      expected: { [user.elementId]: expectedBlob[user.elementId] ?? {} },
    };
  }

  async saveCount(user: GuestPinUser, dto: SaveGuestCountDto) {
    // Seul le DIRECTEUR verrouille (validateAccess) — `submittedAt` n'est qu'un
    // signal ("prêt à vérifier"), pas un verrou (décision produit 2026-09-08,
    // revenue sur le gel immédiat initial).
    if (user.validatedAt) {
      throw new ForbiddenException(
        'Comptage validé par le directeur de site — lecture seule. Contacte-le pour une correction.',
      );
    }
    const result = await this.inventoryService.saveInventoryCounts(
      {
        spaceId: user.spaceId,
        eventId: user.eventId,
        shopId: user.elementId,
        itemId: dto.itemId,
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation,
        countingStatus: dto.countingStatus,
      },
      user.tenantId,
      undefined,
    );
    // Modifier après avoir dit "J'ai terminé" mais AVANT validation directeur =
    // ce n'était pas fini : on réarme le signal pour ne pas laisser le directeur
    // valider des chiffres que le manager est justement en train de changer.
    if (user.submittedAt) {
      await this.prisma.guestPinAccess.update({
        where: { id: user.id },
        data: { submittedAt: null },
      });
    }
    return result;
  }

  /**
   * "J'ai terminé" : signale au directeur que ce PDV est prêt à être vérifié —
   * NE verrouille PAS (le manager reste modifiable, cf. saveCount qui réarme ce
   * flag sur toute nouvelle écriture). Le vrai verrou est `validateAccess`
   * (directeur). Idempotent (submittedAt déjà posé → no-op) ; no-op aussi si déjà
   * validé (rien à re-signaler, `saveCount` refuse déjà l'écriture dans ce cas).
   */
  async submitCount(user: GuestPinUser) {
    if (user.validatedAt) return { submittedAt: user.submittedAt, validatedAt: user.validatedAt };
    if (user.submittedAt) return { submittedAt: user.submittedAt, validatedAt: null };
    const access = await this.prisma.guestPinAccess.update({
      where: { id: user.id },
      data: { submittedAt: new Date() },
      select: { submittedAt: true, validatedAt: true },
    });
    return access;
  }

  // ── Directeur : gestion des fenêtres et des PIN ─────────────────────────────

  async createOrReopenWindow(dto: CreateWindowDto, user: CurrentUserData) {
    await this.assertSpaceAccess(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.upsert({
      where: {
        uniq_inventory_window: {
          tenantId,
          spaceId: dto.spaceId,
          eventId: dto.eventId,
          phase: dto.phase,
        },
      },
      create: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId,
        phase: dto.phase,
        showExpected: dto.showExpected ?? false,
        openedBy: actorUserId,
      },
      update: {
        status: 'open',
        showExpected: dto.showExpected ?? false,
        openedAt: new Date(),
        openedBy: actorUserId,
        closedAt: null,
        closedBy: null,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'CREATE',
      entity: 'InventoryWindow',
      entityId: window.id,
      metadata: { spaceId: dto.spaceId, eventId: dto.eventId, phase: dto.phase },
    });

    return window;
  }

  async getStatusBoard(spaceId: string, eventId: string, user: CurrentUserData) {
    await this.assertSpaceAccess(user, spaceId);
    const windows = await this.prisma.inventoryWindow.findMany({
      where: { tenantId: user.tenantId!, spaceId, eventId },
      include: { guestAccesses: true },
      orderBy: { phase: 'asc' },
    });

    const elementIds = windows.flatMap((w) => w.guestAccesses.map((a) => a.elementId));
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIds } },
          select: { id: true, name: true },
        })
      : [];
    const elementNameById = new Map(elements.map((e) => [e.id, e.name]));

    return windows.map((w) => ({
      id: w.id,
      phase: w.phase,
      status: w.status,
      showExpected: w.showExpected,
      openedAt: w.openedAt,
      closedAt: w.closedAt,
      // PIN désormais partagé par TOUS les PDV de la fenêtre — un seul flag/horodatage
      // au niveau fenêtre, plus par accès (cf. schema.prisma::InventoryWindow).
      hasPin: !!w.pinLookupHash,
      pinSetAt: w.pinSetAt,
      accesses: w.guestAccesses.map((a) => ({
        id: a.id,
        elementId: a.elementId,
        elementName: elementNameById.get(a.elementId) ?? null,
        status: a.status,
        lastLoginAt: a.lastLoginAt,
        // "Soumis" (J'ai terminé, signal seulement) / "Validé" (verrou réel,
        // posé par le directeur via validateAccess) — deux états distincts,
        // cf. commentaires sur GuestPinAccess.submittedAt/validatedAt (schema.prisma).
        submittedAt: a.submittedAt,
        validatedAt: a.validatedAt,
        reviewStatus: a.validatedAt ? 'validated' : a.submittedAt ? 'submitted' : 'in_progress',
      })),
    }));
  }

  private generatePin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * Génère (ou régénère) LE PIN partagé de cette fenêtre — vaut pour TOUS les PDV,
   * pas un par PDV (décision produit 2026-09-08). Retourne le PIN EN CLAIR —
   * l'appelant (contrôleur) est responsable de ne jamais le journaliser ni le
   * stocker ailleurs que dans la réponse HTTP one-shot. Régénérer invalide
   * IMMÉDIATEMENT l'ancien PIN pour tout le monde (comparaison stricte dans
   * `login`), sans toucher aux lignes GuestPinAccess existantes (statut/historique
   * par PDV conservés).
   */
  async setWindowPin(windowId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.assertSpaceAccess(user, window.spaceId);

    for (let attempt = 0; attempt < PIN_GENERATION_MAX_RETRIES; attempt++) {
      const pin = this.generatePin();
      const pinLookupHash = this.hashPin(pin);
      try {
        await this.prisma.inventoryWindow.update({
          where: { id: windowId },
          data: { pinLookupHash, pinSetAt: new Date(), pinSetBy: actorUserId },
        });

        await this.audit.log({
          tenantId,
          userId: actorUserId,
          action: 'UPDATE',
          entity: 'InventoryWindow',
          entityId: windowId,
          metadata: { action: 'set-pin' },
        });

        return { windowId, pin };
      } catch (error: any) {
        // Collision sur pinLookupHash (@unique) — une autre fenêtre a déjà ce PIN actif.
        if (error?.code === 'P2002' && attempt < PIN_GENERATION_MAX_RETRIES - 1) continue;
        throw error;
      }
    }
    throw new BadRequestException('Impossible de générer un PIN unique, réessayez');
  }

  async revokeAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: user.id,
      },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'DELETE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'revoke' },
    });
  }

  /**
   * Réactive un PDV précédemment révoqué — SANS toucher au PIN partagé de la
   * fenêtre (contrairement à l'ancien "régénérer le PIN" par PDV, qui n'existe
   * plus : le PIN est désormais commun, le régénérer affecterait tout le monde).
   */
  async reactivateAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);
    if (access.status === 'active') return { status: 'active' };

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'reactivate' },
    });

    return { status: 'active' };
  }

  /**
   * Le DIRECTEUR valide ce PDV après relecture — c'est CE moment, et lui seul, qui
   * verrouille l'écriture invité (cf. saveCount). Exige `submittedAt` posé (rien à
   * valider tant que le manager n'a pas dit "J'ai terminé") ; no-op si déjà validé.
   */
  async validateAccess(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);
    if (access.validatedAt) return { validatedAt: access.validatedAt };
    if (!access.submittedAt) {
      throw new ForbiddenException("Ce PDV n'a pas encore été soumis par le manager (\"J'ai terminé\").");
    }

    const updated = await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { validatedAt: new Date(), validatedBy: user.id },
      select: { validatedAt: true },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'validate' },
    });

    return updated;
  }

  /**
   * Le directeur renvoie ce PDV pour correction : réouvre l'écriture (efface le
   * signal "J'ai terminé") — le PIN étant désormais partagé par toute la fenêtre,
   * il n'y a de toute façon plus de PIN individuel à régénérer.
   */
  async requestCorrection(accessId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const access = await this.prisma.guestPinAccess.findFirst({ where: { id: accessId, tenantId } });
    if (!access) throw new NotFoundException('Accès introuvable');
    await this.assertSpaceAccess(user, access.spaceId);
    if (!access.submittedAt && !access.validatedAt) return { submittedAt: null };

    await this.prisma.guestPinAccess.update({
      where: { id: accessId },
      data: { submittedAt: null, validatedAt: null, validatedBy: null },
    });

    await this.audit.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'GuestPinAccess',
      entityId: accessId,
      metadata: { action: 'request-correction' },
    });

    return { submittedAt: null };
  }

  async closeWindow(windowId: string, user: CurrentUserData) {
    const tenantId = user.tenantId!;
    const actorUserId = user.id;
    const window = await this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId } });
    if (!window) throw new NotFoundException('Fenêtre introuvable');
    await this.assertSpaceAccess(user, window.spaceId);
    if (window.status !== 'open') {
      throw new ForbiddenException('Fenêtre déjà clôturée');
    }

    // La clôture (= révocation de tous les accès invité de cette fenêtre) est
    // inconditionnelle : elle prend effet même si le push logistique échoue
    // ensuite (ex. "aucun item compté"). Ne jamais faire dépendre la révocation
    // du succès de la synchro. pinLookupHash=null libère la valeur (contrainte
    // unique) pour qu'une future fenêtre puisse retomber sur le même PIN à 6
    // chiffres sans collision — le login le rejette de toute façon déjà via
    // `window.status === 'open'`, ce n'est qu'une libération de la valeur.
    await this.prisma.inventoryWindow.update({
      where: { id: windowId },
      data: { status: 'closed', closedAt: new Date(), closedBy: actorUserId, pinLookupHash: null },
    });

    let pushResult: { ok: boolean; reason?: string } = { ok: false, reason: 'not-attempted' };
    try {
      pushResult = await this.inventoryService.pushCurrentCountToLogistic(
        window.spaceId,
        window.eventId,
        tenantId,
        window.phase as 'pre-event' | 'post-event',
        actorUserId,
      );
      await this.prisma.inventoryWindow.update({
        where: { id: windowId },
        data: { pushedToLogisticAt: new Date() },
      });
    } catch (error: any) {
      this.logger.warn(
        `Fenêtre ${windowId} clôturée mais push logistique en échec : ${error?.message}`,
      );
      pushResult = { ok: false, reason: error?.message ?? 'push-failed' };
    }

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      action: 'UPDATE',
      entity: 'InventoryWindow',
      entityId: windowId,
      metadata: { action: 'close-and-push-logistic', pushResult },
    });

    return { windowClosed: true, push: pushResult };
  }
}
