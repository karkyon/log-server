import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '/home/karkyon/projects/log-server/.env' });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // logs/screenshots/ を /logs-screenshots/ として公開
  const logsScreenshotsDir = path.join('/home/karkyon/projects/log-server/logs/screenshots');
  app.useStaticAssets(logsScreenshotsDir, { prefix: '/logs-screenshots/' });

  // screenshots/ を /screenshots/ として公開（SDK保存先）
  const screenshotsDir = process.env.SCREENSHOT_DIR ||
    path.join('/home/karkyon/projects/log-server/screenshots');
  app.useStaticAssets(screenshotsDir, { prefix: '/screenshots/' });

  const port = process.env.API_PORT || 3099;
  await app.listen(port);
  console.log(`TLog API Server running on :${port}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'loaded' : 'NOT LOADED'}`);
  console.log(`Screenshots served from: ${screenshotsDir}`);
  console.log(`Logs screenshots served from: ${logsScreenshotsDir}`);
}
bootstrap();
