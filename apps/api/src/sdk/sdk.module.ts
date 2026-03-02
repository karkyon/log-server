import { Module } from '@nestjs/common';
import { SdkController } from './sdk.controller';
import { SdkService } from './sdk.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeysModule } from '../apikeys/apikeys.module';

@Module({
  imports: [PrismaModule, ApiKeysModule],
  controllers: [SdkController],
  providers: [SdkService],
})
export class SdkModule {}
