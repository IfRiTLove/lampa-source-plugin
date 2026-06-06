(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    function getMovieFromFullEvent(e) {
        if (e && e.data && e.data.movie) return e.data.movie;

        const active = Lampa.Activity.active();
        if (active && active.movie) return active.movie;

        return null;
    }

    function buildMoviePayload(movie) {
        return {
            title: movie.title || movie.name || '',
            original_title: movie.original_title || movie.original_name || '',
            year: (movie.release_date || movie.first_air_date || '').slice(0, 4),
            tmdb_id: movie.id || null,
            type: movie.media_type || movie.type || (movie.name || movie.first_air_date ? 'serial' : 'movie')
        };
    }

    function searchOnline(movie) {
        const payload = buildMoviePayload(movie);

        if (!payload.title && !payload.original_title) {
            Lampa.Noty.show('Немає даних про тайтл');
            return;
        }

        const params = new URLSearchParams({
            title: payload.title,
            original_title: payload.original_title,
            year: payload.year
        });

        Lampa.Noty.show('Шукаю джерела...');

        fetch(API_URL + '/search?' + params.toString(), {
            method: 'GET'
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                if (!data.ok) {
                    Lampa.Noty.show('Помилка пошуку');
                    return;
                }

                if (!data.results || !data.results.length) {
                    Lampa.Noty.show('Джерела не знайдено');
                    return;
                }

                const first = data.results[0];

                Lampa.Noty.show('Знайдено: ' + first.site + ' / ' + first.title);
            })
            .catch(function (err) {
                console.error('Lampa Source search error:', err);
                Lampa.Noty.show('API search error');
            });
    }

    function addButton(e) {
        const movie = getMovieFromFullEvent(e);
        if (!movie) return;

        if ($('.lampa-source-button').length) return;

        const button = $(
            '<div class="view--torrent selector lampa-source-button">' +
                '<div class="view--torrent__ico">▶</div>' +
                '<div class="view--torrent__text">Lampa Source</div>' +
            '</div>'
        );

        button.on('hover:enter click', function () {
            searchOnline(movie);
        });

        const torrentButton = $('.view--torrent').last();

        if (torrentButton.length) {
            torrentButton.after(button);
        } else {
            const buttons = $('.full-start-new__buttons, .full-start__buttons, .full-start').first();

            if (buttons.length) {
                buttons.append(button);
            }
        }
    }

    function startPlugin() {
        console.log('Lampa Source Plugin v0.3 Loaded');

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                setTimeout(function () {
                    addButton(e);
                }, 500);
            }
        });

        Lampa.Noty.show('Lampa Source v0.3 loaded');
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
