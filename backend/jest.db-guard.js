// Garde-fou base de données pour Jest. @prisma/client charge backend/.env tout seul :
// un test d'intégration écrirait donc dans la base de ce fichier. On refuse toute base
// non locale (ALLOW_REMOTE_DB=1 pour une dérogation explicite).
const path = require('path');
const fs = require('fs');
const { assertLocalDatabase } = require('./scripts/db-guard.cjs');

const envFile = path.join(__dirname, '.env');
const fromFile = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
assertLocalDatabase({ ...fromFile, ...process.env }, { context: 'la suite de tests' });
