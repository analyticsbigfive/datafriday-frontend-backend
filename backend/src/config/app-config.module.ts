import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';
import { AppConfigService } from './app-config.service';

/**
 * Configuration unique de l'API et du worker : même ordre de fichiers .env, même
 * validation. En production, les variables viennent de l'orchestrateur (process.env).
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `envFiles/.env.${process.env.NODE_ENV || 'development'}`,
        'envFiles/.env',
        '.env',
      ],
      expandVariables: true,
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
