'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.env.HOTFIX_PLUGIN || path.join(__dirname, '../plugin.js'), 'utf8');
function extract(name) {
  const declaration = source.match(new RegExp('^( +)function ' + name + '\\(', 'm'));
  assert.ok(declaration, name + ' exists');
  const end = source.indexOf('\n' + declaration[1] + 'function ', declaration.index + 1);
  return source.slice(declaration.index, end < 0 ? undefined : end);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function response(status, data) { return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(data) }; }
const fresh = () => response(200, { ok: true, sync_token: 'test-fresh', expires_in: 3600, profile_id: 7 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(options = {}) {
  let now = 100000, nextTimer = 0;
  const requests = [], timers = new Map(), listeners = {}, playerListeners = {};
  const storage = {
    account: { token: 'test-cub', profile: { id: 7 } },
    sync: { token: 'test-old', expires_at: options.valid ? now + 3600000 : now - 1, profile_id: 7 }
  };
  const video = { paused: false, currentTime: 10, readyState: 4, networkState: 2, error: null };
  const ctx = {
    Promise, Date: { now: () => now }, URL, AbortController,
    PLUGIN_VERSION: '1.1.88', CLIENT_CACHE_VERSION: '72',
    API_URL: 'https://test.invalid', SYNC_TOKEN_STORAGE_KEY: 'sync',
    TIMELINE_SERVER_SYNC_ENABLED: true, syncSessionPromise: null,
    syncTokenState: { token: 'test-old', expiresAt: storage.sync.expires_at, profileId: 7 },
    watchSyncDebugEnabled: true, watchSyncDebugLoaded: true,
    timelineClientDiagSending: false,
    getApiUrl: () => 'https://test.invalid', getDeviceId: () => 'test-device',
    analyticsBasePayload: () => ({ plugin_version: '1.1.88', device_id: 'test-device' }),
    hashDiagValue: () => 'test-hash',
    ensureWatchSyncDebugFlag: () => Promise.resolve(true),
    object: { movie: { id: 1 } }, renderedPickerResults: [],
    pickerActiveWatchProgress: null, pickerActiveWatchMatch: null,
    mediaStorageKeyForSync: () => 'tv:tmdb:1',
    matchActiveWatchSource: () => null,
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    window: { addEventListener: (name, fn) => { listeners[name] = fn; },
      LampaSourcePlaybackDiag: { player_play_called: true, last_player_event: 'playing',
        error_started_at: 90000, telemetry_context: { source_key: 'mikai' }, error_transport: 'DIRECT' } },
    document: { querySelector: () => video, addEventListener() {} },
    console: { warn() {}, log() {} },
    Lampa: {
      Storage: { get: key => storage[key], set: (key, value) => { storage[key] = value; } },
      Activity: { active: () => ({ component: 'lampa_source_results' }) },
      Player: { listener: { follow: (name, fn) => { playerListeners[name] = fn; } } }
    },
    fetch: (url, init = {}) => {
      const route = new URL(url).pathname;
      const req = { route, init }; requests.push(req);
      if (options.onFetch) {
        const result = options.onFetch(req, ctx);
        if (result !== undefined) return result;
      }
      return Promise.resolve(route === '/sync/cub/session' ? fresh() : response(200, { ok: true }));
    }
  };
  vm.createContext(ctx);
  const names = ['analyticsPost', 'getCubSyncBlockReason', 'cubSyncEnabled', 'getCubCredentials',
    'loadStoredSyncToken', 'saveStoredSyncToken', 'clearStoredSyncToken',
    'emitTimelineClientDiag', 'emitCubSessionFail', 'ensureSyncSession', 'syncApiFetch',
    'isSyncTokenReady', 'timelineServerSyncActive', 'emitTimelineSyncActiveDiag',
    'readCubCredentialsPresence', 'ensureTimelineSyncReady', 'refreshPickerActiveWatch'];
  vm.runInContext(names.map(extract).join('\n'), ctx);
  ctx.fetchCloudResumeProgress = () => ctx.syncApiFetch('/timeline/resume').then(r => r ? r.json() : null);
  return { ctx, storage, requests, timers, listeners, playerListeners, video,
    count: route => requests.filter(r => r.route === route).length,
    advance: ms => { now += ms; video.currentTime += ms / 1000; },
    timeout: ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }
  };
}

test('B/C: ten expired-token sync consumers share one HTTP refresh then all continue', async () => {
  const gate = deferred();
  const h = harness({ onFetch: req => req.route === '/sync/cub/session' ? gate.promise : undefined });
  const calls = Array.from({ length: 10 }, () => h.ctx.syncApiFetch('/timeline', { method: 'POST' }));
  await flush();
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.equal(h.count('/timeline'), 0);
  gate.resolve(fresh());
  const results = await Promise.all(calls);
  assert.equal(results.filter(r => r && r.ok).length, 10);
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.equal(h.count('/timeline'), 10);
  assert.equal(h.storage.sync.token, 'test-fresh');
  assert.equal(h.ctx.syncSessionPromise, null);
});

test('A: valid token sync does not renew', async () => {
  const h = harness({ valid: true });
  assert.equal((await h.ctx.syncApiFetch('/timeline')).status, 200);
  assert.equal(h.count('/sync/cub/session'), 0);
});

test('D: refresh HTTP failure settles all consumers; next request can retry', async () => {
  let failing = true;
  const h = harness({ onFetch: req => req.route === '/sync/cub/session' && failing
    ? Promise.resolve(response(503, {})) : undefined });
  const values = await Promise.all(Array.from({ length: 10 }, () => h.ctx.syncApiFetch('/timeline')));
  assert.ok(values.every(v => v === null));
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.equal(h.count('/timeline'), 0);
  assert.equal(h.ctx.syncSessionPromise, null);
  failing = false;
  assert.equal((await h.ctx.syncApiFetch('/timeline')).status, 200);
  assert.equal(h.count('/sync/cub/session'), 2);
});

test('E: throwing and rejecting telemetry cannot break refresh, sync or picker', async () => {
  for (const mode of ['throw', 'reject']) {
    const h = harness({ onFetch: req => {
      if (req.route === '/timeline/client-debug') {
        if (mode === 'throw') throw Error('telemetry offline');
        return Promise.reject(Error('telemetry offline'));
      }
    } });
    assert.equal((await h.ctx.syncApiFetch('/timeline')).status, 200);
    let rendered = 0;
    await h.ctx.refreshPickerActiveWatch([{ source_key: 'mikai' }], () => { rendered++; });
    assert.equal(rendered, 1);
    assert.equal(h.count('/sync/cub/session'), 1);
    assert.ok(h.requests.filter(r => r.route === '/timeline/client-debug').every(r => !r.init.headers.Authorization));
  }
});

test('defensive reentrant calls join the published refresh promise, including forceRefresh', async () => {
  const gate = deferred(), joined = [];
  const h = harness({ onFetch: (req, ctx) => {
    if (req.route === '/sync/cub/session') return gate.promise;
    if (req.route === '/timeline/client-debug') joined.push(ctx.ensureSyncSession(true));
  } });
  const first = h.ctx.ensureSyncSession(false);
  const forced = h.ctx.ensureSyncSession(true);
  assert.equal(first, forced);
  await flush();
  assert.ok(joined.every(p => p === first));
  assert.equal(h.count('/sync/cub/session'), 1);
  gate.resolve(fresh());
  assert.equal((await first).token, 'test-fresh');
  await Promise.all(joined);
});

test('late 401 from an old token reuses the fresh session without another refresh', async () => {
  const late = deferred();
  let oldCalls = 0;
  const h = harness({ valid: true, onFetch: req => {
    if (req.route === '/timeline' && req.init.headers.Authorization === 'Bearer test-old') {
      return ++oldCalls === 1 ? Promise.resolve(response(401, {})) : late.promise;
    }
  } });
  const first = h.ctx.syncApiFetch('/timeline');
  const second = h.ctx.syncApiFetch('/timeline');
  assert.equal((await first).status, 200);
  late.resolve(response(401, {}));
  assert.equal((await second).status, 200);
  assert.equal(h.count('/sync/cub/session'), 1);
});

test('F: readiness failure cannot block rendering search results', async () => {
  const h = harness();
  h.ctx.ensureTimelineSyncReady = () => { throw Error('readiness failed'); };
  const results = [{ source_key: 'mikai' }, { source_key: 'anitube' }];
  const cards = [];
  await h.ctx.refreshPickerActiveWatch(results, () => cards.push(...results));
  assert.equal(cards.length, 2);
});

test('F: rejected readiness and failed resume still render exactly once', async () => {
  for (const failure of ['readiness', 'resume', 'http']) {
    const h = harness({ onFetch: req => failure === 'http' && req.route === '/sync/cub/session'
      ? Promise.resolve(response(503, {})) : undefined });
    if (failure === 'readiness') h.ctx.ensureTimelineSyncReady = () => Promise.reject(Error('not ready'));
    if (failure === 'resume') h.ctx.fetchCloudResumeProgress = () => Promise.reject(Error('resume offline'));
    let rendered = 0;
    await h.ctx.refreshPickerActiveWatch([{ source_key: 'mikai' }], () => { rendered++; });
    assert.equal(rendered, 1);
    assert.equal(h.ctx.pickerActiveWatchProgress, null);
  }
});

test('G/H: expiry while Player active preserves playback; Player exit and next anime picker work', async () => {
  const h = harness({ valid: true });
  h.advance(3600001);
  const before = h.video.currentTime;
  assert.equal((await h.ctx.syncApiFetch('/timeline', { method: 'POST' })).status, 200);
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.equal(h.video.paused, false);
  h.advance(5000);
  assert.ok(h.video.currentTime > before);
  // Exercise the existing Player destroy hook; only its DOM/stream boundaries are stubbed.
  Object.assign(h.ctx, {
    playerSyncHooksBound: false, visibilitySyncHookBound: false,
    activePlaybackSession: { identity: { media_key: 'tv:tmdb:1' }, movie: { id: 1 } },
    flushActivePlayback: () => h.ctx.syncApiFetch('/timeline', { method: 'POST' }),
    clearActiveEphemeralPlaybackState() {}, refreshActiveEpisodeTimelineDom() {}
  });
  vm.runInContext(extract('bindVisibilitySyncHook') + '\n' + extract('bindPlayerSyncHooks'), h.ctx);
  h.ctx.bindPlayerSyncHooks();
  h.playerListeners.destroy();
  await flush();
  assert.equal(h.ctx.activePlaybackSession, null);
  let cards = 0;
  const results = [{ source_key: 'mikai' }, { source_key: 'anitube' }];
  await h.ctx.refreshPickerActiveWatch(results, () => { cards = results.length; });
  assert.equal(cards, 2);
  assert.equal(h.count('/sync/cub/session'), 1);
});

test('401 renewal is not swallowed by a concurrent cached-token lookup', async () => {
  const oldResponse = deferred();
  const h = harness({ valid: true, onFetch: req =>
    req.route === '/timeline' && req.init.headers.Authorization === 'Bearer test-old'
      ? oldResponse.promise : undefined });
  const request = h.ctx.syncApiFetch('/timeline');
  await flush();
  oldResponse.resolve(response(401, {}));
  const lookup = h.ctx.ensureSyncSession(false);
  await lookup;
  assert.equal((await request).status, 200);
  assert.equal(h.count('/sync/cub/session'), 1);
});

function installErrors(h) {
  vm.runInContext(['safeClientErrorMessage', 'safeClientErrorFilename', 'safeClientErrorStack',
    'installClientErrorTelemetry'].map(extract).join('\n'), h.ctx);
  h.ctx.installClientErrorTelemetry();
}

test('global errors log safe context and locations without CUB transport or suppressing Lampa', () => {
  const h = harness();
  const prior = () => 'existing handler';
  h.ctx.window.onerror = prior;
  h.ctx.ensureSyncSession = () => { throw Error('must not enter auth'); };
  installErrors(h);
  h.listeners.error({ message: "Cannot read properties of undefined (reading 'privateValue')",
    filename: 'https://host/private/plugin.js?token=SIGNED', lineno: 12, colno: 3,
    error: { name: 'TypeError', stack: 'TypeError: cookie=SECRET\n at fn (https://host/plugin.js?token=SIGNED:12:3)' },
    preventDefault: () => assert.fail('Lampa error suppressed') });
  const event = h.ctx.window.LampaSourceClientErrors.events[0];
  assert.equal(event.event_type, 'client_script_error');
  assert.equal(event.stack, 'plugin.js:12:3');
  assert.equal(event.filename, 'plugin.js');
  assert.equal(event.active_screen, 'player');
  assert.equal(event.playback_active, true);
  assert.equal(event.playback_age_seconds, 10);
  assert.equal(event.plugin_version, '1.1.88');
  assert.equal(h.ctx.window.onerror, prior);
  assert.equal(h.count('/sync/cub/session'), 0);
  assert.equal(h.count('/analytics/event'), 1);
  assert.doesNotMatch(JSON.stringify(event), /https:|SIGNED|SECRET|privateValue|test-cub|test-old/);
});

test('global rejection records screen after Player exit; opaque and hostile errors fail safely', () => {
  const h = harness();
  installErrors(h);
  h.ctx.window.LampaSourcePlaybackDiag.last_player_event = 'destroy';
  h.listeners.unhandledrejection({ reason: { name: 'RangeError', message: 'Maximum call stack size exceeded',
    stack: 'RangeError\n at fn (https://host/plugin.js:2400:7)' } });
  let event = h.ctx.window.LampaSourceClientErrors.events[0];
  assert.equal(event.active_screen, 'lampa_source_results');
  assert.equal(event.playback_active, false);
  assert.equal(event.event_type, 'unhandled_promise_rejection');
  h.advance(10000);
  h.listeners.error({ message: 'Script error.', error: null, filename: '', lineno: 0, colno: 0 });
  event = h.ctx.window.LampaSourceClientErrors.events[1];
  assert.equal(event.message, 'Script error.');
  assert.equal(event.stack, '');
  const hostile = Object.defineProperty({}, 'message', { get() { throw Error('getter'); } });
  assert.doesNotThrow(() => h.listeners.unhandledrejection({ reason: hostile }));
});

test('telemetry failure keeps bounded local logs and rate limits; installation is idempotent', () => {
  const h = harness({ onFetch: req => { if (req.route === '/analytics/event') throw Error('offline'); } });
  installErrors(h);
  const handler = h.listeners.error;
  h.ctx.installClientErrorTelemetry();
  assert.equal(h.listeners.error, handler);
  for (let i = 0; i < 100; i++) h.listeners.error({ message: 'Script error.' });
  assert.equal(h.count('/analytics/event'), 1);
  for (let i = 0; i < 35; i++) { h.advance(60000); h.listeners.error({ message: 'Script error.' }); }
  assert.equal(h.count('/analytics/event'), 30);
  assert.equal(h.ctx.window.LampaSourceClientErrors.events.length, 30);
  h.advance(3600000);
  h.listeners.error({ message: 'Script error.' });
  assert.equal(h.count('/analytics/event'), 31);
  assert.equal(h.ctx.window.LampaSourceClientErrors.events.length, 30);
});

test('refresh network error and malformed response settle safely and permit a later retry', async () => {
  for (const failure of ['reject', 'throw', 'json', 'invalid']) {
    let failing = true;
    const h = harness({ onFetch: req => {
      if (req.route !== '/sync/cub/session' || !failing) return;
      if (failure === 'throw') throw Error('offline');
      if (failure === 'reject') return Promise.reject(Error('offline'));
      if (failure === 'json') return Promise.resolve({ ok: true, json: () => Promise.reject(Error('json')) });
      return Promise.resolve(response(200, { ok: false }));
    } });
    assert.equal(await h.ctx.syncApiFetch('/timeline'), null);
    assert.equal(h.ctx.syncSessionPromise, null);
    failing = false;
    assert.equal((await h.ctx.syncApiFetch('/timeline')).status, 200);
    assert.equal(h.count('/sync/cub/session'), 2);
  }
});

test('a second 401 is returned without recursive retry', async () => {
  const h = harness({ valid: true, onFetch: req => req.route === '/timeline'
    ? Promise.resolve(response(401, {})) : undefined });
  assert.equal((await h.ctx.syncApiFetch('/timeline')).status, 401);
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.equal(h.count('/timeline'), 2);
});

test('manual local expiry gate changes only expiry and is absent from production code', async () => {
  const h = harness({ valid: true });
  const token = h.storage.sync.token;
  const get = h.ctx.Lampa.Storage.get, set = h.ctx.Lampa.Storage.set;
  h.ctx.Lampa.Storage.get = key => get(key === 'lampa_source_sync_token_v1' ? 'sync' : key);
  h.ctx.Lampa.Storage.set = (key, value) => set(key === 'lampa_source_sync_token_v1' ? 'sync' : key, value);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/expire-sync.local.js'), 'utf8'), h.ctx);
  assert.equal(h.ctx.expireLampaSourceSyncForTest().expired, true);
  assert.equal(h.storage.sync.token, token);
  assert.ok(h.storage.sync.expires_at < h.ctx.Date.now());
  const results = await Promise.all(Array.from({ length: 10 }, () => h.ctx.syncApiFetch('/timeline')));
  assert.ok(results.every(r => r && r.ok));
  assert.equal(h.count('/sync/cub/session'), 1);
  assert.doesNotMatch(source, /expireLampaSourceSyncForTest|expire-sync\.local/);
});
