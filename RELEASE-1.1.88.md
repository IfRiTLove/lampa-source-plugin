# v1.1.88 / cache 72

Plugin-only hotfix based on production v1.1.87 (2a0a721). No Comments UI, backend change or PM2 restart.

Expired CUB tokens previously caused recursive diagnostic authentication and RangeError, then blocked the next source picker. Timeline diagnostics now use generic unauthenticated analyticsPost transport. Session refresh publishes one shared promise before any hook runs, safely settles failures, and permits a later retry. A 401 response gets at most one nonrecursive retry; stale 401 responses cannot discard a newer token.

Picker sync metadata is best-effort: synchronous errors and rejected readiness/resume promises reach the render callback exactly once.

Global error and unhandledrejection diagnostics use generic telemetry, with sanitized message, JS basename/line/column frames, plugin/cache, screen, playback age and state. No raw URLs/tokens/cookies. Repeats limited to once/minute, all reports to 30/hour.

**Collector limitation:** unchanged production backend retains event types, not detailed JS stacks. Full safe records remain in the browser console and the last 30 entries of window.LampaSourceClientErrors.events. Cross-origin masked errors may have no available stack.

## Validation

    node --test tests/sync-expiry.test.cjs

16 tests pass, including expired-token concurrency (10 calls → 1 refresh), reentrancy, HTTP/network/JSON failures, telemetry failures, picker fallback, and simulated Player expiry/exit/next picker.

Related source-workspace suite: 49/50 before and after. The same pre-existing plugin-test.js scroll-preservation assertion fails; it was not changed or hidden.

## TV gate — manual, pending

1. Reload Lampa. Expected heartbeat plugin_version=1.1.88, client_cache_version=72.
2. Start playback. For a fast optional gate, paste scripts/expire-sync.local.js in the device's browser console and call expireLampaSourceSyncForTest(). It changes only the cached expiry timestamp. It is not loaded by plugin.js.
3. Let the next timeline update renew the session. Expect no Script error and continued playback.
4. Exit Player, open anime, verify source cards render.
5. Complete a real 60+ minute playback session. Simulated tests are not a substitute for this gate.

Detailed JS diagnostics: inspect window.LampaSourceClientErrors.events. The helper exposes installed plugin/cache versions without exposing credentials.
