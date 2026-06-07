(function () {
  'use strict';

  var DEFAULT_API_URL = 'https://130-162-220-139.sslip.io';
  var API_URL = getApiUrl();

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

  function proxyUrl(url) {
    API_URL = getApiUrl();
    return API_URL + '/proxy?url=' + encodeURIComponent(url);
  }

  function addSettings() {
    if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return;

    Lampa.SettingsApi.addParam({
      component: 'more',
      param: {
        name: 'lampa_source_api_url',
        type: 'input',
        values: '',
        default: DEFAULT_API_URL
      },
      field: {
        name: 'Lampa Source API'
      },
      onChange: function (value) {
        API_URL = String(value || DEFAULT_API_URL).replace(/\/+$/, '');
        Lampa.Storage.set('lampa_source_api_url', API_URL);
      }
    });
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

    var params = new URLSearchParams({
      title: title,
      original_title: original,
      year: year
    });

    Lampa.Activity.push({
      url: API_URL + '/search?' + params.toString(),
      title: 'Lampa Source',
      component: RESULTS_COMPONENT,
      movie: movie
    });
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
                <span>Source</span>
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
        var params = new URLSearchParams({
          source_url: source.source_url
        });

        Lampa.Activity.push({
          url: API_URL + '/episodes?' + params.toString(),
          translations_url: API_URL + '/translations?' + params.toString(),
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

      json(object.url)
        .then(function (data) {
          loading(self, false);

          if (!data.ok || !data.results || !data.results.length) {
            empty('Джерела не знайдено');
            return;
          }

          data.results.forEach(function (source) {
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
    var episodes = [];
    var filter_items = {};
    var choice = {
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
      var key = sourceUrl();
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
        saved[sourceUrl()] = {
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
        voice: [],
        voice_info: []
      };

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

      filter.set('filter', select);
      filter.chosen('filter', filter_items.voice[choice.voice] ? ['Озвучка: ' + filter_items.voice[choice.voice]] : []);
    }

    function episodesUrl() {
      API_URL = getApiUrl();

      var tr = selectedVoice();

      if (!tr) return object.url;

      var params = new URLSearchParams({
        source_url: sourceUrl(),
        translation_id: tr.translation_id,
        player_id: tr.player_id
      });

      return API_URL + '/episodes?' + params.toString();
    }

    function makeHash(ep) {
      return Lampa.Utils.hash([
        sourceUrl(),
        ep.episode,
        choice.voice_id,
        choice.player_id
      ].join('|'));
    }

    function getDefaultQuality(qualityMap, defValue) {
      if (qualityMap) {
        var preferred = Lampa.Storage.get('video_quality_default', '1080') + 'p';

        if (qualityMap[preferred]) return qualityMap[preferred];

        var keys = Object.keys(qualityMap);
        if (keys.length) return qualityMap[keys[0]];
      }

      return defValue;
    }

    function renameQualityMap(qualityMap) {
      if (!qualityMap) return qualityMap;

      var renamed = {};

      for (var label in qualityMap) {
        renamed['​' + label] = qualityMap[label];
      }

      return renamed;
    }

    function getStream(element, call, error) {
      if (element.stream) {
        call(element);
        return;
      }

      var source = element.episode_url || element.iframe_url || '';

      if (!source) {
        error();
        return;
      }

      var stream = proxyUrl(source);

      element.stream = stream;
      element.qualitys = false;

      call(element);
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

      }, function () {
        element.loading = false;
        Lampa.Noty.show('Потік не знайдено');
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
              season: 1
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
      json(object.translations_url)
        .then(function (data) {
          translations = data && data.ok && data.translations ? data.translations : [];

          if (!translations.length) {
            Lampa.Noty.show('Lampa Source: translations failed, loading episodes directly');
          }

          chooseDefaultVoice();
          buildFilter();

          if (callback) callback();
        })
        .catch(function (err) {
          console.error('Lampa Source translations error:', err);
          Lampa.Noty.show('Lampa Source: translations failed, loading episodes directly');
          translations = [];
          chooseDefaultVoice();
          buildFilter();

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
            chooseDefaultVoice();
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

      loadTranslations(function () {
        loadEpisodes();
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

    Lampa.Noty.show('Lampa Source loaded');

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
