(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    function log(msg) {
        console.log('[Lampa Source]', msg);
        Lampa.Noty.show('LS: ' + msg);
    }

    function startPlugin() {
        log('plugin loaded');

        Lampa.Listener.follow('full', function (e) {
            log('full event: ' + e.type);

            if (e.type !== 'complite') return;

            setTimeout(function () {
                try {
                    const activity = e.object && e.object.activity;
                    if (!activity) {
                        log('no activity');
                        return;
                    }

                    const render = activity.render();
                    if (!render || !render.length) {
                        log('no render');
                        return;
                    }

                    log('render ok');

                    const torrent = render.find('.view--torrent');
                    log('torrent buttons: ' + torrent.length);

                    const movie = e.data && e.data.movie;
                    if (movie) {
                        log('movie: ' + (movie.title || movie.name || 'no title'));
                    } else {
                        log('no movie data');
                    }

                } catch (err) {
                    console.error('[Lampa Source diagnostic error]', err);
                    log('error: ' + err.message);
                }
            }, 800);
        });
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
