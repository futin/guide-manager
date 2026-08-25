import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import type { GuidePosition } from '../../../shared/types';

/**
 * One document per guide file.
 *
 * Keyed by absolute path because that is what the registry stores and what a
 * /guide request carries — there is no other stable id for a guide, and a title
 * can change without the guide becoming a different thing.
 *
 * One document per guide, still — `position` records *where* the reader is
 * inside it (one heading id, or one card index), not a per-heading or per-card
 * record of what has been read. The finer model is a different thing again: for
 * a deck it would have to store which quiz cards were answered and what they
 * scored, which changes what a score means across sessions, and decks carry no
 * stable per-card id to key it on — only sections are id'd. So a deck resume
 * stops at an unanswered quiz and waits, rather than pretending the question
 * was already cleared.
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
  percent: number;

  /**
   * Highest `percent` ever written for this guide. Maintained with `$max` rather
   * than by reading and then writing, so an out-of-order write from a second
   * device sitting on page one cannot lower it — that it only ever climbs is the
   * whole point of the field, and is what makes the board's number a claim about
   * the reader rather than about which tab was closed last.
   *
   * A row written before this field existed reads as 0, i.e. "opened, position
   * unknown". True, and not worth a migration.
   */
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  furthestPercent: number;

  /**
   * Mixed, not a nested schema: the shape is a discriminated union whose two
   * arms share no fields, so mongoose would have to be told about both arms and
   * a discriminator to enforce what progress.dto.ts already validates on the way
   * in. Nothing queries inside this field — it is read whole and handed to the
   * injected reporter whole.
   */
  @Prop({ type: SchemaTypes.Mixed, default: null })
  position: GuidePosition | null;

  @Prop({ required: true, default: false })
  completed: boolean;
}

export type ReadingProgressDocument = HydratedDocument<ReadingProgress>;
export const ReadingProgressSchema = SchemaFactory.createForClass(ReadingProgress);
