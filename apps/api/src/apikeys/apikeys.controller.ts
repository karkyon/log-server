import { Controller, Get, Post, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiKeysService } from './apikeys.service';

@Controller('api/projects/:id/apikeys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  @Get()
  findAll(@Param('id') id: string) {
    return this.apiKeys.findAll(id);
  }

  @Post()
  create(
    @Param('id') id: string,
    @Body('label') label: string,
    @Request() req: any,
  ) {
    return this.apiKeys.create(id, label ?? '無名キー');
  }

  @Delete(':keyId')
  revoke(@Param('id') id: string, @Param('keyId') keyId: string) {
    return this.apiKeys.revoke(id, keyId);
  }
}
