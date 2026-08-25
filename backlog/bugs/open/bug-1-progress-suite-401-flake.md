---
id: bug-1
title: progress suite intermittently gets 401 from a route with no guard
created: 2026-08-25
---

## Symptom

On a full `pnpm test`, the first test of `test/progress.test.ts` failed:

```
● progress › creates a document on first open with openCount 1
  expected 201 "Created", got 401 "Unauthorized"
  at test/progress.test.ts:40
```

The other 17 tests in the suite passed in that same run, against that same
app and that same connection. Reruns are green: 26 consecutive full runs, 8
single-suite runs, and 120 isolated first-request iterations since, without a
repeat. A second, uncaptured failure did occur in a single-suite run while the
diagnostics below were being verified, so the rate is not as low as 1-in-27 —
its detail was lost to a truncated log, which is exactly what the instrument
exists to prevent.

## Why it is strange

No route in this repo is guarded, and nothing in the repo or anywhere in the
dependency tree mints a 401: `createError(401`, `statusCode: 401`,
`status(401)` and `writeHead(401` all return zero hits across `node_modules`.

Nest gives a response a status it was not handed by an `HttpException` in
exactly one case — `BaseExceptionFilter.isHttpError`, which is nothing more
than `err?.statusCode && err?.message`. So any thrown error carrying a numeric
`statusCode` becomes that HTTP status. This was confirmed end to end: a
rejection of `Object.assign(new Error('boom'), { statusCode: 401 })` from
`ProgressService.record` produces precisely `401 "Unauthorized"` on this route.

That makes the open question narrow: **which object, carrying `statusCode:
401`, reached the filter — or did the response never come from this app at
all?**

## Ruled out

| Hypothesis | Killed by |
|---|---|
| The test reached the docker or atlas-local mongod instead of its own | The other 17 tests passed on that same connection; a bad connection fails all 18 |
| mms picked a port colliding with 27017/27018 | `tryPort` uses `listen(0)`, so the port comes from the kernel's ephemeral range (49152+) |
| mongod was running with auth | No `mongodbMemoryServer` key in package.json, no `~/.mongodb-memory-server-rc`, no `MONGOMS_*` in the environment |
| A mongo auth error was mapped to 401 | `MongoServerError` carries no `statusCode`, so Nest answers 500 |
| A race on the first request of a fresh connection | 120 fresh app+connection first-POSTs: no failures, no exceptions reached the filter |
| An HTTP proxy answered | No proxy variables set, and superagent does not read them anyway |
| A suite patched `http`/`fetch` and leaked across files under `--runInBand` | Only the jsdom component suites mock fetch, and that global is per test environment |
| Another process on the machine answered | Nothing local returns 401 for that POST (3001/3500/4321/5176/8080 answer 404 or 400), and `net.inet6.ip6.v6only=0` rules out a `::` / `0.0.0.0` double bind on one port |

## Instrument

`test/progress.test.ts` carries two hooks, both silent on the statuses the
suite means to produce, so a passing run prints nothing:

- a client-side `diagnose` on every request, logging the status, headers, body,
  the socket that served it, and the address of the server under test — which
  settles whether the response came from this app at all (an Express response
  carries `x-powered-by`, and the serving port has to match);
- a `DiagnosticFilter` extending `BaseExceptionFilter`, logging the raw
  exception's own property names and its `statusCode` / `code` / `codeName`
  before deferring to the stock filter, so responses are unchanged.

Both were verified to fire.

## Next

Wait for a sighting with the instrument in place, then read the two logs. If
`servedBy` disagrees with `serverUnderTest`, the cause is outside this process
and outside this repo. If the filter names an error, its `own` list identifies
what put a `statusCode` on it.
