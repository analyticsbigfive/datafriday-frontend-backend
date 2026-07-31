/**
 * Vérification isolée (jetable) CFG-2 Étape 4.5 : fnbCategories/fnbCategory dynamiques, alignés
 * sur Subtype (département 'shop'). Crée un tenant fictif, exerce HrService directement, nettoie
 * tout à la fin (y compris un Subtype de test créé pour prouver la dynamisation).
 */
import { PrismaClient } from '@prisma/client';
import { HrService } from '../src/features/hr/hr.service';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const svc = new HrService(prisma as any);

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`✓ ${msg}`);
}

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: `tmp-fnb-e2e-${Date.now()}` } });
  const tenantId = tenant.id;
  let extraSubtypeId: string | null = null;
  try {
    // 1. Création d'un rôle avec des codes Subtype valides (minuscules) — doit réussir.
    const role = await svc.createRole(
      { department: 'shop', name: 'Test Cuisinier E2E', contractType: 'OTHER', fnbCategories: ['beverages', 'front_food'] },
      tenantId,
    );
    assert(
      JSON.stringify(role.fnbCategories) === JSON.stringify(['beverages', 'front_food']),
      'création avec codes Subtype minuscules acceptée telle quelle',
    );

    // 2. Ancien vocabulaire UPPERCASE_SNAKE (HR_FNB_CATEGORIES) — doit désormais être REJETÉ
    //    (ce n'est plus un code/id Subtype valide) : confirme qu'il n'y a plus de double
    //    vocabulaire silencieusement accepté.
    let rejectedLegacy = false;
    try {
      await svc.createRole(
        { department: 'shop', name: 'Test Legacy Upper E2E', contractType: 'OTHER', fnbCategories: ['BEVERAGE'] },
        tenantId,
      );
    } catch (e: any) {
      rejectedLegacy = /fnbCategory invalide/.test(e.message);
    }
    assert(rejectedLegacy, 'ancien code UPPERCASE_SNAKE (BEVERAGE) rejeté — plus de vocabulaire parallèle');

    // 3. Valeur totalement invalide — doit être rejetée.
    let rejectedBogus = false;
    try {
      await svc.createRole(
        { department: 'shop', name: 'Test Bogus E2E', contractType: 'OTHER', fnbCategories: ['not-a-subtype'] },
        tenantId,
      );
    } catch (e: any) {
      rejectedBogus = /fnbCategory invalide/.test(e.message);
    }
    assert(rejectedBogus, 'valeur bidon rejetée');

    // 4. Sous-type d'un AUTRE département (hospitality → 'lodges') — hors périmètre 'shop',
    //    doit être rejeté (le scope reste strictement le département F&B).
    let rejectedWrongDept = false;
    try {
      await svc.createRole(
        { department: 'shop', name: 'Test WrongDept E2E', contractType: 'OTHER', fnbCategories: ['lodges'] },
        tenantId,
      );
    } catch (e: any) {
      rejectedWrongDept = /fnbCategory invalide/.test(e.message);
    }
    assert(rejectedWrongDept, "sous-type d'un autre département (lodges/hospitality) rejeté");

    // 5. Dynamisme réel : un NOUVEAU sous-type F&B créé par le super-admin (simulé ici en direct
    //    Prisma, hors scope HrService) doit être immédiatement utilisable, sans changement de code.
    const shopDept = await prisma.department.findFirst({ where: { code: 'shop' } });
    assert(!!shopDept, "département 'shop' trouvé");
    const extraSubtype = await prisma.subtype.create({
      data: { departmentId: shopDept!.id, name: 'Vegan Food E2E', code: null },
    });
    extraSubtypeId = extraSubtype.id;
    const roleWithNewSubtype = await svc.createRole(
      { department: 'shop', name: 'Test NewSubtype E2E', contractType: 'OTHER', fnbCategories: [extraSubtype.id] },
      tenantId,
    );
    assert(
      roleWithNewSubtype.fnbCategories[0] === extraSubtype.id,
      'un sous-type F&B fraîchement créé (code=null) est utilisable via son id, sans backfill',
    );

    // 6. Sinking rule : code valide accepté, invalide rejeté.
    const sinkingOk = await svc.createSinkingRule({ roleId: role.id, fnbCategory: 'front_food', mandatoryQty: 2 }, tenantId);
    assert(sinkingOk.fnbCategory === 'front_food', 'règle Sinking avec code Subtype minuscule acceptée');
    let sinkingRejected = false;
    try {
      await svc.createSinkingRule({ roleId: role.id, fnbCategory: 'KITCHEN_FOOD', mandatoryQty: 1 }, tenantId);
    } catch (e: any) {
      sinkingRejected = /fnbCategory invalide/.test(e.message);
    }
    assert(sinkingRejected, 'règle Sinking avec ancien code UPPERCASE_SNAKE rejetée');

    // 7. Update d'un rôle existant : recanonicalisation appliquée aussi en update.
    const updated = await svc.updateRole(role.id, { fnbCategories: ['food'] }, tenantId);
    assert(JSON.stringify(updated.fnbCategories) === JSON.stringify(['food']), 'updateRole revalide/recanonicalise fnbCategories');

    console.log('\nTous les tests ont réussi.');
  } finally {
    if (extraSubtypeId) await prisma.subtype.delete({ where: { id: extraSubtypeId } }).catch(() => {});
    await prisma.hrSinkingRule.deleteMany({ where: { tenantId } });
    await prisma.hrRoleSupplier.deleteMany({ where: { role: { tenantId } } });
    await prisma.hrRole.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
