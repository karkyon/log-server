import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  featureId: string;

  @IsString()
  title: string;

  @IsIn(['バグ', '改善', '質問', '確認'])
  type: string;

  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  priority: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  traceId?: string;
}
