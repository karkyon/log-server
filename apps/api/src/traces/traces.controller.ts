import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TracesService } from './traces.service';

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

  @Get('issues')
  findIssues(@Param('id') id: string) {
    return this.traces.findIssues(id);
  }

  @Get('patterns')
  findPatterns(@Param('id') id: string) {
    return this.traces.findPatterns(id);
  }
}
