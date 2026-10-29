(function () {
  // Install on the phone and play offline: the service worker keeps a copy of the game;
  // the menu shows an "Install" button where the browser offers it, and a hint on iPhone.
  if (!('serviceWorker' in navigator) || /[?&]nosw/.test(location.search) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('[runner] offline copy off', e));
  const $ = id => document.getElementById(id);
  const status = text => { const s = $('offline'); if (s) { s.textContent = text; s.hidden = false; } };
  navigator.serviceWorker.ready.then(() => status('Игра сохранена на устройстве: можно играть без интернета'));
  let offer = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); offer = e;
    const b = $('installBtn'); if (b) b.hidden = false;
  });
  addEventListener('appinstalled', () => { const b = $('installBtn'); if (b) b.hidden = true; status('Установлено: ищи «Собаки» на главном экране'); });
  addEventListener('DOMContentLoaded', () => {
    const b = $('installBtn');
    if (b) b.addEventListener('click', async () => { if (!offer) return; offer.prompt(); await offer.userChoice; offer = null; b.hidden = true; });
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone;
    if (ios && $('iosHint')) $('iosHint').hidden = false;
  });
})();
