(function () {
    'use strict';

    alert('Lampa Source Debug');

    function log(msg) {
        console.log('[LS]', msg);

        try {
            Lampa.Noty.show(msg);
        } catch(e){}
    }

    [
        'app',
        'full',
        'activity',
        'player',
        'torrent',
        'search'
    ].forEach(function(eventName){

        try {
            Lampa.Listener.follow(eventName, function(e){
                log(eventName + ': ' + (e.type || 'unknown'));
            });
        }
        catch(err){
            console.log(err);
        }
    });

})();(function () {
    'use strict';

    alert('Lampa Source Debug');

    function log(msg) {
        console.log('[LS]', msg);

        try {
            Lampa.Noty.show(msg);
        } catch(e){}
    }

    [
        'app',
        'full',
        'activity',
        'player',
        'torrent',
        'search'
    ].forEach(function(eventName){

        try {
            Lampa.Listener.follow(eventName, function(e){
                log(eventName + ': ' + (e.type || 'unknown'));
            });
        }
        catch(err){
            console.log(err);
        }
    });

})();
