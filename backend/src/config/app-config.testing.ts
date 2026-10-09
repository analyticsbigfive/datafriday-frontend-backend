import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';

/** Configuration pour les tests : valeurs explicites, aucune lecture de l'environnement. */
export function testAppConfig(values: Record<string, unknown> = {}): AppConfigService {
  return new AppConfigService(new ConfigService({ NODE_ENV: 'test', ...values }));
}
