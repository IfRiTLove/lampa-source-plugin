(function () {
    'use strict';

    const API_URL = 'http://130.162.220.139:3002';

    function testApi() {
        fetch(API_URL + '/health')
            .then(r => r.json())
            .then(data => {
                console.log('Lampa Source API:', data);

                Lampa.Noty.show(
                    'Lampa Source API OK'
                );
            })
            .catch(err => {
                console.error(err);

                Lampa.Noty.show(
                    'Lampa Source API Error'
                );
            });
    }

    function startPlugin() {
        console.log('Lampa Source Plugin Loaded');

        testApi();
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
