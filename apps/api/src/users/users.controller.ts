import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard }   from '../auth/roles.guard';
import { Roles }        from '../auth/roles.decorator';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: { username: string; password: string; displayName: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.users.create(body.username, body.password, body.displayName, body.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { displayName?: string; role?: 'ADMIN' | 'MEMBER'; isActive?: boolean; password?: string },
    @Request() req: any,
  ) {
    // 自分自身のロール変更を禁止
    if (id === req.user.sub && body.role !== undefined) {
      body = { ...body, role: undefined };
    }
    return this.users.update(id, body);
  }
}
