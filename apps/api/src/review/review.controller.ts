import {
  Controller, Post, Get, Param, Body, Res, UseGuards, HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewService } from './review.service';

@Controller('api/projects/:id')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  // 単一TraceID でレビュー生成
  @Post('traces/:traceId/generate-review')
  @HttpCode(200)
  async generateForTrace(
    @Param('id') projectId: string,
    @Param('traceId') traceId: string,
    @Res() res: Response,
  ) {
    const html = await this.review.generateForTrace(projectId, traceId);
    const short = traceId.slice(0, 8);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="review_${short}.html"`);
    res.send(html);
  }

  // 複数 or プロジェクト全件でレビュー生成
  @Post('generate-review')
  @HttpCode(200)
  async generateForProject(
    @Param('id') projectId: string,
    @Body() body: { traceIds?: string[] },
    @Res() res: Response,
  ) {
    const html = await this.review.generateForProject(projectId, body.traceIds);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="review_project.html"`);
    res.send(html);
  }
}
