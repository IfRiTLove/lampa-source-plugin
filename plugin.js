(function () {
    'use strict';

    const API_URL = 'https://130-162-220-139.sslip.io';

    function getMovie() {
        const active = Lampa.Activity.active();
        return active && active.movie ? active.movie : null;
    }

    function searchOnline() {
        const movie = getMovie();

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
            .then(r => r.json())
            .then(data => {
                if (data.ok && data.results && data.results.length) {
                    const first = data.results[0];
                    Lampa.Noty.show('Знайдено: ' + first.site + ' / ' + first.title);
                } else {
                    Lampa.Noty.show('Джерела не знайдено');
                }
            })
            .catch(err => {
                console.error('Lampa Source error:', err);
                Lampa.Noty.show('Lampa Source API error');
            });
    }

    function createSourceButton() {
        const item = document.createElement('div');

        item.className = 'selector lampa-source-panel-button';
        item.innerHTML = `
            <div style="display:flex;align-items:center;gap:22px;padding:22px 28px;font-size:26px;">
                <div style="font-size:42px;">▶</div>
                <div>
                    <div style="font-size:28px;">Lampa Source</div>
                    <div style="font-size:20px;opacity:.65;">Пошук на моїх джерелах</div>
                </div>
            </div>
        `;

        item.addEventListener('hover:enter', searchOnline);
        item.addEventListener('click', searchOnline);

        return item;
    }

    function injectToSourcePanel() {
        if (document.querySelector('.lampa-source-panel-button')) return;

        const all = Array.from(document.querySelectorAll('div'));

        const sourceTitle = all.find(el => {
            const text = (el.textContent || '').trim();
            return text === 'Джерело' || text === 'Источник' || text === 'Source';
        });

        if (!sourceTitle) return;

        let panel = sourceTitle.parentElement;

        for (let i = 0; i < 5; i++) {
            if (!panel) break;

            const hasShots = (panel.textContent || '').includes('Shots');
            const hasTrailer =
                (panel.textContent || '').includes('Трейлери') ||
                (panel.textContent || '').includes('Трейлеры') ||
                (panel.textContent || '').includes('Trailers');

            if (hasShots || hasTrailer) break;

            panel = panel.parentElement;
        }

        if (!panel) return;

        const button = createSourceButton();
        panel.appendChild(button);

        console.log('Lampa Source injected into source panel');
    }

    function startPlugin() {
        console.log('Lampa Source Plugin v0.4 Loaded');
        Lampa.Noty.show('Lampa Source v0.4 loaded');

        const observer = new MutationObserver(function () {
            injectToSourcePanel();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        Lampa.Listener.follow('full', function () {
            setTimeout(injectToSourcePanel, 500);
            setTimeout(injectToSourcePanel, 1500);
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
