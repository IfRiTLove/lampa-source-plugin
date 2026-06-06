(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';
    const COMPONENT = 'lampa_source_component';

    function buildPayload(movie) {
        return {
            title: movie.title || movie.name || '',
            original_title: movie.original_title || movie.original_name || '',
            year: (movie.release_date || movie.first_air_date || '').slice(0, 4),
            tmdb_id: movie.id || null,
            type: movie.name || movie.first_air_date ? 'serial' : 'movie'
        };
    }

    function LampaSourceComponent(object) {
        let html;
        let scroll;
        let movie = object.movie;

        this.create = function () {
            html = $('<div class="lampa-source-page"><div class="lampa-source-list"></div></div>');
            scroll = new Lampa.Scroll({ mask: true, over: true });

            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            this.load();
            return scroll.render();
        };

        this.load = function () {
            const payload = buildPayload(movie);

            html.find('.lampa-source-list').html(
                '<div style="padding:30px;font-size:26px;">Шукаю джерела...</div>'
            );

            const params = new URLSearchParams({
                title: payload.title,
                original_title: payload.original_title,
                year: payload.year
            });

            fetch(API_URL + '/search?' + params.toString())
                .then(function (r) {
                    return r.json();
                })
                .then(function (data) {
                    if (!data.ok || !data.results || !data.results.length) {
                        html.find('.lampa-source-list').html(
                            '<div style="padding:30px;font-size:26px;">Джерела не знайдено</div>'
                        );
                        return;
                    }

                    renderResults(data.results);
                })
                .catch(function (err) {
                    console.error('Lampa Source search error:', err);

                    html.find('.lampa-source-list').html(
                        '<div style="padding:30px;font-size:26px;">Помилка API</div>'
                    );
                });
        };

        function renderResults(results) {
            const container = html.find('.lampa-source-list');
            container.empty();

            results.forEach(function (item) {
                const card = $(
                    '<div class="selector lampa-source-item" style="padding:24px 30px;margin:12px 24px;border-radius:12px;background:rgba(255,255,255,.08);">' +
                        '<div style="font-size:28px;">' + escapeHtml(item.title || 'Без назви') + '</div>' +
                        '<div style="font-size:20px;opacity:.65;margin-top:6px;">' +
                            escapeHtml(item.site || 'unknown') +
                            (item.year ? ' • ' + escapeHtml(String(item.year)) : '') +
                            (item.quality ? ' • ' + escapeHtml(String(item.quality)) : '') +
                        '</div>' +
                    '</div>'
                );

                card.on('hover:enter click', function () {
                    Lampa.Noty.show('Обрано: ' + (item.title || 'source'));
                });

                container.append(card);
            });

            Lampa.Controller.collectionSet(container.find('.selector'));
            Lampa.Controller.collectionFocus(container.find('.selector').first(), scroll.render());
        }

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html.find('.selector'));
                    Lampa.Controller.collectionFocus(html.find('.selector').first(), scroll.render());
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function addButton(e) {
        if (!e || !e.render || !e.movie) return;

        if (e.render.parent().find('.lampa-source-button').length) return;

        const button = $(
            '<div class="view--torrent selector lampa-source-button">' +
                '<div class="view--torrent__ico">▶</div>' +
                '<div class="view--torrent__body">' +
                    '<div class="view--torrent__name">Lampa Source</div>' +
                    '<div class="view--torrent__quality">Мої джерела</div>' +
                '</div>' +
            '</div>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                title: 'Lampa Source',
                component: COMPONENT,
                movie: e.movie,
                page: 1
            });
        });

        e.render.after(button);
    }

    function startPlugin() {
        console.log('Lampa Source Plugin v1.0 Loaded');

        if (!Lampa.Component.get(COMPONENT)) {
            Lampa.Component.add(COMPONENT, LampaSourceComponent);
        }

        Lampa.Listener.follow('full', function (event) {
            if (event.type === 'complite') {
                setTimeout(function () {
                    const render = event.object.activity.render().find('.view--torrent');

                    addButton({
                        render: render,
                        movie: event.data.movie
                    });
                }, 300);
            }
        });

        Lampa.Noty.show('Lampa Source loaded');
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
