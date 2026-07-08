(function () {
  'use strict';

  var DEFAULT_API_URL = 'https://130-162-220-139.sslip.io';
  var API_URL = getApiUrl();
  var PLUGIN_VERSION = '1.1.11-debug';
  var CLIENT_CACHE_VERSION = '27';
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
    { key: 'kodik', title: 'Kodik' },
    { key: 'anitube', title: 'AniTube' },
    { key: 'animeon', title: 'AnimeON' },
    { key: 'anilibria', title: 'AniLibria' },
    { key: 'all', title: 'Всі джерела' }
  ];
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

  function json(url) {
    debugLog('fetch json', { url: url, type: cacheType(url) });
    return fetch(url).then(function (r) {
      debugLog('fetch response', { url: url, status: r.status, ok: r.ok });
      return r.json();
    }).then(function (data) {
      debugLog('fetch data', summarizeApiData(url, data));
      return data;
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

  function readPersistentCache(url, allowExpired) {
    var item = Lampa.Storage.get(cacheKey(url), null);
    if (!item || !item.value || item.url !== url) return null;
    if (!allowExpired && item.expires <= Date.now()) return null;
    return item.value;
  }

  function savePersistentCache(url, type, data) {
    if (!type || !PERSISTENT_CACHE_TTL[type] || !data) return;

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

  function cachedJsonAfterVersion(url) {
    var type = cacheType(url);
    var cached = requestCache[url];

    if (cached && cached.expires > Date.now()) {
      debugLog('memory cache hit', { url: url, type: type });
      return Promise.resolve(cached.value);
    }

    if (type) {
      var persistent = readPersistentCache(url, false);
      if (persistent) {
        debugLog('persistent cache hit', summarizeApiData(url, persistent));
        requestCache[url] = {
          expires: Date.now() + REQUEST_CACHE_TTL,
          value: persistent
        };
        return Promise.resolve(persistent);
      }
    }

    return json(url).then(function (data) {
      requestCache[url] = {
        expires: Date.now() + REQUEST_CACHE_TTL,
        value: data
      };
      savePersistentCache(url, type, data);

      return data;
    }).catch(function (err) {
      var stale = type ? readPersistentCache(url, true) : null;
      if (stale) {
        debugLog('stale cache fallback', summarizeApiData(url, stale));
        return stale;
      }
      throw err;
    });
  }

  function cachedJson(url) {
    return ensureTitleDbVersion().then(function () {
      return cachedJsonAfterVersion(url);
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
    if (!proxyCode) return url;

    API_URL = getApiUrl();
    return buildProxyUrl(API_URL, url, referer, proxyCode);
  }

  function proxyUrl(url, referer) {
    API_URL = getApiUrl();
    if (!shouldProxyStream(url)) return url;
    return activeProxyUrl(url, referer);
  }

  function streamNeedsProxy(url) {
    return /(?:ashdi\.vip|obrut\.show|superdupercdn\.com)/i.test(String(url || ''));
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
    if (Lampa.Storage.get('lampa_source_kodik_enabled', null) == null) Lampa.Storage.set('lampa_source_kodik_enabled', true);
    if (Lampa.Storage.get('lampa_source_uafix_enabled', null) == null) Lampa.Storage.set('lampa_source_uafix_enabled', false);
    if (!Lampa.Storage.get('lampa_source_uafix_mirror', '')) Lampa.Storage.set('lampa_source_uafix_mirror', 'https://uafix.net');
    if (Lampa.Storage.get('lampa_source_zetflix_enabled', null) == null) Lampa.Storage.set('lampa_source_zetflix_enabled', false);
    if (!Lampa.Storage.get('lampa_source_zetflix_mirror', '')) Lampa.Storage.set('lampa_source_zetflix_mirror', 'https://6jul.zet-flix.online');
    if (Lampa.Storage.get('lampa_source_eneyida_enabled', null) == null) Lampa.Storage.set('lampa_source_eneyida_enabled', true);
    if (!Lampa.Storage.get('lampa_source_eneyida_mirror', '')) Lampa.Storage.set('lampa_source_eneyida_mirror', 'https://eneyida.tv');
    if (Lampa.Storage.get('lampa_source_filmix_enabled', null) == null) Lampa.Storage.set('lampa_source_filmix_enabled', true);
    if (Lampa.Storage.get('lampa_source_anilibria_enabled', null) == null) Lampa.Storage.set('lampa_source_anilibria_enabled', true);
    if (!Lampa.Storage.get('lampa_source_anilibria_mirror', '')) Lampa.Storage.set('lampa_source_anilibria_mirror', 'https://anilibria.top');
    if (Lampa.Storage.get('lampa_source_rezka_enabled', null) == null) Lampa.Storage.set('lampa_source_rezka_enabled', true);
    if (!Lampa.Storage.get('lampa_source_rezka_mirror', '')) Lampa.Storage.set('lampa_source_rezka_mirror', 'https://rezka.fi');
    if (!Lampa.Storage.get('lampa_source_rezka_stream_type', '')) Lampa.Storage.set('lampa_source_rezka_stream_type', 'hls');
    if (!Lampa.Storage.get('lampa_source_quality_default', '')) Lampa.Storage.set('lampa_source_quality_default', '1080');
    if (Lampa.Storage.get('lampa_source_proxy_streams', null) == null) Lampa.Storage.set('lampa_source_proxy_streams', false);
    if (Lampa.Storage.get('lampa_source_proxy_default_v2', null) == null) {
      if (Lampa.Storage.get('lampa_source_proxy_streams', false) === true) Lampa.Storage.set('lampa_source_proxy_streams', false);
      Lampa.Storage.set('lampa_source_proxy_default_v2', true);
    }
    if (Lampa.Storage.get('lampa_source_disable_proxy_sources_v1', null) == null) {
      Lampa.Storage.set('lampa_source_uafix_enabled', false);
      Lampa.Storage.set('lampa_source_zetflix_enabled', false);
      Lampa.Storage.set('lampa_source_disable_proxy_sources_v1', true);
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
    Lampa.Params.trigger('lampa_source_kodik_enabled', true);
    Lampa.Params.trigger('lampa_source_uafix_enabled', false);
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
    Lampa.Params.select('lampa_source_rezka_mirror', '', 'https://rezka.fi');
    Lampa.Params.select('lampa_source_rezka_login', '', '');
    Lampa.Params.select('lampa_source_rezka_password', '', '');
    Lampa.Params.select('lampa_source_rezka_stream_type', { hls: 'HLS', mp4: 'MP4' }, 'hls');
    Lampa.Params.select('lampa_source_quality_default', {
      auto: 'Авто',
      2160: '2160p',
      1440: '1440p',
      1080: '1080p',
      720: '720p',
      480: '480p',
      360: '360p'
    }, '1080');
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
        <div class="settings-param selector" data-name="lampa_source_kodik_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати Kodik</div>
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

    if (window.appready) addFolder();
    else {
      Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') addFolder();
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
    var uakinoEnabled = Lampa.Storage.get('lampa_source_uakino_enabled', true);
    var uakinoMirror = Lampa.Storage.get('lampa_source_uakino_mirror', '');
    var anitubeEnabled = Lampa.Storage.get('lampa_source_anitube_enabled', true);
    var anitubeMirror = Lampa.Storage.get('lampa_source_anitube_mirror', '');
    var anitubeProxyUrl = Lampa.Storage.get('lampa_source_anitube_proxy_url', '') || getCustomProxyUrl();
    var kodikEnabled = Lampa.Storage.get('lampa_source_kodik_enabled', true);
    var uafixEnabled = false;
    var uafixMirror = Lampa.Storage.get('lampa_source_uafix_mirror', '');
    var zetflixEnabled = false;
    var zetflixMirror = Lampa.Storage.get('lampa_source_zetflix_mirror', '');
    var eneyidaEnabled = Lampa.Storage.get('lampa_source_eneyida_enabled', true);
    var eneyidaMirror = Lampa.Storage.get('lampa_source_eneyida_mirror', '');
    var filmixEnabled = Lampa.Storage.get('lampa_source_filmix_enabled', true);
    var filmixToken = Lampa.Storage.get('lampa_source_filmix_token', '') || Lampa.Storage.get('fxapi_token', '');
    var filmixUid = Lampa.Storage.get('fxapi_uid', '');
    var anilibriaEnabled = Lampa.Storage.get('lampa_source_anilibria_enabled', true);
    var anilibriaMirror = Lampa.Storage.get('lampa_source_anilibria_mirror', '');
    var enabled = Lampa.Storage.get('lampa_source_rezka_enabled', true);
    var login = Lampa.Storage.get('lampa_source_rezka_login', '');
    var password = Lampa.Storage.get('lampa_source_rezka_password', '');
    var cookie = Lampa.Storage.get('lampa_source_rezka_cookie', '');
    var mirror = Lampa.Storage.get('lampa_source_rezka_mirror', '');
    var streamType = Lampa.Storage.get('lampa_source_rezka_stream_type', 'hls');

    params.set('uakino_enabled', uakinoEnabled ? '1' : '0');
    if (uakinoMirror) params.set('uakino_mirror', uakinoMirror);

    params.set('anitube_enabled', anitubeEnabled ? '1' : '0');
    if (anitubeMirror) params.set('anitube_mirror', anitubeMirror);
    if (anitubeProxyUrl) params.set('anitube_proxy_url', anitubeProxyUrl);

    params.set('kodik_enabled', kodikEnabled ? '1' : '0');

    params.set('uafix_enabled', uafixEnabled ? '1' : '0');
    if (uafixMirror) params.set('uafix_mirror', uafixMirror);

    params.set('zetflix_enabled', zetflixEnabled ? '1' : '0');
    if (zetflixMirror) params.set('zetflix_mirror', zetflixMirror);

    params.set('eneyida_enabled', eneyidaEnabled ? '1' : '0');
    if (eneyidaMirror) params.set('eneyida_mirror', eneyidaMirror);

    params.set('filmix_enabled', filmixEnabled ? '1' : '0');
    if (filmixToken) params.set('filmix_token', filmixToken);
    if (filmixUid) params.set('filmix_uid', filmixUid);

    params.set('anilibria_enabled', anilibriaEnabled ? '1' : '0');
    if (anilibriaMirror) params.set('anilibria_mirror', anilibriaMirror);

    params.set('rezka_enabled', enabled ? '1' : '0');
    if (login) params.set('rezka_login', login);
    if (password) params.set('rezka_password', password);
    if (cookie) params.set('rezka_cookie', cookie);
    if (mirror) params.set('rezka_mirror', mirror);
    if (streamType) params.set('rezka_stream_type', streamType);

    return params;
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
    return SOURCE_OPTIONS.some(function (item) {
      return item.key === key;
    }) ? key : '';
  }

  function sourceOptionTitle(key) {
    key = validSourceKey(key) || 'all';
    for (var i = 0; i < SOURCE_OPTIONS.length; i++) {
      if (SOURCE_OPTIONS[i].key === key) return SOURCE_OPTIONS[i].title;
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
    if (!key || key === 'all' || key === 'animeon') return true;
    return Lampa.Storage.get('lampa_source_' + key + '_enabled', true) !== false;
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

    if (/anime|аниме|аніме/.test(genres)) return firstEnabled(['anitube', 'animeon', 'anilibria', 'kodik']);
    if (type === 'tv') return firstEnabled(['eneyida', 'rezka', 'uakino']);
    return firstEnabled(['eneyida', 'uakino', 'rezka', 'filmix']);
  }

  function getPreferredSource(movie) {
    var global = Lampa.Storage.get('lampa_source_last_source', '');
    var key = validSourceKey(typeof global === 'string' ? global : '');

    if (key && sourceEnabled(key)) return key;
    return defaultSourceForMovie(movie);
  }

  function rememberPreferredSource(movie, key) {
    key = validSourceKey(key);
    if (!key || key === 'all' || Lampa.Storage.get('lampa_source_save_last_source', true) === false) return;

    Lampa.Storage.set('lampa_source_last_source', key);
    Lampa.Storage.set('lampa_source_last_source_by_type', {});
    Lampa.Storage.set('lampa_source_last_source_by_media', {});
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
    return '';
  }

  function sourceKey(source) {
    return sourceKeyFromText(source && (source.source_key || source.site || source.source_url));
  }

  function buildSearchUrl(movie, selectedSource) {
    API_URL = getApiUrl();
    movie = movie || {};

    var title = movie.title || movie.name || '';
    var original = movie.original_title || movie.original_name || '';
    var year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    var imdb = movie.imdb_id || movie.imdb || movie.imdbId || '';
    var tmdb = movie.id || movie.tmdb_id || movie.tmdbId || '';
    var kp = movie.kp_id || movie.kinopoisk_id || movie.kinopoiskId || '';
    var shikimori = movie.shikimori_id || movie.shikimoriId || '';
    var type = normalizeMovieType(movie);
    var altTitles = collectMovieTitles(movie);
    var genres = collectMovieGenres(movie);

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
      if (name !== title && name !== original) {
        params.append('alt_title', name);
        params.append('alt_title[]', name);
      }
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

    if (!value && source.qualitys && typeof source.qualitys === 'object') {
      var keys = Object.keys(source.qualitys);
      if (keys.length) value = keys.join(', ');
    }

    return String(value || '').replace(/\s+/g, ' ').trim();
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

  function isFilmixSource(source) {
    return /filmix/i.test(String(source && (source.site || source.source_url) || ''));
  }

  function sourceSite(source) {
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

    function appendSourceSwitch() {
      var item = $('<div class="selector lampa-source-switch"><div class="lampa-source-switch__label">Джерело</div><div class="lampa-source-switch__value">' + escapeHtml(sourceOptionTitle(selectedSource)) + '</div></div>');

      bindEnter(item, function () {
        Lampa.Select.show({
          title: 'Джерело',
          items: SOURCE_OPTIONS.map(function (source) {
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
            requestCache[object.url] = null;
            load();
          }
        });
      });

      scroll.append(item);
    }

    function appendSource(source, index) {
      var image = cardImage(object.movie);
      var quality = sourceQuality(source);
      var site = sourceSite(source);
      var currentSourceKey = sourceKey(source);
      var isLast = currentSourceKey && currentSourceKey === selectedSource;
      var isFast = !isLast && index === 0 && isFastSource(source);
      var mark = isLast ? 'обране' : (isFast ? (isFilmixSource(source) ? 'швидке<small>720p макс</small>' : 'швидке') : '');

      var element = {
        title: escapeHtml(source.display_title || source.title || 'Без назви'),
        source_site: escapeHtml(site),
        source_year: escapeHtml(source.year || ''),
        source_type: escapeHtml(sourceTypeTitle(source)),
        quality: escapeHtml(quality),
        quality_class: qualityClass(quality),
        mark: mark,
        mark_class: isLast ? 'lampa-source-card__mark--last' : (isFast ? 'lampa-source-card__mark--fast' : ''),
        poster_class: image ? 'lampa-source-card__poster--image' : '',
        poster_style: image ? 'background-image:url(&quot;' + escapeHtml(image) + '&quot;)' : ''
      };

      var item = Lampa.Template.get('lampa_source_folder', element);

      item.on('hover:focus', function (e) {
        last = e.target;
        scroll.update($(e.target), true);
      });

      bindEnter(item, function () {
        rememberPreferredSource(object.movie, currentSourceKey || selectedSource);

        analyticsEvent('source_open', object.movie, {
          source_site: site
        });

        var params = new URLSearchParams({
          source_url: source.source_url
        });

        var episodesActivity = {
          api_url: API_URL + '/episodes?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams(params)), source.source_url).toString(),
          translations_url: API_URL + '/translations?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams(params)), source.source_url).toString(),
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
    }

    function load() {
      loading(self, true);
      reset();
      appendSourceSwitch();
      scroll.append(Lampa.Template.get('lampa_source_loader'));
      analyticsEvent('search', object.movie);

      cachedJson(object.url)
        .then(function (data) {
          loading(self, false);
          reset();
          appendSourceSwitch();

          if (!data.ok || !data.results || !data.results.length) {
            empty('У ' + sourceOptionTitle(selectedSource) + ' нічого не знайдено');
            return;
          }

          var results = data.results.filter(function (source) {
            var ok = !!sourceSite(source);
            return ok;
          }).slice();

          if (!results.length) {
            empty('У ' + sourceOptionTitle(selectedSource) + ' немає підтриманих потоків');
            return;
          }

          if (selectedSource !== 'all') rememberPreferredSource(object.movie, selectedSource);

          results.forEach(function (source, index) {
            appendSource(source, index);
          });

          self.start(true);
        })
        .catch(function (err) {
          console.error('Lampa Source search error:', err);
          analyticsEvent('error', object.movie, {
            event_type: 'error',
            source_site: 'search'
          });
          empty('Помилка API');
        });
    }

    this.create = function () {
      files.appendFiles(scroll.render());
      load();

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
      network.clear();
      files.destroy();
      scroll.destroy();
      network = null;
    };
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

    function selectedSeason() {
      return seasons[choice.season] || null;
    }

    function seasonSourceUrl() {
      var season = selectedSeason();
      return season && season.source_url ? season.source_url : sourceUrl();
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
      debugLog('choose default voice done', {
        index: index,
        selected: selectedVoice(),
        choice: choice
      });
    }

    function saveChoice() {
      var saved = Lampa.Storage.get('lampa_source_choice', '{}');
      var tr = selectedVoice();

      if (tr) {
        saved[seasonSourceUrl()] = {
          season: choice.season,
          voice: choice.voice,
          voice_name: tr.translation_name,
          voice_id: tr.translation_id,
          player: choice.player,
          player_name: playerName(tr),
          player_id: tr.player_id
        };

        Lampa.Storage.set('lampa_source_choice', saved);
      }
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

      if (filter_items.voice.length > 1) {
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
        var noVoiceUrl = API_URL + '/episodes?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
          source_url: seasonSourceUrl()
        })), seasonSourceUrl()).toString();

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
      appendAuthParams(params);
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
        var preferredQuality = Lampa.Storage.get('lampa_source_quality_default', '1080');
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

    function proxyQualityMap(qualityMap, useProxy) {
      if (!qualityMap) return qualityMap;

      var proxied = {};

      sortQualityLabels(Object.keys(qualityMap)).forEach(function (label) {
        var url = fixProtocol(qualityMap[label]);
        proxied[label] = useProxy === false || String(url).indexOf('/proxy?') !== -1 ? normalizeApiProxyUrl(url) : proxyUrl(url);
      });

      return proxied;
    }

    function getStream(element, call, error) {
      if (element.stream) {
        call(element);
        return;
      }

      if (!element.episode_url && element.error_message) {
        error(element.error_message);
        return;
      }

      var source = fixProtocol(element.episode_url || element.iframe_url || '');

      if (!source) {
        error(element.error_message);
        return;
      }

      if (element.qualitys) {
        var directQualitySource = !shouldProxyStream(source);
        element.stream = directQualitySource ? source : proxyUrl(source);
        element.qualitys = proxyQualityMap(element.qualitys, !directQualitySource);
        call(element);
        return;
      }

      var needsProxy = shouldProxyStream(source);
      var customProxy = getCustomProxyUrl();
      var proxyCode = getProxyAccessCode();
      var useServerProxy = needsProxy && !customProxy && !!proxyCode;
      var useCustomProxy = needsProxy && !!customProxy;

      var resolveUrl = API_URL + '/resolve?url=' + encodeURIComponent(source) + '&proxy=' + (useServerProxy ? '1' : '0');
      if (useServerProxy) resolveUrl += '&proxy_code=' + encodeURIComponent(proxyCode);
      if (source.indexOf('ashdi.vip') !== -1) resolveUrl += '&referer=' + encodeURIComponent(source);

      json(resolveUrl)
        .then(function (data) {
          if (!data || !data.ok || !data.stream_url) {
            element.stream = proxyUrl(source);
            element.qualitys = false;
          } else {
            var resolvedStream = normalizeApiProxyUrl(data.stream_url);
            element.stream = useServerProxy || useCustomProxy || String(resolvedStream).indexOf('/proxy?') !== -1 ? (String(resolvedStream).indexOf('/proxy?') !== -1 ? resolvedStream : proxyUrl(resolvedStream)) : resolvedStream;
            element.qualitys = data.qualitys ? proxyQualityMap(data.qualitys, useServerProxy || useCustomProxy) : false;
          }

          call(element);
        })
        .catch(function () {
          element.stream = proxyUrl(source);
          element.qualitys = false;
          call(element);
        });
    }

    function playElement(element, items) {
      if (element.loading) return;

      if (object.movie && object.movie.id) {
        Lampa.Favorite.add('history', object.movie, 100);
      }

      element.loading = true;

      getStream(element, function (ready) {
        ready.loading = false;

        var first = {
          url: getDefaultQuality(ready.qualitys, ready.stream),
          quality: renameQualityMap(ready.qualitys),
          subtitles: ready.subtitles || false,
          timeline: ready.timeline || false,
          title: ready.title
        };

        Lampa.Player.play(first);
        analyticsEvent('play', object.movie, {
          source_site: sourceSite(object.source)
        });

        var playlist = [];

        items.forEach(function (elem) {
          if (elem == ready) {
            playlist.push(first);
          } else {
            var cell = {
              url: function (call) {
                getStream(elem, function (next) {
                  cell.url = getDefaultQuality(next.qualitys, next.stream);
                  cell.quality = renameQualityMap(next.qualitys);
                  cell.subtitles = next.subtitles || false;
                  call();
                }, function () {
                  cell.url = '';
                  call();
                });
              },
              timeline: elem.timeline || false,
              title: elem.title
            };

            playlist.push(cell);
          }
        });

        Lampa.Player.playlist(playlist);

      }, function (message) {
        element.loading = false;
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

    function append(items) {
      reset();

      var viewed = Lampa.Storage.cache('lampa_source_viewed', 5000, []);
      var voice = voiceTitle();

      items.forEach(function (element) {
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
      });

      self.start(true);
    }

    function loadEpisodes() {
      loading(self, true);
      reset();

      var url = episodesUrl();

      debugLog('load episodes start', {
        url: url,
        selectedVoice: selectedVoice(),
        choice: choice
      });

      cachedJson(url)
        .then(function (data) {
          loading(self, false);

          debugLog('load episodes response', summarizeApiData(url, data));

          if (!data.ok || !data.episodes || !data.episodes.length) {
            episodes = [];
            empty('Серії не знайдено');
            return;
          }

          episodes = data.episodes.map(function (ep) {
            return {
              title: ep.title || 'Серія ' + ep.episode,
              episode: ep.episode,
              episode_url: ep.episode_url,
              iframe_url: ep.iframe_url,
              qualitys: ep.qualitys || false,
              subtitles: ep.subtitles || false,
              error_message: ep.error_message || '',
              season: selectedSeason() ? selectedSeason().season : 1
            };
          });

          append(episodes);
        })
        .catch(function (err) {
          console.error('Lampa Source episodes error:', err);
          analyticsEvent('error', object.movie, {
            source_site: sourceSite(object.source)
          });
          empty('Помилка API');
        });
    }

    function loadTranslations(callback) {
      API_URL = getApiUrl();

      var url = API_URL + '/translations?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
        source_url: seasonSourceUrl()
      })), seasonSourceUrl()).toString();

      debugLog('load translations start', {
        url: url,
        sourceUrl: sourceUrl(),
        seasonSourceUrl: seasonSourceUrl(),
        source: object.source
      });

      cachedJson(url)
        .then(function (data) {
          translations = data && data.ok && data.translations ? data.translations : [];

          debugLog('load translations response', summarizeApiData(url, data));

          if (!translations.length) {
            Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
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
          Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
          translations = [];
          chooseDefaultVoice();
          buildFilter();

          if (callback) callback();
        });
    }

    function loadSeasons(callback) {
      API_URL = getApiUrl();

      cachedJson(API_URL + '/seasons?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
        source_url: sourceUrl()
      })), sourceUrl()).toString())
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

          var active = -1;
          seasons.forEach(function (season, index) {
            if (season.active) active = index;
          });

          choice.season = active >= 0 ? active : 0;

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
          } else if (a.stype == 'player') {
            choice.player = b.index;

            var player = filter_items.player_info[b.index];

            if (player) {
              choice.voice_name = player.translation_name;
              choice.voice_id = player.translation_id;
              choice.player_name = playerName(player);
              choice.player_id = player.player_id;
            }
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

      loadSeasons(function () {
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
    addSettings();
    injectStyles();
    resetTemplates();
    registerDevice();
    heartbeat(true);
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
