#!/usr/bin/env node
/**
 * Garde-fou base de données. Refuse toute commande d'écriture (migrations, seeds,
 * backfills, tests d'intégration) qui viserait une base NON locale, sauf dérogation
 * explicite : ALLOW_REMOTE_DB=1.
 *
 * Contexte : backend/.env a longtemps pointé la base de PRODUCTION ; un `prisma migrate
 * dev` ou un test d'intégration lancé par habitude aurait écrit en production.
 *
 * Usage CLI : node scripts/db-guard.cjs && <commande>
 * Usage code : require('./scripts/db-guard.cjs').assertLocalDatabase()
 */
const fs = require('fs');
const path = require('path');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'postgres-local', 'host.docker.internal']);
const URL_KEYS = ['DATABASE_URL', 'DIRECT_URL'];

function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function remoteUrls(env) {
  return URL_KEYS.map((key) => ({ key, url: env[key] }))
    .filter(({ url }) => !!url)
    .map(({ key, url }) => ({ key, host: hostOf(url) }))
    .filter(({ host }) => !host || !LOCAL_HOSTS.has(host));
}

function assertLocalDatabase(env = process.env, { context = 'cette commande' } = {}) {
  if (env.ALLOW_REMOTE_DB === '1') return;
  const remote = remoteUrls(env);
  if (!remote.length) return;
  const list = remote.map(({ key, host }) => `${key} -> ${host ?? 'URL illisible'}`).join(', ');
  throw new Error(
    `[db-guard] ${context} vise une base distante (${list}). ` +
      `Pointer .env sur la base locale, ou relancer avec ALLOW_REMOTE_DB=1 si c'est voulu.`,
  );
}

module.exports = { assertLocalDatabase, remoteUrls };

if (require.main === module) {
  // Même résolution que le CLI Prisma : process.env d'abord, puis backend/.env.
  const fromFile = readDotEnv(path.join(__dirname, '..', '.env'));
  const env = { ...fromFile, ...process.env };
  try {
    assertLocalDatabase(env, { context: process.argv[2] || 'cette commande' });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
