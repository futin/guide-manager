import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ReadingProgress, ReadingProgressSchema } from './progress.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ReadingProgress.name, schema: ReadingProgressSchema }])],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService]
})
export class ProgressModule {}
