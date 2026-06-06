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
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    gap:12px !important;
    min-width:220px;
    margin-left:14px;
}

.lampa-source-button svg{
    width:24px;
    height:24px;
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
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="13.5" stroke="currentColor" stroke-width="2.5" fill="transparent"></circle>
            <path d="M13 10L23 16L13 22V10Z" fill="currentColor"></path>
        </svg>

        <span>Source</span>
    </div>
`);

        button.on('hover:enter click', function () {
            openSource(movie);
        });

        watchButton.after(button);
    }

    function renderSelectableList(html, scroll, items, onSelect) {
        const box = html.find('.lampa-source-list');
        box.empty();

        items.forEach(function (item) {
            const title = item.title || item.name || 'Без назви';
            const subtitleParts = [];

            if (item.site) subtitleParts.push(item.site);
            if (item.year) subtitleParts.push(item.year);
            if (item.quality) subtitleParts.push(item.quality);
            if (item.episode) subtitleParts.push('Серія ' + item.episode);

            const card = $(`
                <div class="selector lampa-source-card">
                    <div>${escapeHtml(title)}</div>
                    <div class="lampa-source-card__sub">${escapeHtml(subtitleParts.join(' • '))}</div>
                </div>
            `);

            card.on('hover:enter click', function () {
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
            html = $('<div style="padding:30px;"><div class="lampa-source-list">Шукаю джерела...</div></div>');

            scroll = new Lampa.Scroll({ mask: true, over: true });
            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            fetch(object.url)
                .then(function (r) {
                    return r.json();
                })
                .then(function (data) {
                    if (!data.ok || !data.results || !data.results.length) {
                        html.find('.lampa-source-list').html('<div style="font-size:28px;">Джерела не знайдено</div>');
                        return;
                    }

                    renderSelectableList(html, scroll, data.results, function (source) {
                        const params = new URLSearchParams({
                            source_url: source.source_url
                        });

                        Lampa.Activity.push({
                            url: API_URL + '/episodes?' + params.toString(),
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
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
                    Lampa.Controller.collectionFocus(html.find('.selector').first(), html.find('.lampa-source-list'));
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
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

        this.create = function () {
            return this.render();
        };

        this.render = function () {
            html = $('<div style="padding:30px;"><div class="lampa-source-list">Завантажую серії...</div></div>');

            scroll = new Lampa.Scroll({ mask: true, over: true });
            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            fetch(object.url)
                .then(function (r) {
                    return r.json();
                })
                .then(function (data) {
                    if (!data.ok || !data.episodes || !data.episodes.length) {
                        html.find('.lampa-source-list').html('<div style="font-size:28px;">Серії не знайдено</div>');
                        return;
                    }

                    renderSelectableList(html, scroll, data.episodes, function (episode) {
                        if (!episode.episode_url) {
    Lampa.Noty.show('Потік не знайдено');
    return;
}

Lampa.Player.play({
    title: episode.title || object.source.title || 'Lampa Source',
    url: API_URL + '/proxy?url=' + encodeURIComponent(episode.episode_url)
});
                        
                            
                    });
                })
                .catch(function (err) {
                    console.error('Lampa Source episodes error:', err);
                    html.find('.lampa-source-list').html('<div style="font-size:28px;">Помилка API</div>');
                });

            return scroll.render();
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html.find('.lampa-source-list'));
                    Lampa.Controller.collectionFocus(html.find('.selector').first(), html.find('.lampa-source-list'));
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
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

        Lampa.Noty.show('Lampa Source loaded');

        Lampa.Component.add(RESULTS_COMPONENT, LampaSourceResults);
        Lampa.Component.add(EPISODES_COMPONENT, LampaSourceEpisodes);

        Lampa.Listener.follow('full', function (event) {
            if (event.type === 'compilate' || event.type === 'complite') {
                waitButton(event);
            }
        });
    }

    startPlugin();
})();
