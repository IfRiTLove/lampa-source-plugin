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

    function getMovie(event) {
        if (event && event.data && event.data.movie) return event.data.movie;

        const active = Lampa.Activity.active();
        if (active && active.movie) return active.movie;

        return null;
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

    function injectStyles() {
        if (document.getElementById('lampa-source-style')) return;

        $('head').append(`
            <style id="lampa-source-style">
                .lampa-source-button{
                    margin-right: 0.75em;
                    font-size: 1.3em;
                    background-color: rgba(0,0,0,.3);
                    display: flex;
                    align-items: center;
                    height: 2.8em;
                    flex-shrink: 0;
                    padding: .3em 1em;
                    border-radius: 1em;
                    gap: .5em;
                }

                .lampa-source-button svg{
                    width: 1.5em;
                    height: 1.5em;
                    flex-shrink: 0;
                }

                .lampa-source-button span{
                    font-size:22px;
                    font-weight:600;
                    white-space:nowrap;
                }

                .lampa-source-button.focus,
                .lampa-source-button.hover,
                .lampa-source-button:hover{
                    background:#ffffff !important;
                    transform:scale(1.03);
                }

                .lampa-source-button.focus span,
                .lampa-source-button.hover span,
                .lampa-source-button:hover span{
                    color:#000000;
                }

                .lampa-source-wrap{
                    padding:30px;
                    position:relative;
                }

                .lampa-source-head{
                    display:flex;
                    gap:12px;
                    margin-bottom:20px;
                    align-items:center;
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
                    padding:24px;
                    margin-bottom:16px;
                    border-radius:16px;
                    background:rgba(255,255,255,.12);
                    font-size:28px;
                }

                .lampa-source-card.focus,
                .lampa-source-card.hover,
                .lampa-source-card:hover{
                    background:rgba(255,255,255,.24);
                }

                .lampa-source-card__sub{
                    font-size:20px;
                    opacity:.65;
                    margin-top:6px;
                }

                .lampa-source-filter{
                    display:none;
                    position:absolute;
                    top:30px;
                    right:30px;
                    width:420px;
                    max-height:calc(100vh - 100px);
                    padding:18px;
                    border-radius:18px;
                    background:rgba(20,20,20,.96);
                    z-index:99;
                    box-shadow:0 0 40px rgba(0,0,0,.55);
                }

                .lampa-source-filter__title{
                    font-size:26px;
                    font-weight:700;
                    margin-bottom:14px;
                }

                .lampa-source-filter-card{
                    padding:18px;
                    margin-bottom:10px;
                    border-radius:14px;
                    background:rgba(255,255,255,.1);
                    font-size:22px;
                }

                .lampa-source-filter-card.focus,
                .lampa-source-filter-card.hover,
                .lampa-source-filter-card:hover{
                    background:#fff;
                    color:#000;
                }

                .lampa-source-filter-card__sub{
                    font-size:18px;
                    opacity:.65;
                    margin-top:5px;
                }
                
                @media screen and (max-width: 700px) {
    .lampa-source-wrap{
        padding:16px;
    }

    .lampa-source-head{
        margin-bottom:12px;
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
        padding:16px;
        margin-bottom:10px;
        border-radius:12px;
        font-size:18px;
    }

    .lampa-source-card__sub{
        font-size:14px;
    }

    .lampa-source-filter{
        position:fixed;
        top:auto;
        right:0;
        left:0;
        bottom:0;
        width:auto;
        max-height:70vh;
        border-radius:18px 18px 0 0;
        padding:14px;
        overflow-y:auto;
    }

    .lampa-source-filter__title{
        font-size:20px;
    }

    .lampa-source-filter-card{
        padding:14px;
        font-size:17px;
    }

    .lampa-source-filter-card__sub{
        font-size:13px;
    }

    .lampa-source-button{
        font-size:1em;
        height:2.4em;
        padding:0.25em 0.75em;
    }

    .lampa-source-button span{
        font-size:16px;
    }
}
            </style>
        `);
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

    function renderSelectableList(html, items, onSelect) {
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

                    renderSelectableList(html, data.results, function (source) {
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
        let filterOpen = false;
        let destroyed = false;
        let keyHandler = null;

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
                openFilter();
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

        function proxyUrl(url) {
            return API_URL + '/proxy?url=' + encodeURIComponent(url);
        }

        function playEpisode(episode) {
            if (!episode.episode_url) {
                Lampa.Noty.show('Потік не знайдено');
                return;
            }

            const currentUrl = proxyUrl(episode.episode_url);

            const first = {
                title: episode.title || object.source.title || 'Lampa Source',
                url: currentUrl
            };

            Lampa.Player.play(first);

            const playlist = episodes.map(function (ep) {
                if (ep === episode) return first;

                return {
                    title: ep.title || object.source.title || 'Lampa Source',
                    url: ep.episode_url ? proxyUrl(ep.episode_url) : ''
                };
            });

            Lampa.Player.playlist(playlist);
        }

        function renderEpisodes() {
            renderHead();

            const items = episodes.map(function (ep) {
                return {
                    title: ep.title || 'Серія ' + ep.episode,
                    episode: ep.episode,
                    episode_url: ep.episode_url,
                    iframe_url: ep.iframe_url,
                    info: voiceTitle()
                };
            });

            renderSelectableList(html, items, function (episode) {
                playEpisode(episode);
            });
        }

        function renderFilter() {
            const panel = html.find('.lampa-source-filter');
            panel.empty();

            panel.append('<div class="lampa-source-filter__title">Озвучка</div>');

            translations.forEach(function (tr, index) {
                const title = [
                    tr.translation_name || 'Без назви',
                    tr.is_sub ? 'Субтитри' : 'Озвучка'
                ].join(' • ');

                const sub = [
                    tr.player_name || '',
                    tr.episodes_count ? tr.episodes_count + ' серій' : ''
                ].filter(Boolean).join(' • ');

                const card = $(`
                    <div class="selector lampa-source-filter-card">
                        <div>${index === selectedVoice ? '✓ ' : ''}${escapeHtml(title)}</div>
                        <div class="lampa-source-filter-card__sub">${escapeHtml(sub)}</div>
                    </div>
                `);

                bindSelect(card, function () {
                    selectedVoice = index;
                    closeFilter();
                    renderHead();
                    loadEpisodes();
                });

                panel.append(card);
            });
        }

        function openFilter() {
            if (!translations.length) {
                Lampa.Noty.show('Озвучки не знайдено');
                return;
            }

            filterOpen = true;
            renderFilter();

            const panel = html.find('.lampa-source-filter');
            panel.show();

            Lampa.Controller.collectionSet(panel);
            Lampa.Controller.collectionFocus(panel.find('.selector').first(), panel);
        }

        function closeFilter() {
            filterOpen = false;

            const panel = html.find('.lampa-source-filter');
            panel.hide();

            Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
            Lampa.Controller.collectionFocus(
                html.find('.lampa-source-list .selector').first(),
                html.find('.lampa-source-list')
            );
        }

        this.render = function () {
            html = $(`
                <div class="lampa-source-wrap">
                    <div class="lampa-source-head"></div>
                    <div class="lampa-source-list">Завантажую...</div>
                    <div class="lampa-source-filter"></div>
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
                    if (filterOpen) {
                        const panel = html.find('.lampa-source-filter');
                        Lampa.Controller.collectionSet(panel);
                        Lampa.Controller.collectionFocus(panel.find('.selector').first(), panel);
                    } else {
                        Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
                        Lampa.Controller.collectionFocus(
                            html.find('.lampa-source-list .selector').first(),
                            html.find('.lampa-source-list')
                        );
                    }
                },
                right: function () {
                    if (!filterOpen) openFilter();
                },
                left: function () {
                    if (filterOpen) closeFilter();
                    else Lampa.Controller.toggle('menu');
                },
                back: function () {
                    if (filterOpen) closeFilter();
                    else Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('lampa_source_episodes');

            keyHandler = function (e) {
                if (destroyed) return;

                const code = e.keyCode || e.which;

                if (code === 39 && !filterOpen) {
                    openFilter();
                }

                if ((code === 37 || code === 27 || code === 8) && filterOpen) {
                    closeFilter();
                }
            };

            document.addEventListener('keydown', keyHandler);
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            destroyed = true;

            if (keyHandler) {
                document.removeEventListener('keydown', keyHandler);
                keyHandler = null;
            }

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