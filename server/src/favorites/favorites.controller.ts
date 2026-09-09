import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Patch,
  Post,
  Put
} from '@nestjs/common';

import { FavoritesService } from './favorites.service';
import { parseFavoriteDraft, parseFavoritePatch, parseOrder } from './favorites.dto';
import type { Favorite } from '../../../shared/types';

@Controller('api/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  all(): Promise<Favorite[]> {
    return this.favorites.all();
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: unknown): Promise<Favorite> {
    const parsed = parseFavoriteDraft(body);
    if ('error' in parsed) {
      if (parsed.error === 'missing') {
        throw new BadRequestException('guidePath and html are required');
      }
      throw new PayloadTooLargeException('html exceeds 512 KB');
    }
    return this.favorites.create(parsed.draft);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: unknown): Promise<Favorite> {
    const patch = parseFavoritePatch(body);
    if (!patch) throw new BadRequestException('title or note is required');
    const updated = await this.favorites.patch(id, patch);
    if (!updated) throw new NotFoundException('no such favorite');
    return updated;
  }

  @Put('order')
  @HttpCode(204)
  async reorder(@Body() body: unknown): Promise<void> {
    const ids = parseOrder(body);
    if (!ids) throw new BadRequestException('ids must be a non-empty list of distinct ids');
    const ok = await this.favorites.reorder(ids);
    if (!ok) throw new BadRequestException('unknown favorite id');
  }

  /**
   * 204 always, never 404: deleting what is already gone is a success, the
   * same idempotence as ProgressController.reset — the card's two-tap `✕`
   * fires without asking whether the row still exists.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.favorites.remove(id);
  }
}
