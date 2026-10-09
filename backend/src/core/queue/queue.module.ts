import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QUEUES } from './queue.constants';

/**
 * Côté PRODUCTEUR des files BullMQ : connexion, enregistrement des files, QueueService.
 * Aucun processor ici. Les processors vivent dans le dossier `jobs/` de leur feature et
 * ne sont chargés que par BackgroundJobsModule (worker), jamais par l'API.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          // REDIS_QUEUE_URL (Redis dédié aux files) si défini, sinon REDIS_URL. Le polling
          // BullMQ épuise vite le quota gratuit Upstash. La même valeur doit être posée
          // sur l'API et sur le worker.
          url: configService.get<string>(
            'REDIS_QUEUE_URL',
            configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
          ),
        },
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUES.DATA_SYNC },
      { name: QUEUES.AGGREGATION },
      { name: QUEUES.SIMULATION },
    ),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
