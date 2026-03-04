import {
  Controller, Get, Post, Body, Req,
  UseInterceptors, UploadedFile, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Request } from 'express';
import { SdkService } from './sdk.service';
import { ApiKeyAuthGuard } from './apikey-auth.guard';
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
  @UseGuards(ApiKeyAuthGuard)
  async postLog(@Body() body: any, @Req() req: any) {
    return this.sdk.saveLog({ ...body, projectId: req.projectId });
  }

  @Post('consolelog')
  @UseGuards(ApiKeyAuthGuard)
  async postConsoleLog(@Body() body: any, @Req() req: any) {
    return this.sdk.saveConsoleLog({ ...body, projectId: req.projectId });
  }

  @Post('screenshot')
  @UseGuards(ApiKeyAuthGuard)
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
    @Req() req: any,
  ) {
    return this.sdk.saveScreenshot({ ...body, projectId: req.projectId }, file?.path);
  }

  @Post('trace/start')
  @UseGuards(ApiKeyAuthGuard)
  async startTrace(@Body() body: any, @Req() req: any) {
    return this.sdk.startTrace(body, req.projectId, req.apiKeyId);
  }

  @Post('trace/stop')
  @UseGuards(ApiKeyAuthGuard)
  async stopTrace(@Body() body: any) {
    return this.sdk.stopTrace(body);
  }
}
