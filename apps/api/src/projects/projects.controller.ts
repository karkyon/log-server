import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';

@Controller('api/projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.projects.findAll(req.user.sub, req.user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.projects.findOne(id, req.user.sub, req.user.role);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.projects.create(
      body.name, body.slug, body.description, req.user.sub
    );
  }
}
