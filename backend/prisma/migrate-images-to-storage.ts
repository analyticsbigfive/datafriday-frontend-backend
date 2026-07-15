/// <reference types="node" />
/**
 * Migration des images historiques (base64 en colonne texte) vers Supabase Storage.
 *
 * Depuis ce déploiement, les endpoints de création/mise à jour uploadent automatiquement
 * tout data-URI reçu vers Storage et ne stockent plus qu'une URL publique en base. Ce
 * script rattrape les lignes déjà écrites AVANT ce changement, où la colonne contient
 * encore le data-URI base64 complet.
 *
 * Idempotent : ne touche qu'aux valeurs commençant par "data:" ; une ligne déjà migrée
 * (URL) est ignorée au ré-exécution.
 *
 * Usage :
 *   npx tsx prisma/migrate-images-to-storage.ts            # exécute la migration
 *   DRY_RUN=1 npx tsx prisma/migrate-images-to-storage.ts   # liste ce qui serait migré, sans écrire
 */
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'images';
const DRY_RUN = process.env.DRY_RUN === '1';

const DATA_URI_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s;
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

type Target = {
  label: string;
  folder: string;
  findMany: () => Promise<Array<{ id: string; value: string | null }>>;
  update: (id: string, url: string) => Promise<unknown>;
};

async function buildTargets(): Promise<Target[]> {
  return [
    {
      label: 'Space.image',
      folder: 'spaces',
      findMany: async () =>
        (await prisma.space.findMany({ where: { image: { startsWith: 'data:' } }, select: { id: true, image: true } }))
          .map((r) => ({ id: r.id, value: r.image })),
      update: (id, url) => prisma.space.update({ where: { id }, data: { image: url } }),
    },
    {
      label: 'SpaceElement.image',
      folder: 'space-elements',
      findMany: async () =>
        (await prisma.spaceElement.findMany({ where: { image: { startsWith: 'data:' } }, select: { id: true, image: true } }))
          .map((r) => ({ id: r.id, value: r.image })),
      update: (id, url) => prisma.spaceElement.update({ where: { id }, data: { image: url } }),
    },
    {
      label: 'MenuItem.picture',
      folder: 'menu-items',
      findMany: async () =>
        (await prisma.menuItem.findMany({ where: { picture: { startsWith: 'data:' } }, select: { id: true, picture: true } }))
          .map((r) => ({ id: r.id, value: r.picture })),
      update: (id, url) => prisma.menuItem.update({ where: { id }, data: { picture: url } }),
    },
    {
      label: 'Supplier.picture',
      folder: 'suppliers',
      findMany: async () =>
        (await prisma.supplier.findMany({ where: { picture: { startsWith: 'data:' } }, select: { id: true, picture: true } }))
          .map((r) => ({ id: r.id, value: r.picture })),
      update: (id, url) => prisma.supplier.update({ where: { id }, data: { picture: url } }),
    },
    {
      label: 'MarketPrice.image',
      folder: 'market-prices',
      findMany: async () =>
        (await prisma.marketPrice.findMany({ where: { image: { startsWith: 'data:' } }, select: { id: true, image: true } }))
          .map((r) => ({ id: r.id, value: r.image })),
      update: (id, url) => prisma.marketPrice.update({ where: { id }, data: { image: url } }),
    },
  ];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans l\'environnement.');
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log(`🔧 Migration images base64 → Supabase Storage (bucket "${BUCKET}")${DRY_RUN ? ' — DRY RUN' : ''}`);

  let migrated = 0;
  let failed = 0;

  for (const target of await buildTargets()) {
    const rows = await target.findMany();
    if (rows.length === 0) {
      console.log(`  ${target.label}: rien à migrer`);
      continue;
    }
    console.log(`  ${target.label}: ${rows.length} ligne(s) en base64`);

    for (const row of rows) {
      const match = row.value ? DATA_URI_RE.exec(row.value) : null;
      if (!match) {
        console.warn(`    ⚠️  ${target.label} id=${row.id} — data-URI illisible, ignoré`);
        failed++;
        continue;
      }
      const [, mime, base64Payload] = match;
      const ext = ALLOWED_MIME_TO_EXT[mime.toLowerCase()];
      if (!ext) {
        console.warn(`    ⚠️  ${target.label} id=${row.id} — type MIME non supporté (${mime}), ignoré`);
        failed++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`    [dry-run] ${target.label} id=${row.id} → ${target.folder}/*.${ext}`);
        continue;
      }

      try {
        const buffer = Buffer.from(base64Payload, 'base64');
        const path = `${target.folder}/${randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
          contentType: mime,
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        await target.update(row.id, data.publicUrl);
        migrated++;
      } catch (error: any) {
        console.error(`    ❌ ${target.label} id=${row.id} — échec: ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✅ Migration terminée — ${migrated} image(s) migrée(s), ${failed} échec(s)/ignorée(s).`);
}

main()
  .catch((e) => {
    console.error('❌ Migration images — échec', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
