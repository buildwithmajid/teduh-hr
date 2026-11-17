import 'reflect-metadata';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';

/** Konfigurasi bersama untuk server & e2e test. */
export function configureApp(app: INestApplication, corsOrigin: string[]): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

async function bootstrap() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env opsional; variabel bisa datang dari environment langsung
  }
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // IP klien asli dibutuhkan untuk audit log & rate limit saat di belakang reverse proxy.
  app.set('trust proxy', 'loopback');
  configureApp(app, config.corsOrigin);
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`API berjalan di http://localhost:${config.port}/api`, 'Bootstrap');
}

if (require.main === module) {
  void bootstrap();
}
