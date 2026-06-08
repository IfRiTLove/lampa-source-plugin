(function () {
  'use strict';

  var DEFAULT_API_URL = 'https://130-162-220-139.sslip.io';
  var API_URL = getApiUrl();
  var REQUEST_CACHE_TTL = 1000 * 60 * 10;
  var requestCache = {};

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
    return fetch(url).then(function (r) {
      return r.json();
    });
  }

  function cachedJson(url) {
    var cached = requestCache[url];

    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(cached.value);
    }

    return json(url).then(function (data) {
      requestCache[url] = {
        expires: Date.now() + REQUEST_CACHE_TTL,
        value: data
      };

      return data;
    });
  }

  function proxyUrl(url) {
    API_URL = getApiUrl();
    if (Lampa.Storage.get('lampa_source_proxy_streams', true) === false) return url;
    return API_URL + '/proxy?url=' + encodeURIComponent(url);
  }

  function normalizeApiProxyUrl(url) {
    API_URL = getApiUrl();
    return String(url || '').replace(/^https?:\/\/[^/]+\/proxy\?/i, API_URL + '/proxy?');
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
    if (Lampa.Storage.get('lampa_source_rezka_enabled', null) == null) Lampa.Storage.set('lampa_source_rezka_enabled', true);
    if (!Lampa.Storage.get('lampa_source_rezka_mirror', '')) Lampa.Storage.set('lampa_source_rezka_mirror', 'https://rezka.fi');
    if (!Lampa.Storage.get('lampa_source_rezka_stream_type', '')) Lampa.Storage.set('lampa_source_rezka_stream_type', 'hls');
    if (!Lampa.Storage.get('lampa_source_quality_default', '')) Lampa.Storage.set('lampa_source_quality_default', '1080');
    if (Lampa.Storage.get('lampa_source_proxy_streams', null) == null) Lampa.Storage.set('lampa_source_proxy_streams', true);
    if (Lampa.Storage.get('lampa_source_prefer_http', null) == null) Lampa.Storage.set('lampa_source_prefer_http', false);
    if (Lampa.Storage.get('lampa_source_save_last_source', null) == null) Lampa.Storage.set('lampa_source_save_last_source', true);

    Lampa.Params.select('lampa_source_api_url', '', DEFAULT_API_URL);
    Lampa.Params.trigger('lampa_source_uakino_enabled', true);
    Lampa.Params.select('lampa_source_uakino_mirror', '', 'https://uakino.best');
    Lampa.Params.trigger('lampa_source_anitube_enabled', true);
    Lampa.Params.select('lampa_source_anitube_mirror', '', 'https://anitube.in.ua');
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
    Lampa.Params.trigger('lampa_source_proxy_streams', true);
    Lampa.Params.trigger('lampa_source_prefer_http', false);
    Lampa.Params.trigger('lampa_source_save_last_source', true);

    Lampa.Template.add('settings_lampa_source', `
      <div>
        <div class="settings-param selector" data-name="lampa_source_api_url" data-type="input" placeholder="${DEFAULT_API_URL}">
          <div class="settings-param__name">Адреса API</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_uakino_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати UAKino</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_uakino_mirror" data-type="input" placeholder="https://uakino.best">
          <div class="settings-param__name">Дзеркало UAKino</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_anitube_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати AniTube</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_anitube_mirror" data-type="input" placeholder="https://anitube.in.ua">
          <div class="settings-param__name">Дзеркало AniTube</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_enabled" data-type="toggle">
          <div class="settings-param__name">Використовувати Rezka</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_rezka_mirror" data-type="input" placeholder="https://rezka.fi">
          <div class="settings-param__name">Дзеркало Rezka</div>
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
        <div class="settings-param selector" data-name="lampa_source_rezka_stream_type" data-type="select">
          <div class="settings-param__name">Тип потоку Rezka</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_quality_default" data-type="select">
          <div class="settings-param__name">Якість за замовчуванням</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_proxy_streams" data-type="toggle">
          <div class="settings-param__name">Проксувати потоки</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_prefer_http" data-type="toggle">
          <div class="settings-param__name">Надавати перевагу HTTP</div>
          <div class="settings-param__value"></div>
        </div>
        <div class="settings-param selector" data-name="lampa_source_save_last_source" data-type="toggle">
          <div class="settings-param__name">Запам'ятовувати джерело</div>
          <div class="settings-param__value"></div>
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
    });
  }

  function addSettings() {
    if (!Lampa.Template || !Lampa.Settings || !Lampa.Params) return;
    return addTemplateSettings();

    var component = 'lampa_source_settings';

    if (Lampa.SettingsApi.addComponent) {
      Lampa.SettingsApi.addComponent({
        component: component,
        name: 'Lampa Source',
        icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L5 13h6l-1 9 9-12h-6V2z"/></svg>'
      });
    }

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_api_url',
        type: 'input',
        values: '',
        default: DEFAULT_API_URL
      },
      field: {
        name: 'Адреса API'
      },
      onChange: function (value) {
        API_URL = String(value || DEFAULT_API_URL).replace(/\/+$/, '');
        Lampa.Storage.set('lampa_source_api_url', API_URL);
      }
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_rezka_enabled',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Використовувати Rezka'
      },
      onChange: function (value) {
        Lampa.Storage.set('lampa_source_rezka_enabled', !!value);
      }
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_rezka_login',
        type: 'input',
        values: '',
        default: ''
      },
      field: {
        name: 'Логін Rezka'
      },
      onChange: function (value) {
        Lampa.Storage.set('lampa_source_rezka_login', String(value || ''));
      }
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_rezka_password',
        type: 'input',
        values: '',
        default: ''
      },
      field: {
        name: 'Пароль Rezka'
      },
      onChange: function (value) {
        Lampa.Storage.set('lampa_source_rezka_password', String(value || ''));
      }
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_rezka_fill_cookie',
        type: 'button'
      },
      field: {
        name: 'Увійти в Rezka'
      },
      onChange: function () {
        var login = Lampa.Storage.get('lampa_source_rezka_login', '');
        var password = Lampa.Storage.get('lampa_source_rezka_password', '');

        if (!login || !password) {
          Lampa.Noty.show('Спочатку введіть логін і пароль Rezka');
          return;
        }

        var params = new URLSearchParams({
          rezka_login: login,
          rezka_password: password
        });

        json(getApiUrl() + '/rezka/login?' + params.toString())
          .then(function (data) {
            if (!data || !data.ok || !data.cookie) {
              Lampa.Noty.show('Rezka не повернула cookie');
              return;
            }

            Lampa.Storage.set('lampa_source_rezka_cookie', data.cookie);
            Lampa.Noty.show('Сесію Rezka збережено');
          })
          .catch(function () {
            Lampa.Noty.show('Не вдалося увійти в Rezka');
          });
      }
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: {
        name: 'lampa_source_rezka_clear_cookie',
        type: 'button'
      },
      field: {
        name: 'Очистити сесію Rezka'
      },
      onChange: function () {
        Lampa.Storage.set('lampa_source_rezka_cookie', '');
        Lampa.Noty.show('Сесію Rezka очищено');
      }
    });
  }

  function appendAuthParams(params) {
    var uakinoEnabled = Lampa.Storage.get('lampa_source_uakino_enabled', true);
    var uakinoMirror = Lampa.Storage.get('lampa_source_uakino_mirror', '');
    var anitubeEnabled = Lampa.Storage.get('lampa_source_anitube_enabled', true);
    var anitubeMirror = Lampa.Storage.get('lampa_source_anitube_mirror', '');
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
            <div class="online selector">
                <div class="online__body">
                    <div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">
                        <svg style="height:2.4em;width:2.4em;" viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect y="20" width="128" height="92" rx="13" fill="white"/>
                            <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"/>
                            <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"/>
                        </svg>
                    </div>
                    <div class="online__title" style="padding-left:2.1em;">{title}</div>
                    <div class="online__quality" style="padding-left:3.4em;">{quality}{info}</div>
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

                @media screen and (max-width:700px){
                    .lampa-source-button{
                        font-size:1em;
                        height:2.4em;
                        padding:.25em .75em;
                    }

                    .lampa-source-button span{
                        font-size:16px;
                    }
                }
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

  function openSource(movie) {
    API_URL = getApiUrl();

    if (!movie) {
      Lampa.Noty.show('Немає даних про тайтл');
      return;
    }

    var title = movie.title || movie.name || '';
    var original = movie.original_title || movie.original_name || '';
    var year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    var imdb = movie.imdb_id || movie.imdb || movie.imdbId || '';
    var type = movie.name || movie.original_name || movie.first_air_date ? 'tv' : 'movie';
    var altTitles = collectMovieTitles(movie);

    var params = new URLSearchParams({
      title: title,
      original_title: original,
      year: year,
      imdb_id: imdb,
      type: type
    });
    altTitles.forEach(function (name) {
      if (name !== title && name !== original) params.append('alt_title', name);
    });
    appendAuthParams(params);

    Lampa.Activity.push({
      url: API_URL + '/search?' + params.toString(),
      title: 'Lampa Source',
      component: RESULTS_COMPONENT,
      movie: movie
    });
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

  function addButton(event) {
    var movie = getMovie(event);
    if (!movie) return;

    var activity = event.object && event.object.activity;
    if (!activity) return;

    var render = activity.render();
    if (!render || !render.length) return;

    if (render.find('.lampa-source-button').length) return;

    var watchButton = render
      .find('.full-start-new__buttons .selector, .full-start__buttons .selector, .full-start .selector')
      .first();

    if (!watchButton || !watchButton.length) return;

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

    button.on('hover:enter', function () {
      if (opening) return;

      opening = true;
      openSource(movie);

      setTimeout(function () {
        opening = false;
      }, 1000);
    });

    watchButton.after(button);
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

    function appendSource(source) {
      var info = [];

      if (source.site) info.push(source.site);
      if (source.year) info.push(source.year);
      if (source.type) info.push(source.type);

      var element = {
        title: source.title || 'Без назви',
        quality: source.site || 'AnimeON',
        info: info.length ? ' / ' + info.join(' / ') : ''
      };

      var item = Lampa.Template.get('lampa_source_folder', element);

      item.on('hover:focus', function (e) {
        last = e.target;
        scroll.update($(e.target), true);
      });

      bindEnter(item, function () {
        if (Lampa.Storage.get('lampa_source_save_last_source', true) !== false && object.movie && object.movie.id) {
          var savedSources = Lampa.Storage.get('lampa_source_last_source', {});
          savedSources[object.movie.id] = source.source_url;
          Lampa.Storage.set('lampa_source_last_source', savedSources);
        }

        var params = new URLSearchParams({
          source_url: source.source_url
        });

        Lampa.Activity.push({
          url: API_URL + '/episodes?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams(params)), source.source_url).toString(),
          translations_url: API_URL + '/translations?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams(params)), source.source_url).toString(),
          title: source.title || 'Серії',
          component: EPISODES_COMPONENT,
          source: source,
          movie: object.movie
        });
      });

      scroll.append(item);
    }

    function load() {
      loading(self, true);
      reset();

      cachedJson(object.url)
        .then(function (data) {
          loading(self, false);

          if (!data.ok || !data.results || !data.results.length) {
            empty('Джерела не знайдено');
            return;
          }

          var results = data.results.slice();

          if (Lampa.Storage.get('lampa_source_save_last_source', true) !== false && object.movie && object.movie.id) {
            var savedSources = Lampa.Storage.get('lampa_source_last_source', {});
            var savedSource = savedSources[object.movie.id] || '';

            if (savedSource) {
              results.sort(function (a, b) {
                if (a.source_url === savedSource) return -1;
                if (b.source_url === savedSource) return 1;
                return 0;
              });
            }
          }

          results.forEach(function (source) {
            appendSource(source);
          });

          self.start(true);
        })
        .catch(function (err) {
          console.error('Lampa Source search error:', err);
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
      return translations[choice.voice] || null;
    }

    function voiceTitle() {
      var tr = selectedVoice();

      if (!tr) return 'Авто';

      return [
        tr.translation_name || 'Без назви',
        tr.player_name || ''
      ].filter(Boolean).join(' / ');
    }

    function chooseDefaultVoice() {
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
            choice.voice = s;
            choice.voice_name = translations[s].translation_name;
            choice.voice_id = translations[s].translation_id;
            choice.player_id = translations[s].player_id;
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

      choice.voice = index;
      choice.voice_name = translations[index].translation_name;
      choice.voice_id = translations[index].translation_id;
      choice.player_id = translations[index].player_id;
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
        voice_info: []
      };

      seasons.forEach(function (season) {
        filter_items.season.push(season.title || (season.season + ' сезон'));
        filter_items.season_info.push(season);
      });

      translations.forEach(function (tr) {
        var title = [
          tr.translation_name || 'Без назви',
          tr.is_sub ? 'Субтитри' : 'Озвучка',
          tr.player_name || '',
          tr.episodes_count ? tr.episodes_count + ' серій' : ''
        ].filter(Boolean).join(' / ');

        filter_items.voice.push(title);
        filter_items.voice_info.push(tr);
      });

      if (!filter_items.voice[choice.voice]) choice.voice = 0;

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

      var chosen = [];
      if (filter_items.season[choice.season]) chosen.push('Сезон: ' + filter_items.season[choice.season]);
      if (filter_items.voice[choice.voice]) chosen.push('Озвучка: ' + filter_items.voice[choice.voice]);

      filter.set('filter', select);
      filter.chosen('filter', chosen);
    }

    function episodesUrl() {
      API_URL = getApiUrl();

      var tr = selectedVoice();

      if (!tr) {
        return API_URL + '/episodes?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
          source_url: seasonSourceUrl()
        })), seasonSourceUrl()).toString();
      }

      var params = new URLSearchParams({
        source_url: seasonSourceUrl(),
        translation_id: tr.translation_id,
        player_id: tr.player_id
      });
      appendAuthParams(params);
      appendSourceCacheVersion(params, seasonSourceUrl());

      return API_URL + '/episodes?' + params.toString();
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

    function renameQualityMap(qualityMap) {
      if (!qualityMap) return qualityMap;

      var renamed = {};

      sortQualityLabels(Object.keys(qualityMap)).forEach(function (label) {
        renamed['\u200b' + label] = qualityMap[label];
      });

      return renamed;
    }

    function proxyQualityMap(qualityMap) {
      if (!qualityMap) return qualityMap;

      var proxied = {};

      sortQualityLabels(Object.keys(qualityMap)).forEach(function (label) {
        var url = fixProtocol(qualityMap[label]);
        proxied[label] = String(url).indexOf('/proxy?') !== -1 ? normalizeApiProxyUrl(url) : proxyUrl(url);
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
        element.stream = proxyUrl(source);
        element.qualitys = proxyQualityMap(element.qualitys);
        call(element);
        return;
      }

      var useProxy = Lampa.Storage.get('lampa_source_proxy_streams', true) !== false || source.indexOf('ashdi.vip') !== -1;

      var resolveUrl = API_URL + '/resolve?url=' + encodeURIComponent(source) + '&proxy=' + (useProxy ? '1' : '0');
      if (source.indexOf('ashdi.vip') !== -1) resolveUrl += '&referer=' + encodeURIComponent(source);

      json(resolveUrl)
        .then(function (data) {
          if (!data || !data.ok || !data.stream_url) {
            element.stream = proxyUrl(source);
            element.qualitys = false;
          } else {
            element.stream = normalizeApiProxyUrl(data.stream_url);
            element.qualitys = data.qualitys ? proxyQualityMap(data.qualitys) : false;
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
        element.quality = element.quality || 'HLS';
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

      json(episodesUrl())
        .then(function (data) {
          loading(self, false);

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
          empty('Помилка API');
        });
    }

    function loadTranslations(callback) {
      API_URL = getApiUrl();

      json(API_URL + '/translations?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
        source_url: seasonSourceUrl()
      })), seasonSourceUrl()).toString())
        .then(function (data) {
          translations = data && data.ok && data.translations ? data.translations : [];

          if (!translations.length) {
            Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
          }

          chooseDefaultVoice();
          buildFilter();

          if (callback) callback();
        })
        .catch(function (err) {
          console.error('Lampa Source translations error:', err);
          Lampa.Noty.show('Озвучки не завантажились, пробую серії напряму');
          translations = [];
          chooseDefaultVoice();
          buildFilter();

          if (callback) callback();
        });
    }

    function loadSeasons(callback) {
      API_URL = getApiUrl();

      json(API_URL + '/seasons?' + appendSourceCacheVersion(appendAuthParams(new URLSearchParams({
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

            var tr = filter_items.voice_info[b.index];

            if (tr) {
              choice.voice_name = tr.translation_name;
              choice.voice_id = tr.translation_id;
              choice.player_id = tr.player_id;
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

    Lampa.Noty.show('Lampa Source завантажено');

    Lampa.Component.add(RESULTS_COMPONENT, LampaSourceResults);
    Lampa.Component.add(EPISODES_COMPONENT, LampaSourceEpisodes);

    Lampa.Listener.follow('full', function (event) {
      if (event.type === 'complite') {
        waitButton(event);
      }
    });
  }

  startPlugin();
})();

