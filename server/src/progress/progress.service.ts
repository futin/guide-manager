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

  async all(): Promise<GuideProgress[]> {
    const docs = await this.model.find().sort({ lastOpenedAt: -1 }).exec();
    return docs.map(toWire);
  }

  /**
   * Last-write-wins upsert on `guidePath`. This is a single-user tool reached
   * from a phone and a laptop, so the only realistic conflict is the same guide
   * open in two places — and there the newer position is the one you want.
   *
   * `completed` is the deliberate exception: it is only ever set, never cleared,
   * because the DTO models an omitted flag as "no opinion".
   */
  async record(dto: RecordProgressDto): Promise<GuideProgress> {
    const set: Record<string, unknown> = {
      project: dto.project,
      scrollPercent: dto.scrollPercent,
      lastOpenedAt: new Date()
    };
    if (dto.completed === true) set.completed = true;

    const update: UpdateQuery<ReadingProgressDocument> = { $set: set, $inc: { openCount: 1 } };
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
    scrollPercent: doc.scrollPercent,
    completed: doc.completed,
    lastOpenedAt: doc.lastOpenedAt.toISOString(),
    openCount: doc.openCount
  };
}
