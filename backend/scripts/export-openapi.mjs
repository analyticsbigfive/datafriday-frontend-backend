#!/usr/bin/env node
/**
 * Exporte la spécification OpenAPI complète (la même que GET /api/v1/openapi.json)
 * vers docs/api/openapi.json, SANS démarrer le serveur.
 *
 * Usage :
 *   pnpm build && node scripts/export-openapi.mjs
 *   (ou : pnpm docs:api — régénère aussi API_REFERENCE.md)
 *
 * Le script instancie l'AppModule compilé (dist/) avec la config Swagger partagée
 * (src/config/swagger.config.ts). Les hooks onModuleInit ne sont pas exécutés
 * (pas de app.init()/listen()), donc pas de connexion Prisma ; les variables
 * d'env sont lues via envFiles/.env.development comme au boot normal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'api', 'openapi.json');
const require = createRequire(path.join(ROOT, 'package.json'));

process.chdir(ROOT); // envFilePath de ConfigModule est relatif au cwd
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// La spec exportée est un artefact committé : on y met l'URL publique réelle,
// pas le localhost de la machine qui a lancé l'export.
process.env.API_BASE_URL = process.env.API_BASE_URL || 'https://datafriday-api.onrender.com';

const distMain = path.join(ROOT, 'dist', 'app.module.js');
if (!fs.existsSync(distMain)) {
  console.error('dist/ absent ou incomplet — lancer `pnpm build` d\'abord.');
  process.exit(1);
}

const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { SwaggerModule } = require('@nestjs/swagger');
const { AppModule } = require(distMain);
const { buildSwaggerConfig } = require(path.join(ROOT, 'dist', 'config', 'swagger.config.js'));

try {
  const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api/v1'); // même préfixe qu'en prod pour des paths identiques

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  fs.writeFileSync(OUT, JSON.stringify(document, null, 2) + '\n');

  const nPaths = Object.keys(document.paths).length;
  const nOps = Object.values(document.paths).reduce((a, p) => a + Object.keys(p).length, 0);
  console.log(`OK — ${nPaths} paths / ${nOps} opérations / ${document.tags?.length ?? 0} tags → ${path.relative(ROOT, OUT)}`);
} catch (err) {
  console.error('Échec de l\'export OpenAPI :', err);
  process.exitCode = 1;
}
// Des clients Redis/BullMQ instanciés par les modules peuvent maintenir la boucle
// d'événements ouverte : on force la sortie une fois le fichier écrit.
process.exit(process.exitCode ?? 0);
