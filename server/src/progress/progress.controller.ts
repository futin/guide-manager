import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query
} from '@nestjs/common';

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

  /**
   * Reset one guide.
   *
   * The path travels as a query parameter rather than in a body: a DELETE with a
   * body is awkward for every client that has to send one — the injected
   * reporter's `fetch` included — and the path is not a secret, since it is
   * already the `p` of the /guide URL the reader is looking at.
   *
   * 204, and no 404 for a guide that was never opened: both callers fire without
   * knowing whether anything is stored, so "there was nothing to forget" is a
   * success, not a condition worth reporting.
   */
  @Delete()
  @HttpCode(204)
  async reset(@Query('guidePath') guidePath?: string): Promise<void> {
    if (!guidePath) throw new BadRequestException('guidePath is required');
    await this.progress.reset(guidePath);
  }
}
