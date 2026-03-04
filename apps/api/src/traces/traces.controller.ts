import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TracesService } from './traces.service';
import { CreateIssueDto } from './create-issue.dto';
import { CreatePatternDto } from './create-pattern.dto';

@Controller('api/projects/:id')
@UseGuards(JwtAuthGuard)
export class TracesController {
  constructor(private traces: TracesService) {}

  @Get('traces')
  findAll(@Param('id') id: string) {
    return this.traces.findAll(id);
  }

  @Get('traces/:tid')
  findOne(@Param('id') id: string, @Param('tid') tid: string) {
    return this.traces.findOne(id, tid);
  }
  @Get('traces/:tid/logs')
  findLogs(@Param('id') id: string, @Param('tid') tid: string) {
    return this.traces.getLogs(id, tid);
  }


  @Get('issues')
  findIssues(@Param('id') id: string) {
    return this.traces.findIssues(id);
  }

  @Post('issues')
  createIssue(
    @Param('id') id: string,
    @Body() dto: CreateIssueDto,
    @Request() req: any,
  ) {
    return this.traces.createIssue(id, dto, req.user?.userId);
  }

  @Get('patterns')
  findPatterns(@Param('id') id: string) {
    return this.traces.findPatterns(id);
  }

  @Post('patterns')
  createPattern(
    @Param('id') id: string,
    @Body() dto: CreatePatternDto,
    @Request() req: any,
  ) {
    return this.traces.createPattern(id, dto, req.user?.userId);
  }

  @Post(':traceId/force-stop')
  async forceStop(
    @Param('id') projectId: string,
    @Param('traceId') traceId: string,
  ) {
    return this.traces.forceStop(projectId, traceId);
  }
}
