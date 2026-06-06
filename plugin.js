(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    function getMovieData() {
        const data = Lampa.Activity.active();

        if (!data || !data.movie) {
            return null;
        }

        const movie = data.movie;

        return {
            title: movie.title || movie.name || '',
            original_title: movie.original_title || movie.original_name || '',
            year: (movie.release_date || movie.first_air_date || '').slice(0, 4),
            tmdb_id: movie.id || null,
            type: movie.name || movie.first_air_date ? 'serial' : 'movie'
        };
    }

    function searchOnline() {
        const movie = getMovieData();

        if (!movie || (!movie.title && !movie.original_title)) {
            Lampa.Noty.show('Немає даних про тайтл');
            return;
        }

        const params = new URLSearchParams({
            title: movie.title,
            original_title: movie.original_title,
            year: movie.year
        });

        Lampa.Noty.show('Шукаю джерела...');

        fetch(API_URL + '/search?' + params.toString())
            .then(r => r.json())
            .then(data => {
                if (!data.ok) {
                    Lampa.Noty.show('Помилка пошуку');
                    return;
                }

                if (!data.results || !data.results.length) {
                    Lampa.Noty.show('Джерела не знайдено');
                    return;
                }

                const first = data.results[0];

                Lampa.Noty.show(
                    'Знайдено: ' + first.site + ' / ' + first.title
                );
            })
            .catch(err => {
                console.error(err);
                Lampa.Noty.show('API search error');
            });
    }

    function addButton() {
        const activity = Lampa.Activity.active();

        if (!activity || !activity.movie) return;

        if (document.querySelector('.lampa-source-button')) return;

        const button = document.createElement('div');
        button.className = 'full-start__button selector lampa-source-button';
        button.innerHTML = '<span>Lampa Source</span>';

        button.addEventListener('hover:enter', searchOnline);
        button.addEventListener('click', searchOnline);

        const place =
            document.querySelector('.full-start-new__buttons') ||
            document.querySelector('.full-start__buttons') ||
            document.querySelector('.full-start');

        if (place) {
            place.appendChild(button);
        }
    }

    function startPlugin() {
        console.log('Lampa Source Plugin v0.2 Loaded');

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                setTimeout(addButton, 300);
            }
        });

        Lampa.Noty.show('Lampa Source v0.2 loaded');
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
