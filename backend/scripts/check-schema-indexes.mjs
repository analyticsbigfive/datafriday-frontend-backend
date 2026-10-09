#!/usr/bin/env node
/**
 * Garde-fou CI (plan de remédiation D1/D2), lit prisma/schema.prisma :
 *  - D1 : index non unique dont les colonnes sont le préfixe d'un autre index, d'une
 *    contrainte unique ou de la clé primaire du même modèle (index redondant) ;
 *  - D2 : clé étrangère dont la première colonne ne commence aucun index.
 * Les exceptions sont volontaires et justifiées ci-dessous. Sortie non nulle si écart.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEEP_REDUNDANT = {
  // 1,5 milliard de lectures (jointures transaction -> lignes) ; l'index couvrant fait 3,4 fois
  // sa taille : le supprimer ferait lire bien plus de pages à chaque jointure (classe C).
  'SalesTransactionItem:transactionId': 'classe C, mesuré en production le 2026-10-02',
  // À mesurer (EXPLAIN ANALYZE sur volume réel) avant toute suppression (classe B).
  'SalesTransaction:tenantId,integrationId,status,transactionDate': 'classe B, mesure en attente',
};

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

const models = [];
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const [, name, body] = m;
  const indexes = []; // { fields, unique }
  const foreignKeys = []; // fields[]
  for (const line of body.split('\n')) {
    const t = line.trim();
    const block = t.match(/^@@(index|unique|id)\(\[([^\]]*)\]/);
    if (block) {
      indexes.push({ unique: block[1] !== 'index', fields: block[2].split(',').map((f) => f.trim().split('(')[0]).filter(Boolean) });
      continue;
    }
    const field = t.match(/^(\w+)\s+\S+(.*)$/);
    if (!field || t.startsWith('//')) continue;
    if (/@id\b/.test(field[2]) || /@unique\b/.test(field[2])) indexes.push({ unique: true, fields: [field[1]] });
    const rel = field[2].match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
    if (rel) foreignKeys.push(rel[1].split(',').map((f) => f.trim()).filter(Boolean));
  }
  models.push({ name, indexes, foreignKeys });
}

const isPrefix = (a, b) => a.length <= b.length && a.every((f, i) => b[i] === f);
const problems = [];
for (const { name, indexes, foreignKeys } of models) {
  indexes.forEach((idx, i) => {
    if (idx.unique) return;
    const key = `${name}:${idx.fields.join(',')}`;
    const cover = indexes.find((o, j) => j !== i && isPrefix(idx.fields, o.fields) && (o.fields.length > idx.fields.length || o.unique || j < i));
    if (cover && !KEEP_REDUNDANT[key]) {
      problems.push(`D1 index redondant ${key} (couvert par [${cover.fields.join(', ')}]${cover.unique ? ' unique' : ''})`);
    }
  });
  for (const fk of foreignKeys) {
    if (!indexes.some((idx) => idx.fields[0] === fk[0])) problems.push(`D2 clé étrangère sans index ${name}.${fk.join(',')}`);
  }
}

const stale = Object.keys(KEEP_REDUNDANT).filter((k) => {
  const [model, cols] = k.split(':');
  return !models.find((m) => m.name === model)?.indexes.some((i) => i.fields.join(',') === cols);
});
for (const k of stale) problems.push(`exception obsolète dans KEEP_REDUNDANT : ${k}`);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} écart(s) dans schema.prisma.`);
  process.exit(1);
}
console.log('schema.prisma : aucun index redondant ni clé étrangère sans index.');
