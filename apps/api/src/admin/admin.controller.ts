import { Controller, Delete, Query, UseGuards, BadRequestException, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard }   from '../auth/roles.guard';
import { Roles }        from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  /** DELETE /api/admin/reset?project=<slug>  プロジェクトのログデータを全削除 */
  @Delete('reset')
  @HttpCode(200)
  async resetProject(@Query('project') slug: string) {
    if (!slug) throw new BadRequestException('project パラメータが必要です');
    return this.admin.resetProjectData(slug);
  }
}
