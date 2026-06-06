(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    function getMovie(event) {
        if (event && event.data && event.data.movie) return event.data.movie;

        const active = Lampa.Activity.active();
        if (active && active.movie) return active.movie;

        return null;
    }

    function searchOnline(movie) {
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

        Lampa.Noty.show('Lampa Source: шукаю...');

        fetch(API_URL + '/search?' + params.toString())
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                if (data.ok && data.results && data.results.length) {
                    const first = data.results[0];
                    Lampa.Noty.show('Знайдено: ' + first.site + ' / ' + first.title);
                } else {
                    Lampa.Noty.show('Джерела не знайдено');
                }
            })
            .catch(function (err) {
                console.error('Lampa Source error:', err);
                Lampa.Noty.show('Lampa Source API error');
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

    if (!watchButton || !watchButton.length) {
        Lampa.Noty.show('Lampa Source: контейнер не знайдено');
        return;
    }

    const button = $(`
        <div class="full-start__button selector lampa-source-button" style="
            margin-left: 14px;
            min-width: 210px;
            height: 74px;
            border-radius: 18px;
            background: rgba(255,255,255,.18);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            color: #fff;
        ">
            <span>Lampa Source</span>
        </div>
    `);

    button.on('hover:enter click', function () {
        searchOnline(movie);
    });

    watchButton.after(button);

    Lampa.Noty.show('Lampa Source: кнопка додана');
}

    function startPlugin() {
        console.log('Lampa Source Plugin fixed loaded');
        Lampa.Noty.show('Lampa Source loaded');

        Lampa.Listener.follow('full', function (event) {
            if (event.type === 'compilate' || event.type === 'complite') {
                setTimeout(function () {
                    try {
                        addButton(event);
                    } catch (err) {
                        console.error('Lampa Source addButton error:', err);
                        Lampa.Noty.show('Lampa Source error: ' + err.message);
                    }
                }, 800);
            }
        });
    }

    startPlugin();
})();
