import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Nest's default body-parser setup wires express's json/urlencoded parsers
 * before `main.ts` gets a chance to touch them, so raising the limit later
 * would be too late for the first request. `bodyParser: false` at creation
 * time defers that wiring to `configureApp`, below, which installs the parser
 * this app actually wants.
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/**
 * Installs the one JSON body parser this app runs, at the 1 MB limit
 * favorites needs.
 *
 * Express's own default caps a JSON body at 100 KB, and a whole study section
 * captured as one favorite's `html` can exceed that on its own. Without this,
 * a large-but-legitimate capture would be rejected by express itself — a
 * generic, unhelpful 413 — before `favorites.dto.ts`'s own 512 KB cap ever ran.
 * That DTO limit is the one meant to fire, with its own message; this parser's
 * job is only to get out of its way.
 *
 * Both `main.ts` and every e2e suite that POSTs a favorite call this (paired
 * with `APP_OPTIONS` at app creation), so the behaviour under test is the same
 * behaviour the running server has.
 */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '1mb' });
}
