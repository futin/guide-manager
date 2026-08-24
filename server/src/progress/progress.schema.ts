import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/**
 * One document per guide file.
 *
 * Keyed by absolute path because that is what the registry stores and what a
 * /guide request carries — there is no other stable id for a guide, and a title
 * can change without the guide becoming a different thing.
 *
 * Per-guide granularity only: no per-heading and no per-deck-card state. A finer
 * model would need stable heading ids or a POST from inside generated decks,
 * both of which are their own piece of work.
 */
@Schema({ timestamps: true, collection: 'reading_progress' })
export class ReadingProgress {
  @Prop({ required: true, unique: true, index: true })
  guidePath: string;

  @Prop({ required: true, default: '' })
  project: string;

  @Prop({ required: true })
  lastOpenedAt: Date;

  @Prop({ required: true, default: 0 })
  openCount: number;

  @Prop({ required: true, default: 0, min: 0, max: 100 })
  scrollPercent: number;

  @Prop({ required: true, default: false })
  completed: boolean;
}

export type ReadingProgressDocument = HydratedDocument<ReadingProgress>;
export const ReadingProgressSchema = SchemaFactory.createForClass(ReadingProgress);
