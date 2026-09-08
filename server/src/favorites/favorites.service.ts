import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, type Model } from 'mongoose';

import { StoredFavorite, type StoredFavoriteDocument } from './favorites.schema';
import type { FavoritePatch } from './favorites.dto';
import type { Favorite, FavoriteDraft } from '../../../shared/types';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(StoredFavorite.name)
    private readonly model: Model<StoredFavoriteDocument>
  ) {}

  /**
   * Every favorite, project ascending then order ascending — the exact order
   * the Favorites view paints its bays in (design doc, "Routes"). One query
   * for the whole tab, the same reasoning as ProgressService.all's single
   * board query.
   */
  async all(): Promise<Favorite[]> {
    const docs = await this.model.find().sort({ project: 1, order: 1 }).exec();
    return docs.map(toWire);
  }

  /**
   * Save a new favorite on top of its own project's bay.
   *
   * `order` is one less than the lowest order already in that project (or 0
   * for the project's first row), never a count or a max: a freshly saved
   * thing is the one being worked on, so it belongs at the top, and top is the
   * numerically lowest order by this collection's sort. Scoped to `project`
   * alone — a favorite never changes project, and bays never share an order
   * sequence — so saving into an empty project always starts back at 0.
   *
   * The title backstop lives here, not in favorites.dto.ts, because it needs
   * `crumb` and `text` together: the client has already tried to default it
   * (see assets/favorites.js, Capture), so this only fires for a call that
   * skipped that step or trimmed to nothing.
   */
  async create(draft: FavoriteDraft): Promise<Favorite> {
    const lowest = await this.model
      .findOne({ project: draft.project })
      .sort({ order: 1 })
      .exec();
    const order = lowest ? lowest.order - 1 : 0;

    const doc = await this.model.create({
      ...draft,
      title: defaultTitle(draft),
      order
    });
    return toWire(doc);
  }

  /**
   * Change `title` and/or `note` only — the rest of a favorite is immutable
   * capture data, and `order` has its own route (reorder, below). Returns
   * null for an id that cannot possibly match (not a valid ObjectId) or that
   * matches nothing, so the controller can tell "no such favorite" from a
   * write that actually happened without a second query.
   */
  async patch(id: string, patch: FavoritePatch): Promise<Favorite | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
    return doc ? toWire(doc) : null;
  }

  /**
   * Rewrite an entire project bay's order in one call: `ids[i]`'s order
   * becomes `i`. One route serves ↑, ↓, ⤒ and drag because all four are "here
   * is the bay's new id list" from the client's point of view.
   *
   * Refuses (returns false, writes nothing) unless every id in the list
   * exists — `countDocuments` rather than fetching and diffing, since all
   * this needs to know is whether the count matches, not which ids are
   * missing. A partial write here would leave the bay in an order the client
   * never asked for and cannot undo from what it already applied optimistically.
   *
   * The ObjectId-shape check comes first because a string that is not one
   * (parseOrder only checks "non-empty", not "looks like an id") would
   * otherwise reach `$in` and throw a CastError — an unauthenticated route
   * must answer a garbled id with the same 400 an unknown-but-well-formed one
   * gets, not a 500.
   */
  async reorder(ids: string[]): Promise<boolean> {
    if (!ids.every(isValidObjectId)) return false;
    const count = await this.model.countDocuments({ _id: { $in: ids } }).exec();
    if (count !== ids.length) return false;

    await this.model.bulkWrite(
      ids.map((id, order) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order } } }
      }))
    );
    return true;
  }

  /**
   * Delete one favorite. Idempotent, like ProgressService.reset: the card's
   * two-tap `✕` fires on whatever the reader is looking at without first
   * asking whether it still exists, so "already gone" is a success, not an
   * error. An id that is not a valid ObjectId can only ever match nothing, so
   * it is a no-op rather than a thrown error too.
   */
  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) return;
    await this.model.deleteOne({ _id: id }).exec();
  }
}

/**
 * The title backstop (design doc, "Validation"): the client's own value if it
 * survived trimming, else the innermost (last) crumb entry, else the first 60
 * characters of `text` trimmed, else the literal `Untitled`. In that order,
 * because the crumb is the reader's own words about where this came from,
 * `text` is only ever a mechanical excerpt, and `Untitled` is the one case
 * where the capture carried nothing usable at all.
 *
 * Final whole-branch review, Minor (bundled): the crumb entry is trimmed
 * before the truthiness check, not read verbatim. The real client can never
 * send a whitespace-only entry (`crumbFor` in assets/favorites.js filters on
 * trimmed text before pushing), but this is an unauthenticated route, so a
 * hand-rolled POST reaching this fallback with `crumb: ['A', '   ']` used to
 * produce a title of three literal spaces — visually blank on the card while
 * still satisfying the "never empty" rule at a glance. Trimming here makes a
 * whitespace-only entry fall through to the next rung exactly as an *absent*
 * one already did, rather than being treated as if it were meaningful text.
 */
function defaultTitle(draft: FavoriteDraft): string {
  if (draft.title.length > 0) return draft.title;
  const innermostCrumb = draft.crumb[draft.crumb.length - 1]?.trim();
  if (innermostCrumb) return innermostCrumb;
  const fromText = draft.text.slice(0, 60).trim();
  if (fromText.length > 0) return fromText;
  return 'Untitled';
}

function toWire(doc: StoredFavoriteDocument): Favorite {
  return {
    id: doc._id.toString(),
    guidePath: doc.guidePath,
    project: doc.project,
    guideTitle: doc.guideTitle,
    anchor: doc.anchor ?? null,
    crumb: doc.crumb,
    html: doc.html,
    text: doc.text,
    title: doc.title,
    note: doc.note,
    order: doc.order,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}
