// Cliquet du typage (plan de remédiation, P4) : nombre de `any` explicites hors tests.
// Échoue si le compte dépasse le budget de `scripts/any-budget.json` ; quand il baisse,
// le script le signale pour qu'on abaisse le budget dans la même PR (il ne remonte jamais).
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';

const budgetFile = new URL('./any-budget.json', import.meta.url);
const { budget } = JSON.parse(readFileSync(budgetFile, 'utf8'));

const eslint = new ESLint({
  overrideConfig: { rules: { '@typescript-eslint/no-explicit-any': 'warn' } },
});
const results = await eslint.lintFiles(['src/**/*.ts']);
let count = 0;
const byFile = [];
for (const r of results) {
  if (r.filePath.endsWith('.spec.ts')) continue;
  const n = r.messages.filter((m) => m.ruleId === '@typescript-eslint/no-explicit-any').length;
  if (n) {
    count += n;
    byFile.push([n, r.filePath.split('/backend/')[1]]);
  }
}

if (count > budget) {
  console.error(`Typage : ${count} any explicites hors tests, budget ${budget}. Retirer les nouveaux any.`);
  byFile.sort((a, b) => b[0] - a[0]).slice(0, 15).forEach(([n, f]) => console.error(`  ${n}  ${f}`));
  process.exit(1);
}
console.log(`Typage : ${count} any explicites hors tests (budget ${budget}).`);
if (count < budget) console.log(`Le compte a baissé : abaisser le budget à ${count} dans scripts/any-budget.json.`);
