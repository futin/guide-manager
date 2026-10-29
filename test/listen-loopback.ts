import type { INestApplication } from '@nestjs/common';

/**
 * The one way a suite here puts a Nest app on a socket before handing it to supertest. One helper rather than an inline call in eight suites, because the
 * host argument below is the entire fix and eight copies are eight chances to drop it. Not a test file (no `.test.ts`), so jest's testMatch never runs it;
 * it sits flat in `test/` beside the suites that use it, like `flake-diagnostics.ts`.
 *
 * supertest dials `http://127.0.0.1:<port>` and nothing else — `serverAddress()` in `node_modules/supertest/lib/test.js` hardcodes that literal — but the
 * port comes from whatever address the server actually bound. Handed a server that is not listening yet (`app.init()` alone), supertest calls a bare
 * `listen(0)`: no host, so Node binds the IPv6 wildcard `::`, and the kernel picks the ephemeral port against THAT address alone. Another process already
 * holding the same number on `127.0.0.1` does not make `::<port>` unavailable. The dial then goes to IPv4 loopback and is routed to the most specific match
 * — the stranger's socket, not ours — so the assertion runs against whatever that other program answered: a status this app never returns, a parse error
 * off a non-HTTP listener, or a connect timeout. That is the most likely explanation for the progress suite's unguarded-route 401 (github
 * futin/guide-manager#5): a sibling dev server with auth, answering on a port our wildcard bind shadowed. backlog-manager hit the same mechanism at about
 * one run in 1500 and fixed it the same way (its bug-33).
 *
 * `'127.0.0.1'` closes it: a bind that names the host cannot be shadowed, because the kernel refuses it with EADDRINUSE when the port is taken. It became
 * urgent when jest left `--runInBand`: workers run several suites at once, so there are several times as many binds in flight, each one a draw in that
 * lottery. Retries were the alternative and are worse — `jest.retryTimes` hides a real regression exactly as well as it hides this.
 *
 * The second effect matters too: with the server already listening, supertest's `if (!addr) this._server = app.listen(0)` branch never runs, so it opens
 * and closes nothing per request — where `app.init()` alone cost one listen/close cycle, one more draw, per request. Every suite's `await app.close()` stays
 * where it is; it now tears down a real listener, and it is the only thing that does. Guarded by `test/supertest-bind.test.ts`.
 */
export function listenLoopback(app: INestApplication): Promise<void> {
  return app.listen(0, '127.0.0.1').then(() => undefined);
}
