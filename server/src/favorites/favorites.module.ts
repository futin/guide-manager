import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { StoredFavorite, StoredFavoriteSchema } from './favorites.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: StoredFavorite.name, schema: StoredFavoriteSchema }])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService]
})
export class FavoritesModule {}
