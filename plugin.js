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

        Lampa.Activity.push({
            url: API_URL + '/search?' + params.toString(),
            title: 'Lampa Source',
            component: 'lampa_source_results',
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
    }

    function LampaSourceResults(object) {
        let html;
        let scroll;

        this.create = function () {
            html = $('<div style="padding:30px;"><div class="lampa-source-results">Шукаю джерела...</div></div>');

            scroll = new Lampa.Scroll({ mask: true, over: true });
            scroll.render().addClass('layer--wheight');
            scroll.append(html);

            fetch(object.url)
                .then(function (r) {
                    return r.json();
                })
                .then(function (data) {
                    const box = html.find('.lampa-source-results');

                    if (!data.ok || !data.results || !data.results.length) {
                        box.html('<div style="font-size:28px;">Джерела не знайдено</div>');
                        return;
                    }

                    box.empty();

                    data.results.forEach(function (item) {
                        const card = $(`
                            <div class="selector" style="
                                padding:24px;
                                margin-bottom:16px;
                                border-radius:16px;
                                background:rgba(255,255,255,.12);
                                font-size:28px;
                            ">
                                <div>${item.title || 'Без назви'}</div>
                                <div style="font-size:20px;opacity:.65;margin-top:6px;">
                                    ${item.site || 'unknown'} ${item.year ? '• ' + item.year : ''}
                                </div>
                            </div>
                        `);

                        card.on('hover:enter click', function () {
                            Lampa.Noty.show('Обрано: ' + (item.title || 'source'));
                        });

                        box.append(card);
                    });

                    Lampa.Controller.collectionSet(box.find('.selector'));
                    Lampa.Controller.collectionFocus(box.find('.selector').first(), scroll.render());
                })
                .catch(function () {
                    html.find('.lampa-source-results').html('<div style="font-size:28px;">Помилка API</div>');
                });

            return scroll.render();
        };

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

    function startPlugin() {
        console.log('Lampa Source Plugin loaded');
        Lampa.Noty.show('Lampa Source loaded');

        Lampa.Component.add('lampa_source_results', LampaSourceResults);

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
