// MANUAL LOCAL GATE ONLY. Not imported or loaded by plugin.js.
// Paste in the Lampa browser console, then call expireLampaSourceSyncForTest().
// Changes only the cached expiry timestamp; never prints or replaces token values.
function expireLampaSourceSyncForTest() {
  var key = 'lampa_source_sync_token_v1';
  var saved = Lampa.Storage.get(key, null);
  if (!saved || !saved.token) return { expired: false, reason: 'no_cached_session' };
  Lampa.Storage.set(key, Object.assign({}, saved, { expires_at: Date.now() - 1 }));
  return { expired: true };
}
