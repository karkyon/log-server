import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body.username, body.password);
  }

  @Post('create-user')
  @HttpCode(201)
  createUser(@Body() body: { username: string; password: string; displayName: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.auth.createUser(body.username, body.password, body.displayName, body.role);
  }
}
