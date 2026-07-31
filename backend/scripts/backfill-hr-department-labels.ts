/**
 * Réécrit HrRole.department / HrSupplier.departments[] des anciens LIBELLÉS (ex-HR_DEPARTMENTS /
 * HR_SUPPLIER_DEPARTMENTS, ex. "F&B", "Merchandising") vers le `code` STABLE de la table
 * `Department` correspondante (ex. "shop", "merchshop") — CFG-2 Étape 4. Idempotent (une valeur
 * déjà un code/id valide n'est jamais retouchée). DRY-RUN par défaut.
 *
 *   npx tsx scripts/backfill-hr-department-labels.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-hr-department-labels.ts --apply    # applique
 *
 * Résolution par NOM (insensible à la casse) contre Department, pas une table de correspondance
 * codée en dur — robuste à toute valeur legacy déjà en base, pas seulement les 4/7 libellés
 * historiques connus. Une valeur qui ne correspond à AUCUN Department.code/id/name est laissée
 * inchangée et listée en warning (nécessite une décision manuelle, pas un écrasement silencieux).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  const departments = await prisma.department.findMany({ select: { id: true, code: true, name: true } });
  const byCodeOrId = new Set(departments.flatMap((d) => [d.code, d.id].filter(Boolean)));
  const byNameLower = new Map(departments.map((d) => [d.name.toLowerCase(), d.code ?? d.id]));

  const resolve = (value: string): { resolved: string; changed: boolean } | null => {
    if (byCodeOrId.has(value)) return { resolved: value, changed: false }; // déjà canonique
    const match = byNameLower.get(value.toLowerCase());
    if (match) return { resolved: match, changed: true };
    return null; // ni code/id valide, ni libellé reconnu
  };

  // ---- HrRole.department ----
  const roles = await prisma.hrRole.findMany({ select: { id: true, name: true, department: true } });
  let roleChanges = 0;
  const roleUnresolved: string[] = [];
  for (const role of roles) {
    const result = resolve(role.department);
    if (!result) {
      roleUnresolved.push(`HrRole ${role.id} (${role.name}): "${role.department}" non reconnu`);
      continue;
    }
    if (result.changed) {
      roleChanges++;
      console.log(`HrRole ${role.id} (${role.name}): "${role.department}" -> "${result.resolved}"`);
      if (APPLY) {
        await prisma.hrRole.update({ where: { id: role.id }, data: { department: result.resolved } });
      }
    }
  }

  // ---- HrSupplier.departments[] ----
  const suppliers = await prisma.hrSupplier.findMany({ select: { id: true, name: true, departments: true } });
  let supplierRowsChanged = 0;
  const supplierUnresolved: string[] = [];
  for (const supplier of suppliers) {
    let changed = false;
    const nextDepartments = supplier.departments.map((value) => {
      const result = resolve(value);
      if (!result) {
        supplierUnresolved.push(`HrSupplier ${supplier.id} (${supplier.name}): "${value}" non reconnu`);
        return value;
      }
      if (result.changed) changed = true;
      return result.resolved;
    });
    if (changed) {
      supplierRowsChanged++;
      console.log(`HrSupplier ${supplier.id} (${supplier.name}): [${supplier.departments.join(', ')}] -> [${nextDepartments.join(', ')}]`);
      if (APPLY) {
        await prisma.hrSupplier.update({ where: { id: supplier.id }, data: { departments: nextDepartments } });
      }
    }
  }

  console.log(`\nHrRole: ${roles.length} lignes, ${roleChanges} à réécrire.`);
  console.log(`HrSupplier: ${suppliers.length} lignes, ${supplierRowsChanged} à réécrire.`);
  if (roleUnresolved.length || supplierUnresolved.length) {
    console.log('\n⚠️  Valeurs non résolues (laissées inchangées, à traiter manuellement) :');
    console.log([...roleUnresolved, ...supplierUnresolved].join('\n'));
  }
  console.log(`\n${APPLY ? '✅ Backfill appliqué.' : 'ℹ️  Relancez avec --apply pour exécuter.'}`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
