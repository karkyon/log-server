import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/karkyon/projects/log-server/.env' });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = process.env.API_PORT || 3099;
  await app.listen(port);
  console.log(`TLog API Server running on :${port}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'loaded' : 'NOT LOADED'}`);
}
bootstrap();
