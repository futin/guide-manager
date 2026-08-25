import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, UpdateQuery } from 'mongoose';

import { ReadingProgress, type ReadingProgressDocument } from './progress.schema';
import type { RecordProgressDto } from './progress.dto';
import type { GuideProgress } from '../../../shared/types';

@Injectable()
export class ProgressService {
  constructor(
    @InjectModel(ReadingProgress.name)
    private readonly model: Model<ReadingProgressDocument>
  ) {}

  /**
   * Progress for many guides in one query, keyed by path. The guides index
   * renders every card from this — one round trip per page, not one per card.
   * A guide that was never opened is simply absent from the map.
   */
  async find(guidePaths: string[]): Promise<Map<string, GuideProgress>> {
    if (guidePaths.length === 0) return new Map();
    const docs = await this.model.find({ guidePath: { $in: guidePaths } }).exec();
    return new Map(docs.map((d) => [d.guidePath, toWire(d)]));
  }

  /**
   * Forget a guide entirely.
   *
   * A delete rather than a field-clearing update: "start over" means a guide you
   * have not read, and a surviving `openCount: 7` beside a zeroed position is a
   * state the board would then have to explain. Absence already renders
   * correctly — the card drops back to saying nothing, which is its
   * never-opened branch.
   *
   * Idempotent, because neither caller knows whether a row exists: the viewer's
   * reset button fires on whatever the reader is looking at, and the injected
   * reporter's "start over" fires without having asked.
   */
  async reset(guidePath: string): Promise<void> {
    await this.model.deleteOne({ guidePath }).exec();
  }

  async all(): Promise<GuideProgress[]> {
    const docs = await this.model.find().sort({ lastOpenedAt: -1 }).exec();
    return docs.map(toWire);
  }

  /**
   * Last-write-wins upsert on `guidePath`, with three deliberate exceptions.
   *
   * This is a single-user tool reached from a phone and a laptop, so the only
   * realistic conflict is the same guide open in two places — and there the
   * newer position is the one you want. Three fields must not follow that rule:
   *
   * - `furthestPercent` climbs via `$max`, so a write from a device sitting on
   *   page one cannot erase how far the other device got. It is the one field
   *   where last-write-wins would be destructive rather than merely arbitrary,
   *   which is most of why it exists.
   * - `completed` is only ever set, never cleared, because the DTO models an
   *   omitted flag as "no opinion".
   * - `openCount` increments only for a write that declares itself an open.
   *   Every other write in a session is a position report, and counting those
   *   would turn a session counter into a scroll-event counter.
   *
   * `position` is set only when the write carries one, for the same reason: the
   * percent is coarse and the position is what makes a resume exact, so a write
   * that lost its position must not blank the stored one.
   */
  async record(dto: RecordProgressDto): Promise<GuideProgress> {
    const set: Record<string, unknown> = {
      project: dto.project,
      percent: dto.percent,
      lastOpenedAt: new Date()
    };
    if (dto.position) set.position = dto.position;
    if (dto.completed === true) set.completed = true;

    const update: UpdateQuery<ReadingProgressDocument> = {
      $set: set,
      $max: { furthestPercent: dto.percent }
    };
    if (dto.opened === true) update.$inc = { openCount: 1 };

    const doc = await this.model
      .findOneAndUpdate({ guidePath: dto.guidePath }, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      })
      .exec();
    return toWire(doc as ReadingProgressDocument);
  }
}

function toWire(doc: ReadingProgressDocument): GuideProgress {
  return {
    guidePath: doc.guidePath,
    percent: doc.percent,
    furthestPercent: doc.furthestPercent,
    position: doc.position ?? null,
    completed: doc.completed,
    lastOpenedAt: doc.lastOpenedAt.toISOString(),
    openCount: doc.openCount
  };
}
