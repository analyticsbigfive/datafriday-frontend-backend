import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

const logger = new Logger('Worker');

async function bootstrap() {
  // createApplicationContext() boots NestJS without any HTTP server
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  app.enableShutdownHooks();

  logger.log('✅ BullMQ worker started — waiting for jobs');
}

// BUG-379-02 : une exception échappée après le bootstrap laissait le process "up" mais mort
// à l'intérieur, sans redémarrage Render (qui ne redémarre qu'un process qui sort).
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception, exiting for restart: ${err.message}`, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error(`Unhandled rejection, exiting for restart: ${err.message}`, err.stack);
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error(`Worker failed to start: ${err.message}`, err.stack);
  process.exit(1);
});
