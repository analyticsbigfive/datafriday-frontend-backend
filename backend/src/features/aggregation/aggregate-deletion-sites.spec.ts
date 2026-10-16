import * as fs from 'fs';
import * as path from 'path';

/**
 * Garde-fou ADR_MULTI_SOURCE 4.3 / 6 : recense TOUS les sites qui suppriment des lignes d'agrégats
 * (SpaceRevenueMinuteAgg, SpaceRevenueMinuteItemAgg, SpaceProductRevenueDailyAgg,
 * SpaceBasketMinuteAgg). Un nouveau site de suppression fait échouer ce test : son auteur doit
 * le déclarer ici avec sa classe, et la règle unique (`protectedAggregateWhere`) s'applique aux
 * sites de classe `protected`. C'est ce qui empêche un job d'une source d'effacer celles d'une autre.
 *
 * Classes :
 *  - protected   : le `where` passe par la règle unique (helper importé dans le même fichier) ;
 *  - scoped      : le `where` est borné par l'intégration de l'espace ou de l'évènement, aucune autre source n'est touchée ;
 *  - intentional : suppression voulue de TOUTES les lignes de l'évènement (il sort de l'espace, est exclu ou supprimé).
 */
type SiteClass = 'protected' | 'scoped' | 'intentional';
const EXPECTED: Record<string, { count: number; class: SiteClass; why: string }> = {
  'features/aggregation/aggregation.service.ts': { count: 3, class: 'protected', why: 'rebuild par source (sourceDeleteWhere) ; skipEvent exclut volontairement l\'évènement' },
  'features/aggregation/live-minute-aggregation.service.ts': { count: 2, class: 'protected', why: 'job minutes par source (sourceDeleteWhere)' },
  'features/aggregation/basket-aggregation.service.ts': { count: 1, class: 'protected', why: 'where reçu de l\'appelant, toujours issu de sourceDeleteWhere' },
  'features/aggregation/sync-stale-rows.service.ts': { count: 4, class: 'protected', why: 'balayage de fin de resynchronisation (protectedIntegrationIds)' },
  'features/aggregation/space-integration-scope.service.ts': { count: 4, class: 'scoped', why: 'purge des seules lignes d\'intégrations NON mappées à l\'espace' },
  'features/events/events.service.ts': { count: 6, class: 'protected', why: 'Démapper protégé ; sortie d\'espace supprime tout (voulu)' },
  'features/logistics/services/sales-simulation.service.ts': { count: 1, class: 'intentional', why: 'purge QA d\'un évènement simulé, l\'Event est supprimé juste après' },
};

const SRC = path.resolve(__dirname, '..', '..');
const DELETE_SITE = /(spaceRevenueMinuteAgg|spaceRevenueMinuteItemAgg|spaceProductRevenueDailyAgg|spaceBasketMinuteAgg)\s*\.\s*(deleteMany|delete)\b/g;
const RAW_DELETE = /(DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+"?(SpaceRevenueMinuteAgg|SpaceRevenueMinuteItemAgg|SpaceProductRevenueDailyAgg|SpaceBasketMinuteAgg)"?/gi;

function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listSources(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

describe('Sites de suppression d\'agrégats (garde-fou multi-source)', () => {
  const files = listSources(SRC).map((file) => ({ rel: path.relative(SRC, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }));

  it('chaque site de suppression est déclaré, avec le bon nombre d\'occurrences', () => {
    const found: Record<string, number> = {};
    for (const { rel, text } of files) {
      const count = (text.match(DELETE_SITE) ?? []).length;
      if (count) found[rel] = count;
    }
    const declared = Object.fromEntries(Object.entries(EXPECTED).map(([rel, v]) => [rel, v.count]));
    expect(found).toEqual(declared);
  });

  it('aucune suppression SQL brute sur les tables d\'agrégats', () => {
    const raw = files.filter(({ text }) => RAW_DELETE.test(text)).map(({ rel }) => rel);
    RAW_DELETE.lastIndex = 0;
    expect(raw).toEqual([]);
  });

  it('les sites de classe protected utilisent la règle unique', () => {
    for (const [rel, site] of Object.entries(EXPECTED)) {
      if (site.class !== 'protected') continue;
      const text = files.find((f) => f.rel === rel)?.text ?? '';
      const usesRule = /protectedAggregateWhere|sourceDeleteWhere|protectedIntegrationIds/.test(text) || rel.endsWith('basket-aggregation.service.ts');
      expect({ rel, usesRule }).toEqual({ rel, usesRule: true });
    }
  });
});
