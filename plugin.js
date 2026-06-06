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

    function findNativeSourceItem() {
        return Array.from(document.querySelectorAll('div')).find(function (el) {
            const text = (el.textContent || '').trim();

            return (
                text === 'Трейлери' ||
                text === 'Трейлеры' ||
                text === 'Trailers' ||
                text.includes('Трейлери') ||
                text.includes('Трейлеры') ||
                text.includes('Trailers')
            );
        });
    }

    function createSourceButton() {
        const trailerItem = findNativeSourceItem();
        let item;

        if (trailerItem && trailerItem.parentElement) {
            item = trailerItem.parentElement.cloneNode(true);
        } else {
            item = document.createElement('div');
            item.className = 'selector';
            item.innerHTML = '<div>Lampa Source</div><div>Пошук на моїх джерелах</div>';
        }

        item.classList.add('lampa-source-panel-button', 'selector');

        item.removeAttribute('data-action');
        item.removeAttribute('data-name');
        item.removeAttribute('data-type');

        item.innerHTML = item.innerHTML
            .replace(/Трейлери/g, 'Lampa Source')
            .replace(/Трейлеры/g, 'Lampa Source')
            .replace(/Trailers/g, 'Lampa Source');

        item.innerHTML = item.innerHTML
            .replace(/Дивитися трейлери/g, 'Пошук на моїх джерелах')
            .replace(/Смотреть трейлеры/g, 'Пошук на моїх джерелах')
            .replace(/Watch trailers/g, 'Пошук на моїх джерелах');

        if (!item.textContent.includes('Lampa Source')) {
            item.innerHTML = `
                <div style="display:flex;align-items:center;gap:28px;">
                    <div style="font-size:42px;">▶</div>
                    <div>
                        <div>Lampa Source</div>
                        <div style="opacity:.65;">Пошук на моїх джерелах</div>
                    </div>
                </div>
            `;
        }

        item.addEventListener('hover:enter', searchOnline);
        item.addEventListener('click', searchOnline);

        return item;
    }

    function injectToSourcePanel() {
        if (document.querySelector('.lampa-source-panel-button')) return;

        const sourceTitle = Array.from(document.querySelectorAll('div')).find(function (el) {
            const text = (el.textContent || '').trim();
            return text === 'Джерело' || text === 'Источник' || text === 'Source';
        });

        if (!sourceTitle) return;

        const trailerText = findNativeSourceItem();
        if (!trailerText) return;

        const button = createSourceButton();

        const nativeItem = trailerText.parentElement;

        if (nativeItem && nativeItem.parentElement) {
            nativeItem.parentElement.insertBefore(button, nativeItem.nextSibling);
        }
    }

    function startPlugin() {
        console.log('Lampa Source Plugin v0.5 Loaded');
        Lampa.Noty.show('Lampa Source v0.5 loaded');

        const observer = new MutationObserver(function () {
            injectToSourcePanel();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        Lampa.Listener.follow('full', function () {
            setTimeout(injectToSourcePanel, 300);
            setTimeout(injectToSourcePanel, 1000);
            setTimeout(injectToSourcePanel, 2000);
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
