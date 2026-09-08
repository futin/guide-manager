import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

import type { GuidePosition } from '../../../shared/types';

/**
 * One document per saved block.
 *
 * Named `StoredFavorite` rather than `Favorite` because `Favorite` is already
 * the wire shape in shared/types.ts, and a mongoose document is not that shape
 * — it carries an `_id`, `Date`s rather than ISO strings, and the timestamps
 * mongoose itself manages. `toWire` in favorites.service.ts is the one place
 * that bridges the two.
 *
 * Unlike ReadingProgress, this collection has no unique key: saving the same
 * table out of the same guide twice is two favorites with two different notes,
 * on purpose (design doc, "The collection"). A favorite is a deliberate,
 * repeatable act, not a single per-guide slot the way reading position is.
 */
@Schema({ timestamps: true, collection: 'favorites' })
export class StoredFavorite {
  @Prop({ required: true, index: true })
  guidePath: string;

  // No `required: true` here, deliberately, though the brief this schema was
  // built from lists it: mongoose's default `required` check for a String
  // path is "not null AND non-empty" (SchemaString._checkRequired checks
  // `v.length`), not merely "present". A write with no project must still
  // land as '' (the DTO defaults an absent project to that), so pairing
  // `required: true` with `default: ''` here would make the field's own
  // default fail its own required check on every unattributed favorite.
  @Prop({ default: '' })
  project: string;

  @Prop({ default: '' })
  guideTitle: string;

  /**
   * Mixed, not a nested schema, for the same reason ReadingProgress.position
   * is: GuidePosition is a discriminated union whose two arms share no
   * fields, and nothing here queries inside it — it is validated once on the
   * way in (progress.dto.ts's parsePosition) and handed to the client whole.
   */
  @Prop({ type: SchemaTypes.Mixed, default: null })
  anchor: GuidePosition | null;

  @Prop({ type: [String], default: [] })
  crumb: string[];

  @Prop({ required: true })
  html: string;

  @Prop({ default: '' })
  text: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  note: string;

  /**
   * Manual order within the project bay, ascending = top. Required (no
   * default) because every write path that creates a row — only
   * FavoritesService.create — computes one; there is no meaningful order for
   * a row nobody assigned a place to.
   *
   * Indexed together with `project`, not alone: every read this app does is
   * "the rows for project X, in order" (GET /api/favorites sorts by both), so
   * the compound index is the one that actually serves a query — an index on
   * `order` alone would still have to scan across projects to find a bay's
   * neighbours.
   */
  @Prop({ required: true })
  order: number;

  // Not @Prop-decorated: `timestamps: true` above makes mongoose populate and
  // maintain these two on every document regardless of the class's own
  // decorators. Declaring them here is purely so toWire (favorites.service.ts)
  // can read doc.createdAt/doc.updatedAt with a type instead of a cast.
  createdAt: Date;
  updatedAt: Date;
}

export type StoredFavoriteDocument = HydratedDocument<StoredFavorite>;
export const StoredFavoriteSchema = SchemaFactory.createForClass(StoredFavorite);
StoredFavoriteSchema.index({ project: 1, order: 1 });
