(function () {
  'use strict';

  var DEFAULT_API_URL = 'https://130-162-220-139.sslip.io';
  var API_URL = getApiUrl();
  var serverSourceRegistry = null;
  var PLUGIN_VERSION = '1.1.35-test-kinovod-v1';
  var CLIENT_CACHE_VERSION = '41';
  var TEST_BUILD = 'KINOVOD_V1';
  var DEVICE_ID_KEY = 'lampa_source_device_id';
  var HEARTBEAT_INTERVAL = 1000 * 60;
  var REQUEST_CACHE_TTL = 1000 * 60 * 10;
  var requestCache = {};
  var lastHeartbeatAt = 0;
  var titleDbVersionCheckAt = 0;
  var titleDbVersionPromise = null;
  var SOURCE_OPTIONS = [
    { key: 'uakino', title: 'UAKino' },
    { key: 'rezka', title: 'Rezka' },
    { key: 'eneyida', title: 'Eneyida' },
    { key: 'filmix', title: 'Filmix' },
    { key: 'uafix', title: 'UAFix' },
    { key: 'anitube', title: 'AniTube' },
    { key: 'animeon', title: 'AnimeON' },
    { key: 'anilibria', title: 'AniLibria' },
    { key: 'kinovod', title: 'Kinovod' },
    { key: 'all', title: 'Всі джерела' }
  ];
  function sourceOptions() {
    var options = !serverSourceRegistry
      ? SOURCE_OPTIONS.slice()
      : Object.keys(serverSourceRegistry)
        .filter(function (key) {
          return key !== 'kodik' && serverSourceRegistry[key].enabled !== false;
        })
        .map(function (key) {
        return { key: key, title: serverSourceRegistry[key].display_name || key };
      }).concat([{ key: 'all', title: 'Всі джерела' }]);
    var hidden = Lampa.Storage.get('lampa_source_hidden', []);
    if (Array.isArray(hidden) && hidden.length) {
      options = options.filter(function (item) {
        return item.key === 'all' || hidden.indexOf(item.key) === -1;
      });
    }
    var order = Lampa.Storage.get('lampa_source_sort_order', []);
    if (Array.isArray(order) && order.length) {
      options.sort(function (a, b) {
        if (a.key === 'all') return 1;
        if (b.key === 'all') return -1;
        var ai = order.indexOf(a.key);
        var bi = order.indexOf(b.key);
        if (ai === -1) ai = 999;
        if (bi === -1) bi = 999;
        return ai - bi;
      });
    }
    return options;
  }
  var REZKA_PLACEHOLDER_SOURCE_URL = 'client://lampa-source/rezka/auth-required';
  var REZKA_AUTH_REQUIRED_LABEL = 'Потрібен вхід';
  var REZKA_AUTH_HINT = 'Увійдіть в акаунт Rezka у налаштуваннях Lampa Source';

  function hasRezkaAuthCookieValue(cookie) {
    return String(cookie || '').trim().length > 0;
  }

  function isRezkaPickerItem(item) {
    if (!item) return false;
    if (sourceKeyFromText(item.source_key) === 'rezka') return true;
    if (String(item.site || '').toLowerCase() === 'rezka') return true;
    return String(item.source_url || '').toLowerCase().indexOf('rezka') !== -1;
  }

  function isRezkaSourceConfiguredForPicker() {
    if (Lampa.Storage.get('lampa_source_rezka_enabled', true) === false) return false;
    var hidden = Lampa.Storage.get('lampa_source_hidden', []);
    return !(Array.isArray(hidden) && hidden.indexOf('rezka') !== -1);
  }

  function shouldInjectRezkaAuthPlaceholder() {
    return isRezkaSourceConfiguredForPicker() && !hasRezkaAuthCookieValue(Lampa.Storage.get('lampa_source_rezka_cookie', ''));
  }

  function buildRezkaAuthPlaceholder(movie) {
    movie = movie || {};
    return {
      source_key: 'rezka',
      site: 'Rezka',
      title: 'Rezka',
      display_title: 'Rezka',
      auth_required: true,
      client_placeholder: true,
      source_status: 'AUTH_REQUIRED',
      source_url: REZKA_PLACEHOLDER_SOURCE_URL,
      year: String((movie.release_date || movie.first_air_date || '')).slice(0, 4),
      type: String(movie.type || movie.media_type || '').trim()
    };
  }

  function applyRezkaAuthPlaceholder(results, movie) {
    var list = (results || []).slice();
    if (!shouldInjectRezkaAuthPlaceholder()) return list;
    if (list.some(isRezkaPickerItem)) return list;
    return list.concat([buildRezkaAuthPlaceholder(movie)]);
  }

  var PERSISTENT_CACHE_PREFIX = 'lampa_source_pcache_v' + CLIENT_CACHE_VERSION + '_';
  var PERSISTENT_CACHE_TTL = {
    search: 1000 * 60 * 30,
    translations: 1000 * 60 * 60 * 6,
    seasons: 1000 * 60 * 60 * 6,
    episodes: 1000 * 60 * 60 * 12
  };

  var RESULTS_COMPONENT = 'lampa_source_results';
  var EPISODES_COMPONENT = 'lampa_source_episodes';

  function getApiUrl() {
    return String(Lampa.Storage.get('lampa_source_api_url', DEFAULT_API_URL) || DEFAULT_API_URL).replace(/\/+$/, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  var PICKER_SOURCE_SITE_NAMES = {
    filmix: 1,
    rezka: 1,
    uakino: 1,
    eneyida: 1,
    anitube: 1,
    animeon: 1,
    anilibria: 1,
    uafix: 1,
    zetflix: 1,
    moon: 1
  };

  var PICKER_GENRE_TOKENS = {
    action: 1, adventure: 1, 'action adventure': 1, 'боевик': 1, 'бойовик': 1, 'приключения': 1, 'пригоди': 1,
    'екшн': 1, 'экшен': 1, 'экшн': 1, detective: 1, 'детектив': 1, crime: 1, 'криминал': 1, 'кримінал': 1,
    mystery: 1, drama: 1, 'драма': 1, thriller: 1, 'триллер': 1, 'трилер': 1, horror: 1, 'ужасы': 1, 'жахи': 1,
    fantasy: 1, 'фэнтези': 1, 'фентезі': 1, 'sci fi': 1, 'sci-fi': 1, 'science fiction': 1, 'нф': 1, 'фантастика': 1,
    comedy: 1, 'комедия': 1, 'комедія': 1, romance: 1, 'мелодрама': 1, 'романтика': 1,
    animation: 1, 'анимация': 1, 'анімація': 1, anime: 1, 'аниме': 1, 'аніме': 1,
    documentary: 1, 'документальный': 1, 'документальний': 1, family: 1, 'семейный': 1, 'сімейний': 1,
    history: 1, 'исторический': 1, 'історичний': 1, war: 1, 'военный': 1, 'військовий': 1, western: 1
  };

  var PICKER_CATEGORY_TOKENS = {
    specials: 1, special: 1, 'спецматериалы': 1, 'спецматеріали': 1, extras: 1, extra: 1,
    'новинки': 1, 'популярне': 1, 'популярное': 1, 'топ': 1, 'премьеры': 1, 'премєри': 1
  };

  function normalizePickerText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizePickerKey(value) {
    return normalizePickerText(value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/ї/g, 'и')
      .replace(/і/g, 'и')
      .replace(/є/g, 'е')
      .replace(/ґ/g, 'г')
      .replace(/[^\p{L}\p{N}\s:/\-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function uniquePickerTitles(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (value) {
      var raw = normalizePickerText(value);
      var key = normalizePickerKey(raw);
      if (!raw || !key || seen[key]) return;
      seen[key] = 1;
      out.push(raw);
    });
    return out;
  }

  function isLikelyPickerTitle(value) {
    var s = normalizePickerText(value);
    var n = normalizePickerKey(s);
    if (!n || n.length < 3) return false;
    if (n === 'драма' || n === 'історичний' || n === 'исторический' || n === 'мелодрама' || n === 'трилер' ||
      n === 'фантастика' || n === 'комедия' || n === 'комедія' || n === 'боевик' || n === 'екшн' ||
      n === 'пригоди' || n === 'приключения' || n === 'ужасы' || n === 'жахи' || n === 'криминал' ||
      n === 'кримінал' || n === 'en' || n === 'ru' || n === 'uk' || n === 'ua' || n === 'ja') {
      return false;
    }
    return true;
  }

  function splitPickerGenreParts(value) {
    return normalizePickerKey(value)
      .split(/\s+(?:and|и|і|та)\s+|\s*&\s*/)
      .filter(Boolean);
  }

  function isGenreLikePickerTitle(value) {
    var normalized = normalizePickerKey(value);
    if (!normalized) return true;
    if (PICKER_GENRE_TOKENS[normalized]) return true;
    var parts = splitPickerGenreParts(value);
    return parts.length > 1 && parts.every(function (part) { return !!PICKER_GENRE_TOKENS[part]; });
  }

  function isCategoryLikePickerTitle(value) {
    var normalized = normalizePickerKey(value);
    if (!normalized) return true;
    if (PICKER_CATEGORY_TOKENS[normalized]) return true;
    return /^(фільми|сериали|серіали|фильмы|мультфільми|мультфильмы|аниме|аніме|сезон|season)\b/.test(normalized);
  }

  function isUnusablePickerSourceTitle(sourceTitle) {
    var raw = normalizePickerText(sourceTitle);
    if (!raw) return true;
    if (!isLikelyPickerTitle(raw)) return true;
    if (isGenreLikePickerTitle(raw)) return true;
    if (isCategoryLikePickerTitle(raw)) return true;
    return false;
  }

  function isSourceSiteNamePickerTitle(value, source) {
    var raw = normalizePickerText(value);
    if (!raw) return true;
    var normalized = normalizePickerKey(raw);
    var keys = [source && source.source_key, source && source.site]
      .map(function (item) { return normalizePickerKey(item); })
      .filter(Boolean);
    if (keys.some(function (key) { return normalized === key; })) return true;
    return !!PICKER_SOURCE_SITE_NAMES[normalized];
  }

  function buildPickerReferenceTitles(source, movie) {
    source = source || {};
    movie = movie || {};
    return uniquePickerTitles([
      source.title,
      source.display_title,
      movie.title || movie.name,
      movie.original_title || movie.original_name
    ]);
  }

  function isAuthPickerSource(source, authRequired, sourceReadiness) {
    if (!source) return false;
    if (authRequired) return true;
    if (source.client_placeholder) return true;
    if (source.auth_required) return true;
    var key = sourceKey(source);
    var readiness = sourceReadiness && sourceReadiness[key];
    return !!(readiness && readiness.status === 'AUTH_REQUIRED');
  }

  function resolveSourcePickerDisplayTitle(source, movie, authRequired, sourceReadiness) {
    source = source || {};
    movie = movie || {};
    var siteName = normalizePickerText(source.site || sourceKey(source));
    var canonical = normalizePickerText(source.title || source.display_title || movie.title || movie.name);

    if (isAuthPickerSource(source, authRequired, sourceReadiness)) {
      return normalizePickerText(source.title || source.display_title) || siteName || 'Без назви';
    }

    var references = buildPickerReferenceTitles(source, movie);
    var sourceTitle = normalizePickerText(source.source_title);

    if (
      sourceTitle &&
      !isSourceSiteNamePickerTitle(sourceTitle, source) &&
      !isUnusablePickerSourceTitle(sourceTitle)
    ) {
      return sourceTitle;
    }

    var displayTitle = normalizePickerText(source.display_title);
    if (
      displayTitle &&
      normalizePickerKey(displayTitle) !== normalizePickerKey(canonical) &&
      !isSourceSiteNamePickerTitle(displayTitle, source) &&
      !isUnusablePickerSourceTitle(displayTitle)
    ) {
      return displayTitle;
    }

    return canonical || 'Без назви';
  }

  function buildAuthHeaders() {
    var filmixToken = Lampa.Storage.get('lampa_source_filmix_token', '') || Lampa.Storage.get('fxapi_token', '');
    var payload = {
      uakino_enabled: Lampa.Storage.get('lampa_source_uakino_enabled', true) ? '1' : '0',
      uakino_mirror: Lampa.Storage.get('lampa_source_uakino_mirror', ''),
      anitube_enabled: Lampa.Storage.get('lampa_source_anitube_enabled', true) ? '1' : '0',
      anitube_mirror: Lampa.Storage.get('lampa_source_anitube_mirror', ''),
      anitube_proxy_url: Lampa.Storage.get('lampa_source_anitube_proxy_url', '') || getCustomProxyUrl(),
      kodik_enabled: '0',
      uafix_enabled: Lampa.Storage.get('lampa_source_uafix_enabled', true) ? '1' : '0',
      uafix_mirror: Lampa.Storage.get('lampa_source_uafix_mirror', ''),
      zetflix_enabled: '0',
      zetflix_mirror: Lampa.Storage.get('lampa_source_zetflix_mirror', ''),
      eneyida_enabled: Lampa.Storage.get('lampa_source_eneyida_enabled', true) ? '1' : '0',
      eneyida_mirror: Lampa.Storage.get('lampa_source_eneyida_mirror', ''),
      filmix_enabled: Lampa.Storage.get('lampa_source_filmix_enabled', true) ? '1' : '0',
      filmix_token: filmixToken,
      filmix_uid: Lampa.Storage.get('fxapi_uid', ''),
      anilibria_enabled: Lampa.Storage.get('lampa_source_anilibria_enabled', true) ? '1' : '0',
      anilibria_mirror: Lampa.Storage.get('lampa_source_anilibria_mirror', ''),
      rezka_enabled: Lampa.Storage.get('lampa_source_rezka_enabled', true) ? '1' : '0',
      rezka_login: Lampa.Storage.get('lampa_source_rezka_login', ''),
      rezka_password: Lampa.Storage.get('lampa_source_rezka_password', ''),
      rezka_cookie: Lampa.Storage.get('lampa_source_rezka_cookie', ''),
      rezka_mirror: Lampa.Storage.get('lampa_source_rezka_mirror', ''),
      rezka_stream_type: Lampa.Storage.get('lampa_source_rezka_stream_type', 'hls')
    };
    return { 'x-lampa-source-auth': JSON.stringify(payload) };
  }

  function appendTitleIdentityParams(params, movie) {
    movie = movie || {};
    var year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    if (year) params.set('year', year);
    if (movie.id || movie.tmdb_id || movie.tmdbId) params.set('tmdb_id', movie.id || movie.tmdb_id || movie.tmdbId);
    if (movie.imdb_id || movie.imdb || movie.imdbId) params.set('imdb_id', movie.imdb_id || movie.imdb || movie.imdbId);
    if (movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId) params.set('kp_id', movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId);
    if (movie.shikimori_id || movie.shikimoriId) params.set('shikimori_id', movie.shikimori_id || movie.shikimoriId);
    if (movie.type || movie.media_type) params.set('type', normalizeMovieType(movie));
    if (movie.title || movie.name) params.set('title', movie.title || movie.name);
    if (movie.original_title || movie.original_name) params.set('original_title', movie.original_title || movie.original_name);
    return params;
  }

  var downstreamStormGuard = (function () {
    var inflight = {};
    return {
      run: function (key, runner) {
        key = String(key || '');
        if (!key) return Promise.resolve().then(runner);
        if (inflight[key]) return inflight[key];
        var promise = Promise.resolve().then(runner).finally(function () {
          delete inflight[key];
        });
        inflight[key] = promise;
        return promise;
      },
      has: function (key) {
        return !!inflight[String(key || '')];
      }
    };
  })();

  var SEARCH_DEDUPE_IGNORE_PARAMS = { stale_fallback: 1, t: 1, _: 1 };

  function isRateLimitedResponse(data) {
    return !!(data && data.error === 'rate_limited');
  }

  function normalizeRetryAfterMs(retryAfter) {
    var seconds = Number(retryAfter);
    var boundedSeconds = Number.isFinite(seconds) && seconds > 0
      ? Math.max(1, Math.min(300, Math.ceil(seconds)))
      : 1;
    return boundedSeconds * 1000;
  }

  function isAllSourcesSelection(selectedSource) {
    var key = String(selectedSource || '').trim().toLowerCase();
    if (!key || key === 'all' || key === 'auto') return true;
    if (key === 'всі джерела' || key === 'все источники') return true;
    if (/^https?:\/\//.test(key)) return false;
    return validSourceKey(key) === 'all';
  }

  function buildSourceCooldownKey(selectedSource) {
    if (isAllSourcesSelection(selectedSource)) return 'all';
    var raw = String(selectedSource || '').trim().toLowerCase();
    if (/^https?:\/\//.test(raw)) return 'all';
    return validSourceKey(selectedSource) || 'all';
  }

  function buildRateLimitIdentity(url, selectedSource, requestId) {
    return String(url || '') + '|' + buildSourceCooldownKey(selectedSource) + '|' + String(requestId || '');
  }

  function normalizeSearchRequestKey(url) {
    var raw = String(url || '');
    if (!raw) return '';

    try {
      var parsed = new URL(raw, getApiUrl());
      if (String(parsed.pathname || '').indexOf('/search') === -1) return raw;
      var pairs = [];
      parsed.searchParams.forEach(function (value, key) {
        if (SEARCH_DEDUPE_IGNORE_PARAMS[key]) return;
        pairs.push([key, value]);
      });
      pairs.sort(function (a, b) {
        return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);
      });
      return parsed.origin + parsed.pathname + '?' + pairs.map(function (pair) {
        return pair[0] + '=' + pair[1];
      }).join('&');
    } catch (e) {
      return raw;
    }
  }

  var searchInflightDedupe = (function () {
    var inflight = {};
    var metrics = { search_inflight_dedupe_hit: 0 };

    return {
      run: function (key, runner) {
        key = String(key || '');
        if (!key) return Promise.resolve().then(runner);
        if (inflight[key]) {
          metrics.search_inflight_dedupe_hit += 1;
          pickerTelemetry('search_inflight_dedupe_hit', {});
          return inflight[key];
        }
        var promise = Promise.resolve().then(runner).finally(function () {
          delete inflight[key];
        });
        inflight[key] = promise;
        return promise;
      },
      has: function (key) {
        return !!inflight[String(key || '')];
      },
      metrics: metrics
    };
  })();

  function createRateLimitRetryScheduler() {
    var entries = {};
    var metrics = {
      search_rate_limited: 0,
      search_rate_limit_retry_scheduled: 0
    };

    function cancel(identity) {
      if (identity == null) {
        Object.keys(entries).forEach(function (key) {
          clearTimeout(entries[key].timerId);
        });
        entries = {};
        return;
      }

      var key = String(identity);
      if (entries[key]) clearTimeout(entries[key].timerId);
      delete entries[key];
    }

    function schedule(options) {
      options = options || {};
      var generation = options.generation;
      var identity = String(options.identity || '');
      var delayMs = normalizeRetryAfterMs(options.retry_after);
      var onRetry = options.onRetry;
      var shouldRetry = options.shouldRetry;

      if (!identity || typeof onRetry !== 'function') return false;

      metrics.search_rate_limited += 1;
      metrics.search_rate_limit_retry_scheduled += 1;

      cancel(identity);

      var timerId = setTimeout(function () {
        delete entries[identity];
        if (typeof shouldRetry === 'function' && !shouldRetry({ identity: identity, generation: generation })) return;
        onRetry();
      }, delayMs);

      entries[identity] = { timerId: timerId, generation: generation, identity: identity };
      return true;
    }

    return {
      schedule: schedule,
      cancel: cancel,
      cancelAll: function () { cancel(null); },
      hasScheduled: function (identity) {
        if (identity == null) return Object.keys(entries).length > 0;
        return !!entries[String(identity)];
      },
      metrics: metrics
    };
  }

  function buildSearchDedupeKey(url, options) {
    options = options || {};
    var identity = '';
    var source = 'all';
    try {
      var parsed = new URL(String(url || ''), getApiUrl());
      identity = [
        parsed.searchParams.get('title') || '',
        parsed.searchParams.get('original_title') || '',
        parsed.searchParams.get('year') || '',
        parsed.searchParams.get('type') || '',
        parsed.searchParams.get('tmdb_id') || '',
        parsed.searchParams.get('imdb_id') || '',
        parsed.searchParams.get('kp_id') || '',
        parsed.searchParams.get('shikimori_id') || ''
      ].map(function (part) { return String(part || '').trim().toLowerCase(); }).join('|');
      source = buildSourceCooldownKey(parsed.searchParams.get('sources'));
    } catch (e) { }
    var staleSuffix = options.staleFallback ? '|stale=1' : '';
    return identity + '|' + source + '|' + normalizeSearchRequestKey(url) + staleSuffix;
  }

  function createSearchLoadGate() {
    var initialStarted = false;
    var initialSettled = false;

    return {
      reset: function () {
        initialStarted = false;
        initialSettled = false;
      },
      tryStartInitial: function () {
        if (initialStarted) return false;
        initialStarted = true;
        return true;
      },
      markInitialSettled: function () {
        initialSettled = true;
      },
      canPoll: function () {
        return initialSettled;
      },
      canSupplement: function () {
        return initialSettled;
      },
      isInitialStarted: function () {
        return initialStarted;
      },
      isInitialSettled: function () {
        return initialSettled;
      }
    };
  }

  var SEARCH_POLL_MIN_MS = 2000;
  var SEARCH_POLL_MAX_DELAY_MS = 8000;
  var SEARCH_POLL_BACKOFF_MS = [2000, 4000, 8000];
  var SEARCH_POLL_MAX_NETWORK = 4;
  var SEARCH_POLL_MAX_POLLS = 3;

  function isSearchExplicitlyActive(data) {
    return !!(data && (data.search_active === true || data.refreshing === true || data.server_busy === true));
  }

  function resolveServerPollHintMs(data) {
    if (!data) return 0;
    var nextPoll = Number(data.next_poll_ms);
    if (Number.isFinite(nextPoll) && nextPoll > 0) {
      return Math.min(SEARCH_POLL_MAX_DELAY_MS, Math.max(SEARCH_POLL_MIN_MS, Math.ceil(nextPoll)));
    }
    if (!isRateLimitedResponse(data)) {
      var retryAfterSec = Number(data.retry_after);
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        return Math.min(SEARCH_POLL_MAX_DELAY_MS, Math.max(SEARCH_POLL_MIN_MS, normalizeRetryAfterMs(retryAfterSec)));
      }
    }
    return 0;
  }

  function pollNeedsFreshFetch(data) {
    if (!data) return true;
    if (isSearchExplicitlyActive(data)) return true;
    if (data.cached === true && !isSearchExplicitlyActive(data)) return false;
    return data.ok === true && Array.isArray(data.results) && data.results.length === 0;
  }

  function shouldScheduleSearchPoll(data, options) {
    options = options || {};
    var startedAt = options.startedAt;
    var waitMs = options.waitMs || 12000;
    var networkCount = options.networkCount || 0;
    var pollCount = options.pollCount || 0;
    var maxNetwork = options.maxNetwork || SEARCH_POLL_MAX_NETWORK;
    var maxPolls = options.maxPolls || SEARCH_POLL_MAX_POLLS;
    var hasRenderableResults = !!options.hasRenderableResults;
    var now = options.now != null ? options.now : Date.now();

    if (networkCount >= maxNetwork) return false;
    if (pollCount >= maxPolls) return false;
    if (now - startedAt >= waitMs) return false;
    if (isRateLimitedResponse(data)) return false;
    if (hasRenderableResults && !isSearchExplicitlyActive(data)) return false;
    if (data && data.search_active === false && !isSearchExplicitlyActive(data)) return false;
    if (data && data.cached === true && !isSearchExplicitlyActive(data)) return false;
    return isSearchStillActive(data, startedAt, waitMs);
  }

  function resolveSearchPollDelayMs(data, pollCount, options) {
    options = options || {};
    var backoff = options.backoffMs || SEARCH_POLL_BACKOFF_MS;
    var minMs = options.minPollMs != null ? options.minPollMs : SEARCH_POLL_MIN_MS;
    var maxMs = options.maxPollDelayMs != null ? options.maxPollDelayMs : SEARCH_POLL_MAX_DELAY_MS;
    var serverHint = resolveServerPollHintMs(data);
    var backoffMs = backoff[Math.min(Math.max(pollCount || 0, 0), backoff.length - 1)];
    var chosen = serverHint > 0 ? serverHint : backoffMs;
    return Math.min(maxMs, Math.max(minMs, chosen));
  }

  function createSearchPollController(options) {
    options = options || {};
    var waitMs = options.waitMs || 12000;
    var maxNetwork = options.maxNetwork || SEARCH_POLL_MAX_NETWORK;
    var maxPolls = options.maxPolls || SEARCH_POLL_MAX_POLLS;
    var networkCount = 0;
    var pollCount = 0;
    var startedAt = Date.now();
    var lastResponse = null;

    return {
      reset: function (started) {
        networkCount = 0;
        pollCount = 0;
        startedAt = started != null ? started : Date.now();
        lastResponse = null;
      },
      setLastResponse: function (data) {
        lastResponse = data;
      },
      getLastResponse: function () {
        return lastResponse;
      },
      recordNetwork: function () {
        networkCount += 1;
      },
      getNetworkCount: function () {
        return networkCount;
      },
      getPollCount: function () {
        return pollCount;
      },
      canStartNetwork: function () {
        return networkCount < maxNetwork;
      },
      shouldPoll: function (data, ctx) {
        ctx = ctx || {};
        return shouldScheduleSearchPoll(data, {
          startedAt: startedAt,
          waitMs: waitMs,
          networkCount: networkCount,
          pollCount: pollCount,
          maxNetwork: maxNetwork,
          maxPolls: maxPolls,
          hasRenderableResults: ctx.hasRenderableResults,
          now: ctx.now
        });
      },
      nextDelayMs: function (data) {
        return resolveSearchPollDelayMs(data, pollCount, options);
      },
      markPollScheduled: function () {
        pollCount += 1;
      },
      pollBypassMemory: function (data) {
        return pollNeedsFreshFetch(data || lastResponse);
      },
      isPastDeadline: function (now) {
        return (now != null ? now : Date.now()) - startedAt >= waitMs;
      }
    };
  }

  function createSourceRateLimitCooldown() {
    var untilBySource = {};

    return {
      mark: function (source, retryAfter, meta) {
        meta = meta || {};
        var key = buildSourceCooldownKey(source);
        untilBySource[key] = {
          until: Date.now() + normalizeRetryAfterMs(retryAfter),
          requestId: meta.requestId,
          generation: meta.generation,
          identity: meta.identity || ''
        };
      },
      peek: function (source) {
        var key = buildSourceCooldownKey(source);
        var entry = untilBySource[key];
        if (!entry) return null;
        if (Date.now() >= entry.until) {
          delete untilBySource[key];
          return null;
        }
        return entry;
      },
      isActive: function (source) {
        return !!this.peek(source);
      },
      remainingMs: function (source) {
        var entry = this.peek(source);
        if (!entry) return 0;
        return Math.max(0, entry.until - Date.now());
      },
      clear: function (source) {
        delete untilBySource[buildSourceCooldownKey(source)];
      }
    };
  }

  function shouldPersistSearchCache(data) {
    if (!data || isRateLimitedResponse(data)) return false;
    return data.ok === true && Array.isArray(data.results) && data.results.length > 0;
  }

  function json(url) {
    var stage = cacheType(url) || (String(url).indexOf('/resolve') !== -1 ? 'resolve' : '');
    if (stage) pickerTelemetry('downstream_request', { downstream_stage: stage });
    debugLog('fetch json', { url: url, type: cacheType(url) });
    return downstreamStormGuard.run(url, function () {
      return fetch(url, { headers: buildAuthHeaders() }).then(function (r) {
        if (stage) pickerTelemetry('downstream_response', { downstream_stage: stage, http_status: r.status, error_code: r.ok ? '' : 'http_error' });
        debugLog('fetch response', { url: url, status: r.status, ok: r.ok });
        return r.json();
      }).then(function (data) {
        debugLog('fetch data', summarizeApiData(url, data));
        return data;
      }).catch(function (err) {
        if (stage) pickerTelemetry('downstream_error', { downstream_stage: stage, error_code: String(err && err.name || 'request_error').slice(0, 64) });
        throw err;
      });
    });
  }

  function debugLog(message, data) {
    try {
      console.log('[Lampa Source Debug]', message, data || '');
    } catch (e) { }
  }

  function summarizeApiData(url, data) {
    var type = cacheType(url);
    var result = {
      url: url,
      type: type,
      ok: data && data.ok,
      cached: data && data.cached
    };

    if (type === 'search') {
      result.results_count = data && data.results ? data.results.length : 0;
      result.results = data && data.results ? data.results.map(function (item) {
        return {
          site: item.site,
          title: item.title,
          year: item.year,
          type: item.type,
          source_url: item.source_url
        };
      }) : [];
    }

    if (type === 'translations') {
      result.translations_count = data && data.translations ? data.translations.length : 0;
      result.translations = data && data.translations ? data.translations.map(function (tr) {
        return {
          translation_id: tr.translation_id,
          translation_name: tr.translation_name,
          player_id: tr.player_id,
          player_name: tr.player_name,
          episodes_count: tr.episodes_count,
          source_file: tr.source_file
        };
      }) : [];
    }

    if (type === 'episodes') {
      result.episodes_count = data && data.episodes ? data.episodes.length : 0;
      result.first_episode = data && data.episodes && data.episodes[0] ? data.episodes[0] : null;
    }

    return result;
  }

  function createDeviceId() {
    if (Lampa.Utils && Lampa.Utils.uid) return Lampa.Utils.uid();
    return 'ls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  }

  function getDeviceId() {
    var id = Lampa.Storage.get(DEVICE_ID_KEY, '');
    if (!id) {
      id = createDeviceId();
      Lampa.Storage.set(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function analyticsBasePayload() {
    return {
      device_id: getDeviceId(),
      device_name: 'Lampa',
      plugin_version: PLUGIN_VERSION
    };
  }

  function analyticsPost(path, payload) {
    API_URL = getApiUrl();

    try {
      fetch(API_URL + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(Object.assign(analyticsBasePayload(), payload || {})),
        keepalive: true
      }).catch(function () { });
    } catch (e) { }
  }

  function registerDevice() {
    analyticsPost('/device/register');
  }

  function heartbeat(force) {
    var now = Date.now();
    if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL) return;
    lastHeartbeatAt = now;
    analyticsPost('/device/heartbeat');
  }

  function movieAnalytics(movie) {
    movie = movie || {};

    return {
      title: movie.title || movie.name || '',
      original_title: movie.original_title || movie.original_name || '',
      year: String(movie.release_date || movie.first_air_date || '').slice(0, 4),
      type: movie.media_type || movie.type || (movie.first_air_date || movie.name || movie.original_name ? 'tv' : 'movie')
    };
  }

  function analyticsEvent(eventType, movie, extra) {
    var payload = movieAnalytics(movie);
    payload.event_type = eventType;
    Object.assign(payload, extra || {});
    analyticsPost('/analytics/event', payload);
    heartbeat(false);
  }

  var lastStateTelemetryKey = '';

  function emitStateTelemetry(eventType, movie, extra) {
    extra = extra || {};
    var key = [
      eventType,
      movie && (movie.id || movie.title || movie.name) || '',
      extra.source_key || '',
      extra.season || '',
      extra.episode || '',
      extra.translation || ''
    ].join('|');
    if (lastStateTelemetryKey === key) return;
    lastStateTelemetryKey = key;
    analyticsEvent(eventType, movie, extra);
  }

  function activityTelemetryExtras(movie, fields) {
    fields = fields || {};
    return {
      source_key: fields.source_key || '',
      source_site: fields.source_site || '',
      season: fields.season != null ? String(fields.season) : '',
      episode: fields.episode != null ? String(fields.episode) : '',
      translation: fields.translation != null ? String(fields.translation) : ''
    };
  }

  var SYNC_TOKEN_STORAGE_KEY = 'lampa_source_sync_token_v1';
  var SYNC_QUEUE_STORAGE_KEY = 'lampa_source_sync_queue_v1';
  var SYNC_QUEUE_MAX = 100;
  var SYNC_HEARTBEAT_MS = 25000;
  var SYNC_MIN_POSITION_SECONDS = 60;
  var SYNC_COMPLETED_PERCENT = 90;
  var syncTokenState = { token: '', expiresAt: 0, profileId: null };
  var activePlaybackSession = null;
  var playbackHeartbeatTimer = null;
  var playerSyncHooksBound = false;
  var syncSessionPromise = null;

  function cubSyncEnabled() {
    return !!(Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.sync);
  }

  function getCubCredentials() {
    if (!cubSyncEnabled()) return null;
    var account = Lampa.Storage.get('account', '{}');
    if (!account || !account.token || !account.profile || account.profile.id == null) return null;
    return {
      token: String(account.token),
      profile_id: String(account.profile.id)
    };
  }

  function loadStoredSyncToken() {
    var stored = Lampa.Storage.get(SYNC_TOKEN_STORAGE_KEY, null);
    if (!stored || typeof stored !== 'object') return null;
    if (!stored.token || !stored.expires_at || stored.expires_at <= Date.now()) return null;
    syncTokenState.token = String(stored.token);
    syncTokenState.expiresAt = Number(stored.expires_at) || 0;
    syncTokenState.profileId = stored.profile_id != null ? stored.profile_id : null;
    return syncTokenState;
  }

  function saveStoredSyncToken(payload) {
    if (!payload || !payload.sync_token) return;
    syncTokenState.token = String(payload.sync_token);
    syncTokenState.expiresAt = Date.now() + (Number(payload.expires_in) || 3600) * 1000 - 5000;
    syncTokenState.profileId = payload.profile_id != null ? payload.profile_id : null;
    Lampa.Storage.set(SYNC_TOKEN_STORAGE_KEY, {
      token: syncTokenState.token,
      expires_at: syncTokenState.expiresAt,
      profile_id: syncTokenState.profileId
    });
  }

  function clearStoredSyncToken() {
    syncTokenState = { token: '', expiresAt: 0, profileId: null };
    Lampa.Storage.set(SYNC_TOKEN_STORAGE_KEY, null);
  }

  function ensureSyncSession(forceRefresh) {
    if (!cubSyncEnabled()) return Promise.resolve(null);
    if (!forceRefresh) {
      var loaded = loadStoredSyncToken();
      if (loaded && loaded.token) return Promise.resolve(loaded);
    }

    var creds = getCubCredentials();
    if (!creds) return Promise.resolve(null);

    if (syncSessionPromise && !forceRefresh) return syncSessionPromise;

    API_URL = getApiUrl();
    syncSessionPromise = fetch(API_URL + '/sync/cub/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cub_token: creds.token,
        cub_profile_id: creds.profile_id
      })
    }).then(function (response) {
      if (!response.ok) {
        if (response.status === 401) clearStoredSyncToken();
        return null;
      }
      return response.json();
    }).then(function (data) {
      syncSessionPromise = null;
      if (!data || !data.ok || !data.sync_token) return null;
      saveStoredSyncToken(data);
      return syncTokenState;
    }).catch(function () {
      syncSessionPromise = null;
      return null;
    });

    return syncSessionPromise;
  }

  function syncApiFetch(path, options, retried) {
    options = options || {};
    retried = !!retried;

    return ensureSyncSession(false).then(function (session) {
      if (!session || !session.token) return null;

      var headers = Object.assign({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.token
      }, options.headers || {});

      API_URL = getApiUrl();
      return fetch(API_URL + path, Object.assign({}, options, { headers: headers })).then(function (response) {
        if (response.status === 401 && !retried) {
          clearStoredSyncToken();
          return ensureSyncSession(true).then(function () {
            return syncApiFetch(path, options, true);
          });
        }
        return response;
      });
    });
  }

  function buildPlaybackIdentity(movie, element, seasonNumber) {
    var mediaType = normalizeMovieType(movie) === 'tv' ? 'tv' : 'movie';
    var season = mediaType === 'tv' ? Math.max(0, Number(seasonNumber) || 0) : 0;
    var episode = mediaType === 'tv' ? Math.max(0, Number(element && element.episode) || 0) : 0;
    return {
      media_key: mediaStorageKey(movie),
      media_type: mediaType,
      season: season,
      episode: episode
    };
  }

  function progressMatchesIdentity(progress, identity) {
    if (!progress || !identity) return false;
    return String(progress.media_key) === String(identity.media_key)
      && Number(progress.season || 0) === Number(identity.season || 0)
      && Number(progress.episode || 0) === Number(identity.episode || 0);
  }

  function shouldCloudAutoResume(progress) {
    if (!progress || progress.completed) return false;
    return Number(progress.position_seconds) >= SYNC_MIN_POSITION_SECONDS;
  }

  function computeCloudPercent(position, duration) {
    var pos = Number(position) || 0;
    var dur = Number(duration) || 0;
    if (dur <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((pos / dur) * 100)));
  }

  function readSyncQueue() {
    var queue = Lampa.Storage.get(SYNC_QUEUE_STORAGE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeSyncQueue(queue) {
    Lampa.Storage.set(SYNC_QUEUE_STORAGE_KEY, Array.isArray(queue) ? queue : []);
  }

  function syncQueueKey(item) {
    return [item.media_key, item.season || 0, item.episode || 0].join('|');
  }

  function enqueueSyncUpdate(body) {
    if (!body || !body.media_key) return;
    var queue = readSyncQueue();
    var key = syncQueueKey(body);
    queue = queue.filter(function (entry) { return syncQueueKey(entry) !== key; });
    queue.push(body);
    while (queue.length > SYNC_QUEUE_MAX) queue.shift();
    writeSyncQueue(queue);
  }

  function shouldSendCloudProgress(payload, options) {
    options = options || {};
    if (!payload) return false;
    if (options.force === true) return true;
    if (payload.explicit_restart === true) return true;
    if (payload.completed === true) return true;
    return Number(payload.position_seconds) >= SYNC_MIN_POSITION_SECONDS;
  }

  function buildCloudPutBody(identity, payload, sessionState) {
    var position = Math.max(0, Number(payload.position_seconds) || 0);
    var duration = Math.max(0, Number(payload.duration_seconds) || 0);
    var percent = Number(payload.percent) || computeCloudPercent(position, duration);
    var completed = payload.completed === true || percent >= SYNC_COMPLETED_PERCENT;
    return {
      media_key: identity.media_key,
      media_type: identity.media_type,
      season: identity.season,
      episode: identity.episode,
      position_seconds: position,
      duration_seconds: duration,
      completed: completed,
      revision: sessionState && sessionState.revision != null ? Number(sessionState.revision) : 0,
      device_id: getDeviceId(),
      explicit_restart: payload.explicit_restart === true
    };
  }

  function saveCloudProgress(identity, payload, options) {
    options = options || {};
    if (!identity || !identity.media_key) return Promise.resolve(null);
    if (!shouldSendCloudProgress(payload, options)) return Promise.resolve(null);

    var body = buildCloudPutBody(identity, payload, activePlaybackSession || {});
    if (!shouldSendCloudProgress(body, options)) return Promise.resolve(null);

    return syncApiFetch('/sync/progress', {
      method: 'PUT',
      body: JSON.stringify(body)
    }).then(function (response) {
      if (!response) {
        if (options.queueOnFailure !== false) enqueueSyncUpdate(body);
        return null;
      }
      if (!response.ok) {
        if (options.queueOnFailure !== false) enqueueSyncUpdate(body);
        return response.json().catch(function () { return null; });
      }
      return response.json();
    }).then(function (data) {
      if (data && data.ok && data.progress && activePlaybackSession && progressMatchesIdentity(data.progress, identity)) {
        activePlaybackSession.revision = Number(data.progress.revision) || activePlaybackSession.revision;
      }
      return data;
    }).catch(function () {
      if (options.queueOnFailure !== false) enqueueSyncUpdate(body);
      return null;
    });
  }

  function fetchCloudProgress(identity) {
    if (!identity || !identity.media_key) return Promise.resolve(null);
    var query = 'media_key=' + encodeURIComponent(identity.media_key)
      + '&season=' + encodeURIComponent(String(identity.season || 0))
      + '&episode=' + encodeURIComponent(String(identity.episode || 0));

    return syncApiFetch('/sync/progress?' + query, { method: 'GET' }).then(function (response) {
      if (!response || !response.ok) return null;
      return response.json();
    }).then(function (data) {
      if (!data || !data.ok) return null;
      return data.progress || null;
    }).catch(function () {
      return null;
    });
  }

  function flushSyncQueue() {
    if (!cubSyncEnabled()) return Promise.resolve();
    var queue = readSyncQueue();
    if (!queue.length) return Promise.resolve();

    return ensureSyncSession(false).then(function () {
      var remaining = [];
      var chain = Promise.resolve();

      queue.forEach(function (item) {
        chain = chain.then(function () {
          return syncApiFetch('/sync/progress', {
            method: 'PUT',
            body: JSON.stringify(item)
          }).then(function (response) {
            if (!response || !response.ok) {
              remaining.push(item);
              return null;
            }
            return response.json().then(function (data) {
              if (!data || !data.ok) remaining.push(item);
              return data;
            });
          }).catch(function () {
            remaining.push(item);
            return null;
          });
        });
      });

      return chain.then(function () {
        writeSyncQueue(remaining);
      });
    }).catch(function () { });
  }

  function buildCloudTimeline(nativeTimeline, remoteProgress, identity) {
    var native = nativeTimeline && typeof nativeTimeline === 'object' ? nativeTimeline : {};
    var originalHandler = typeof native.handler === 'function' ? native.handler : null;
    var lastSaveAt = 0;

    var merged = {
      hash: native.hash,
      percent: Number(native.percent) || 0,
      time: Number(native.time) || 0,
      duration: Number(native.duration) || 0,
      profile: native.profile || 0,
      continued: false,
      continued_bloc: false,
      waiting_for_user: false,
      stop_recording: false,
      handler: function (percent, time, duration) {
        if (originalHandler) originalHandler(percent, time, duration);
        var now = Date.now();
        if (now - lastSaveAt < SYNC_HEARTBEAT_MS - 1000) return;
        lastSaveAt = now;
        if (!activePlaybackSession || !progressMatchesIdentity(activePlaybackSession.identity, identity)) return;
        saveCloudProgress(identity, {
          percent: Number(percent) || 0,
          position_seconds: Number(time) || 0,
          duration_seconds: Number(duration) || 0,
          completed: Number(percent) >= SYNC_COMPLETED_PERCENT
        }, { queueOnFailure: true });
      }
    };

    if (shouldCloudAutoResume(remoteProgress)) {
      merged.time = Number(remoteProgress.position_seconds) || 0;
      merged.duration = Number(remoteProgress.duration_seconds) || merged.duration;
      merged.percent = Number(remoteProgress.percent) || computeCloudPercent(merged.time, merged.duration);
      merged.continued = false;
    }

    return merged;
  }

  function stopPlaybackHeartbeat() {
    if (playbackHeartbeatTimer) {
      clearInterval(playbackHeartbeatTimer);
      playbackHeartbeatTimer = null;
    }
  }

  function flushActivePlayback(options) {
    options = options || {};
    if (!activePlaybackSession || !Lampa.Player || !Lampa.Player.playdata) return Promise.resolve();

    var work = Lampa.Player.playdata();
    var identity = activePlaybackSession.identity;
    if (!work || !work.timeline || !identity) return Promise.resolve();

    var payload = {
      percent: Number(work.timeline.percent) || 0,
      position_seconds: Number(work.timeline.time) || 0,
      duration_seconds: Number(work.timeline.duration) || 0,
      completed: Number(work.timeline.percent) >= SYNC_COMPLETED_PERCENT
    };

    stopPlaybackHeartbeat();
  return saveCloudProgress(identity, payload, {
      queueOnFailure: options.queueOnFailure !== false,
      force: options.force === true
    });
  }

  function startPlaybackHeartbeat() {
    stopPlaybackHeartbeat();
    playbackHeartbeatTimer = setInterval(function () {
      if (!activePlaybackSession || !Lampa.Player || !Lampa.Player.opened || !Lampa.Player.opened()) return;
      flushActivePlayback({ queueOnFailure: true });
    }, SYNC_HEARTBEAT_MS);
  }

  function bindPlayerSyncHooks() {
    if (playerSyncHooksBound || !Lampa.Player || !Lampa.Player.listener) return;
    playerSyncHooksBound = true;

    Lampa.Player.listener.follow('pause', function () {
      flushActivePlayback({ queueOnFailure: true, force: true });
    });

    Lampa.Player.listener.follow('destroy', function () {
      flushActivePlayback({ queueOnFailure: true, force: true }).then(function () {
        activePlaybackSession = null;
        stopPlaybackHeartbeat();
      }, function () {
        activePlaybackSession = null;
        stopPlaybackHeartbeat();
      });
    });

    if (Lampa.Player.listener.follow) {
      Lampa.Player.listener.follow('rewind', function () {
        if (activePlaybackSession) {
          activePlaybackSession.userSeeked = true;
          activePlaybackSession.autoSeekDone = true;
        }
      });
    }
  }

  function applyCloudPlaybackSync(movie, element, seasonNumber, ready, makeHashFn, callback) {
    callback = typeof callback === 'function' ? callback : function () {};
    var identity = buildPlaybackIdentity(movie, element, seasonNumber);
    var requestId = String(Date.now()) + ':' + Math.random().toString(36).slice(2, 8);

    if (!cubSyncEnabled()) {
      callback(ready, null);
      return;
    }

    fetchCloudProgress(identity).then(function (remote) {
      if (remote && !progressMatchesIdentity(remote, identity)) remote = null;

      activePlaybackSession = {
        identity: Object.assign({}, identity),
        revision: remote && remote.revision != null ? Number(remote.revision) : 0,
        userSeeked: false,
        autoSeekDone: false,
        requestId: requestId,
        identityRequestId: requestId
      };

      var hash = typeof makeHashFn === 'function' ? makeHashFn(element) : '';
      var nativeTimeline = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : false;
      if (nativeTimeline) {
        ready.timeline = buildCloudTimeline(nativeTimeline, remote, identity);
      }

      callback(ready, remote);
      startPlaybackHeartbeat();
    }).catch(function () {
      callback(ready, null);
    });
  }

  function initCloudWatchSync() {
    if (!cubSyncEnabled()) return;
    bindPlayerSyncHooks();
    ensureSyncSession(false).then(function () {
      return flushSyncQueue();
    }).catch(function () { });
  }

  function pickerTelemetry(stage, details) {
    analyticsPost('/analytics/event', Object.assign({
      event_type: 'picker_stage',
      stage: stage,
      plugin_version: PLUGIN_VERSION,
      cache_version: CLIENT_CACHE_VERSION
    }, details || {}));
  }

  function cacheType(url) {
    var path = '';

    try {
      path = new URL(url, getApiUrl()).pathname;
    } catch (e) {
      path = String(url || '');
    }

    if (path.indexOf('/search') !== -1) return 'search';
    if (path.indexOf('/translations') !== -1) return 'translations';
    if (path.indexOf('/seasons') !== -1) return 'seasons';
    if (path.indexOf('/episodes') !== -1) return 'episodes';
    return '';
  }

  function cacheKey(url) {
    var hash = Lampa.Utils && Lampa.Utils.hash ? Lampa.Utils.hash(url) : encodeURIComponent(url).replace(/%/g, '_').slice(0, 180);
    return PERSISTENT_CACHE_PREFIX + hash;
  }

  function cacheDataUsable(type, data) {
    if (!data) return false;
    if (type === 'search') return shouldPersistSearchCache(data);
    if (type === 'translations') return data.ok === true && Array.isArray(data.translations) && data.translations.length > 0;
    if (type === 'seasons') return data.ok === true && Array.isArray(data.seasons) && data.seasons.length > 0;
    if (type === 'episodes') return data.ok === true && Array.isArray(data.episodes) && data.episodes.length > 0;
    return true;
  }

  function removePersistentCache(url) {
    try {
      var key = cacheKey(url);
      Lampa.Storage.set(key, null);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (e) { }
  }

  function clearRequestCacheUrl(url) {
    requestCache[url] = null;
    removePersistentCache(url);
  }

  function readPersistentCache(url, allowExpired) {
    var type = cacheType(url);
    var item = Lampa.Storage.get(cacheKey(url), null);
    if (!item || !item.value || item.url !== url) return null;
    if (!allowExpired && item.expires <= Date.now()) return null;
    if (!cacheDataUsable(type, item.value)) {
      removePersistentCache(url);
      return null;
    }
    return item.value;
  }

  function savePersistentCache(url, type, data) {
    if (!type || !PERSISTENT_CACHE_TTL[type] || !cacheDataUsable(type, data)) return;

    Lampa.Storage.set(cacheKey(url), {
      url: url,
      expires: Date.now() + PERSISTENT_CACHE_TTL[type],
      value: data
    });
  }

  function clearLocalSourceCache() {
    requestCache = {};

    try {
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf(PERSISTENT_CACHE_PREFIX) !== -1 || key.indexOf('lampa_source_pcache_') !== -1) {
          Lampa.Storage.set(key, null);
          localStorage.removeItem(key);
        }
      });
    } catch (e) { }
  }

  function ensureTitleDbVersion() {
    var now = Date.now();
    if (titleDbVersionPromise) return titleDbVersionPromise;
    if (now - titleDbVersionCheckAt < 1000 * 60) return Promise.resolve();

    titleDbVersionCheckAt = now;
    API_URL = getApiUrl();

    titleDbVersionPromise = fetch(API_URL + '/title-db/version?t=' + now, {
      cache: 'no-store'
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var version = data && Number(data.version) || 0;
        var stored = Number(Lampa.Storage.get('lampa_source_title_db_version', 0)) || 0;

        if (version && stored && version !== stored) clearLocalSourceCache();
        if (version) Lampa.Storage.set('lampa_source_title_db_version', version);
      })
      .catch(function () { })
      .then(function () {
        titleDbVersionPromise = null;
      });

    return titleDbVersionPromise;
  }

  function logSearchLoad(reason, meta) {
    meta = meta || {};
    pickerTelemetry('search_load', {
      search_load_reason: String(reason || ''),
      selected_source: meta.selectedSource != null ? buildSourceCooldownKey(meta.selectedSource) : '',
      request_id: meta.requestId != null ? String(meta.requestId) : '',
      generation: meta.generation != null ? meta.generation : ''
    });
    debugLog('search load', { reason: reason, meta: meta });
  }

  function cachedJsonAfterVersion(url, options) {
    options = options || {};
    var type = cacheType(url);
    var cacheUrl = options.cacheUrl || url;
    var bypassMemory = !!options.bypassMemory;
    var dedupeKey = options.dedupeKey || buildSearchDedupeKey(url, { staleFallback: !!options.staleFallback });
    var cached = bypassMemory ? null : requestCache[cacheUrl];

    if (!bypassMemory && cached && cached.expires > Date.now() && cacheDataUsable(type, cached.value)) {
      debugLog('memory cache hit', { url: url, type: type });
      return Promise.resolve(cached.value);
    }
    if (!bypassMemory && cached && !cacheDataUsable(type, cached.value)) requestCache[cacheUrl] = null;

    if (type && !bypassMemory) {
      var persistent = readPersistentCache(cacheUrl, false);
      if (persistent) {
        debugLog('persistent cache hit', summarizeApiData(url, persistent));
        requestCache[cacheUrl] = {
          expires: Date.now() + REQUEST_CACHE_TTL,
          value: persistent
        };
        return Promise.resolve(persistent);
      }
    }

    function fetchSearchJson() {
      if (typeof options.onNetworkStart === 'function') options.onNetworkStart();
      return json(url).then(function (data) {
        if (cacheDataUsable(type, data)) {
          requestCache[cacheUrl] = {
            expires: Date.now() + REQUEST_CACHE_TTL,
            value: data
          };
          savePersistentCache(cacheUrl, type, data);
        } else if (!isRateLimitedResponse(data)) {
          clearRequestCacheUrl(cacheUrl);
        }

        return data;
      }).catch(function (err) {
        var stale = type && !bypassMemory ? readPersistentCache(cacheUrl, true) : null;
        if (stale && cacheDataUsable(type, stale)) {
          debugLog('stale cache fallback', summarizeApiData(url, stale));
          return stale;
        }
        throw err;
      });
    }

    if (type === 'search') {
      return searchInflightDedupe.run(dedupeKey, fetchSearchJson);
    }

    return fetchSearchJson();
  }

  function cachedJson(url, options) {
    return ensureTitleDbVersion().then(function () {
      return cachedJsonAfterVersion(url, options);
    });
  }

  function getProxyAccessCode() {
    return String(Lampa.Storage.get('lampa_source_proxy_access_code', '') || '').trim();
  }

  function getCustomProxyUrl() {
    return String(Lampa.Storage.get('lampa_source_custom_proxy_url', '') || '').trim().replace(/\/+$/, '');
  }

  function buildProxyUrl(proxyBaseUrl, url, referer, proxyCode) {
    var result = proxyBaseUrl + '/proxy?url=' + encodeURIComponent(url);
    if (referer) result += '&referer=' + encodeURIComponent(referer);
    if (proxyCode) result += '&proxy_code=' + encodeURIComponent(proxyCode);
    return result;
  }

  function activeProxyUrl(url, referer) {
    var customProxy = getCustomProxyUrl();
    if (customProxy) return buildProxyUrl(customProxy, url, referer, '');

    var proxyCode = getProxyAccessCode();
    API_URL = getApiUrl();
    if (proxyCode) return buildProxyUrl(API_URL, url, referer, proxyCode);

    if (kinovodCdnNeedsProxy(url)) {
      return buildProxyUrl(API_URL, url, referer || 'https://kinovod.pro/', '');
    }

    return url;
  }

  function proxyUrl(url, referer) {
    API_URL = getApiUrl();
    if (!shouldProxyStream(url)) return url;
    return activeProxyUrl(url, referer);
  }

  function kinovodCdnNeedsProxy(url) {
    return /(?:redcdn\.org|threnet\.xyz)/i.test(String(url || ''));
  }

  function kinovodPlaybackReferer(element, url) {
    var probe = String(url || (element && (element.iframe_url || element.episode_url)) || sourceUrl() || '').toLowerCase();
    if (/kinovod(?:serial(?:anime)?)?\.pro/.test(probe)) return 'https://kinovod.pro/';
    if (kinovodCdnNeedsProxy(url || (element && element.episode_url))) return 'https://kinovod.pro/';
    return '';
  }
  function streamNeedsProxy(url) {
    var text = String(url || '');
    if (!text) return false;
    if (/(?:ashdi\.vip|obrut\.show|superdupercdn\.com|zetvideo\.net)/i.test(text)) return true;
    if (kinovodCdnNeedsProxy(text)) return true;
    if (/\.m3u8/i.test(text) && /^https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/i.test(text)) return true;
    return false;
  }

  function shouldAttachEpisodeRef(element, resolveUrl) {
    if (!element || !element.ref) return false;

    function normalizeCompareUrl(url) {
      return String(url || '').trim();
    }

    var episodeUrl = normalizeCompareUrl(element.episode_url);
    var iframeUrl = normalizeCompareUrl(element.iframe_url);
    var target = normalizeCompareUrl(resolveUrl);

    if (!target) return false;
    if (iframeUrl && target === iframeUrl) return false;
    if (episodeUrl && target === episodeUrl) return true;
    return false;
  }

  function isAnimeLikeMovie(movie) {
    movie = movie || {};

    var rawType = String(movie.media_type || movie.type || '').toLowerCase();
    if (rawType === 'anime' || rawType === 'anime-serial') return true;

    var genres = collectMovieGenres(movie).join(' ').toLowerCase();
    if (/anime|аниме|аніме|animation/.test(genres)) return true;

    if (collectMovieGenres(movie).some(function (genre) {
      return String(genre) === '16';
    })) return true;

    var originalLanguage = String(movie.original_language || movie.original_lang || '').toLowerCase();
    if (originalLanguage === 'ja' || originalLanguage === 'ko') return true;

    if (movie.shikimori_id || movie.shikimoriId || movie.mal_id || movie.malId) return true;

    return false;
  }

  function searchMediaType(movie) {
    movie = movie || {};
    var rawType = String(movie.media_type || movie.type || '').toLowerCase();
    if (rawType === 'anime' || rawType === 'anime-serial') return 'anime';
    if (isAnimeLikeMovie(movie)) return 'anime';
    return normalizeMovieType(movie) || 'movie';
  }

  function shouldProxyStream(url) {
    return Lampa.Storage.get('lampa_source_proxy_streams', false) === true || streamNeedsProxy(url);
  }

  function normalizeApiProxyUrl(url) {
    API_URL = getApiUrl();
    var current = String(url || '');
    if (current.indexOf('/proxy?') === -1) return current;

    try {
      var parsed = new URL(current);
      var target = parsed.searchParams.get('url') || '';
      var referer = parsed.searchParams.get('referer') || '';
      return target ? activeProxyUrl(target, referer) : current;
    } catch (e) {
      return current;
    }
  }

  function fixProtocol(url) {
    if (!url) return url;

    if (String(url).indexOf('//') === 0) {
      return (Lampa.Storage.get('lampa_source_prefer_http', false) ? 'http:' : 'https:') + url;
    }

    if (Lampa.Storage.get('lampa_source_prefer_http', false)) {
      return String(url).replace(/^https:/i, 'http:');
    }

    return String(url).replace(/^http:/i, 'https:');
  }

  function addTemplateSettings() {
    Lampa.Storage.set('lampa_source_api_url', getApiUrl());
    if (Lampa.Storage.get('lampa_source_uakino_enabled', null) == null) Lampa.Storage.set('lampa_source_uakino_enabled', true);
    if (!Lampa.Storage.get('lampa_source_uakino_mirror', '')) Lampa.Storage.set('lampa_source_uakino_mirror', 'https://uakino.best');
    if (Lampa.Storage.get('lampa_source_anitube_enabled', null) == null) Lampa.Storage.set('lampa_source_anitube_enabled', true);
    if (!Lampa.Storage.get('lampa_source_anitube_mirror', '')) Lampa.Storage.set('lampa_source_anitube_mirror', 'https://anitube.in.ua');
    if (Lampa.Storage.get('lampa_source_anitube_proxy_url', null) == null) Lampa.Storage.set('lampa_source_anitube_proxy_url', '');
    if (Lampa.Storage.get('lampa_source_disable_kodik_v1', null) == null) {
      Lampa.Storage.set('lampa_source_kodik_enabled', false);
      var hiddenKodik = Lampa.Storage.get('lampa_source_hidden', []);
      if (!Array.isArray(hiddenKodik)) hiddenKodik = [];
      if (hiddenKodik.indexOf('kodik') === -1) hiddenKodik.push('kodik');
      Lampa.Storage.set('lampa_source_hidden', hiddenKodik);
      Lampa.Storage.set('lampa_source_disable_kodik_v1', true);
    }
    if (Lampa.Storage.get('lampa_source_uafix_enabled', null) == null) Lampa.Storage.set('lampa_source_uafix_enabled', true);
    if (!Lampa.Storage.get('lampa_source_uafix_mirror', '')) Lampa.Storage.set('lampa_source_uafix_mirror', 'https://uafix.net');
    if (Lampa.Storage.get('lampa_source_zetflix_enabled', null) == null) Lampa.Storage.set('lampa_source_zetflix_enabled', false);
    if (!Lampa.Storage.get('lampa_source_zetflix_mirror', '')) Lampa.Storage.set('lampa_source_zetflix_mirror', 'https://6jul.zet-flix.online');
    if (Lampa.Storage.get('lampa_source_eneyida_enabled', null) == null) Lampa.Storage.set('lampa_source_eneyida_enabled', true);
    if (!Lampa.Storage.get('lampa_source_eneyida_mirror', '')) Lampa.Storage.set('lampa_source_eneyida_mirror', 'https://eneyida.tv');
    if (Lampa.Storage.get('lampa_source_filmix_enabled', null) == null) Lampa.Storage.set('lampa_source_filmix_enabled', true);
    if (Lampa.Storage.get('lampa_source_anilibria_enabled', null) == null) Lampa.Storage.set('lampa_source_anilibria_enabled', true);
    if (!Lampa.Storage.get('lampa_source_anilibria_mirror', '')) Lampa.Storage.set('lampa_source_anilibria_mirror', 'https://anilibria.top');
    if (Lampa.Storage.get('lampa_source_rezka_enabled', null) == null) Lampa.Storage.set('lampa_source_rezka_enabled', true);
    if (!Lampa.Storage.get('lampa_source_rezka_mirror', '')) Lampa.Storage.set('lampa_source_rezka_mirror', 'https://rezka.si');
    if (!Lampa.Storage.get('lampa_source_rezka_stream_type', '')) Lampa.Storage.set('lampa_source_rezka_stream_type', 'hls');
    if (!Lampa.Storage.get('lampa_source_quality_default', '')) Lampa.Storage.set('lampa_source_quality_default', 'auto');
    if (!Lampa.Storage.get('lampa_source_priority', '')) Lampa.Storage.set('lampa_source_priority', 'all');
    if (Lampa.Storage.get('lampa_source_best_quality_v1', null) == null) {
      Lampa.Storage.set('lampa_source_quality_default', 'auto');
      Lampa.Storage.set('lampa_source_best_quality_v1', true);
    }
    if (Lampa.Storage.get('lampa_source_proxy_streams', null) == null) Lampa.Storage.set('lampa_source_proxy_streams', false);
    if (Lampa.Storage.get('lampa_source_proxy_default_v2', null) == null) {
      if (Lampa.Storage.get('lampa_source_proxy_streams', false) === true) Lampa.Storage.set('lampa_source_proxy_streams', false);
      Lampa.Storage.set('lampa_source_proxy_default_v2', true);
    }
    if (Lampa.Storage.get('lampa_source_disable_proxy_sources_v1', null) == null) {
      Lampa.Storage.set('lampa_source_zetflix_enabled', false);
      Lampa.Storage.set('lampa_source_disable_proxy_sources_v1', true);
    }
    if (Lampa.Storage.get('lampa_source_enable_uafix_v1', null) == null) {
      Lampa.Storage.set('lampa_source_uafix_enabled', true);
      Lampa.Storage.set('lampa_source_enable_uafix_v1', true);
    }
    if (Lampa.Storage.get('lampa_source_prefer_http', null) == null) Lampa.Storage.set('lampa_source_prefer_http', false);
    if (Lampa.Storage.get('lampa_source_save_last_source', null) == null) Lampa.Storage.set('lampa_source_save_last_source', true);
    if (Lampa.Storage.get('lampa_source_proxy_access_code', null) == null) Lampa.Storage.set('lampa_source_proxy_access_code', '');
    if (Lampa.Storage.get('lampa_source_custom_proxy_url', null) == null) Lampa.Storage.set('lampa_source_custom_proxy_url', '');

    Lampa.Params.select('lampa_source_api_url', '', DEFAULT_API_URL);
    Lampa.Params.trigger('lampa_source_uakino_enabled', true);
    Lampa.Params.select('lampa_source_uakino_mirror', '', 'https://uakino.best');
    Lampa.Params.trigger('lampa_source_anitube_enabled', true);
    Lampa.Params.select('lampa_source_anitube_mirror', '', 'https://anitube.in.ua');
    Lampa.Params.select('lampa_source_anitube_proxy_url', '', '');
    Lampa.Params.trigger('lampa_source_kodik_enabled', false);
    Lampa.Params.trigger('lampa_source_uafix_enabled', true);
    Lampa.Params.select('lampa_source_uafix_mirror', '', 'https://uafix.net');
    Lampa.Params.trigger('lampa_source_zetflix_enabled', false);
    Lampa.Params.select('lampa_source_zetflix_mirror', '', 'https://6jul.zet-flix.online');
    Lampa.Params.trigger('lampa_source_eneyida_enabled', true);
    Lampa.Params.select('lampa_source_eneyida_mirror', '', 'https://eneyida.tv');
    Lampa.Params.trigger('lampa_source_filmix_enabled', true);
    Lampa.Params.select('lampa_source_filmix_token', '', '');
    Lampa.Params.trigger('lampa_source_anilibria_enabled', true);
    Lampa.Params.select('lampa_source_anilibria_mirror', '', 'https://anilibria.top');
    Lampa.Params.trigger('lampa_source_rezka_enabled', true);
    Lampa.Params.select('lampa_source_rezka_mirror', '', 'https://rezka.si');
    Lampa.Params.select('lampa_source_rezka_login', '', '');
    Lampa.Params.select('lampa_source_rezka_password', '', '');
    Lampa.Params.select('lampa_source_rezka_stream_type', { hls: 'HLS', mp4: 'MP4' }, 'hls');
    Lampa.Params.select('lampa_source_quality_default', {
      auto: 'Найкраща',
      2160: '2160p',
      1440: '1440p',
      1080: '1080p',
      720: '720p',
      480: '480p',
      360: '360p'
    }, 'auto');
    Lampa.Params.select('lampa_source_priority', {
      auto: 'Автоматично',
      all: 'Всі джерела',
      uakino: 'UAKino',
      rezka: 'Rezka',
      eneyida: 'Eneyida',
      filmix: 'Filmix',
      uafix: 'UAFix',
      anitube: 'AniTube',
      animeon: 'AnimeON',
      anilibria: 'AniLibria'
    }, 'all');
    Lampa.Params.trigger('lampa_source_proxy_streams', false);
    Lampa.Params.trigger('lampa_source_prefer_http', false);
    Lampa.Params.trigger('lampa_source_save_last_source', true);
    Lampa.Params.select('lampa_source_proxy_access_code', '', '');
    Lampa.Params.select('lampa_source_custom_proxy_url', '', '');

    Lampa.Template.add('settings_lampa_source', `
      <div>
        <div class="settings-param selector" data-name="lampa_source_uakino_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати UAKino</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_anitube_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати AniTube</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_anitube_proxy_url" data-type="input" placeholder="https://your-proxy.example">
          <div class="settings-param__name">Проксі AniTube</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_uafix_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати UAFix</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_uafix_mirror" data-type="input" placeholder="https://uafix.net">
          <div class="settings-param__name">Дзеркало UAFix</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_eneyida_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати Eneyida</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_filmix_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати Filmix</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_anilibria_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати AniLibria</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати Rezka</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_login" data-type="input" placeholder="Не вказано">
          <div class="settings-param__name">Логін Rezka</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_password" data-type="input" data-string="true" placeholder="Не вказано">
          <div class="settings-param__name">Пароль Rezka</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_fill_cookie" data-static="true">
          <div class="settings-param__name">Заповнити cookie Rezka</div>
          <div class="settings-param__status"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_clear_cookie" data-static="true">
          <div class="settings-param__name">Очистити сесію Rezka</div>
          <div class="settings-param__status"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_quality_default" data-type="select">
          <div class="settings-param__name">Якість за замовчуванням</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_priority" data-type="select">
          <div class="settings-param__name">Пріоритетне джерело</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_save_last_source" data-type="toggle">
          <div class="settings-param__name">Запам'ятовувати джерело</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_proxy_access_code" data-type="input" data-string="true" placeholder="Не вказано">
          <div class="settings-param__name">Код серверного проксі</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_custom_proxy_url" data-type="input" placeholder="https://your-proxy.example">
          <div class="settings-param__name">Власний proxy URL</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_clear_cache" data-static="true">
          <div class="settings-param__name">Скинути кеш Lampa Source</div>
          <div class="settings-param__status"></div>
        </div>
      </div>
    `);

    function addFolder() {
      if (!Lampa.Settings.main || !Lampa.Settings.main()) return;

      var body = Lampa.Settings.main().render();
      if (body.find('[data-component="lampa_source"]').length) return;

      var folder = $(`
        <div class="settings-folder selector" data-component="lampa_source">
          <div class="settings-folder__icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L5 13h6l-1 9 9-12h-6V2z"></path></svg>
          </div>
          <div class="settings-folder__name">Lampa Source</div>
        </div>
      `);

      body.find('[data-component="more"]').after(folder);
      Lampa.Settings.main().update();
    }

    function setStatus(button, status) {
      $('.settings-param__status', button).removeClass('active error wait').addClass(status);
    }

    function fillRezkaCookie(button) {
      var login = Lampa.Storage.get('lampa_source_rezka_login', '');
      var password = Lampa.Storage.get('lampa_source_rezka_password', '');

      if (!login || !password) {
        Lampa.Noty.show('Спочатку введіть логін і пароль Rezka');
        setStatus(button, 'error');
        return;
      }

      var params = new URLSearchParams({
        rezka_login: login,
        rezka_password: password
      });
      appendAuthParams(params);
      setStatus(button, 'wait');

      json(getApiUrl() + '/rezka/login?' + params.toString())
        .then(function (data) {
          if (!data || !data.ok || !data.cookie) {
            Lampa.Noty.show('Rezka не повернула cookie');
            setStatus(button, 'error');
            return;
          }

          Lampa.Storage.set('lampa_source_rezka_cookie', data.cookie);
          Lampa.Noty.show('Сесію Rezka збережено');
          setStatus(button, 'active');
          if (Lampa.Listener && typeof Lampa.Listener.send === 'function') {
            Lampa.Listener.send('lampa_source', { type: 'rezka_cookie_updated' });
          }
        })
        .catch(function () {
          Lampa.Noty.show('Не вдалося увійти в Rezka');
          setStatus(button, 'error');
        });
    }

    function clearSourceCache(button) {
      clearLocalSourceCache();
      Lampa.Storage.set('lampa_source_last_source', '');
      Lampa.Storage.set('lampa_source_last_source_by_type', {});
      Lampa.Storage.set('lampa_source_last_source_by_media', {});
      Lampa.Storage.set('lampa_source_choice', {});
      Lampa.Storage.set('lampa_source_viewed', []);

      Lampa.Noty.show('Кеш Lampa Source очищено');
      setStatus(button, 'active');
    }

    if (window.appready) loadSourceRegistry().then(addFolder);
    else {
      Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') loadSourceRegistry().then(addFolder);
      });
    }

    Lampa.Settings.listener.follow('open', function (event) {
      if (event.name !== 'lampa_source') return;

      var fill = event.body.find('[data-name="lampa_source_rezka_fill_cookie"]');
      if (Lampa.Storage.get('lampa_source_rezka_cookie', '')) setStatus(fill, 'active');
      fill.unbind('hover:enter').on('hover:enter', function () {
        fillRezkaCookie(fill);
      });

      var clear = event.body.find('[data-name="lampa_source_rezka_clear_cookie"]');
      clear.unbind('hover:enter').on('hover:enter', function () {
        Lampa.Storage.set('lampa_source_rezka_cookie', '');
        Lampa.Noty.show('Сесію Rezka очищено');
        setStatus(clear, 'active');
      });

      var clearCache = event.body.find('[data-name="lampa_source_clear_cache"]');
      clearCache.unbind('hover:enter').on('hover:enter', function () {
        clearSourceCache(clearCache);
      });
    });
  }

  function addSettings() {
    if (!Lampa.Template || !Lampa.Settings || !Lampa.Params) return;
    return addTemplateSettings();
  }

  function appendAuthParams(params) {
    params.set('device_id', getDeviceId());
    var uakinoEnabled = Lampa.Storage.get('lampa_source_uakino_enabled', true);
    var uakinoMirror = Lampa.Storage.get('lampa_source_uakino_mirror', '');
    var anitubeEnabled = Lampa.Storage.get('lampa_source_anitube_enabled', true);
    var anitubeMirror = Lampa.Storage.get('lampa_source_anitube_mirror', '');
    var anitubeProxyUrl = Lampa.Storage.get('lampa_source_anitube_proxy_url', '') || getCustomProxyUrl();
    var uafixEnabled = Lampa.Storage.get('lampa_source_uafix_enabled', true);
    var uafixMirror = Lampa.Storage.get('lampa_source_uafix_mirror', '');
    var zetflixEnabled = false;
    var zetflixMirror = Lampa.Storage.get('lampa_source_zetflix_mirror', '');
    var eneyidaEnabled = Lampa.Storage.get('lampa_source_eneyida_enabled', true);
    var eneyidaMirror = Lampa.Storage.get('lampa_source_eneyida_mirror', '');
    var filmixEnabled = Lampa.Storage.get('lampa_source_filmix_enabled', true);
    var anilibriaEnabled = Lampa.Storage.get('lampa_source_anilibria_enabled', true);
    var anilibriaMirror = Lampa.Storage.get('lampa_source_anilibria_mirror', '');
    var enabled = Lampa.Storage.get('lampa_source_rezka_enabled', true);
    var mirror = Lampa.Storage.get('lampa_source_rezka_mirror', '');
    var streamType = Lampa.Storage.get('lampa_source_rezka_stream_type', 'hls');

    params.set('uakino_enabled', uakinoEnabled ? '1' : '0');
    if (uakinoMirror) params.set('uakino_mirror', uakinoMirror);

    params.set('anitube_enabled', anitubeEnabled ? '1' : '0');
    if (anitubeMirror) params.set('anitube_mirror', anitubeMirror);
    if (anitubeProxyUrl) params.set('anitube_proxy_url', anitubeProxyUrl);

    params.set('kodik_enabled', '0');

    params.set('uafix_enabled', uafixEnabled ? '1' : '0');
    if (uafixMirror) params.set('uafix_mirror', uafixMirror);

    params.set('zetflix_enabled', zetflixEnabled ? '1' : '0');
    if (zetflixMirror) params.set('zetflix_mirror', zetflixMirror);

    params.set('eneyida_enabled', eneyidaEnabled ? '1' : '0');
    if (eneyidaMirror) params.set('eneyida_mirror', eneyidaMirror);

    params.set('filmix_enabled', filmixEnabled ? '1' : '0');

    params.set('anilibria_enabled', anilibriaEnabled ? '1' : '0');
    if (anilibriaMirror) params.set('anilibria_mirror', anilibriaMirror);

    params.set('rezka_enabled', enabled ? '1' : '0');
    if (mirror) params.set('rezka_mirror', mirror);
    if (streamType) params.set('rezka_stream_type', streamType);

    return params;
  }

  function appendDownstreamAuthParams(params, manualRetry) {
    appendAuthParams(params);
    if (manualRetry) params.set('retry', '1');
    return params;
  }

  function sourceRegistryEntry(key) {
    key = validSourceKey(key);
    if (!key) return null;
    if (serverSourceRegistry && serverSourceRegistry[key]) return serverSourceRegistry[key];
    return null;
  }

  function sourceHasCapability(key, group, value) {
    var entry = sourceRegistryEntry(key);
    if (!entry || !entry.capabilities || !Array.isArray(entry.capabilities[group])) return false;
    return entry.capabilities[group].indexOf(value) !== -1;
  }

  function sourceNeedsSeasonsFetch(source) {
    var key = sourceKey(source);
    if (!sourceHasCapability(key, 'content', 'seasons')) return false;
    return normalizeMovieType(source && source.type ? { type: source.type } : {}) === 'tv' || looksLikeSerialSource(source);
  }

  function looksLikeSerialSource(source) {
    return /tv|serial|series|anime/i.test(String(source && source.type || ''));
  }

  function sourceFailureStorageKey(movie, sourceKeyValue) {
    return mediaStorageKey(movie) + '|' + String(sourceKeyValue || '');
  }

  function readSourceFailures() {
    return storedObject('lampa_source_terminal_failures_v1');
  }

  function writeSourceFailures(map) {
    Lampa.Storage.set('lampa_source_terminal_failures_v1', map || {});
  }

  function migrateLegacyTerminalFailuresV2() {
    if (Lampa.Storage.get('lampa_source_terminal_failures_migrated_v2', false) === true) return;
    var map = readSourceFailures();
    Object.keys(map).forEach(function (key) {
      if (String(key).split('|').pop() === 'uakino') delete map[key];
    });
    writeSourceFailures(map);
    Lampa.Storage.set('lampa_source_terminal_failures_migrated_v2', true);
  }

  function isSourceFailureSuppressed() {
    return false;
  }

  function rememberSourceFailure() {
    return;
  }

  function clearSourceFailure(movie, sourceKeyValue) {
    sourceKeyValue = validSourceKey(sourceKeyValue);
    if (!sourceKeyValue) return;
    var map = readSourceFailures();
    delete map[sourceFailureStorageKey(movie, sourceKeyValue)];
    writeSourceFailures(map);
  }

  function getStoredSourceFailure(movie, sourceKeyValue) {
    sourceKeyValue = validSourceKey(sourceKeyValue);
    if (!sourceKeyValue) return null;
    return readSourceFailures()[sourceFailureStorageKey(movie, sourceKeyValue)] || null;
  }

  function readDevicePlaybackFailures() {
    return storedObject('lampa_source_device_playback_v2');
  }

  function writeDevicePlaybackFailures(map) {
    Lampa.Storage.set('lampa_source_device_playback_v2', map || {});
  }

  function rememberDevicePlaybackFailure(movie, sourceKeyValue, status) {
    sourceKeyValue = validSourceKey(sourceKeyValue);
    status = normalizeFailureStatus(status);
    if (!sourceKeyValue || ['DIRECT_FAILED', 'PLAYBACK_UNSUPPORTED', 'NO_EPISODES', 'NO_STREAM', 'RESOLVE_FAILED'].indexOf(status) === -1) return;
    var map = readDevicePlaybackFailures();
    map[sourceFailureStorageKey(movie, sourceKeyValue)] = { status: status, at: Date.now() };
    writeDevicePlaybackFailures(map);
  }

  function clearDevicePlaybackFailure(movie, sourceKeyValue) {
    sourceKeyValue = validSourceKey(sourceKeyValue);
    if (!sourceKeyValue) return;
    var map = readDevicePlaybackFailures();
    delete map[sourceFailureStorageKey(movie, sourceKeyValue)];
    writeDevicePlaybackFailures(map);
  }

  function getStoredDevicePlaybackFailure(movie, sourceKeyValue) {
    sourceKeyValue = validSourceKey(sourceKeyValue);
    if (!sourceKeyValue) return null;
    return readDevicePlaybackFailures()[sourceFailureStorageKey(movie, sourceKeyValue)] || null;
  }

  function normalizeFailureStatus(status) {
    return String(status || '').trim().toUpperCase().replace(/-/g, '_');
  }

  function isGlobalTerminalStatus(status) {
    return ['NO_EPISODES', 'RESOLVE_FAILED', 'NO_STREAM'].indexOf(normalizeFailureStatus(status)) !== -1;
  }

  function resolvePickerSourceClick(options) {
    options = options || {};
    if (options.authRequired) return { action: 'auth', manualRetry: false };
    if (options.isPlaceholder) return { action: 'noop', manualRetry: false };
    return { action: 'open', manualRetry: true };
  }

  function classifyResolveOutcome(data, payload) {
    if (payload && payload.fallback) {
      return { scope: 'device', status: 'DIRECT_FAILED' };
    }
    if (data && data.suppressed) {
      return { scope: 'device', status: normalizeFailureStatus(data.status || 'NO_STREAM') };
    }
    if (data && data.ok === false) {
      return { scope: 'device', status: normalizeFailureStatus(data.status || 'NO_STREAM') };
    }
    return null;
  }

  function devicePlaybackBadgeLabel(deviceFailure) {
    if (!deviceFailure || !deviceFailure.status) return '';
    return 'потік недоступний (локально)';
  }

  function devicePlaybackMarkClass(deviceFailure) {
    if (!deviceFailure || !deviceFailure.status) return '';
    return 'lampa-source-card__mark--warning';
  }

  function clearAllSourceFailureState(movie, sourceKeyValue) {
    clearSourceFailure(movie, sourceKeyValue);
    clearDevicePlaybackFailure(movie, sourceKeyValue);
  }

  function applyResolveOutcome(movie, sourceKeyValue, data, payload) {
    if (data && data.status === 'WORKING') {
      clearAllSourceFailureState(movie, sourceKeyValue);
      return;
    }
    if (payload && payload.ok !== false && (payload.stream_url || payload.stream) && !payload.fallback) {
      clearAllSourceFailureState(movie, sourceKeyValue);
      return;
    }
    var outcome = classifyResolveOutcome(data, payload);
    if (outcome && outcome.scope === 'device') {
      rememberDevicePlaybackFailure(movie, sourceKeyValue, outcome.status);
      return;
    }
    clearAllSourceFailureState(movie, sourceKeyValue);
  }

  function sourceFailureUserLabel(status) {
    if (status === 'AUTH_REQUIRED') return 'Потрібен вхід';
    if (status === 'NO_EPISODES') return 'немає серій';
    if (status === 'RESOLVE_FAILED' || status === 'NO_STREAM') return 'потік недоступний';
    return '';
  }

  function isRezkaAuthRequiredSource(source, sourceKeyValue, readinessMap) {
    if (source && source.auth_required) return true;
    var readiness = readinessMap && readinessMap[sourceKeyValue];
    return !!(readiness && readiness.status === 'AUTH_REQUIRED');
  }

  function openRezkaAuthSettings() {
    Lampa.Noty.show('Для Rezka потрібен вхід. Увійдіть в акаунт Rezka у налаштуваннях Lampa Source.');
    if (Lampa.Settings && typeof Lampa.Settings.show === 'function') {
      Lampa.Settings.show('lampa_source');
    }
  }

  function sourceFailureMarkClass(status) {
    if (status === 'AUTH_REQUIRED') return 'lampa-source-card__mark--auth';
    if (status === 'NO_EPISODES') return 'lampa-source-card__mark--warning';
    if (status === 'RESOLVE_FAILED' || status === 'NO_STREAM') return 'lampa-source-card__mark--disabled';
    return '';
  }

  function appendSourceCacheVersion(params, sourceUrl) {
    if (String(sourceUrl || '').indexOf('uafix.net') !== -1) params.set('lsv', '2');
    return params;
  }

  function getMovie(event) {
    if (event && event.data && event.data.movie) return event.data.movie;

    var active = Lampa.Activity.active();
    if (active && active.movie) return active.movie;

    return null;
  }

  function resetTemplates() {
    Lampa.Template.add('lampa_source_online', `
            <div class="online selector">
                <div class="online__body">
                    <div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">
                        <svg style="height:2.4em;width:2.4em;" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>
                            <path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/>
                        </svg>
                    </div>
                    <div class="online__title" style="padding-left:2.1em;">{title}</div>
                    <div class="online__quality" style="padding-left:3.4em;">{quality}{info}</div>
                </div>
            </div>
        `);

    Lampa.Template.add('lampa_source_folder', `
            <div class="lampa-source-card selector">
                <div class="lampa-source-card__poster {poster_class}" style="{poster_style}">
                    <div class="lampa-source-card__fallback">
                        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="12" width="48" height="40" rx="8" fill="currentColor" opacity=".22"/>
                            <path d="M28 23v18l15-9-15-9Z" fill="currentColor"/>
                        </svg>
                    </div>
                </div>
                <div class="lampa-source-card__body">
                    <div class="lampa-source-card__top">
                        <div class="lampa-source-card__title">{title}</div>
                        <div class="lampa-source-card__mark {mark_class}">{mark}</div>
                    </div>
                    <div class="lampa-source-card__meta">
                        <span>{source_site}</span>
                        <span>{source_year}</span>
                        <span>{source_type}</span>
                    </div>
                    <div class="lampa-source-card__bottom">
                        <div class="lampa-source-card__quality {quality_class}">{quality}</div>
                    </div>
                </div>
            </div>
        `);

    Lampa.Template.add('lampa_source_loader', `
            <div class="lampa-source-loader">
                <div class="lampa-source-loader__icon">
                    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                        <rect x="8" y="12" width="48" height="40" rx="8" fill="currentColor" opacity=".18"/>
                        <path d="M28 23v18l15-9-15-9Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="lampa-source-loader__body">
                    <div class="lampa-source-loader__title">Шукаю джерела</div>
                    <div class="lampa-source-loader__text">Перевіряю кеш і доступні сайти</div>
                    <div class="lampa-source-loader__bar"><i></i></div>
                </div>
            </div>
        `);

  }

  function injectStyles() {
    if (document.getElementById('lampa-source-style')) return;

    $('head').append(`
            <style id="lampa-source-style">
                .lampa-source-button{
                    margin-right:0.75em;
                    font-size:1.3em;
                    background-color:rgba(0,0,0,.3);
                    display:flex;
                    align-items:center;
                    height:2.8em;
                    flex-shrink:0;
                    padding:.3em 1em;
                    border-radius:1em;
                    gap:.5em;
                }

                .lampa-source-button svg{
                    width:1.5em;
                    height:1.5em;
                    flex-shrink:0;
                }

                .lampa-source-button span{
                    font-size:22px;
                    font-weight:600;
                    white-space:nowrap;
                }

                .lampa-source-button.focus,
                .lampa-source-button.hover,
                .lampa-source-button:hover{
                    background:#fff !important;
                    transform:scale(1.03);
                }

                .lampa-source-button.focus span,
                .lampa-source-button.hover span,
                .lampa-source-button:hover span{
                    color:#000;
                }

                .lampa-source-switch{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:1em;
                    margin-bottom:1em;
                    padding:.85em 1em;
                    border-radius:.65em;
                    background:rgba(255,255,255,.075);
                    border:1px solid rgba(255,255,255,.10);
                }

                .lampa-source-switch.focus,
                .lampa-source-switch.hover,
                .lampa-source-switch:hover{
                    background:#fff !important;
                    color:#000;
                }

                .lampa-source-switch__label{
                    font-size:1.08em;
                    font-weight:600;
                }

                .lampa-source-switch__value{
                    font-size:.95em;
                    opacity:.78;
                    white-space:nowrap;
                }

                .lampa-source-clarify{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:1em;
                    margin-bottom:1em;
                    padding:.85em 1em;
                    border-radius:.65em;
                    background:rgba(255,255,255,.05);
                    border:1px solid rgba(255,255,255,.08);
                }

                .lampa-source-clarify.focus,
                .lampa-source-clarify.hover,
                .lampa-source-clarify:hover{
                    background:#fff !important;
                    color:#000;
                }

                .lampa-source-clarify__label{
                    font-size:1.08em;
                    font-weight:600;
                }

                .lampa-source-clarify__value{
                    font-size:.95em;
                    opacity:.78;
                    text-align:right;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    max-width:65%;
                }

                .lampa-source-fix-marker{
                    margin-bottom:1em;
                    padding:.65em 1em;
                    border-radius:.65em;
                    background:rgba(255,196,0,.18);
                    border:2px solid rgba(255,196,0,.55);
                    text-align:center;
                }

                .lampa-source-fix-marker__label{
                    font-size:1.05em;
                    font-weight:700;
                    letter-spacing:.04em;
                    color:#ffc400;
                }

                .lampa-source-card{
                    position:relative;
                    display:flex;
                    min-height:7.2em;
                    margin-bottom:1em;
                    border-radius:.65em;
                    background:rgba(255,255,255,.075);
                    border:1px solid rgba(255,255,255,.10);
                    overflow:hidden;
                }

                .lampa-source-card.focus,
                .lampa-source-card.hover,
                .lampa-source-card:hover{
                    background:rgba(255,255,255,.16);
                    border-color:rgba(255,255,255,.34);
                }

                .lampa-source-card__poster{
                    width:5.2em;
                    min-height:7.2em;
                    flex-shrink:0;
                    background-color:rgba(255,255,255,.09);
                    background-position:center;
                    background-size:cover;
                    color:rgba(255,255,255,.86);
                    display:flex;
                    align-items:center;
                    justify-content:center;
                }

                .lampa-source-card__poster--image .lampa-source-card__fallback{
                    display:none;
                }

                .lampa-source-card__fallback svg{
                    width:3em;
                    height:3em;
                }

                .lampa-source-card__body{
                    min-width:0;
                    flex:1;
                    padding:.85em 1em .8em;
                }

                .lampa-source-card__top{
                    display:flex;
                    align-items:flex-start;
                    justify-content:space-between;
                    gap:.8em;
                }

                .lampa-source-card__title{
                    min-width:0;
                    font-size:1.35em;
                    line-height:1.22;
                    font-weight:600;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    display:-webkit-box;
                    -webkit-line-clamp:2;
                    -webkit-box-orient:vertical;
                }

                .lampa-source-card__mark,
                .lampa-source-card__quality{
                    flex-shrink:0;
                    border-radius:.4em;
                    padding:.25em .55em;
                    font-size:.78em;
                    line-height:1.2;
                    background:rgba(255,255,255,.13);
                    color:rgba(255,255,255,.88);
                    white-space:nowrap;
                    text-align:center;
                }

                .lampa-source-card__mark small{
                    display:block;
                    margin-top:.15em;
                    font-size:.72em;
                    font-weight:600;
                    color:rgba(255,255,255,.72);
                    white-space:nowrap;
                }

                .lampa-source-card__mark:empty,
                .lampa-source-card__quality:empty{
                    display:none;
                }

                .lampa-source-card__mark--last{
                    background:rgba(75,163,255,.22);
                    color:#cfe7ff;
                }

                .lampa-source-card__mark--fast{
                    background:rgba(72,201,120,.18);
                    color:#c9f5d7;
                }

                .lampa-source-card__mark--disabled{
                    background:rgba(255,107,107,.16);
                    color:#ffb3b3;
                }

                .lampa-source-card__mark--warning{
                    background:rgba(255,193,79,.18);
                    color:#ffe0a6;
                }

                .lampa-source-card__mark--auth{
                    background:rgba(255,159,67,.18);
                    color:#ffd7ad;
                }

                .lampa-source-card__quality--auth-hint{
                    background:rgba(255,255,255,.08);
                    color:rgba(255,255,255,.72);
                    white-space:normal;
                    max-width:18em;
                }

                .lampa-source-card__meta{
                    display:flex;
                    flex-wrap:wrap;
                    gap:.45em;
                    margin-top:.55em;
                    color:rgba(255,255,255,.68);
                    font-size:.95em;
                }

                .lampa-source-card__meta span{
                    max-width:14em;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                }

                .lampa-source-card__meta span:empty{
                    display:none;
                }

                .lampa-source-card__meta span:not(:empty):not(:last-child):after{
                    content:"";
                    display:inline-block;
                    width:.28em;
                    height:.28em;
                    margin-left:.45em;
                    border-radius:50%;
                    background:rgba(255,255,255,.35);
                    vertical-align:middle;
                }

                .lampa-source-card__bottom{
                    margin-top:.8em;
                    display:flex;
                    align-items:center;
                    gap:.5em;
                }

                .lampa-source-card__quality--hd{
                    background:rgba(72,201,120,.18);
                    color:#c9f5d7;
                }

                .lampa-source-card__quality--uhd{
                    background:rgba(142,118,255,.22);
                    color:#ded8ff;
                }

                .lampa-source-loader{
                    display:flex;
                    align-items:center;
                    gap:1em;
                    padding:1.2em;
                    border-radius:.65em;
                    background:rgba(255,255,255,.075);
                    border:1px solid rgba(255,255,255,.10);
                    color:rgba(255,255,255,.9);
                }

                .lampa-source-loader__icon{
                    width:3.6em;
                    height:3.6em;
                    flex-shrink:0;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:rgba(255,255,255,.86);
                }

                .lampa-source-loader__icon svg{
                    width:100%;
                    height:100%;
                }

                .lampa-source-loader__body{
                    min-width:0;
                    flex:1;
                }

                .lampa-source-loader__title{
                    font-size:1.35em;
                    font-weight:600;
                }

                .lampa-source-loader__text{
                    margin-top:.2em;
                    font-size:.95em;
                    color:rgba(255,255,255,.64);
                }

                .lampa-source-loader__bar{
                    position:relative;
                    overflow:hidden;
                    width:14em;
                    max-width:80%;
                    height:.25em;
                    margin-top:.85em;
                    border-radius:2em;
                    background:rgba(255,255,255,.12);
                }

                .lampa-source-loader__bar i{
                    position:absolute;
                    left:0;
                    top:0;
                    bottom:0;
                    width:42%;
                    border-radius:inherit;
                    background:rgba(255,255,255,.72);
                    animation:lampaSourceLoad 1.1s ease-in-out infinite;
                }

                @keyframes lampaSourceLoad{
                    0%{transform:translateX(-110%);}
                    100%{transform:translateX(250%);}
                }

                // @media screen and (max-width:700px){
                //     .lampa-source-button{
                //         font-size:1em;
                //         height:2.4em;
                //         padding:.25em .75em;
                //     }

                //     .lampa-source-button span{
                //         font-size:16px;
                //     }
                // }
            </style>
        `);
  }

  function bindEnter(item, callback) {
    var locked = false;

    item.on('hover:enter', function () {
      if (locked) return;

      locked = true;
      callback();

      setTimeout(function () {
        locked = false;
      }, 700);
    });
  }

  function loading(ctx, status) {
    if (ctx.activity && ctx.activity.loader) ctx.activity.loader(status);
  }

  function normalizeMovieType(movie) {
    movie = movie || {};
    var type = movie.media_type || movie.type || (movie.first_air_date || movie.name || movie.original_name ? 'tv' : 'movie');

    if (type === 'anime' || type === 'anime-serial') type = 'tv';
    if (type === 'film') type = 'movie';
    return type || 'movie';
  }

  function validSourceKey(key) {
    key = String(key || '').toLowerCase();
    return sourceOptions().some(function (item) {
      return item.key === key;
    }) ? key : '';
  }

  function sourceOptionTitle(key) {
    key = validSourceKey(key) || 'all';
    var options = sourceOptions();
    for (var i = 0; i < options.length; i++) {
      if (options[i].key === key) return options[i].title;
    }
    return key;
  }

  function storedObject(key) {
    var value = Lampa.Storage.get(key, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function mediaStorageKey(movie) {
    movie = movie || {};
    var type = normalizeMovieType(movie);
    var tmdb = movie.id || movie.tmdb_id || movie.tmdbId || '';
    var imdb = movie.imdb_id || movie.imdb || movie.imdbId || '';
    var kp = movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId || '';
    var title = String(movie.title || movie.name || movie.original_title || movie.original_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    var year = (movie.release_date || movie.first_air_date || '').slice(0, 4);

    if (tmdb) return type + ':tmdb:' + tmdb;
    if (imdb) return type + ':imdb:' + imdb;
    if (kp) return type + ':kp:' + kp;
    return type + ':title:' + title + ':' + year;
  }

  function sourceEnabled(key) {
    key = validSourceKey(key);
    if (!key || key === 'all') return true;
    if (key === 'kodik') return false;
    return Lampa.Storage.get('lampa_source_' + key + '_enabled', true) !== false;
  }

  function loadSourceRegistry() {
    return fetch(getApiUrl() + '/sources', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      var next = {};
      (data.sources || []).forEach(function (item) { if (item && item.key) next[item.key] = item; });
      serverSourceRegistry = next;
      Lampa.Storage.set('lampa_source_server_registry_v1', next);
    }).catch(function () {
      serverSourceRegistry = Lampa.Storage.get('lampa_source_server_registry_v1', null);
    });
  }

  function firstEnabled(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (sourceEnabled(keys[i])) return keys[i];
    }
    return 'all';
  }

  function defaultSourceForMovie(movie) {
    var type = normalizeMovieType(movie);
    var genres = collectMovieGenres(movie).join(' ').toLowerCase();

    if (isAnimeLikeMovie(movie) || /anime|аниме|аніме/.test(genres)) return firstEnabled(['anitube', 'animeon', 'anilibria']);
    if (type === 'tv') return firstEnabled(['eneyida', 'rezka', 'uakino']);
    return firstEnabled(['eneyida', 'uakino', 'rezka', 'filmix']);
  }

  function getPreferredSource(movie) {
    var priority = String(Lampa.Storage.get('lampa_source_priority', 'all') || 'all').toLowerCase();
    if (priority !== 'all' && priority !== 'auto') {
      var explicit = validSourceKey(priority);
      if (explicit && explicit !== 'all' && sourceEnabled(explicit)) return explicit;
    }
    return 'all';
  }

  function getPrioritySource(movie) {
    var value = String(Lampa.Storage.get('lampa_source_priority', 'all') || 'all').toLowerCase();
    if (!value || value === 'all') return '';
    if (value === 'auto') return defaultSourceForMovie(movie);
    var selected = validSourceKey(value);
    if (selected && selected !== 'all' && sourceEnabled(selected)) return selected;
    return '';
  }

  function rememberPreferredSource(movie, key) {
    key = validSourceKey(key);
    if (!key || key === 'all' || Lampa.Storage.get('lampa_source_save_last_source', true) === false) return;

    Lampa.Storage.set('lampa_source_last_source', key);

    var byType = storedObject('lampa_source_last_source_by_type');
    byType[normalizeMovieType(movie)] = key;
    Lampa.Storage.set('lampa_source_last_source_by_type', byType);

    var byMedia = storedObject('lampa_source_last_source_by_media');
    byMedia[mediaStorageKey(movie)] = key;
    Lampa.Storage.set('lampa_source_last_source_by_media', byMedia);
  }

  var CLARIFICATION_STORAGE_KEY = 'lampa_source_search_clarification_v1';

  function getClarificationStore() {
    return storedObject(CLARIFICATION_STORAGE_KEY);
  }

  function getSearchClarification(movie) {
    var store = getClarificationStore();
    var entry = store[mediaStorageKey(movie)];
    if (!entry || typeof entry !== 'object') return null;
    var query = String(entry.query || '').replace(/\s+/g, ' ').trim();
    if (!query) return null;
    return entry;
  }

  function buildClarificationEntry(movie, query) {
    query = String(query || '').replace(/\s+/g, ' ').trim();
    if (!query) return null;

    return {
      query: query,
      year: (movie.release_date || movie.first_air_date || '').slice(0, 4),
      type: normalizeMovieType(movie),
      imdb_id: String(movie.imdb_id || movie.imdb || movie.imdbId || ''),
      tmdb_id: String(movie.id || movie.tmdb_id || movie.tmdbId || ''),
      kp_id: String(movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId || ''),
      shikimori_id: String(movie.shikimori_id || movie.shikimoriId || ''),
      updated_at: Date.now()
    };
  }

  function saveSearchClarification(movie, query) {
    var entry = buildClarificationEntry(movie, query);
    if (!entry) return null;

    var store = getClarificationStore();
    store[mediaStorageKey(movie)] = entry;
    Lampa.Storage.set(CLARIFICATION_STORAGE_KEY, store);
    return entry;
  }

  function removeSearchClarification(movie) {
    var store = getClarificationStore();
    var key = mediaStorageKey(movie);
    if (!store[key]) return false;
    delete store[key];
    Lampa.Storage.set(CLARIFICATION_STORAGE_KEY, store);
    return true;
  }

  function invalidateTitleSearchCache(movie, previousClarification, nextClarification) {
    var sourceKeys = SOURCE_OPTIONS.map(function (item) { return item.key; });
    var variants = [previousClarification, nextClarification, null];
    var seen = {};

    sourceKeys.forEach(function (source) {
      variants.forEach(function (clarification) {
        var url = buildSearchUrl(movie, source, clarification);
        if (!url || seen[url]) return;
        seen[url] = true;
        clearRequestCacheUrl(url);
      });
    });
  }

  function sourceKeyFromText(value) {
    value = String(value || '').toLowerCase();
    if (!value) return '';
    if (value.indexOf('animeon') !== -1) return 'animeon';
    if (value.indexOf('uakino') !== -1) return 'uakino';
    if (value.indexOf('rezka') !== -1) return 'rezka';
    if (value.indexOf('eneyida') !== -1) return 'eneyida';
    if (value.indexOf('uafix') !== -1) return 'uafix';
    if (value.indexOf('zet-flix') !== -1 || value.indexOf('zetflix') !== -1) return 'zetflix';
    if (value.indexOf('anitube') !== -1) return 'anitube';
    if (value.indexOf('kodik') !== -1) return 'kodik';
    if (value.indexOf('filmix') !== -1) return 'filmix';
    if (value.indexOf('anilibria') !== -1 || value.indexOf('aniliberty') !== -1) return 'anilibria';
    if (value.indexOf('kinovod') !== -1) return 'kinovod';
    return '';
  }

  function sourceKey(source) {
    return sourceKeyFromText(source && (source.source_key || source.source || source.site || source.source_url));
  }

  function sourceSiteNameFromKey(key) {
    var names = {
      rezka: 'Rezka',
      uakino: 'UAKino',
      eneyida: 'Eneyida',
      uafix: 'UAFix',
      filmix: 'Filmix',
      anitube: 'AniTube',
      animeon: 'AnimeON',
      anilibria: 'AniLibria',
      zetflix: 'ZetFlix',
      kodik: 'Kodik',
      kinovod: 'Kinovod'
    };
    return names[key] || '';
  }

  function buildSearchUrl(movie, selectedSource, clarificationOverride) {
    API_URL = getApiUrl();
    movie = movie || {};

    var clarification = clarificationOverride !== undefined
      ? (clarificationOverride || null)
      : getSearchClarification(movie);
    var title = clarification && clarification.query
      ? clarification.query
      : (movie.title || movie.name || '');
    var original = movie.original_title || movie.original_name || '';
    var year = (movie.release_date || movie.first_air_date || '').slice(0, 4) || (clarification && clarification.year) || '';
    var imdb = movie.imdb_id || movie.imdb || movie.imdbId || (clarification && clarification.imdb_id) || '';
    var tmdb = movie.id || movie.tmdb_id || movie.tmdbId || (clarification && clarification.tmdb_id) || '';
    var kp = movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId || (clarification && clarification.kp_id) || '';
    var shikimori = movie.shikimori_id || movie.shikimoriId || (clarification && clarification.shikimori_id) || '';
    var type = searchMediaType(movie) || (clarification && clarification.type) || 'movie';
    var altTitles = [];
    var genres = collectMovieGenres(movie);
    var clarificationQuery = clarification && clarification.query ? String(clarification.query).toLowerCase() : '';

    function addAlt(name) {
      var text = String(name || '').replace(/\s+/g, ' ').trim();
      var key = text.toLowerCase();
      if (!text || text.length > 160 || text === title || text === original) return;
      if (clarificationQuery && key === clarificationQuery) return;
      if (altTitles.indexOf(text) !== -1) return;
      altTitles.push(text);
    }

    if (clarification && clarification.query) {
      addAlt(movie.title);
      addAlt(movie.name);
      addAlt(movie.original_title);
      addAlt(movie.original_name);
    } else {
      collectMovieTitles(movie).forEach(function (name) {
        if (name !== title && name !== original) addAlt(name);
      });
    }

    var params = new URLSearchParams({
      title: title,
      original_title: original,
      year: year,
      imdb_id: imdb,
      tmdb_id: tmdb,
      kp_id: kp,
      shikimori_id: shikimori,
      type: type,
      device_id: getDeviceId(),
      lscv: CLIENT_CACHE_VERSION
    });
    params.set('sources', validSourceKey(selectedSource) || 'all');
    altTitles.forEach(function (name) {
      params.append('alt_title', name);
      params.append('alt_title[]', name);
    });
    genres.forEach(function (genre) {
      params.append('genre', genre);
    });
    appendAuthParams(params);

    return API_URL + '/search?' + params.toString();
  }

  function sourceActivity(movie, selectedSource) {
    if (!movie) {
      return null;
    }

    selectedSource = validSourceKey(selectedSource) || getPreferredSource(movie);

    return {
      url: buildSearchUrl(movie, selectedSource),
      title: 'Lampa Source',
      component: RESULTS_COMPONENT,
      selected_source: selectedSource,
      movie: movie
    };
  }

  function preloadSearch(movie) {
    var activity = sourceActivity(movie);
    if (!activity) return;

    var dedupeKey = buildSearchDedupeKey(activity.url);
    if (searchInflightDedupe.has(dedupeKey)) return;

    logSearchLoad('preload', { url: activity.url, selectedSource: activity.selected_source });
    cachedJson(activity.url).catch(function () { });
  }

  function openSource(movie) {
    var activity = sourceActivity(movie);

    if (!activity) {
      Lampa.Noty.show('Немає даних про тайтл');
      return;
    }

    Lampa.Activity.push(activity);
  }

  function collectMovieTitles(movie) {
    var result = [];
    var seen = {};

    function add(value) {
      var title = String(value || '').replace(/\s+/g, ' ').trim();
      var key = title.toLowerCase();

      if (!title || title.length > 160 || /^https?:\/\//i.test(title) || seen[key]) return;
      seen[key] = true;
      result.push(title);
    }

    function walk(value, depth, key) {
      if (depth > 4 || value == null) return;

      if (typeof value === 'string') {
        if (/title|name|original|alternative|alias|translation/i.test(String(key || ''))) add(value);
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(function (item) {
          walk(item, depth + 1, key);
        });
        return;
      }

      if (typeof value !== 'object') return;

      Object.keys(value).forEach(function (itemKey) {
        if (/overview|description|poster|backdrop|path|url|image|logo|id$/i.test(itemKey)) return;
        walk(value[itemKey], depth + 1, itemKey);
      });
    }

    add(movie.title);
    add(movie.name);
    add(movie.original_title);
    add(movie.original_name);
    walk(movie, 0, '');

    return result.slice(0, 30);
  }

  function collectMovieGenres(movie) {
    var result = [];
    var seen = {};

    function add(value) {
      var text = String(value || '').replace(/\s+/g, ' ').trim();
      var key = text.toLowerCase();

      if (!text || seen[key]) return;
      seen[key] = true;
      result.push(text);
    }

    function walk(value, depth, key) {
      if (depth > 4 || value == null) return;

      if (typeof value === 'string' || typeof value === 'number') {
        if (/genre/i.test(String(key || ''))) add(value);
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(function (item) {
          walk(item, depth + 1, key);
        });
        return;
      }

      if (typeof value !== 'object') return;

      if (value.id && /genre/i.test(String(key || ''))) add(value.id);
      if (value.name && /genre/i.test(String(key || ''))) add(value.name);

      Object.keys(value).forEach(function (itemKey) {
        walk(value[itemKey], depth + 1, itemKey);
      });
    }

    walk(movie.genres, 0, 'genres');
    walk(movie.genre_ids, 0, 'genre_ids');
    walk(movie.genre, 0, 'genre');

    return result.slice(0, 12);
  }

  function cardImage(movie) {
    movie = movie || {};

    var direct = movie.img || movie.poster || movie.cover || movie.image || movie.picture || movie.poster_path || movie.backdrop || movie.backdrop_path || '';

    try {
      if (!direct && Lampa.Utils.cardImg) direct = Lampa.Utils.cardImg(movie);
    } catch (e) { }

    try {
      if (!direct && Lampa.Utils.cardImgBackground) direct = Lampa.Utils.cardImgBackground(movie);
    } catch (e2) { }

    direct = String(direct || '').trim();
    if (!direct) return '';

    var cssUrl = direct.match(/url\((['"]?)(.*?)\1\)/i);
    if (cssUrl && cssUrl[2]) direct = cssUrl[2];
    if (direct.indexOf('//') === 0) return 'https:' + direct;
    if (direct.charAt(0) === '/') return 'https://image.tmdb.org/t/p/w342' + direct;
    return direct;
  }

  function sourceQuality(source) {
    var value = source.quality || source.quality_text || source.video_quality || '';

    if (source.qualitys && typeof source.qualitys === 'object') {
      var keys = Object.keys(source.qualitys).sort(function (a, b) {
        return sourceQualityScore(b) - sourceQualityScore(a);
      });
      if (keys.length) value = keys[0];
    }

    return sourceQualityLabel(value);
  }

  function sourceQualityScore(value) {
    var text = String(value || '').toLowerCase();
    if (/4k|uhd|2160/.test(text)) return 2160;
    if (/fhd|full\s*hd|1080/.test(text)) return 1080;
    if (/(^|\D)hd($|\D)|720/.test(text)) return 720;
    var found = text.match(/(1440|480|360|240)/);
    return found ? Number(found[1]) : 0;
  }

  function sourceQualityLabel(value) {
    var score = sourceQualityScore(value);
    if (score >= 2160) return '4K';
    if (score >= 1440) return '1440p';
    if (score >= 1080) return 'FHD';
    if (score >= 720) return 'HD';
    return score ? score + 'p' : '';
  }

  function sourceTypeTitle(source) {
    var type = String(source && source.type || '').toLowerCase();
    var site = sourceSite(source);

    if (site === 'AniTube' && !type) return 'АНІМЕ';
    if (/tv|serial|series|anime/.test(type)) return 'СЕРІАЛ';
    if (/movie|film/.test(type)) return 'ФІЛЬМ';

    return source && source.type || '';
  }

  function qualityClass(value) {
    var text = String(value || '').toLowerCase();
    if (/2160|4k|uhd/.test(text)) return 'lampa-source-card__quality--uhd';
    if (/1080|720|hd/.test(text)) return 'lampa-source-card__quality--hd';
    return '';
  }

  function isFastSource(source) {
    return /kodik|filmix|animeon|anilibria/i.test(String(source.site || source.source_url || ''));
  }

  function sourceSite(source) {
    if (source && source.client_placeholder && sourceKey(source) === 'rezka') return 'Rezka';
    var fromKey = sourceSiteNameFromKey(sourceKey(source));
    if (fromKey) return fromKey;
    if (source && String(source.site || '').toLowerCase() === 'rezka') return 'Rezka';
    var url = String(source && source.source_url || '').toLowerCase();

    if (!url || url.indexOf('cub.rip') !== -1) return '';
    if (url.indexOf('animeon.club') !== -1) return 'AnimeON';
    if (url.indexOf('uakino') !== -1) return 'UAKino';
    if (url.indexOf('rezka') !== -1) return 'Rezka';
    if (url.indexOf('eneyida') !== -1) return 'Eneyida';
    if (url.indexOf('uafix') !== -1) return 'UAFix';
    if (url.indexOf('zet-flix') !== -1) return 'ZetFlix';
    if (url.indexOf('anitube') !== -1) return 'AniTube';
    if (url.indexOf('kodik:') === 0 || url.indexOf('kodik') !== -1) return 'Kodik';
    if (url.indexOf('filmix:') === 0 || url.indexOf('filmix') !== -1) return 'Filmix';
    if (url.indexOf('anilibria') !== -1 || url.indexOf('aniliberty') !== -1) return 'AniLibria';
    return '';
  }

  function addButton(event) {
    var movie = getMovie(event);
    if (!movie) return;

    var activity = event.object && event.object.activity;
    if (!activity) return;

    var render = activity.render();
    if (!render || !render.length) return;

    if (render.find('.lampa-source-button').length) return;

    var watchButton = render
      .find('.full-start-new__buttons .selector, .full-start__buttons .selector, .full-start .selector, .full-start-new .selector')
      .first();

    var buttonPlace = render
      .find('.full-start-new__buttons, .full-start__buttons, .full-start-new, .full-start')
      .first();

    if ((!watchButton || !watchButton.length) && (!buttonPlace || !buttonPlace.length)) return;

    injectStyles();

    var button = $(`
            <div class="full-start__button selector lampa-source-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L5 13H11L10 22L19 10H13L13 2Z" fill="currentColor"></path>
                </svg>
                <span>Джерела</span>
            </div>
        `);

    var opening = false;

    button.on('hover:focus', function () {
      preloadSearch(movie);
    });

    button.on('hover:enter', function () {
      if (opening) return;

      opening = true;
      openSource(movie);

      setTimeout(function () {
        opening = false;
      }, 1000);
    });

    if (watchButton && watchButton.length) watchButton.after(button);
    else buttonPlace.append(button);
  }

  function mergePickerResults(existing, incoming) {
    var merged = (existing || []).slice();
    var seen = {};
    merged.forEach(function (item) {
      if (item && item.source_url) seen[item.source_url] = true;
    });
    (incoming || []).forEach(function (item) {
      if (!item || !item.source_url || seen[item.source_url]) return;
      seen[item.source_url] = true;
      merged.push(item);
    });
    return merged;
  }

  function filterPickerResultsForSource(results, selectedSourceFilter) {
    if (isAllSourcesSelection(selectedSourceFilter)) return (results || []).slice();
    var raw = String(selectedSourceFilter || '').trim().toLowerCase();
    if (/^https?:\/\//.test(raw)) return (results || []).slice();
    var key = validSourceKey(selectedSourceFilter) || sourceKeyFromText(selectedSourceFilter);
    if (!key || key === 'all') return (results || []).slice();
    return (results || []).filter(function (source) {
      return sourceKey(source) === key;
    });
  }

  function createPickerRequestCoordinator() {
    var activeRequest = null;
    var requestSeq = 0;

    return {
      beginLoad: function (url, selectedSourceFilter, generation) {
        requestSeq += 1;
        activeRequest = {
          requestId: requestSeq,
          generation: Number(generation) || 0,
          url: String(url || ''),
          selectedSource: buildSourceCooldownKey(selectedSourceFilter)
        };
        return {
          requestId: activeRequest.requestId,
          generation: activeRequest.generation,
          url: activeRequest.url,
          selectedSource: activeRequest.selectedSource
        };
      },
      shouldApply: function (request) {
        if (!request || !activeRequest) return false;
        return request.requestId === activeRequest.requestId
          && request.generation === activeRequest.generation
          && request.url === activeRequest.url
          && buildSourceCooldownKey(request.selectedSource) === activeRequest.selectedSource;
      },
      invalidate: function () {
        activeRequest = null;
      }
    };
  }

  function createRetryTimerBag() {
    var timers = [];

    return {
      schedule: function (callback, delayMs) {
        timers.forEach(function (timerId) {
          clearTimeout(timerId);
        });
        timers.length = 0;
        var timerId = setTimeout(function () {
          timers.length = 0;
          callback();
        }, delayMs);
        timers.push(timerId);
        return timerId;
      },
      clearAll: function () {
        timers.forEach(function (timerId) {
          clearTimeout(timerId);
        });
        timers.length = 0;
      }
    };
  }

  function isKodikSource(source) {
    var site = String(source && source.site || '').toLowerCase();
    var url = String(source && source.source_url || '').toLowerCase();
    return site === 'kodik' || url.indexOf('kodik:') === 0 || /kodik\.(?:info|biz|cc)|kodikplayer\.com/.test(url);
  }

  function mapPickerResults(data) {
    if (!data || !data.ok || !Array.isArray(data.results)) return [];
    return data.results.filter(function (source) {
      return !!sourceSite(source) && !isKodikSource(source);
    });
  }

  function isSearchStillActive(data, startedAt, waitMs) {
    if (!data) return true;
    if (isRateLimitedResponse(data)) return false;
    if (data.search_active === true || data.refreshing === true || data.server_busy === true) return true;
    if (Date.now() - startedAt >= waitMs) return false;
    return data.ok === true && Array.isArray(data.results) && data.results.length === 0 && data.cached !== true;
  }

  function LampaSourceResults(object) {
    var self = this;
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var last = false;
    var selectedSource = validSourceKey(object.selected_source) || getPreferredSource(object.movie);
    var searchGeneration = 0;
    var searchRequestCoordinator = createPickerRequestCoordinator();
    var searchRetryTimers = createRetryTimerBag();
    var sourceRateLimitCooldown = createSourceRateLimitCooldown();
    var renderedPickerResults = [];
    var sourceReadiness = {};
    var rateLimitRetryScheduler = createRateLimitRetryScheduler();
    var searchLoadGate = createSearchLoadGate();
    var SEARCH_WAIT_MS = 12000;
    var searchPollState = createSearchPollController({ waitMs: SEARCH_WAIT_MS });

    function shouldReloadForRezkaCookieUpdate() {
      var source = validSourceKey(selectedSource) || 'all';
      return source === 'rezka' || source === 'all';
    }

    Lampa.Listener.follow('lampa_source', function (event) {
      if (!event || event.type !== 'rezka_cookie_updated') return;
      if (!shouldReloadForRezkaCookieUpdate()) return;
      clearRequestCacheUrl(object.url);
      load('settings_event');
    });

    scroll.body().addClass('torrent-list');
    scroll.minus(files.render().find('.explorer__files-head'));

    function reset() {
      last = false;
      scroll.render().find('.empty').remove();
      scroll.clear();
      scroll.reset();
    }

    function empty(msg) {
      var empty = Lampa.Template.get('list_empty');
      if (msg) empty.find('.empty__descr').text(msg);
      scroll.append(empty);
      loading(self, false);
      self.start(true);
    }

    function rateLimitMessageForSource(sourceKey) {
      var title = sourceOptionTitle(sourceKey);
      if (sourceKey && sourceKey !== 'all') {
        return 'Забагато запитів для ' + title + '. Пошук продовжиться автоматично.';
      }
      return 'Забагато запитів. Пошук продовжиться автоматично.';
    }

    function showRateLimitStateForSource(sourceKey) {
      if (buildSourceCooldownKey(selectedSource) !== buildSourceCooldownKey(sourceKey)) return;

      loading(self, false);
      reset();
      appendSearchControls();
      empty(rateLimitMessageForSource(sourceKey));
    }

    function scheduleRateLimitRetry(data, request) {
      var sourceKey = buildSourceCooldownKey(request.selectedSource);
      var identity = buildRateLimitIdentity(request.url, request.selectedSource, request.requestId);
      var retryAfter = data && data.retry_after;

      sourceRateLimitCooldown.mark(sourceKey, retryAfter, {
        requestId: request.requestId,
        generation: request.generation,
        identity: identity
      });

      pickerTelemetry('search_rate_limited', {
        retry_after: Number(retryAfter) || 0,
        selected_source: sourceKey
      });

      rateLimitRetryScheduler.schedule({
        generation: request.generation,
        identity: identity,
        retry_after: retryAfter,
        shouldRetry: function (ctx) {
          return searchRequestCoordinator.shouldApply({
            requestId: request.requestId,
            generation: ctx.generation,
            url: request.url,
            selectedSource: request.selectedSource
          });
        },
        onRetry: function () {
          if (!searchRequestCoordinator.shouldApply(request)) return;
          if (buildSourceCooldownKey(selectedSource) !== sourceKey) return;
          loading(self, true);
          reset();
          appendSearchControls();
          scroll.append(Lampa.Template.get('lampa_source_loader'));
          attemptSearch(request, false, 'retry');
        }
      });

      pickerTelemetry('search_rate_limit_retry_scheduled', {
        retry_after: Number(retryAfter) || 0,
        selected_source: sourceKey
      });
    }

    function appendSourceSwitch() {
      var item = $('<div class="selector lampa-source-switch"><div class="lampa-source-switch__label">Джерело</div><div class="lampa-source-switch__value">' + escapeHtml(sourceOptionTitle(selectedSource)) + '</div></div>');

      bindEnter(item, function () {
        Lampa.Select.show({
          title: 'Джерело',
          items: sourceOptions().map(function (source) {
            return {
              title: source.title,
              source: source.key,
              selected: source.key === selectedSource
            };
          }),
          onSelect: function (item) {
            selectedSource = validSourceKey(item.source) || 'all';
            object.selected_source = selectedSource;
            object.url = buildSearchUrl(object.movie, selectedSource);
            clearRequestCacheUrl(object.url);
            load('source_switch');
          }
        });
      });

      scroll.append(item);
    }

    function openClarificationEditor(currentValue) {
      if (!Lampa.Input || !Lampa.Input.edit) {
        Lampa.Noty.show('Введення недоступне');
        return;
      }

      Lampa.Input.edit({
        title: 'Уточнення пошуку',
        value: currentValue || '',
        free: true,
        nosave: true,
        onEdit: function (value) {
          var query = String(value || '').replace(/\s+/g, ' ').trim();
          if (!query) {
            Lampa.Noty.show('Введіть текст для пошуку');
            return;
          }

          var previous = getSearchClarification(object.movie);
          saveSearchClarification(object.movie, query);
          invalidateTitleSearchCache(object.movie, previous, getSearchClarification(object.movie));
          object.url = buildSearchUrl(object.movie, selectedSource);
          load('settings_event');
        }
      });
    }

    function appendClarificationControl() {
      var clarification = getSearchClarification(object.movie);
      var summary = clarification && clarification.query
        ? ('Уточнення: ' + clarification.query)
        : 'Уточнити пошук';
      var item = $('<div class="selector lampa-source-clarify"><div class="lampa-source-clarify__label">Пошук</div><div class="lampa-source-clarify__value">' + escapeHtml(summary) + '</div></div>');

      bindEnter(item, function () {
        var items = [
          { title: clarification ? 'Змінити уточнення' : 'Додати уточнення', action: 'edit' }
        ];

        if (clarification) {
          items.push({ title: 'Видалити уточнення', action: 'delete' });
          items.push({ title: 'Звичайний пошук', action: 'reset' });
        }

        Lampa.Select.show({
          title: 'Уточнення пошуку',
          items: items,
          onSelect: function (selected) {
            if (!selected) return;

            if (selected.action === 'edit') {
              openClarificationEditor(clarification && clarification.query || '');
              return;
            }

            if (selected.action === 'delete' || selected.action === 'reset') {
              var previous = getSearchClarification(object.movie);
              removeSearchClarification(object.movie);
              invalidateTitleSearchCache(object.movie, previous, null);
              object.url = buildSearchUrl(object.movie, selectedSource);
              load('settings_event');
            }
          }
        });
      });

      scroll.append(item);
    }

    function appendTestBuildMarker() {
      if (!TEST_BUILD) return;
      scroll.append($('<div class="lampa-source-fix-marker"><div class="lampa-source-fix-marker__label">TEST: KINOVOD V1</div></div>'));
    }

    function appendSearchControls() {
      appendTestBuildMarker();
      appendSourceSwitch();
      appendClarificationControl();
    }

    function appendSource(source, index) {
      var image = cardImage(object.movie);
      var quality = sourceQuality(source);
      var site = sourceSite(source);
      var currentSourceKey = sourceKey(source);
      var deviceFailure = getStoredDevicePlaybackFailure(object.movie, currentSourceKey);
      var failureLabel = devicePlaybackBadgeLabel(deviceFailure);
      var readiness = sourceReadiness[currentSourceKey];
      var readinessLabel = readiness && readiness.label ? readiness.label : '';
      var authRequired = isRezkaAuthRequiredSource(source, currentSourceKey, sourceReadiness);
      var isLast = currentSourceKey && currentSourceKey === selectedSource;
      var isPriority = selectedSource === 'all' && currentSourceKey === getPrioritySource(object.movie);
      var isFast = !isLast && !isPriority && index === 0 && isFastSource(source);
      var mark = failureLabel || (authRequired ? REZKA_AUTH_REQUIRED_LABEL : readinessLabel) || (isPriority ? 'пріоритет' : (isLast ? 'обране' : (isFast ? 'швидке' : '')));
      var qualityLabel = authRequired ? REZKA_AUTH_HINT : quality;

      var pickerDisplayTitle = resolveSourcePickerDisplayTitle(source, object.movie, authRequired, sourceReadiness);

      var element = {
        title: escapeHtml(pickerDisplayTitle),
        source_site: escapeHtml(site),
        source_year: escapeHtml(source.year || ''),
        source_type: escapeHtml(sourceTypeTitle(source)),
        quality: escapeHtml(qualityLabel),
        quality_class: authRequired ? 'lampa-source-card__quality--auth-hint' : qualityClass(quality),
        mark: mark,
        mark_class: failureLabel ? devicePlaybackMarkClass(deviceFailure) : (authRequired ? sourceFailureMarkClass('AUTH_REQUIRED') : (isLast || isPriority ? 'lampa-source-card__mark--last' : (isFast ? 'lampa-source-card__mark--fast' : ''))),
        poster_class: image ? 'lampa-source-card__poster--image' : '',
        poster_style: image ? 'background-image:url(&quot;' + escapeHtml(image) + '&quot;)' : ''
      };

      var item = Lampa.Template.get('lampa_source_folder', element);

      item.on('hover:focus', function (e) {
        last = e.target;
        scroll.update($(e.target), true);
      });

      bindEnter(item, function () {
        var click = resolvePickerSourceClick({
          authRequired: authRequired,
          isPlaceholder: !!source.client_placeholder
        });
        if (click.action === 'auth') {
          openRezkaAuthSettings();
          return;
        }
        if (click.action === 'noop') return;
        if (deviceFailure) clearDevicePlaybackFailure(object.movie, currentSourceKey || '');
        pickerTelemetry('source_selected', { source_key: currentSourceKey || '' });
        rememberPreferredSource(object.movie, currentSourceKey || selectedSource);

        analyticsEvent('source_open', object.movie, {
          source_site: site
        });
        emitStateTelemetry('source_selected', object.movie, activityTelemetryExtras(object.movie, {
          source_key: currentSourceKey || '',
          source_site: site
        }));

        var params = new URLSearchParams({
          source_url: source.source_url
        });
        appendTitleIdentityParams(params, object.movie);

        var episodesUrl = API_URL + '/episodes?' + appendSourceCacheVersion(appendDownstreamAuthParams(new URLSearchParams(params), click.manualRetry), source.source_url).toString();
        var translationsUrl = API_URL + '/translations?' + appendSourceCacheVersion(appendDownstreamAuthParams(new URLSearchParams(params), click.manualRetry), source.source_url).toString();

        var episodesActivity = {
          url: episodesUrl,
          api_url: episodesUrl,
          translations_url: translationsUrl,
          title: source.title || 'Серії',
          component: EPISODES_COMPONENT,
          source: source,
          movie: object.movie
        };

        debugLog('source selected -> push episodes activity', {
          source: source,
          site: site,
          currentSourceKey: currentSourceKey,
          selectedSource: selectedSource,
          activity: episodesActivity
        });

        Lampa.Activity.push(episodesActivity);
      });

      scroll.append(item);
      if (!source.client_placeholder) {
        pickerTelemetry('picker_item_created', { source_key: currentSourceKey || '', picker_items_count: index + 1 });
      }
    }

    function load(loadReason) {
      loadReason = loadReason || 'open';
      searchGeneration += 1;
      var request = searchRequestCoordinator.beginLoad(object.url, selectedSource, searchGeneration);
      var startedAt = Date.now();
      var cooldownSourceKey = buildSourceCooldownKey(selectedSource);
      renderedPickerResults = [];
      searchLoadGate.reset();
      searchPollState.reset(startedAt);
      rateLimitRetryScheduler.cancelAll();
      searchRetryTimers.clearAll();
      logSearchLoad(loadReason, request);

      if (sourceRateLimitCooldown.isActive(cooldownSourceKey)) {
        showRateLimitStateForSource(cooldownSourceKey);
        scheduleRateLimitRetry({ retry_after: Math.ceil(sourceRateLimitCooldown.remainingMs(cooldownSourceKey) / 1000) }, request);
        return;
      }

      loading(self, true);
      reset();
      appendSearchControls();
      scroll.append(Lampa.Template.get('lampa_source_loader'));
      analyticsEvent('search', object.movie);

      function mapResultsForRequest(data) {
        return filterPickerResultsForSource(mapPickerResults(data), request.selectedSource);
      }

      function handleRateLimitedResponse(data) {
        if (!searchRequestCoordinator.shouldApply(request)) return;
        searchLoadGate.markInitialSettled();
        showRateLimitStateForSource(cooldownSourceKey);
        scheduleRateLimitRetry(data, request);
      }

      function markAttemptSettled(searchReason) {
        if (searchReason !== 'polling') searchLoadGate.markInitialSettled();
      }

      function maybeScheduleSearchPoll(data, activeRequest, hasRenderableResults, useStaleFallback) {
        if (!searchRequestCoordinator.shouldApply(activeRequest)) return false;

        searchPollState.setLastResponse(data);

        if (!searchPollState.shouldPoll(data, { hasRenderableResults: hasRenderableResults })) {
          if (!useStaleFallback && !hasRenderableResults && searchPollState.isPastDeadline()) {
            finishAfterDeadline();
          }
          return false;
        }

        if (!searchPollState.canStartNetwork()) {
          logSearchLoad('polling_max_network', activeRequest);
          return false;
        }

        var delayMs = searchPollState.nextDelayMs(data);
        searchPollState.markPollScheduled();
        pickerTelemetry('search_poll_scheduled', {
          poll_count: searchPollState.getPollCount(),
          delay_ms: delayMs,
          network_count: searchPollState.getNetworkCount()
        });
        searchRetryTimers.schedule(function () {
          attemptSearch(activeRequest, false, 'polling');
        }, delayMs);
        return true;
      }

      function attemptSearch(activeRequest, useStaleFallback, searchReason) {
        if (!searchRequestCoordinator.shouldApply(activeRequest)) return;

        searchReason = searchReason || (useStaleFallback ? 'supplement' : loadReason);
        var isInitialTrigger = searchReason === 'open' || searchReason === 'source_switch' || searchReason === 'settings_event';

        if (isInitialTrigger && !searchLoadGate.tryStartInitial()) {
          logSearchLoad('duplicate_initial_skipped', activeRequest);
          return;
        }
        if (searchReason === 'polling' && !searchLoadGate.canPoll()) {
          logSearchLoad('polling_blocked', activeRequest);
          return;
        }
        if ((useStaleFallback || searchReason === 'supplement') && !searchLoadGate.canSupplement()) {
          logSearchLoad('supplement_blocked', activeRequest);
          return;
        }

        if (searchReason === 'polling' && !searchPollState.canStartNetwork()) {
          logSearchLoad('polling_max_network', activeRequest);
          return;
        }

        logSearchLoad(searchReason, activeRequest);

        var fetchUrl = object.url;
        if (useStaleFallback && fetchUrl.indexOf('stale_fallback=') === -1) {
          fetchUrl += (fetchUrl.indexOf('?') === -1 ? '?' : '&') + 'stale_fallback=1';
        }

        var bypassMemory = searchReason === 'retry'
          || (searchReason === 'polling' && searchPollState.pollBypassMemory(searchPollState.getLastResponse()));
        if (isInitialTrigger) clearRequestCacheUrl(object.url);

        var fetchOptions = {
          cacheUrl: object.url,
          bypassMemory: bypassMemory,
          staleFallback: !!useStaleFallback,
          dedupeKey: buildSearchDedupeKey(fetchUrl, { staleFallback: !!useStaleFallback }),
          onNetworkStart: function () {
            searchPollState.recordNetwork();
            pickerTelemetry('search_network', {
              search_load_reason: searchReason,
              network_count: searchPollState.getNetworkCount()
            });
          }
        };

        ensureTitleDbVersion().then(function () {
          return cachedJsonAfterVersion(fetchUrl, fetchOptions);
        }).then(function (data) {
            if (!searchRequestCoordinator.shouldApply(activeRequest)) return;

            if (isRateLimitedResponse(data)) {
              handleRateLimitedResponse(data);
              return;
            }

            markAttemptSettled(searchReason);
            sourceRateLimitCooldown.clear(cooldownSourceKey);

            var results = mapResultsForRequest(data);
            var hasRenderableResults = results.length > 0 || shouldInjectRezkaAuthPlaceholder();
            if (hasRenderableResults) {
              renderResults(data, {
                supplement: renderedPickerResults.length > 0,
                incremental: renderedPickerResults.length > 0,
                preserveFocus: renderedPickerResults.length > 0
              });
              maybeScheduleSearchPoll(data, activeRequest, hasRenderableResults, useStaleFallback);
              return;
            }

            if (maybeScheduleSearchPoll(data, activeRequest, false, useStaleFallback)) return;

            if (!useStaleFallback) {
              finishAfterDeadline();
              return;
            }

            renderResults(data || { ok: true, results: [] }, { allowEmpty: true });
          })
          .catch(function (err) {
            if (!searchRequestCoordinator.shouldApply(activeRequest)) return;

            markAttemptSettled(searchReason);

            if (maybeScheduleSearchPoll(null, activeRequest, false, useStaleFallback)) return;

            var stale = readPersistentCache(object.url, true);
            if (mapResultsForRequest(stale).length || shouldInjectRezkaAuthPlaceholder()) {
              renderResults(stale && stale.ok ? stale : { ok: true, results: [] }, { allowEmpty: true });
              return;
            }

            console.error('Lampa Source search error:', err);
            analyticsEvent('error', object.movie, {
              event_type: 'error',
              source_site: 'search'
            });
            loading(self, false);
            reset();
            appendSearchControls();
            empty('Помилка API');
          });
      }

      function renderResults(data, options) {
        options = options || {};
        if (!searchRequestCoordinator.shouldApply(request)) return;

        var results = mapResultsForRequest(data);
        if (options.supplement && renderedPickerResults.length) {
          results = filterPickerResultsForSource(
            mergePickerResults(renderedPickerResults, results),
            request.selectedSource
          );
        }
        results = applyRezkaAuthPlaceholder(results, object.movie);
        results = filterPickerResultsForSource(results, request.selectedSource);

        pickerTelemetry('search_results_mapped', {
          search_results_count: data && Array.isArray(data.results) ? data.results.length : 0,
          filtered_results_count: results.length,
          request_id: request.requestId,
          selected_source: request.selectedSource
        });

        if (!results.length) {
          if (!options.allowEmpty) return;
          loading(self, false);
          reset();
          appendSearchControls();
          empty('У ' + sourceOptionTitle(selectedSource) + ' нічого не знайдено');
          return;
        }

        if (options.incremental && options.supplement && renderedPickerResults.length) {
          var previousFocus = last;
          var existingUrls = {};
          renderedPickerResults.forEach(function (source) {
            if (source && source.source_url) existingUrls[source.source_url] = true;
          });
          var addedCount = 0;
          results.forEach(function (source, index) {
            if (!source || !source.source_url || existingUrls[source.source_url]) return;
            existingUrls[source.source_url] = true;
            appendSource(source, index);
            addedCount += 1;
          });
          if (addedCount > 0) {
            renderedPickerResults = results;
            sourceReadiness = data && data.source_readiness ? data.source_readiness : sourceReadiness;
            loading(self, false);
            if (previousFocus) {
              last = previousFocus;
              Lampa.Controller.collectionFocus(last, scroll.render());
            }
            return;
          }
        }

        renderedPickerResults = results;
        sourceReadiness = data && data.source_readiness ? data.source_readiness : sourceReadiness;
        loading(self, false);

        var restoreFocus = options.preserveFocus ? last : false;
        reset();
        appendSearchControls();

        if (selectedSource !== 'all') rememberPreferredSource(object.movie, selectedSource);

        var prioritySource = selectedSource === 'all' ? getPrioritySource(object.movie) : '';
        if (prioritySource) {
          results.sort(function (a, b) {
            var aPriority = sourceKey(a) === prioritySource ? 0 : 1;
            var bPriority = sourceKey(b) === prioritySource ? 0 : 1;
            return aPriority - bPriority;
          });
        }

        results.forEach(function (source, index) {
          appendSource(source, index);
        });

        pickerTelemetry('picker_rendered', {
          picker_created: true,
          picker_items_count: results.length,
          first_selectable_items_count: scroll.render().find('.selector').length,
          request_id: request.requestId
        });

        emitStateTelemetry('source_picker_open', object.movie);

        if (restoreFocus && scroll.render().find(restoreFocus).length) {
          last = restoreFocus;
          self.start(false);
          Lampa.Controller.collectionFocus(last, scroll.render());
          return;
        }

        self.start(!options.preserveFocus);
      }

      function finishAfterDeadline() {
        if (!searchRequestCoordinator.shouldApply(request)) return;

        var stale = readPersistentCache(object.url, true);
        if (mapResultsForRequest(stale).length || shouldInjectRezkaAuthPlaceholder()) {
          renderResults(stale && stale.ok ? stale : { ok: true, results: [] }, { allowEmpty: true });
          return;
        }

        attemptSearch(request, true, 'supplement');
      }

      attemptSearch(request, false, loadReason);
    }

    this.create = function () {
      files.appendFiles(scroll.render());
      load('open');

      return this.render();
    };

    this.render = function () {
      return files.render();
    };

    this.start = function (firstSelect) {
      if (firstSelect) {
        last = scroll.render().find('.selector').eq(0)[0];
      }

      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || scroll.render().find('.selector').eq(0)[0], scroll.render());
        },
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () {
          Navigator.move('down');
        },
        right: function () {
          if (Navigator.canmove('right')) Navigator.move('right');
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        back: this.back
      });

      Lampa.Controller.toggle('content');
    };

    this.back = function () {
      Lampa.Activity.backward();
    };

    this.pause = function () { };
    this.stop = function () { };
    this.destroy = function () {
      rateLimitRetryScheduler.cancelAll();
      searchRetryTimers.clearAll();
      searchRequestCoordinator.invalidate();
      searchPollState.reset();
      searchGeneration += 1;
      network.clear();
      files.destroy();
      scroll.destroy();
      network = null;
    };
  }

  function recoverTranslations(seasonUrl, primaryUrl) {
    clearRequestCacheUrl(primaryUrl);

    var params = new URLSearchParams({
      source_url: seasonUrl
    });
    appendDownstreamAuthParams(params, true);
    appendSourceCacheVersion(params, seasonUrl);

    var retryUrl = API_URL + '/translations?' + params.toString();

    return json(retryUrl).then(function (data) {
      return data && data.ok && data.translations ? data.translations : [];
    }).catch(function () {
      return [];
    });
  }

  function LampaSourceEpisodes(object) {
    debugLog('episodes component init', {
      object_keys: Object.keys(object || {}),
      component: object && object.component,
      title: object && object.title,
      url: object && object.url,
      api_url: object && object.api_url,
      translations_url: object && object.translations_url,
      source: object && object.source,
      movie: object && movieAnalytics(object.movie)
    });

    var self = this;
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);

    var translations = [];
    var seasons = [];
    var episodes = [];
    var filter_items = {};
    var choice = {
      season: 0,
      voice: 0,
      voice_name: '',
      voice_id: 0,
      player: 0,
      player_name: '',
      player_id: 0
    };
    var lazySeasonsEnabled = sourceNeedsSeasonsFetch(object.source);
    var translationsCache = {};
    var episodesCache = {};
    var episodesLoadGeneration = 0;
    var PLAYBACK_STORAGE_KEY = 'lampa_source_playback_v1';
    var resolveSession = createResolveSession(function (element) {
      return makeHash(element);
    });
    var last = false;

    scroll.body().addClass('torrent-list');
    scroll.minus(files.render().find('.explorer__files-head'));

    function reset() {
      last = filter.render().find('.selector').eq(0)[0];
      scroll.render().find('.empty').remove();
      scroll.clear();
      scroll.reset();
    }

    function empty(msg) {
      var empty = Lampa.Template.get('list_empty');
      if (msg) empty.find('.empty__descr').text(msg);
      scroll.append(empty);
      loading(self, false);
      self.start(true);
    }

    function sourceUrl() {
      return object.source && object.source.source_url ? object.source.source_url : '';
    }

    function sourceRef() {
      return object.source && object.source.ref ? object.source.ref : '';
    }

    function sourceContractKey() {
      return object.source && object.source.source_key ? object.source.source_key : sourceKey(object.source);
    }

    function playbackKey() {
      return mediaStorageKey(object.movie) + '|' + String(sourceContractKey() || '');
    }

    function readPlaybackState() {
      var saved = storedObject(PLAYBACK_STORAGE_KEY);
      return saved[playbackKey()] || null;
    }

    function writePlaybackState(patch) {
      var saved = storedObject(PLAYBACK_STORAGE_KEY);
      var current = saved[playbackKey()] || {};
      var season = selectedSeason();
      var tr = selectedVoice();
      var next = {
        source_key: sourceContractKey(),
        season: choice.season,
        season_number: season ? season.season : 1,
        voice: choice.voice,
        voice_name: tr ? tr.translation_name : choice.voice_name,
        voice_id: choice.voice_id,
        player: choice.player,
        player_name: tr ? playerName(tr) : choice.player_name,
        player_id: choice.player_id,
        selected_episode: current.selected_episode != null ? current.selected_episode : current.episode,
        played_episode: current.played_episode,
        episode: current.episode,
        updated_at: Date.now()
      };

      if (patch && patch.selected_episode != null) {
        next.selected_episode = patch.selected_episode;
        next.episode = patch.selected_episode;
      }

      if (patch && patch.played_episode != null) {
        next.played_episode = patch.played_episode;
        next.selected_episode = patch.played_episode;
        next.episode = patch.played_episode;
      }

      if (patch && patch.episode != null && patch.selected_episode == null && patch.played_episode == null) {
        next.episode = patch.episode;
        if (next.selected_episode == null) next.selected_episode = patch.episode;
      }

      saved[playbackKey()] = next;
      Lampa.Storage.set(PLAYBACK_STORAGE_KEY, saved);
    }

    function resolveSavedVoiceIndex(translationsList, saved) {
      if (!translationsList.length) return { index: 0, fallback: true };
      if (!saved) return { index: 0, fallback: true };

      for (var i = 0; i < translationsList.length; i++) {
        if (
          translationsList[i].translation_id == saved.voice_id &&
          translationsList[i].player_id == saved.player_id
        ) {
          return { index: i, fallback: false };
        }
      }

      return { index: 0, fallback: true };
    }

    function resolveSavedSeasonWithFallback(seasonsList, saved) {
      var index = resolveSavedSeasonIndex(seasonsList, saved);
      if (!saved || !seasonsList.length) return { index: index, fallback: true };

      var season = seasonsList[index];
      var matchedByNumber = saved.season_number != null && season
        && Number(season.season) === Number(saved.season_number);
      var matchedByIndex = typeof saved.season === 'number' && saved.season === index;

      return { index: index, fallback: !(matchedByNumber || matchedByIndex) };
    }

    function resolveFocusEpisode(episodesList, saved) {
      if (!episodesList.length) return null;

      var candidates = [
        saved && saved.selected_episode,
        saved && saved.played_episode,
        saved && saved.episode
      ];

      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c] == null) continue;
        for (var i = 0; i < episodesList.length; i++) {
          if (Number(episodesList[i].episode) === Number(candidates[c])) {
            return Number(episodesList[i].episode);
          }
        }
      }

      return Number(episodesList[0].episode);
    }

    function episodeRestoreMeta(episodesList, saved, episodeNumber) {
      if (!saved) return { episode: episodeNumber, fallback: true };

      var candidates = [saved.selected_episode, saved.played_episode, saved.episode];
      var matched = false;

      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i] != null && Number(candidates[i]) === Number(episodeNumber)) {
          matched = true;
          break;
        }
      }

      return { episode: episodeNumber, fallback: !matched };
    }

    function shouldRecordSuccessfulPlay(payload) {
      return !!(payload && payload.ok !== false && (payload.stream || payload.stream_url));
    }

    function syncPlaybackChoice() {
      writePlaybackState({});
    }

    function recordSelectedEpisode(episodeNumber) {
      writePlaybackState({ selected_episode: episodeNumber });
    }

    function recordSuccessfulPlay(episodeNumber) {
      writePlaybackState({ played_episode: episodeNumber });
    }

    function resolveSavedSeasonIndex(seasonsList, saved) {
      if (!Array.isArray(seasonsList) || !seasonsList.length) return 0;

      if (saved && saved.season_number != null) {
        for (var n = 0; n < seasonsList.length; n++) {
          if (Number(seasonsList[n] && seasonsList[n].season) === Number(saved.season_number)) return n;
        }
      }

      if (saved && typeof saved.season === 'number' && saved.season >= 0 && saved.season < seasonsList.length) {
        return saved.season;
      }

      for (var i = 0; i < seasonsList.length; i++) {
        if (seasonsList[i] && seasonsList[i].active) return i;
      }

      return 0;
    }

    function translationsCacheKey(seasonUrl) {
      return String(seasonUrl || '');
    }

    function episodeRequestKey(seasonUrl, translationId, playerId) {
      return [
        String(seasonUrl || ''),
        translationId == null ? '' : String(translationId),
        playerId == null ? '' : String(playerId)
      ].join('|');
    }

    function currentEpisodeRequestKey() {
      return episodeRequestKey(seasonSourceUrl(), choice.voice_id, choice.player_id);
    }

    function hasTranslationsCache() {
      return !!translationsCache[translationsCacheKey(seasonSourceUrl())];
    }

    function hasEpisodesCache() {
      return !!episodesCache[currentEpisodeRequestKey()];
    }

    function selectedSeason() {
      return seasons[choice.season] || null;
    }

    function seasonSourceUrl() {
      var season = selectedSeason();
      return season && season.source_url ? season.source_url : sourceUrl();
    }

    function seasonRef() {
      var season = selectedSeason();
      return season && season.ref ? season.ref : sourceRef();
    }

    function selectedVoice() {
      if (usePlayerFilter() && filter_items.player_info && filter_items.player_info.length) {
        return filter_items.player_info[choice.player] || filter_items.player_info[0] || null;
      }

      return translations[choice.voice] || null;
    }

    function voiceTitle() {
      var tr = selectedVoice();

      if (!tr) return 'Авто';

      return formatVoiceTitle(tr, true);
    }

    function cleanVoicePart(value) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isAniTubeSource() {
      return sourceSiteName() === 'AniTube';
    }

    function cleanAniTubeVoiceName(value) {
      return cleanVoicePart(value)
        .replace(/^(плеєр|плеер|player)\s*/i, '')
        .trim();
    }

    function formatVoiceTitle(tr, withPlayer) {
      if (!tr) return '';

      if (isAniTubeSource()) {
        return cleanAniTubeVoiceName(tr.translation_name || tr.player_name) || 'Player';
      }

      var site = sourceSiteName().toLowerCase();
      var parts = [];

      [tr.translation_name, withPlayer ? tr.player_name : ''].forEach(function (value) {
        var part = cleanVoicePart(value);
        var key = part.toLowerCase();

        if (!part) return;
        if (key === 'озвучка' || key === 'субтитри') return;
        if (key === site) return;
        if (parts.some(function (item) { return item.toLowerCase() === key; })) return;

        parts.push(part);
      });

      if (!parts.length) return tr.is_sub ? 'Субтитри' : 'Без вибору';
      return parts.join(' / ');
    }

    function voiceKey(tr) {
      if (isAniTubeSource()) {
        return 'anitube:' + String(tr && tr.translation_id || '') + ':' + String(tr && tr.player_id || '');
      }

      var name = cleanVoicePart(tr && tr.translation_name);
      if (name) return (tr && tr.is_sub ? 'sub:' : 'voice:') + name.toLowerCase();
      return tr && tr.is_sub ? 'sub:subtitles' : 'voice:default';
    }

    function playerName(tr) {
      return cleanVoicePart(tr && tr.player_name) || 'Player';
    }

    function usePlayerFilter() {
      if (sourceSiteName() !== 'AniTube') return false;

      var names = {};
      translations.forEach(function (tr) {
        var name = playerName(tr).toLowerCase();
        if (name && name !== 'direct' && name !== 'player') names[name] = true;
      });

      return Object.keys(names).length > 1;
    }

    function isDuplicateAniTubeName(tr) {
      if (!isAniTubeSource()) return false;

      var name = cleanAniTubeVoiceName(tr && tr.translation_name || tr && tr.player_name).toLowerCase();
      if (!name) return false;

      var count = 0;
      translations.forEach(function (item) {
        var itemName = cleanAniTubeVoiceName(item && item.translation_name || item && item.player_name).toLowerCase();
        if (itemName === name) count++;
      });

      return count > 1;
    }

    function filterVoiceTitle(tr, withPlayer) {
      var title = formatVoiceTitle(tr, withPlayer);

      if (isDuplicateAniTubeName(tr)) {
        title += ' #' + (tr.player_id || tr.translation_id || '');
      }

      return title;
    }

    function buildVoiceGroups() {
      var groups = [];
      var seen = {};

      translations.forEach(function (tr) {
        var key = voiceKey(tr);
        if (seen[key]) return;

        seen[key] = true;
        groups.push({
          key: key,
          title: formatVoiceTitle(tr, false),
          translation_name: tr.translation_name,
          is_sub: tr.is_sub
        });
      });

      return groups;
    }

    function playerOptionsForVoice(group) {
      var players = [];
      var seen = {};
      var key = group && group.key;

      translations.forEach(function (tr) {
        if (key && voiceKey(tr) !== key) return;

        var name = playerName(tr);
        var playerKey = name.toLowerCase() + ':' + tr.player_id;
        if (seen[playerKey]) return;

        seen[playerKey] = true;
        players.push(tr);
      });

      return players;
    }

    function setChoiceFromTranslation(tr) {
      if (!tr) return;

      if (usePlayerFilter()) {
        var groups = buildVoiceGroups();
        var key = voiceKey(tr);
        var voiceIndex = 0;

        for (var i = 0; i < groups.length; i++) {
          if (groups[i].key === key) {
            voiceIndex = i;
            break;
          }
        }

        var players = playerOptionsForVoice(groups[voiceIndex]);
        var playerIndex = 0;

        for (var j = 0; j < players.length; j++) {
          if (players[j].translation_id == tr.translation_id && players[j].player_id == tr.player_id) {
            playerIndex = j;
            break;
          }
        }

        choice.voice = voiceIndex;
        choice.player = playerIndex;
      } else {
        for (var k = 0; k < translations.length; k++) {
          if (translations[k] === tr) {
            choice.voice = k;
            break;
          }
        }
      }

      choice.voice_name = tr.translation_name;
      choice.voice_id = tr.translation_id;
      choice.player_name = playerName(tr);
      choice.player_id = tr.player_id;
    }

    function sourceSiteName() {
      var source = object.source || {};
      var url = String(source.source_url || '').toLowerCase();
      if (source.site) return source.site;
      if (url.indexOf('animeon.club') !== -1) return 'AnimeON';
      if (url.indexOf('uakino') !== -1) return 'UAKino';
      if (url.indexOf('rezka') !== -1) return 'Rezka';
      if (url.indexOf('eneyida') !== -1) return 'Eneyida';
      if (url.indexOf('uafix') !== -1) return 'UAFix';
      if (url.indexOf('zet-flix') !== -1) return 'ZetFlix';
      if (url.indexOf('anitube') !== -1) return 'AniTube';
      if (url.indexOf('kodik:') === 0 || url.indexOf('kodik') !== -1) return 'Kodik';
      if (url.indexOf('filmix:') === 0 || url.indexOf('filmix') !== -1) return 'Filmix';
      if (url.indexOf('anilibria') !== -1 || url.indexOf('aniliberty') !== -1) return 'AniLibria';
      return 'Джерело';
    }

    function telemetryContext(extra) {
      var season = selectedSeason();
      return activityTelemetryExtras(object.movie, Object.assign({
        source_key: sourceContractKey(),
        source_site: sourceSiteName(),
        season: season ? season.season : '',
        translation: voiceTitle()
      }, extra || {}));
    }

    function looksSerial() {
      if (seasons.length > 1) return true;
      if (episodes.length > 1) return true;
      if (translations.some(function (tr) { return tr && Number(tr.episodes_count) > 1; })) return true;
      return /tv|serial|series|anime/i.test(String(object.source && object.source.type || ''));
    }

    function chooseDefaultVoice() {
      debugLog('choose default voice start', {
        translations_count: translations.length,
        translations: translations.map(function (tr) {
          return {
            translation_id: tr.translation_id,
            translation_name: tr.translation_name,
            player_id: tr.player_id,
            player_name: tr.player_name,
            episodes_count: tr.episodes_count,
            voice_key: voiceKey(tr),
            title: filterVoiceTitle(tr, true)
          };
        })
      });

      if (!translations.length) {
        choice.voice = 0;
        return;
      }

      var playback = readPlaybackState();
      if (playback) {
        var voiceRestore = resolveSavedVoiceIndex(translations, playback);
        setChoiceFromTranslation(translations[voiceRestore.index]);
        if (voiceRestore.fallback) syncPlaybackChoice();
        return;
      }

      var saved = Lampa.Storage.get('lampa_source_choice', '{}');
      var key = seasonSourceUrl();
      var savedChoice = saved[key];

      if (savedChoice) {
        for (var s = 0; s < translations.length; s++) {
          if (
            translations[s].translation_id == savedChoice.voice_id &&
            translations[s].player_id == savedChoice.player_id
          ) {
            setChoiceFromTranslation(translations[s]);
            return;
          }
        }
      }

      var index = -1;

      for (var i = 0; i < translations.length; i++) {
        var tr = translations[i];

        if (!tr.is_sub && tr.player_name === 'Ashdi' && tr.episodes_count) {
          index = i;
          break;
        }
      }

      if (index === -1) {
        for (var j = 0; j < translations.length; j++) {
          var tr2 = translations[j];

          if (!tr2.is_sub && tr2.episodes_count) {
            index = j;
            break;
          }
        }
      }

      if (index === -1) index = 0;

      setChoiceFromTranslation(translations[index]);
      syncPlaybackChoice();
      debugLog('choose default voice done', {
        index: index,
        selected: selectedVoice(),
        choice: choice
      });
    }

    function saveChoice() {
      if (!selectedVoice()) return;
      syncPlaybackChoice();
    }

    function buildFilter() {
      filter_items = {
        season: [],
        season_info: [],
        voice: [],
        voice_info: [],
        player: [],
        player_info: []
      };

      seasons.forEach(function (season) {
        filter_items.season.push(season.title || (season.season + ' сезон'));
        filter_items.season_info.push(season);
      });

      if (usePlayerFilter()) {
        buildVoiceGroups().forEach(function (group) {
          filter_items.voice.push(group.title || (group.is_sub ? 'Субтитри' : 'Без вибору'));
          filter_items.voice_info.push(group);
        });

        if (!filter_items.voice[choice.voice]) choice.voice = 0;

        playerOptionsForVoice(filter_items.voice_info[choice.voice]).forEach(function (tr) {
          var title = playerName(tr);
          if (looksSerial() && tr.episodes_count && tr.episodes_count > 1) {
            title += ' / ' + tr.episodes_count + ' серій';
          }

          filter_items.player.push(title);
          filter_items.player_info.push(tr);
        });

        if (!filter_items.player[choice.player]) choice.player = 0;
        setChoiceFromTranslation(filter_items.player_info[choice.player]);
      } else {
        translations.forEach(function (tr) {
          var title = filterVoiceTitle(tr, true);
          if (looksSerial() && tr.episodes_count && tr.episodes_count > 1) {
            title += ' / ' + tr.episodes_count + ' серій';
          }

          filter_items.voice.push(title);
          filter_items.voice_info.push(tr);
        });

        if (!filter_items.voice[choice.voice]) choice.voice = 0;

        var selected = translations[choice.voice];
        if (selected) {
          choice.voice_name = selected.translation_name;
          choice.voice_id = selected.translation_id;
          choice.player_name = playerName(selected);
          choice.player_id = selected.player_id;
        }
      }

      var select = [];

      if (filter_items.season.length > 1) {
        var seasonSubitems = [];

        filter_items.season.forEach(function (name, index) {
          seasonSubitems.push({
            title: name,
            selected: index == choice.season,
            index: index
          });
        });

        select.push({
          title: 'Сезон',
          subtitle: filter_items.season[choice.season],
          items: seasonSubitems,
          stype: 'season'
        });
      }

      if (filter_items.voice.length >= 1) {
        var subitems = [];

        filter_items.voice.forEach(function (name, index) {
          subitems.push({
            title: name,
            selected: index == choice.voice,
            index: index
          });
        });

        select.push({
          title: 'Озвучка',
          subtitle: filter_items.voice[choice.voice],
          items: subitems,
          stype: 'voice'
        });
      }

      if (filter_items.player.length > 1) {
        var playerSubitems = [];

        filter_items.player.forEach(function (name, index) {
          playerSubitems.push({
            title: name,
            selected: index == choice.player,
            index: index
          });
        });

        select.push({
          title: 'Плеєр',
          subtitle: filter_items.player[choice.player],
          items: playerSubitems,
          stype: 'player'
        });
      }

      var chosen = [];
      var serial = looksSerial();
      var voice = filter_items.voice[choice.voice] || '';

      chosen.push('Джерело: ' + sourceSiteName());
      if (serial && filter_items.season[choice.season] && filter_items.season.length > 1) {
        chosen.push('Сезон: ' + filter_items.season[choice.season]);
      }
      if (voice) {
        chosen.push((serial ? 'Озвучка: ' : 'Варіант: ') + voice.replace(/\s*\/\s*1 сер(?:ій|ія|ії)\s*$/i, ''));
      }
      if (filter_items.player[choice.player]) {
        chosen.push('Плеєр: ' + filter_items.player[choice.player].replace(/\s*\/\s*\d+\s*сер(?:ій|ія|ії)\s*$/i, ''));
      }

      filter.set('filter', select);
      filter.chosen('filter', chosen);

      debugLog('filter built', {
        looksSerial: serial,
        choice: choice,
        filter_items: filter_items,
        select: select,
        chosen: chosen
      });
    }

    function episodesUrl() {
      API_URL = getApiUrl();

      var tr = selectedVoice();

      if (!tr) {
        var noVoiceUrl = API_URL + '/episodes?' + appendSourceCacheVersion(appendDownstreamAuthParams(new URLSearchParams({
          source_url: seasonSourceUrl()
        }), true), seasonSourceUrl()).toString();

        debugLog('episodes url built without voice', {
          url: noVoiceUrl,
          seasonSourceUrl: seasonSourceUrl()
        });

        return noVoiceUrl;
      }

      var params = new URLSearchParams({
        source_url: seasonSourceUrl(),
        translation_id: tr.translation_id,
        player_id: tr.player_id
      });
      var season = selectedSeason();
      if (season && season.season != null) params.set('season', String(season.season));
      appendTitleIdentityParams(params, object.movie);
      appendDownstreamAuthParams(params, true);
      appendSourceCacheVersion(params, seasonSourceUrl());

      var url = API_URL + '/episodes?' + params.toString();

      debugLog('episodes url built with voice', {
        url: url,
        seasonSourceUrl: seasonSourceUrl(),
        selectedVoice: tr,
        choice: choice
      });

      return url;
    }

    function makeHash(ep) {
      return Lampa.Utils.hash([
        sourceUrl(),
        seasonSourceUrl(),
        ep.episode,
        choice.voice_id,
        choice.player_id
      ].join('|'));
    }

    function getDefaultQuality(qualityMap, defValue) {
      if (qualityMap) {
        var preferredQuality = Lampa.Storage.get('lampa_source_quality_default', 'auto');
        var preferred = preferredQuality === 'auto' ? '' : preferredQuality + 'p';

        if (preferred && qualityMap[preferred]) return qualityMap[preferred];

        var keys = sortQualityLabels(Object.keys(qualityMap));
        if (keys.length) return qualityMap[keys[0]];
      }

      return defValue;
    }

    function qualityScore(label) {
      var text = String(label || '').toLowerCase();
      var k = text.match(/(\d+)k/);
      if (k) return Number(k[1]) * 1000;

      var p = text.match(/(\d{3,4})p/);
      var score = p ? Number(p[1]) : 0;
      if (text.indexOf('ultra') !== -1) score += 1;
      return score;
    }

    function sortQualityLabels(labels) {
      return labels.sort(function (a, b) {
        var diff = qualityScore(b) - qualityScore(a);
        if (diff) return diff;
        return String(b).localeCompare(String(a));
      });
    }

    function normalizeQualityLabel(label) {
      var text = String(label || '').replace(/\u200b/g, '').trim();
      var lower = text.toLowerCase();

      if (!text || lower === 'hls' || lower === 'auto') return '';
      if (/2160|4k|uhd|ultra/.test(lower)) return 'UHD';
      if (/1440/.test(lower)) return '1440p';
      if (/1080/.test(lower)) return '1080p';
      if (/720/.test(lower)) return '720p';
      if (/480/.test(lower)) return '480p';
      if (/360/.test(lower)) return '360p';
      if (lower === 'hd') return 'HD';

      return text;
    }

    function qualityLabel(element) {
      if (element.qualitys && typeof element.qualitys === 'object') {
        var keys = sortQualityLabels(Object.keys(element.qualitys));
        for (var i = 0; i < keys.length; i++) {
          var label = normalizeQualityLabel(keys[i]);
          if (label) return label;
        }
      }

      return normalizeQualityLabel(element.quality);
    }

    function renameQualityMap(qualityMap) {
      if (!qualityMap) return qualityMap;

      var renamed = {};

      sortQualityLabels(Object.keys(qualityMap)).forEach(function (label) {
        renamed['\u200b' + label] = qualityMap[label];
      });

      return renamed;
    }

    function proxyQualityMap(qualityMap, useProxy, referer) {
      if (!qualityMap) return qualityMap;

      var proxied = {};

      sortQualityLabels(Object.keys(qualityMap)).forEach(function (label) {
        var url = fixProtocol(qualityMap[label]);
        proxied[label] = useProxy === false || String(url).indexOf('/proxy?') !== -1 ? normalizeApiProxyUrl(url) : proxyUrl(url, referer || '');
      });

      return proxied;
    }

    function sanitizeStreamMeta(meta, context) {
      var out = {};
      var merged = Object.assign({}, meta || {}, context || {});
      ['source_key', 'stream_type', 'resolver', 'cached'].forEach(function (key) {
        if (merged[key] !== undefined && merged[key] !== null && merged[key] !== '') out[key] = merged[key];
      });
      return out;
    }

    function sanitizeStreamHeaders(headers) {
      if (!headers || typeof headers !== 'object') return {};
      var out = {};
      Object.keys(headers).forEach(function (key) {
        var lower = String(key).toLowerCase();
        if (/token|cookie|authorization|secret|password|api[_-]?key/i.test(key)) return;
        if (['referer', 'origin', 'user-agent', 'accept', 'accept-language', 'content-type'].indexOf(lower) === -1) return;
        var value = String(headers[key] || '').trim();
        if (!value || /token|cookie|authorization|secret|password|api[_-]?key/i.test(value)) return;
        out[key] = value;
      });
      return out;
    }

    function collectFallbackUrls(raw) {
      var urls = [];
      var seen = {};
      function add(value) {
        var text = String(value || '').trim();
        if (!text || seen[text]) return;
        seen[text] = true;
        urls.push(text);
      }
      if (raw && Array.isArray(raw.fallback_urls)) raw.fallback_urls.forEach(add);
      ['reserve_url', 'reserve', 'backup_url', 'fallback_url', 'url2', 'url_2', 'mirror_url'].forEach(function (key) {
        if (raw && raw[key]) add(raw[key]);
      });
      if (raw && raw.stream && typeof raw.stream === 'object') collectFallbackUrls(raw.stream).forEach(add);
      return urls;
    }

    function normalizeStreamContractFromPayload(data, element, context) {
      data = data || {};
      element = element || {};
      var raw = data.stream && typeof data.stream === 'object' ? Object.assign({}, data.stream, data) : Object.assign({}, data);
      var streamUrl = raw.url || raw.stream_url || '';
      if (!streamUrl && Array.isArray(raw.streams) && raw.streams.length) {
        var primary = raw.streams.find(function (item) { return item && item.quality === 'default'; }) || raw.streams[0];
        streamUrl = primary && primary.url || '';
      }
      var qualitys = raw.qualitys || raw.quality || false;
      var streams = Array.isArray(raw.streams) && raw.streams.length
        ? raw.streams
        : (function () {
          var list = [];
          if (streamUrl) list.push({ quality: 'default', url: streamUrl });
          if (qualitys && typeof qualitys === 'object') {
            Object.keys(qualitys).forEach(function (label) {
              list.push({ quality: label, url: qualitys[label] });
            });
          }
          return list;
        })();
      var fallback_urls = collectFallbackUrls(raw).filter(function (url) { return url !== streamUrl; });
      return {
        url: streamUrl,
        fallback_urls: fallback_urls,
        quality: qualitys || false,
        qualitys: qualitys || false,
        headers: sanitizeStreamHeaders(raw.headers || element.headers || {}),
        subtitles: raw.subtitles || element.subtitles || false,
        segments: raw.segments || element.segments || [],
        meta: sanitizeStreamMeta(raw.meta, context || {}),
        streams: streams
      };
    }

    function proxyStreamContract(contract, useProxy) {
      if (!contract) return contract;
      if (contract.url) {
        contract.url = useProxy === false || String(contract.url).indexOf('/proxy?') !== -1
          ? normalizeApiProxyUrl(contract.url)
          : proxyUrl(contract.url);
      }
      contract.fallback_urls = (contract.fallback_urls || []).map(function (url) {
        return useProxy === false || String(url).indexOf('/proxy?') !== -1 ? normalizeApiProxyUrl(url) : proxyUrl(url);
      });
      if (contract.quality && typeof contract.quality === 'object') {
        contract.quality = proxyQualityMap(contract.quality, useProxy);
        contract.qualitys = contract.quality;
      }
      return contract;
    }

    function attachBoundedStreamFallbacks(item, contract) {
      var urls = [contract.url].concat(contract.fallback_urls || []).filter(Boolean);
      var unique = [];
      var seen = {};
      urls.forEach(function (url) {
        if (!url || seen[url]) return;
        seen[url] = true;
        unique.push(url);
      });

      var fallbacks = unique.slice(1);
      if (!fallbacks.length) return item;

      item.error = function (work, cb) {
        var next = fallbacks.shift();
        if (next) cb(next);
      };
      return item;
    }

    function buildPlayerItemFromContract(contract, element) {
      var item = {
        quality: renameQualityMap(contract.quality || contract.qualitys || false),
        subtitles: contract.subtitles || false,
        timeline: element && element.timeline || false,
        title: element && element.title,
        url: getDefaultQuality(contract.quality || contract.qualitys, contract.url)
      };

      if (contract.headers && Object.keys(contract.headers).length) {
        item.headers = contract.headers;
      }

      attachBoundedStreamFallbacks(item, contract);
      return item;
    }

    function createResolveSession(keyFn) {
      var cache = {};
      var inflight = {};

      return {
        resolve: function (element, runner) {
          var key = keyFn(element);

          if (cache[key]) return Promise.resolve(cache[key]);
          if (inflight[key]) return inflight[key];

          var promise = Promise.resolve().then(function () {
            return runner(element);
          }).then(function (payload) {
            if (payload && payload.ok !== false && (payload.stream || payload.stream_url) && !payload.fallback) {
              cache[key] = payload;
            }
            return payload;
          }).finally(function () {
            delete inflight[key];
          });

          inflight[key] = promise;
          return promise;
        }
      };
    }

    function buildResolvePayload(data, element, source, useServerProxy, useCustomProxy) {
      var useProxy = useServerProxy || useCustomProxy;
      var contract = normalizeStreamContractFromPayload(data, element, {
        source_key: sourceContractKey(),
        resolver: 'resolve',
        cached: !!(data && data.cached)
      });

      if (!data || !data.ok || !contract.url) {
        contract = normalizeStreamContractFromPayload({
          url: proxyUrl(source),
          subtitles: element.subtitles,
          headers: element.headers,
          segments: element.segments,
          streams: (data && data.streams) || []
        }, element, {
          source_key: sourceContractKey(),
          resolver: 'resolve',
          cached: false
        });
        return {
          ok: true,
          fallback: true,
          stream: contract.url,
          stream_url: contract.url,
          qualitys: false,
          subtitles: contract.subtitles,
          streams: contract.streams,
          headers: contract.headers,
          segments: contract.segments,
          meta: contract.meta,
          fallback_urls: contract.fallback_urls,
          stream_contract: contract
        };
      }

      contract = proxyStreamContract(contract, !(useServerProxy || useCustomProxy) ? false : true);

      return {
        ok: true,
        stream: contract.url,
        stream_url: contract.url,
        qualitys: contract.quality || false,
        subtitles: contract.subtitles,
        streams: contract.streams,
        headers: contract.headers,
        segments: contract.segments,
        meta: contract.meta,
        fallback_urls: contract.fallback_urls,
        stream_contract: contract
      };
    }

    function applyResolvePayload(element, payload) {
      if (!element || !payload) return element;

      element.stream = payload.stream || payload.stream_url || element.stream || '';
      element.qualitys = payload.qualitys || payload.quality || false;
      element.subtitles = payload.subtitles || false;
      element.fallback_urls = payload.fallback_urls || [];
      element.meta = payload.meta || {};
      if (payload.streams && payload.streams.length) element.streams = payload.streams;
      if (payload.headers) element.headers = payload.headers;
      if (payload.segments) element.segments = payload.segments;
      element.stream_contract = payload.stream_contract || normalizeStreamContractFromPayload(payload, element, payload.meta || {});
      return element;
    }

    function resolveStreamCore(element) {
      if (element.stream) {
        return Promise.resolve({
          ok: true,
          stream: element.stream,
          stream_url: element.stream,
          qualitys: element.qualitys || false,
          subtitles: element.subtitles || false,
          streams: element.streams || [],
          headers: element.headers || false,
          segments: element.segments || false
        });
      }

      if (!element.episode_url && element.error_message) {
        return Promise.resolve({ ok: false, error: element.error_message });
      }

      var rawSource = String(element.episode_url || element.iframe_url || '').trim();
      var source = fixProtocol(rawSource);

      if (!source) {
        return Promise.resolve({ ok: false, error: element.error_message || 'NO_STREAM' });
      }

      if (!element.qualitys && kinovodCdnNeedsProxy(source)) {
        var kinovodDirectReferer = kinovodPlaybackReferer(element, source);
        var kinovodDirectUrl = proxyUrl(source, kinovodDirectReferer);
        var kinovodDirectContract = normalizeStreamContractFromPayload({
          url: kinovodDirectUrl,
          qualitys: false,
          subtitles: element.subtitles,
          headers: element.headers,
          segments: element.segments,
          fallback_urls: element.fallback_urls
        }, element, { source_key: sourceContractKey(), resolver: 'kinovod-direct' });
        return Promise.resolve({
          ok: true,
          stream: kinovodDirectContract.url,
          stream_url: kinovodDirectContract.url,
          qualitys: kinovodDirectContract.quality,
          subtitles: kinovodDirectContract.subtitles,
          streams: kinovodDirectContract.streams,
          headers: kinovodDirectContract.headers,
          segments: kinovodDirectContract.segments,
          meta: kinovodDirectContract.meta,
          fallback_urls: kinovodDirectContract.fallback_urls,
          stream_contract: kinovodDirectContract
        });
      }

      if (element.qualitys) {
        var kvReferer = kinovodPlaybackReferer(element, source);
        var directQualitySource = !shouldProxyStream(source);
        var directContract = normalizeStreamContractFromPayload({
          url: directQualitySource ? source : proxyUrl(source, kvReferer),
          qualitys: proxyQualityMap(element.qualitys, !directQualitySource, kvReferer),
          subtitles: element.subtitles,
          headers: element.headers,
          segments: element.segments,
          fallback_urls: element.fallback_urls
        }, element, { source_key: sourceContractKey(), resolver: 'episodes-direct' });
        return Promise.resolve({
          ok: true,
          stream: directContract.url,
          stream_url: directContract.url,
          qualitys: directContract.quality,
          subtitles: directContract.subtitles,
          streams: directContract.streams,
          headers: directContract.headers,
          segments: directContract.segments,
          meta: directContract.meta,
          fallback_urls: directContract.fallback_urls,
          stream_contract: directContract
        });
      }

      var needsProxy = shouldProxyStream(rawSource || source);
      var customProxy = getCustomProxyUrl();
      var proxyCode = getProxyAccessCode();

      function requestResolve(useServerProxy) {
        var resolveParams = new URLSearchParams({
          url: rawSource || source,
          proxy: useServerProxy ? '1' : '0'
        });
        if (useServerProxy && proxyCode) resolveParams.set('proxy_code', proxyCode);
        var kvReferer = kinovodPlaybackReferer(element, rawSource || source);
        if (kvReferer) resolveParams.set('referer', kvReferer);
        if ((rawSource || source).indexOf('ashdi.vip') !== -1) resolveParams.set('referer', rawSource || source);
        if ((rawSource || source).indexOf('zetvideo.net') !== -1) resolveParams.set('referer', 'https://zetvideo.net/');
        if (sourceUrl()) resolveParams.set('source_url', sourceUrl());
        if (shouldAttachEpisodeRef(element, rawSource || source)) resolveParams.set('ref', element.ref);
        appendDownstreamAuthParams(resolveParams, true);
        return json(API_URL + '/resolve?' + resolveParams.toString()).then(function (data) {
          if (data && data.auth_required) {
            return {
              ok: false,
              error: 'Потрібен вхід',
              subtitles: element.subtitles || false,
              qualitys: false
            };
          }

          if (data && data.suppressed) {
            var suppressedStreamStatus = data.status || 'NO_STREAM';
            rememberDevicePlaybackFailure(object.movie, sourceContractKey(), suppressedStreamStatus);
            return {
              ok: false,
              error: element.error_message || sourceFailureUserLabel(suppressedStreamStatus) || 'Джерело недоступне для цього тайтлу',
              subtitles: element.subtitles || false,
              qualitys: false
            };
          }

          var useCustomProxy = needsProxy && !!customProxy;
          var payload = buildResolvePayload(data, element, source, useServerProxy && !customProxy && !!proxyCode, useCustomProxy);
          applyResolveOutcome(object.movie, sourceContractKey(), data, payload);
          return payload;
        });
      }

      var initialProxy = needsProxy && !customProxy && !!proxyCode;
      return requestResolve(initialProxy).then(function (payload) {
        if (payload && payload.ok !== false && (payload.stream_url || payload.stream)) return payload;
        if (!initialProxy && needsProxy && (proxyCode || customProxy)) {
          return requestResolve(!!proxyCode && !customProxy);
        }
        if (payload && payload.ok === false) {
          Lampa.Noty.show(payload.error || sourceFailureUserLabel('NO_STREAM') || 'Потік недоступний');
        }
        return payload;
      }).catch(function () {
        return {
          ok: true,
          fallback: true,
          stream: proxyUrl(source),
          stream_url: proxyUrl(source),
          qualitys: false,
          subtitles: element.subtitles || false,
          streams: [],
          headers: element.headers || false,
          segments: element.segments || false
        };
      });
    }

    function getStream(element, call, error) {
      emitStateTelemetry('resolve_started', object.movie, telemetryContext({
        episode: element.episode
      }));

      resolveSession.resolve(element, resolveStreamCore).then(function (payload) {
        if (!payload || payload.ok === false) {
          emitStateTelemetry('playback_error', object.movie, telemetryContext({
            episode: element.episode
          }));
          if (error) error(payload && payload.error || element.error_message || 'Потік не знайдено');
          return;
        }

        applyResolvePayload(element, payload);
        call(element);
      }).catch(function () {
        emitStateTelemetry('playback_error', object.movie, telemetryContext({
          episode: element.episode
        }));
        if (error) error(element.error_message || 'Потік не знайдено');
      });
    }

    function buildLazyPlaylistCell(elem) {
      return {
        title: elem.title,
        timeline: elem.timeline || false,
        url: function (call) {
          var cell = this;

          getStream(elem, function (next) {
            var contract = next.stream_contract || normalizeStreamContractFromPayload(next, elem, next.meta || {});
            var item = buildPlayerItemFromContract(contract, elem);
            cell.url = item.url;
            cell.quality = item.quality;
            cell.subtitles = item.subtitles;
            if (item.headers) cell.headers = item.headers;
            if (typeof call === 'function') call();
          }, function () {
            cell.url = '';
            if (typeof call === 'function') call();
          });
        }
      };
    }

    function buildResolvedPlaylistItem(ready) {
      var contract = ready.stream_contract || normalizeStreamContractFromPayload(ready, ready, ready.meta || {});
      return buildPlayerItemFromContract(contract, ready);
    }

    function playElement(element, items) {
      if (element.loading) return;

      if (object.movie && object.movie.id) {
        Lampa.Favorite.add('history', object.movie, 100);
      }

      element.loading = true;
      recordSelectedEpisode(element.episode);

      getStream(element, function (ready) {
        ready.loading = false;

        if (shouldRecordSuccessfulPlay({ ok: true, stream: ready.stream })) {
          recordSuccessfulPlay(element.episode);
        }

        var seasonNumber = selectedSeason() ? selectedSeason().season : 0;

        applyCloudPlaybackSync(object.movie, ready, seasonNumber, ready, makeHash, function (syncedReady) {
          var first = buildResolvedPlaylistItem(syncedReady);

          Lampa.Player.play(first);
          analyticsEvent('play', object.movie, {
            source_site: sourceSite(object.source)
          });
          emitStateTelemetry('play_started', object.movie, telemetryContext({
            episode: element.episode
          }));

          var playlist = [];

          items.forEach(function (elem) {
            if (elem === ready) {
              playlist.push(first);
              return;
            }

            playlist.push(buildLazyPlaylistCell(elem));
          });

          Lampa.Player.playlist(playlist);
        });

      }, function (message) {
        element.loading = false;
        emitStateTelemetry('playback_error', object.movie, telemetryContext({
          episode: element.episode
        }));
        Lampa.Noty.show(message || 'Потік не знайдено');
      });
    }

    function showContextMenu(element, item, hash, viewed, items) {
      if (!Lampa.Select || !Lampa.Select.show) return;

      var source = element.episode_url || element.iframe_url || '';
      var isViewed = viewed.indexOf(hash) !== -1;

      Lampa.Select.show({
        title: element.title || 'Lampa Source',
        items: [
          { title: 'Відтворити', action: 'play' },
          { title: isViewed ? 'Зняти позначку перегляду' : 'Позначити переглянутим', action: 'viewed' },
          { title: 'Скинути позицію', action: 'reset_timeline' },
          { title: 'Копіювати посилання', action: 'copy' },
          { title: 'Відкрити джерело', action: 'open' }
        ],
        onSelect: function (selected) {
          if (!selected) return;

          if (selected.action === 'play') {
            playElement(element, items);
          } else if (selected.action === 'viewed') {
            var index = viewed.indexOf(hash);
            if (index === -1) {
              viewed.push(hash);
              item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
            } else {
              viewed.splice(index, 1);
              item.find('.torrent-item__viewed').remove();
            }
            Lampa.Storage.set('lampa_source_viewed', viewed);
          } else if (selected.action === 'reset_timeline') {
            if (Lampa.Timeline.update) Lampa.Timeline.update(hash, 0, 0);
            if (cubSyncEnabled()) {
              var resetIdentity = buildPlaybackIdentity(object.movie, element, selectedSeason() ? selectedSeason().season : 0);
              saveCloudProgress(resetIdentity, {
                position_seconds: 0,
                duration_seconds: 0,
                percent: 0,
                completed: false,
                explicit_restart: true
              }, { queueOnFailure: true, force: true });
            }
            Lampa.Noty.show('Позицію скинуто');
          } else if (selected.action === 'copy') {
            if (navigator.clipboard && source) navigator.clipboard.writeText(source);
            Lampa.Noty.show(source ? 'Посилання скопійовано' : 'Посилання немає');
          } else if (selected.action === 'open') {
            if (source) window.open(source, '_blank');
          }
        },
        onBack: function () {
          self.start();
        }
      });
    }

    function append(items, focusEpisode) {
      reset();

      var viewed = Lampa.Storage.cache('lampa_source_viewed', 5000, []);
      var voice = voiceTitle();
      var focusIndex = -1;

      items.forEach(function (element, index) {
        var hash = makeHash(element);
        var view = Lampa.Timeline.view(hash);

        element.timeline = view;
        element.quality = qualityLabel(element);
        element.info = ' / ' + voice;

        var item = Lampa.Template.get('lampa_source_online', element);

        item.append(Lampa.Timeline.render(view));

        if (Lampa.Timeline.details) {
          item.find('.online__quality').append(
            Lampa.Timeline.details(view, ' / ')
          );
        }

        if (viewed.indexOf(hash) !== -1) {
          item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
        }

        item.on('hover:focus', function (e) {
          last = e.target;
          scroll.update($(e.target), true);
          emitStateTelemetry('episode_selected', object.movie, telemetryContext({
            episode: element.episode
          }));
        });

        bindEnter(item, function () {
          playElement(element, items);

          if (viewed.indexOf(hash) === -1) {
            viewed.push(hash);
            Lampa.Storage.set('lampa_source_viewed', viewed);
            item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
          }
        });

        item.on('hover:long', function () {
          showContextMenu(element, item, hash, viewed, items);
        });

        scroll.append(item);

        if (focusEpisode != null && Number(element.episode) === Number(focusEpisode)) {
          focusIndex = index;
        }
      });

      if (focusIndex >= 0) {
        last = scroll.render().find('.selector').eq(focusIndex)[0] || last;
      }

      self.start(true);
    }

    function collectionHasItems(data, key) {
      return !!(data && data.ok && Array.isArray(data[key]) && data[key].length);
    }

    function requestCollectionWithFallback(primaryUrl, fallbackUrl, key) {
      return cachedJson(primaryUrl).then(function (data) {
        if (collectionHasItems(data, key) || !fallbackUrl || fallbackUrl === primaryUrl) return data;
        clearRequestCacheUrl(primaryUrl);
        return cachedJson(fallbackUrl);
      }).catch(function (err) {
        if (!fallbackUrl || fallbackUrl === primaryUrl) throw err;
        clearRequestCacheUrl(primaryUrl);
        return cachedJson(fallbackUrl);
      });
    }

    function mapEpisodesPayload(data) {
      if (!data || !data.ok || !data.episodes || !data.episodes.length) return [];

      return data.episodes.map(function (ep) {
        return {
          title: ep.title || 'Серія ' + ep.episode,
          episode: ep.episode,
          episode_url: ep.episode_url,
          iframe_url: ep.iframe_url,
          ref: ep.ref || '',
          qualitys: ep.qualitys || false,
          subtitles: ep.subtitles || false,
          error_message: ep.error_message || '',
          season: selectedSeason() ? selectedSeason().season : 1
        };
      });
    }

    function renderEpisodesList(items, generation) {
      if (generation != null && generation !== episodesLoadGeneration) return;
      episodes = items || [];
      if (!episodes.length) return;

      var playback = readPlaybackState();
      var focusEpisode = resolveFocusEpisode(episodes, playback);
      var episodeRestore = episodeRestoreMeta(episodes, playback, focusEpisode);
      if (episodeRestore.fallback) {
        writePlaybackState({ selected_episode: focusEpisode });
      }
      append(episodes, focusEpisode);
    }

    function loadEpisodes() {
      var generation = ++episodesLoadGeneration;
      var cacheKey = currentEpisodeRequestKey();

      if (lazySeasonsEnabled && episodesCache[cacheKey]) {
        loading(self, false);
        renderEpisodesList(episodesCache[cacheKey], generation);
        return;
      }

      loading(self, true);
      reset();

      var url = episodesUrl();

      debugLog('load episodes start', {
        url: url,
        selectedVoice: selectedVoice(),
        choice: choice,
        lazySeasonsEnabled: lazySeasonsEnabled
      });

      json(url)
        .then(function (data) {
          if (generation !== episodesLoadGeneration) return;
          loading(self, false);

          debugLog('load episodes response', summarizeApiData(url, data));

          if (data && data.auth_required) {
            openRezkaAuthSettings();
            episodes = [];
            empty('Потрібен вхід');
            return;
          }

          if (data && data.suppressed) {
            var suppressedStatus = data.status || 'NO_EPISODES';
            rememberDevicePlaybackFailure(object.movie, sourceContractKey(), suppressedStatus);
            episodes = [];
            empty(sourceFailureUserLabel(suppressedStatus) || 'Джерело недоступне для цього тайтлу');
            return;
          }

          var mapped = mapEpisodesPayload(data);
          if (!mapped.length) {
            var episodesStatus = (data && data.status) || 'NO_EPISODES';
            rememberDevicePlaybackFailure(object.movie, sourceContractKey(), episodesStatus);
            episodes = [];
            empty(sourceFailureUserLabel(episodesStatus) || 'Серії не знайдено');
            return;
          }

          clearAllSourceFailureState(object.movie, sourceContractKey());
          if (lazySeasonsEnabled) episodesCache[cacheKey] = mapped;
          renderEpisodesList(mapped, generation);
        })
        .catch(function (err) {
          if (generation !== episodesLoadGeneration) return;
          console.error('Lampa Source episodes error:', err);
          analyticsEvent('error', object.movie, {
            source_site: sourceSite(object.source)
          });
          empty('Помилка API');
        });
    }

    function loadTranslations(callback) {
      API_URL = getApiUrl();
      var seasonUrl = seasonSourceUrl();
      var cacheKey = translationsCacheKey(seasonUrl);

      if (lazySeasonsEnabled && translationsCache[cacheKey]) {
        translations = translationsCache[cacheKey];
        chooseDefaultVoice();
        buildFilter();
        if (callback) callback();
        return;
      }

      var url = API_URL + '/translations?' + appendSourceCacheVersion(appendDownstreamAuthParams(new URLSearchParams({
        source_url: seasonUrl
      }), true), seasonUrl).toString();

      debugLog('load translations start', {
        url: url,
        sourceUrl: sourceUrl(),
        seasonSourceUrl: seasonSourceUrl(),
        source: object.source
      });

      json(url)
        .then(function (data) {
          translations = data && data.ok && data.translations ? data.translations : [];

          debugLog('load translations response', summarizeApiData(url, data));

          if (!translations.length) {
            return recoverTranslations(seasonUrl, url).then(function (recovered) {
              translations = recovered;
              if (!translations.length) {
                Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
              }
            });
          }
        })
        .then(function () {
          if (lazySeasonsEnabled && translations.length) {
            translationsCache[cacheKey] = translations.slice();
          }

          chooseDefaultVoice();
          buildFilter();

          if (callback) callback();
        })
        .catch(function (err) {
          console.error('Lampa Source translations error:', err);
          analyticsEvent('error', object.movie, {
            source_site: sourceSite(object.source)
          });

          recoverTranslations(seasonUrl, url).then(function (recovered) {
            translations = recovered;
            if (!translations.length) {
              Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
            }

            chooseDefaultVoice();
            buildFilter();

            if (callback) callback();
          });
        });
    }

    function ensureSeasons(callback) {
      if (!sourceNeedsSeasonsFetch(object.source)) {
        seasons = [{
          season: 1,
          title: '1 сезон',
          source_url: sourceUrl(),
          active: true
        }];
        choice.season = 0;
        if (callback) callback();
        return;
      }

      loadSeasons(callback);
    }

    function loadSeasons(callback) {
      API_URL = getApiUrl();

      var url = API_URL + '/seasons?' + appendSourceCacheVersion(appendDownstreamAuthParams(new URLSearchParams({
        source_url: sourceUrl()
      }), true), sourceUrl()).toString();

      json(url)
        .then(function (data) {
          seasons = data && data.ok && data.seasons ? data.seasons : [];

          if (!seasons.length) {
            seasons = [{
              season: 1,
              title: '1 сезон',
              source_url: sourceUrl(),
              active: true
            }];
          }

          var seasonRestore = resolveSavedSeasonWithFallback(seasons, readPlaybackState());
          choice.season = seasonRestore.index;
          if (seasonRestore.fallback) syncPlaybackChoice();

          if (callback) callback();
        })
        .catch(function (err) {
          console.error('Lampa Source seasons error:', err);
          analyticsEvent('error', object.movie, {
            source_site: sourceSite(object.source)
          });
          seasons = [{
            season: 1,
            title: '1 сезон',
            source_url: sourceUrl(),
            active: true
          }];
          choice.season = 0;

          if (callback) callback();
        });
    }

    this.create = function () {
      var _this = this;

      loading(this, true);
      analyticsEvent('episodes_open', object.movie, {
        source_site: sourceSite(object.source)
      });

      filter.onBack = function () {
        _this.start();
      };

      filter.onSelect = function (type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            choice.season = 0;
            chooseDefaultVoice();
          } else if (a.stype == 'season') {
            choice.season = b.index;
            choice.voice = 0;
            choice.voice_id = 0;
            choice.player = 0;
            choice.player_name = '';
            choice.player_id = 0;

            var seasonRow = filter_items.season && filter_items.season[b.index];
            emitStateTelemetry('season_selected', object.movie, telemetryContext({
              season: seasonRow ? seasonRow.season : (b.index + 1),
              translation: ''
            }));

            loadTranslations(function () {
              saveChoice();
              buildFilter();
              loadEpisodes();
            });

            setTimeout(function () {
              if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
            }, 10);

            return;
          } else if (a.stype == 'voice') {
            choice.voice = b.index;
            choice.player = 0;

            var tr = filter_items.voice_info[b.index];

            if (tr) {
              if (usePlayerFilter()) {
                buildFilter();
              } else {
                choice.voice_name = tr.translation_name;
                choice.voice_id = tr.translation_id;
                choice.player_name = playerName(tr);
                choice.player_id = tr.player_id;
              }
            }

            emitStateTelemetry('translation_selected', object.movie, telemetryContext({
              translation: tr ? tr.translation_name : choice.voice_name
            }));
          } else if (a.stype == 'player') {
            choice.player = b.index;

            var player = filter_items.player_info[b.index];

            if (player) {
              choice.voice_name = player.translation_name;
              choice.voice_id = player.translation_id;
              choice.player_name = playerName(player);
              choice.player_id = player.player_id;
            }

            emitStateTelemetry('translation_selected', object.movie, telemetryContext({
              translation: player ? player.translation_name : choice.voice_name
            }));
          }

          saveChoice();
          buildFilter();
          loadEpisodes();

          setTimeout(function () {
            if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
          }, 10);
        }
      };

      files.appendHead(filter.render());
      files.appendFiles(scroll.render());

      ensureSeasons(function () {
        loadTranslations(function () {
          loadEpisodes();
        });
      });

      return this.render();
    };

    this.render = function () {
      return files.render();
    };

    this.start = function (firstSelect) {
      if (firstSelect) {
        var lastViews = scroll.render().find('.selector.online').find('.torrent-item__viewed').parent().last();

        if (lastViews.length) {
          last = lastViews.eq(0)[0];
        } else {
          last = scroll.render().find('.selector').eq(0)[0];
        }
      }

      if (object.movie) {
        Lampa.Background.immediately(Lampa.Utils.cardImgBackground(object.movie));
      }

      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || scroll.render().find('.selector').eq(0)[0], scroll.render());
        },
        up: function () {
          if (Navigator.canmove('up')) {
            Navigator.move('up');
          } else {
            Lampa.Controller.toggle('head');
          }
        },
        down: function () {
          Navigator.move('down');
        },
        right: function () {
          if (Navigator.canmove('right')) {
            Navigator.move('right');
          } else {
            filter.show('Фільтр', 'filter');
          }
        },
        left: function () {
          if (Navigator.canmove('left')) {
            Navigator.move('left');
          } else {
            Lampa.Controller.toggle('menu');
          }
        },
        back: this.back
      });

      Lampa.Controller.toggle('content');
    };

    this.back = function () {
      Lampa.Activity.backward();
    };

    this.pause = function () { };
    this.stop = function () { };
    this.destroy = function () {
      network.clear();
      files.destroy();
      scroll.destroy();
      network = null;
      episodes = null;
      translations = null;
    };
  }

  function waitButton(event, tries) {
    tries = tries || 0;

    if (tries > 20) return;

    var activity = event.object && event.object.activity;
    if (!activity) return;

    var render = activity.render();
    if (!render) return;

    var place = render.find('.full-start-new__buttons, .full-start__buttons');

    if (place.length) {
      addButton(event);
      return;
    }

    setTimeout(function () {
      waitButton(event, tries + 1);
    }, 100);
  }

  function startPlugin() {
    migrateLegacyTerminalFailuresV2();
    addSettings();
    injectStyles();
    resetTemplates();
    registerDevice();
    heartbeat(true);
    initCloudWatchSync();
    setInterval(function () {
      heartbeat(true);
    }, HEARTBEAT_INTERVAL);

    Lampa.Noty.show('Lampa Source завантажено');
    Lampa.Component.add(RESULTS_COMPONENT, LampaSourceResults);
    Lampa.Component.add(EPISODES_COMPONENT, LampaSourceEpisodes);

    Lampa.Listener.follow('full', function (event) {
      if (event.type === 'complite') {
        waitButton(event);
      }
    });

    Lampa.Listener.follow('card', function (event) {
      if (event.type === 'focus' && event.data && event.data.movie) {
        preloadSearch(event.data.movie);
      }
    });
  }

  startPlugin();
})();
