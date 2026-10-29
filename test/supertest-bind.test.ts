import { readdirSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer, get as httpGet } from 'node:http';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { HealthController } from '../server/src/health/health.controller';
import { listenLoopback } from './listen-loopback';

/**
 * Pins all three halves of `listenLoopback` (`test/listen-loopback.ts`, which says why it exists): the helper binds where supertest dials, supertest then
 * re-binds nothing per request, and the platform really does let a wildcard bind be shadowed. Without the third, the host argument reads as decoration.
 */
describe('listenLoopback', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = moduleRef.createNestApplication();
  });

  afterEach(async () => {
    await app.close();
  });

  // The host argument IS the fix, so this is the assertion that goes red the moment anyone drops it: a wildcard bind reports `::`/IPv6 here.
  it('binds the server to IPv4 loopback, the address supertest dials', async () => {
    await listenLoopback(app);

    expect(app.getHttpServer().address()).toEqual({ address: '127.0.0.1', family: 'IPv4', port: expect.any(Number) });
  });

  // With `app.init()` alone both spies record one call per request: supertest's own bare `listen(0)`, then its close.
  it('leaves supertest to re-bind nothing — no listen or close per request', async () => {
    await listenLoopback(app);
    const server = app.getHttpServer();
    const listen = jest.spyOn(server, 'listen');
    const close = jest.spyOn(server, 'close');

    try {
      await request(server).get('/api/health').expect(200);
      await request(server).get('/api/health').expect(200);

      expect(listen).toHaveBeenCalledTimes(0);
      expect(close).toHaveBeenCalledTimes(0);
    } finally {
      // Restored here, not left to afterEach: `app.close()` goes through the very `close` spied on above.
      listen.mockRestore();
      close.mockRestore();
    }
  });
});

/**
 * The mechanism itself, deterministic and in milliseconds. The squatter is a non-HTTP listener bound explicitly to 127.0.0.1 — the stranger (a sibling dev
 * server, an IDE helper) that really holds ephemeral-range loopback ports on a developer machine.
 */
describe('the platform behaviour the helper exists for', () => {
  let squatter: NetServer;
  let shadow: ReturnType<typeof createHttpServer> | undefined;
  let accepted: Socket[] = [];

  beforeEach(async () => {
    accepted = [];
    squatter = createNetServer((socket) => {
      accepted.push(socket);
      socket.end('NOT-HTTP\r\n\r\n');
    });
    await new Promise<void>((resolve) => squatter.listen(0, '127.0.0.1', resolve));
  });

  // Accepted sockets are destroyed first: `socket.end` only half-closes, and `server.close()` waits for every connection, so without this the teardown dies
  // on jest's hook timeout instead of the case on its own assertion. `net.Server` has no `closeAllConnections()`, hence the list.
  afterEach(async () => {
    for (const socket of accepted) socket.destroy();
    if (shadow) {
      shadow.closeAllConnections();
      await new Promise<void>((resolve) => shadow!.close(() => resolve()));
    }
    shadow = undefined;
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
  });

  const occupiedPort = (): number => (squatter.address() as { port: number }).port;

  // The overlap is BSD-stack behaviour (macOS, where developers run this), not universal: Linux — CI — refuses a dual-stack wildcard bind on a port any IPv4
  // address already holds, so there the overlap cases are unreachable rather than wrong. They run off Linux only, and the Linux case in their place asserts
  // the refusal itself, so a kernel that ever started allowing the overlap goes red here instead of silently reopening the bug on CI.
  const onLinux = process.platform === 'linux';
  const whereWildcardOverlaps = onLinux ? it.skip : it;
  const whereWildcardIsRefused = onLinux ? it : it.skip;

  whereWildcardIsRefused('refuses a wildcard listen(port) on a port 127.0.0.1 already holds — why CI never saw it', async () => {
    shadow = createHttpServer();

    const error = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
      shadow!.once('error', resolve);
      shadow!.listen(occupiedPort(), () => reject(new Error('a wildcard bind shared a port 127.0.0.1 already holds')));
    });

    expect(error.code).toBe('EADDRINUSE');
  });

  whereWildcardOverlaps('lets a wildcard listen(port) succeed on a port 127.0.0.1 holds, then routes the IPv4 dial to the squatter', async () => {
    shadow = createHttpServer((_req, res) => res.end('ours'));
    await new Promise<void>((resolve, reject) => {
      shadow!.once('error', reject);
      shadow!.listen(occupiedPort(), resolve);
    });
    expect(shadow.address()).toEqual({ address: '::', family: 'IPv6', port: occupiedPort() });

    // `agent: false` is what superagent passes: the same socket setup a supertest request gets, so this is the real path.
    const error = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
      httpGet({ host: '127.0.0.1', port: occupiedPort(), path: '/', agent: false }, (res) => {
        res.resume();
        reject(new Error(`reached a real HTTP responder (${res.statusCode}) — the squatter did not answer`));
      }).on('error', resolve);
    });

    expect(error.code).toBe('HPE_INVALID_CONSTANT');
  });

  it('refuses the same bind written with the loopback host — which is why the fix works', async () => {
    shadow = createHttpServer();

    const error = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
      shadow!.once('error', resolve);
      shadow!.listen(occupiedPort(), '127.0.0.1', () => reject(new Error('bound a port 127.0.0.1 already holds')));
    });

    expect(error.code).toBe('EADDRINUSE');
  });
});

/**
 * Source guard: behavioural coverage cannot reach this — a suite that forgets the helper stays green nearly every run, which is precisely the defect.
 * Comments are blanked first, because `listen-loopback.ts` and this file both quote `app.init()` and `listen(0)` while explaining why no suite may lean on
 * them. It cannot catch a suite that builds a second app and listens only the first; that has to be checked by the reader.
 */
describe('every supertest suite listens through the helper', () => {
  const blankComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

  const suites = readdirSync(__dirname)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => ({ name, source: blankComments(readFileSync(join(__dirname, name), 'utf8')) }))
    .filter((file) => file.source.includes("from 'supertest'"));

  it('finds the suites at all — a rename that empties this list must fail loudly', () => {
    expect(suites.length).toBeGreaterThanOrEqual(9);
  });

  it('has no supertest suite that skips listenLoopback or leaves supertest to bind', () => {
    const offenders = suites
      .filter((file) => !file.source.includes('listenLoopback(') || /\.init\(\)|\.listen\(0\)/.test(file.source))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });
});
