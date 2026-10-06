// Offline play: on the first visit the game keeps a copy of all its files (code, models, icons),
// and without a network it starts from that copy. The file list is made by tools/make-sw-list.js.
const CACHE = 'dogs-v1';
/* FILES */
const FILES = [
  './',
  'index.html',
  'whippet.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/assets.js',
  'js/audio.js',
  'js/camera.js',
  'js/cat.js',
  'js/chickens.js',
  'js/cityworker.js',
  'js/config.js',
  'js/daytime.js',
  'js/fx.js',
  'js/input.js',
  'js/main.js',
  'js/map.js',
  'js/materials.js',
  'js/models.js',
  'js/modes/guard.js',
  'js/modes/runner.js',
  'js/modes/sniffer.js',
  'js/music.js',
  'js/player.js',
  'js/pwa.js',
  'js/quests.js',
  'js/speedfx.js',
  'js/street.js',
  'js/traffic.js',
  'js/util.js',
  'js/wardrobe.js',
  'js/whippet.js',
  'js/world.js',
  'vendor/BufferGeometryUtils.js',
  'vendor/GLTFLoader.js',
  'vendor/SkeletonUtils.js',
  'vendor/post/CopyShader.js',
  'vendor/post/EffectComposer.js',
  'vendor/post/LuminosityHighPassShader.js',
  'vendor/post/RenderPass.js',
  'vendor/post/RoomEnvironment.js',
  'vendor/post/ShaderPass.js',
  'vendor/post/UnrealBloomPass.js',
  'vendor/three.min.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  '../models/cat.glb',
  '../models/chicken.glb',
  '../models/city/atm.glb',
  '../models/city/bench.glb',
  '../models/city/big_building.glb',
  '../models/city/box.glb',
  '../models/city/brown_building.glb',
  '../models/city/building_green.glb',
  '../models/city/building_red.glb',
  '../models/city/building_red_corner.glb',
  '../models/city/bus.glb',
  '../models/city/bus_stop.glb',
  '../models/city/bus_stop_sign.glb',
  '../models/city/car.glb',
  '../models/city/car_b.glb',
  '../models/city/cone.glb',
  '../models/city/debris_papers.glb',
  '../models/city/dumpster.glb',
  '../models/city/fence_end.glb',
  '../models/city/fence_piece.glb',
  '../models/city/fire_hydrant.glb',
  '../models/city/flower_pot.glb',
  '../models/city/gb_blank.glb',
  '../models/city/mailbox.glb',
  '../models/city/manhole_cover.glb',
  '../models/city/motorcycle.glb',
  '../models/city/pickup_truck.glb',
  '../models/city/pizza_corner.glb',
  '../models/city/planter_bushes.glb',
  '../models/city/police_car.glb',
  '../models/city/power_box.glb',
  '../models/city/rb_blank.glb',
  '../models/city/sports_car.glb',
  '../models/city/stop_sign.glb',
  '../models/city/suv.glb',
  '../models/city/traffic_light.glb',
  '../models/city/trash_bag.glb',
  '../models/city/trash_can.glb',
  '../models/city/tree.glb',
  '../models/city/van.glb',
  '../models/city/washing_line.glb',
  '../models/dog_doberman.glb',
  '../models/dog_guard.glb',
  '../models/dog_poodle.glb',
  '../models/dog_runner.glb',
  '../models/dog_shiba.glb',
  '../models/fox.glb',
  '../models/man.glb',
];
/* /FILES */
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => console.warn('[sw] not cached', f))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  const ours = url.origin === location.origin;
  if (!ours && !FONTS.test(req.url)) return;
  // the game asks whether an optional model exists with HEAD: answer from the copy when offline
  if (req.method === 'HEAD') {
    e.respondWith(fetch(req).catch(() => caches.match(req.url, { ignoreSearch: true }).then(r => new Response(null, { status: r ? 200 : 404 }))));
    return;
  }
  if (req.method !== 'GET') return;
  // code (pages, scripts, styles): fresh from the network, so an update shows at once; the copy
  // when offline. Heavy things that rarely change (models, libraries, icons, fonts): the copy first.
  const heavy = /\.(glb|png)$/.test(url.pathname) || url.pathname.includes('/vendor/') || !ours;
  // (a changed model or library needs a new CACHE name above)
  e.respondWith(caches.open(CACHE).then(async c => {
    const get = () => fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
    if (heavy) return (await c.match(req, { ignoreSearch: true })) || get();
    return get().catch(async () => (await c.match(req, { ignoreSearch: true })) || c.match('index.html'));
  }));
});
