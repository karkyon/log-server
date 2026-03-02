import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SdkModule } from './sdk/sdk.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TracesModule } from './traces/traces.module';
import { ApiKeysModule } from './apikeys/apikeys.module';

@Module({
  imports: [
    ApiKeysModule,
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
