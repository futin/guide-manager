import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';

import { ProgressService } from './progress.service';
import { parseRecordProgress } from './progress.dto';
import type { GuideProgress } from '../../../shared/types';

@Controller('api/progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  all(): Promise<GuideProgress[]> {
    return this.progress.all();
  }

  @Post()
  record(@Body() body: unknown): Promise<GuideProgress> {
    const dto = parseRecordProgress(body);
    if (!dto) throw new BadRequestException('guidePath is required');
    return this.progress.record(dto);
  }
}
