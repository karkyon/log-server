import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreatePatternDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  screenMode?: string;

  @IsObject()
  seqData: Record<string, any>;

  @IsOptional()
  @IsString()
  memo?: string;
}
