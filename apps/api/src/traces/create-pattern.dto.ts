import { IsString, IsOptional } from 'class-validator';

export class CreatePatternDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  screenMode?: string;

  // seqData は JSON として受け取る（any で受けて保存）
  seqData: any;

  @IsOptional()
  @IsString()
  memo?: string;
}
