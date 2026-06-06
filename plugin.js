(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    const RESULTS_COMPONENT = 'lampa_source_results';
    const EPISODES_COMPONENT = 'lampa_source_episodes';

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
        return API_URL + '/proxy?url=' + encodeURIComponent(url);
    }

    function getMovie(event) {
        if (event && event.data && event.data.movie) return event.data.movie;

        const active = Lampa.Activity.active();
        if (active && active.movie) return active.movie;

        return null;
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

                .lampa-source-wrap{
                    padding:30px;
                }

                .lampa-source-head{
                    display:flex;
                    gap:12px;
                    margin-bottom:20px;
                    align-items:center;
                    flex-wrap:wrap;
                }

                .lampa-source-chip{
                    padding:12px 22px;
                    border-radius:14px;
                    background:rgba(255,255,255,.12);
                    font-size:22px;
                    white-space:nowrap;
                }

                .lampa-source-chip.focus,
                .lampa-source-chip.hover,
                .lampa-source-chip:hover{
                    background:#fff;
                    color:#000;
                }

                .lampa-source-list{
                    min-height:200px;
                }

                .lampa-source-card{
                    padding:1em;
                    margin-bottom:.7em;
                    border-radius:.7em;
                    background:rgba(255,255,255,.08);
                    font-size:1.15em;
                }

                .lampa-source-card.focus,
                .lampa-source-card.hover,
                .lampa-source-card:hover{
                    background:rgba(255,255,255,.18);
                }

                .lampa-source-card__sub{
                    font-size:.75em;
                    opacity:.55;
                    margin-top:.35em;
                }

                @media screen and (max-width:700px){
                    .lampa-source-wrap{
                        padding:16px;
                    }

                    .lampa-source-head{
                        margin-bottom:12px;
                        flex-wrap:nowrap;
                        overflow-x:auto;
                    }

                    .lampa-source-chip{
                        font-size:16px;
                        padding:8px 12px;
                        max-width:100%;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    }

                    .lampa-source-card{
                        padding:.85em;
                        margin-bottom:.55em;
                        border-radius:.65em;
                        font-size:1em;
                    }

                    .lampa-source-card__sub{
                        font-size:.72em;
                    }

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
    }

    function bindSelect(item, action) {
        let locked = false;

        item.on('hover:enter', function () {
            if (locked) return;

            locked = true;
            action();

            setTimeout(function () {
                locked = false;
            }, 700);
        });
    }

    function openSource(movie) {
        if (!movie) {
            Lampa.Noty.show('Немає даних про тайтл');
            return;
        }

        const title = movie.title || movie.name || '';
        const original = movie.original_title || movie.original_name || '';
        const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);

        const params = new URLSearchParams({
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
        const movie = getMovie(event);
        if (!movie) return;

        const activity = event.object && event.object.activity;
        if (!activity) return;

        const render = activity.render();
        if (!render || !render.length) return;

        if (render.find('.lampa-source-button').length) return;

        const watchButton = render
            .find('.full-start-new__buttons .selector, .full-start__buttons .selector, .full-start .selector')
            .first();

        if (!watchButton || !watchButton.length) return;

        injectStyles();

        const button = $(`
            <div class="full-start__button selector lampa-source-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L5 13H11L10 22L19 10H13L13 2Z" fill="currentColor"></path>
                </svg>
                <span>Source</span>
            </div>
        `);

        let opening = false;

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

    function renderSimpleList(html, items, onSelect) {
        const box = html.find('.lampa-source-list');
        box.empty();

        items.forEach(function (item) {
            const title = item.title || item.name || 'Без назви';
            const subtitleParts = [];

            if (item.site) subtitleParts.push(item.site);
            if (item.year) subtitleParts.push(item.year);
            if (item.quality) subtitleParts.push(item.quality);
            if (item.episode) subtitleParts.push('Серія ' + item.episode);
            if (item.info) subtitleParts.push(item.info);

            const card = $(`
                <div class="selector lampa-source-card">
                    <div>${escapeHtml(title)}</div>
                    <div class="lampa-source-card__sub">${escapeHtml(subtitleParts.join(' • '))}</div>
                </div>
            `);

            bindSelect(card, function () {
                onSelect(item);
            });

            box.append(card);
        });

        Lampa.Controller.collectionSet(box);
        Lampa.Controller.collectionFocus(box.find('.selector').first(), box);
    }

    function LampaSourceResults(object) {
        let html;
        let scroll;

        this.create = function () {
            return this.render();
        };

        this.render = function () {
            html = $('<div class="lampa-source-wrap"><div class="lampa-source-list">Шукаю джерела...</div></div>');

            scroll = new Lampa.Scroll({ mask: true, over: true });
            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            json(object.url)
                .then(function (data) {
                    if (!data.ok || !data.results || !data.results.length) {
                        html.find('.lampa-source-list').html('<div style="font-size:28px;">Джерела не знайдено</div>');
                        return;
                    }

                    renderSimpleList(html, data.results, function (source) {
                        const params = new URLSearchParams({
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
                })
                .catch(function (err) {
                    console.error('Lampa Source search error:', err);
                    html.find('.lampa-source-list').html('<div style="font-size:28px;">Помилка API</div>');
                });

            return scroll.render();
        };

        this.start = function () {
            Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
            Lampa.Controller.collectionFocus(
                html.find('.selector').first(),
                html.find('.lampa-source-list')
            );
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            if (html) html.remove();
        };
    }

    function LampaSourceEpisodes(object) {
        let html;
        let scroll;
        let translations = [];
        let selectedVoice = 0;
        let episodes = [];

        this.create = function () {
            return this.render();
        };

        function voiceTitle() {
            const tr = translations[selectedVoice];

            if (!tr) return 'Авто';

            return [
                tr.translation_name || 'Без назви',
                tr.player_name || '',
                tr.episodes_count ? tr.episodes_count + ' серій' : ''
            ].filter(Boolean).join(' / ');
        }

        function renderHead() {
            const head = html.find('.lampa-source-head');
            head.empty();

            const voice = $(`
                <div class="selector lampa-source-chip">
                    Озвучка: ${escapeHtml(voiceTitle())}
                </div>
            `);

            bindSelect(voice, function () {
                openVoiceSelect();
            });

            head.append(voice);
        }

        function chooseDefaultVoice() {
            if (!translations.length) return;

            let index = -1;

            for (let i = 0; i < translations.length; i++) {
                const tr = translations[i];

                if (!tr.is_sub && tr.player_name === 'Ashdi' && tr.episodes_count) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                for (let i = 0; i < translations.length; i++) {
                    const tr = translations[i];

                    if (!tr.is_sub && tr.episodes_count) {
                        index = i;
                        break;
                    }
                }
            }

            if (index === -1) index = 0;

            selectedVoice = index;
        }

        function loadTranslations(callback) {
            json(object.translations_url)
                .then(function (data) {
                    translations = data && data.ok && data.translations ? data.translations : [];
                    chooseDefaultVoice();
                    renderHead();

                    if (callback) callback();
                })
                .catch(function (err) {
                    console.error('Lampa Source translations error:', err);
                    translations = [];
                    renderHead();

                    if (callback) callback();
                });
        }

        function episodesUrl() {
            const tr = translations[selectedVoice];

            if (!tr) return object.url;

            const params = new URLSearchParams({
                source_url: object.source.source_url,
                translation_id: tr.translation_id,
                player_id: tr.player_id
            });

            return API_URL + '/episodes?' + params.toString();
        }

        function loadEpisodes() {
            const list = html.find('.lampa-source-list');

            list.html('<div style="font-size:28px;">Завантажую серії...</div>');

            json(episodesUrl())
                .then(function (data) {
                    if (!data.ok || !data.episodes || !data.episodes.length) {
                        episodes = [];
                        list.html('<div style="font-size:28px;">Серії не знайдено</div>');
                        return;
                    }

                    episodes = data.episodes;
                    renderEpisodes();
                })
                .catch(function (err) {
                    console.error('Lampa Source episodes error:', err);
                    list.html('<div style="font-size:28px;">Помилка API</div>');
                });
        }

        function makeHash(ep) {
            return Lampa.Utils.hash([
                object.source.source_url,
                ep.episode,
                voiceTitle()
            ].join('|'));
        }

        function playEpisode(episode) {
            if (!episode.episode_url) {
                Lampa.Noty.show('Потік не знайдено');
                return;
            }

            const first = {
                title: episode.title || object.source.title || 'Lampa Source',
                url: proxyUrl(episode.episode_url),
                timeline: episode.timeline || false
            };

            Lampa.Player.play(first);

            const playlist = episodes.map(function (ep) {
                if (ep === episode || ep.episode === episode.episode) return first;

                return {
                    title: ep.title || object.source.title || 'Lampa Source',
                    url: ep.episode_url ? proxyUrl(ep.episode_url) : '',
                    timeline: Lampa.Timeline.view(makeHash(ep))
                };
            });

            Lampa.Player.playlist(playlist);
        }

        function renderEpisodes() {
            renderHead();

            const box = html.find('.lampa-source-list');
            box.empty();

            const viewed = Lampa.Storage.cache('lampa_source_viewed', 5000, []);
            const voice = voiceTitle();

            episodes.forEach(function (ep) {
                const hash = makeHash(ep);
                const view = Lampa.Timeline.view(hash);

                const element = {
                    title: ep.title || 'Серія ' + ep.episode,
                    quality: 'HLS',
                    info: ' / ' + voice,
                    episode: ep.episode,
                    episode_url: ep.episode_url,
                    iframe_url: ep.iframe_url,
                    timeline: view
                };

                const item = Lampa.Template.get('lampa_source_online', element);

                item.append(Lampa.Timeline.render(view));

                if (Lampa.Timeline.details) {
                    item.find('.online__quality').append(
                        Lampa.Timeline.details(view, ' / ')
                    );
                }

                if (viewed.indexOf(hash) !== -1) {
                    item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                }

                bindSelect(item, function () {
                    if (object.movie && object.movie.id) {
                        Lampa.Favorite.add('history', object.movie, 100);
                    }

                    playEpisode(element);

                    if (viewed.indexOf(hash) === -1) {
                        viewed.push(hash);
                        Lampa.Storage.set('lampa_source_viewed', viewed);
                        item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                    }
                });

                box.append(item);
            });

            Lampa.Controller.collectionSet(box);
            Lampa.Controller.collectionFocus(box.find('.selector').first(), box);
        }

        function openVoiceSelect() {
            if (!translations.length) {
                Lampa.Noty.show('Озвучки не знайдено');
                return;
            }

            const items = translations.map(function (tr, index) {
                return {
                    title: [
                        tr.translation_name || 'Без назви',
                        tr.is_sub ? 'Субтитри' : 'Озвучка'
                    ].join(' • '),
                    subtitle: [
                        tr.player_name || '',
                        tr.episodes_count ? tr.episodes_count + ' серій' : ''
                    ].filter(Boolean).join(' • '),
                    selected: index === selectedVoice,
                    index: index
                };
            });

            Lampa.Select.show({
                title: 'Озвучка',
                items: items,
                onBack: function () {
                    Lampa.Controller.toggle('lampa_source_episodes');
                },
                onSelect: function (item) {
                    selectedVoice = item.index;
                    renderHead();
                    loadEpisodes();

                    setTimeout(function () {
                        Lampa.Controller.toggle('lampa_source_episodes');
                    }, 100);
                }
            });
        }

        this.render = function () {
            html = $(`
                <div class="lampa-source-wrap">
                    <div class="lampa-source-head"></div>
                    <div class="lampa-source-list">Завантажую...</div>
                </div>
            `);

            scroll = new Lampa.Scroll({ mask: true, over: true });
            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            loadTranslations(function () {
                loadEpisodes();
            });

            return scroll.render();
        };

        this.start = function () {
            Lampa.Controller.add('lampa_source_episodes', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
                    Lampa.Controller.collectionFocus(
                        html.find('.lampa-source-list .selector').first(),
                        html.find('.lampa-source-list')
                    );
                },
                up: function () {
                    Lampa.Controller.collectionSet(html.find('.lampa-source-head'));
                    Lampa.Controller.collectionFocus(
                        html.find('.lampa-source-head .selector').first(),
                        html.find('.lampa-source-head')
                    );
                },
                down: function () {
                    Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
                    Lampa.Controller.collectionFocus(
                        html.find('.lampa-source-list .selector').first(),
                        html.find('.lampa-source-list')
                    );
                },
                right: function () {
                    openVoiceSelect();
                },
                left: function () {
                    Lampa.Controller.toggle('menu');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('lampa_source_episodes');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            if (html) html.remove();
        };
    }

    function waitButton(event, tries) {
        tries = tries || 0;

        if (tries > 20) return;

        const activity = event.object && event.object.activity;
        if (!activity) return;

        const render = activity.render();
        if (!render) return;

        const place = render.find('.full-start-new__buttons, .full-start__buttons');

        if (place.length) {
            addButton(event);
            return;
        }

        setTimeout(function () {
            waitButton(event, tries + 1);
        }, 100);
    }

    function startPlugin() {
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