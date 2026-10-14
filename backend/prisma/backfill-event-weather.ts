/// <reference types="node" />
/**
 * Rattrapage de la météo des events passés (Event.weatherCode / temperatureC / weatherFetchedAt),
 * pour les filtres Analyse « Météo / Température à l'heure du show ». Mêmes règles que le job de
 * nuit (EventWeatherFillService) mais sur TOUT l'historique, lot par lot.
 *
 * Idempotent : un event déjà rempli ou déjà marqué « introuvable » récemment est ignoré, le script
 * se relance sans risque (reprise après coupure comprise). Un échec réseau laisse l'event intact.
 * Appels Open-Meteo espacés (limite gratuite) : compter ~1 s par couple (ville, date) distinct.
 *
 *   npm run event-weather:backfill -- --dry-run        # résout la météo, n'écrit rien
 *   npm run event-weather:backfill                     # écrit (passe par db-guard : base locale)
 *   options : --batch=50 (taille de lot, défaut 50)  --max=500 (plafond d'events examinés)
 */
import { PrismaClient } from '@prisma/client';
import { EventWeatherService } from '../src/features/events/weather/event-weather.service';
import { EventWeatherFillService } from '../src/features/events/weather/event-weather-fill.service';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function numberArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const value = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function main() {
  const batch = numberArg('batch', 50);
  const max = numberArg('max', Number.MAX_SAFE_INTEGER);
  console.log(DRY_RUN ? 'DRY-RUN : aucune écriture\n' : 'MODE ÉCRITURE\n');

  const fill = new EventWeatherFillService(prisma as any, new EventWeatherService());
  const totals = { scanned: 0, filled: 0, missing: 0, failed: 0 };
  // Les events déjà vus (échec, aujourd'hui, ou dry-run qui n'écrit rien) ne sont pas repris.
  const seen: string[] = [];

  for (let round = 1; totals.scanned < max; round++) {
    // eslint-disable-next-line no-await-in-loop -- lots séquentiels : appels Open-Meteo espacés
    const result = await fill.fillBatch(Math.min(batch, max - totals.scanned), { dryRun: DRY_RUN, excludeIds: seen });
    if (result.scanned === 0) break;
    seen.push(...result.ids);
    totals.scanned += result.scanned;
    totals.filled += result.filled;
    totals.missing += result.missing;
    totals.failed += result.failed;
    console.log(
      `Lot ${round} : ${result.filled} remplis, ${result.missing} introuvables, ${result.failed} en échec ` +
        `(cumul ${totals.scanned} examinés)`,
    );
  }

  console.log(`\nTerminé${DRY_RUN ? ' (dry-run)' : ''} : ${JSON.stringify(totals)}`);
  if (totals.failed) console.log('Des échecs transitoires restent : relancer le script pour les reprendre.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
