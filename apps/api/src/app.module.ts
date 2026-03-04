import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SdkModule } from './sdk/sdk.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TracesModule } from './traces/traces.module';
import { ApiKeysModule } from './apikeys/apikeys.module';
import { UsersModule } from './users/users.module';
import { ReviewModule } from './review/review.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', 'public'),
      serveRoot: '/assets',
    }),
    ApiKeysModule,
    UsersModule,
    AdminModule,
    ReviewModule,
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SdkModule,
    AuthModule,
    ProjectsModule,
    TracesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
