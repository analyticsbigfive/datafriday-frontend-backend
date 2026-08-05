/**
 * Réécrit HrRole.fnbCategories[] / HrSinkingRule.fnbCategory des anciennes valeurs
 * UPPERCASE_SNAKE (HR_FNB_CATEGORIES, ex. "BEVERAGE", "FRONT_FOOD") vers le `code` STABLE du
 * Subtype correspondant (département 'shop', ex. "beverages", "front_food") — CFG-2 Étape 4.5.
 * Idempotent (une valeur déjà un code/id Subtype valide n'est jamais retouchée). DRY-RUN par
 * défaut.
 *
 *   npx tsx scripts/backfill-hr-fnb-categories.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-hr-fnb-categories.ts --apply    # applique
 *
 * Mapping figé (les 9 valeurs HR_FNB_CATEGORIES historiques → Subtype.code, cf. ex
 * fnb-tags.util.ts::SUBTYPE_TO_FNB_CATEGORY avant suppression) — une valeur legacy qui ne
 * correspond à aucune entrée connue ET n'est déjà ni un code ni un id Subtype valide est laissée
 * inchangée et listée en warning (nécessite une décision manuelle, pas un écrasement silencieux).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

const LEGACY_UPPER_TO_SUBTYPE_CODE: Record<string, string> = {
  FOOD: 'food',
  BEVERAGE: 'beverages',
  BEER: 'beer',
  GP_PREMIUM: 'gppremium',
  TEMPORARY: 'temporary',
  DRINKEE: 'drinkee',
  MIXOLOGY: 'mixology',
  FRONT_FOOD: 'front_food',
  KITCHEN_FOOD: 'kitchen_food',
};

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  const subtypes = await prisma.subtype.findMany({
    where: { department: { code: 'shop' } },
    select: { id: true, code: true },
  });
  const byCodeOrId = new Set(subtypes.flatMap((s) => [s.code, s.id].filter(Boolean)));

  const resolve = (value: string): { resolved: string; changed: boolean } | null => {
    if (byCodeOrId.has(value)) return { resolved: value, changed: false }; // déjà canonique
    const mapped = LEGACY_UPPER_TO_SUBTYPE_CODE[value];
    if (mapped && byCodeOrId.has(mapped)) return { resolved: mapped, changed: true };
    return null;
  };

  // ── HrRole.fnbCategories (array) ────────────────────────────────────────────
  const roles = await prisma.hrRole.findMany({
    select: { id: true, name: true, fnbCategories: true },
  });
  let roleChanges = 0;
  const roleWarnings: string[] = [];
  for (const role of roles) {
    if (!role.fnbCategories.length) continue;
    const next: string[] = [];
    let changed = false;
    for (const value of role.fnbCategories) {
      const r = resolve(value);
      if (!r) {
        roleWarnings.push(`HrRole "${role.name}" (${role.id}) : valeur non résolue "${value}"`);
        next.push(value);
        continue;
      }
      if (r.changed) changed = true;
      next.push(r.resolved);
    }
    if (changed) {
      console.log(`HrRole "${role.name}" : [${role.fnbCategories.join(', ')}] -> [${next.join(', ')}]`);
      roleChanges++;
      if (APPLY) {
        await prisma.hrRole.update({ where: { id: role.id }, data: { fnbCategories: next } });
      }
    }
  }

  // ── HrSinkingRule.fnbCategory (scalar) ──────────────────────────────────────
  const rules = await prisma.hrSinkingRule.findMany({
    select: { id: true, roleId: true, fnbCategory: true },
  });
  let ruleChanges = 0;
  const ruleWarnings: string[] = [];
  for (const rule of rules) {
    const r = resolve(rule.fnbCategory);
    if (!r) {
      ruleWarnings.push(`HrSinkingRule ${rule.id} (roleId=${rule.roleId}) : valeur non résolue "${rule.fnbCategory}"`);
      continue;
    }
    if (!r.changed) continue;
    console.log(`HrSinkingRule ${rule.id} : "${rule.fnbCategory}" -> "${r.resolved}"`);
    ruleChanges++;
    if (APPLY) {
      await prisma.hrSinkingRule.update({ where: { id: rule.id }, data: { fnbCategory: r.resolved } });
    }
  }

  console.log(`\n${roleChanges} HrRole.fnbCategories à réécrire, ${ruleChanges} HrSinkingRule.fnbCategory à réécrire.`);
  for (const w of [...roleWarnings, ...ruleWarnings]) console.warn(`⚠️  ${w}`);
  if (!APPLY && (roleChanges || ruleChanges)) console.log('\nRelancez avec --apply pour écrire.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
