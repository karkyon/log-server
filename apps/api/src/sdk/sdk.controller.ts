import {
  Controller, Get, Post, Body, Res,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { SdkService } from './sdk.service';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class SdkController {
  constructor(private readonly sdk: SdkService) {}

  @Get('ping')
  ping() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Post('log')
  async postLog(@Body() body: any) {
    return this.sdk.saveLog(body);
  }

  @Post('consolelog')
  async postConsoleLog(@Body() body: any) {
    return this.sdk.saveConsoleLog(body);
  }

  @Post('screenshot')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const dir = process.env.SCREENSHOT_DIR ||
          path.join(process.cwd(), '..', '..', 'screenshots');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `${Date.now()}${ext}`);
      },
    }),
  }))
  async postScreenshot(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    return this.sdk.saveScreenshot(body, file?.path);
  }
}
