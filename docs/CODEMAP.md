# Карта кода «Восьмёрки Баклажан»

Создаётся `python3 -I tools/codemap.py` — руками не править. Файлы грузятся в этом порядке; все имена верхнего уровня общие.
Как устроено и зачем — в `docs/ARCHITECTURE.md`.

## Код: `arcade/js/`

### `01-core.js` — 151 строк, 12 КБ

Параметры, уроки, сохранение, случайность, сцена, куски мира.

Разделы: параметры полигона (стр. 19) · параметры города (стр. 25) · уроки (стр. 50) · сохранение (стр. 88) · случайность с зерном: город всегда одинаковый (стр. 93) · сцена (стр. 97) · куски мира: мелкие объекты по квадратам 200 м, рисуем только видимые (стр. 111)

Имена: `$`, `showFatal`, `halted`, `halt`, `T`, `G`, `RS`, `ROW0`, `AIR_SLOW`, `CLEAN_ROLL`, `ZA`, `VMAXF`, `WORLD`, `SPAWN`, `yUp0`, `MODELS`, `LEVELS`, `FREE`, `DRILLS`, `save`, `persist`, `seed`, `rnd`, `stage`, `renderer`, `MAXQ`, `scene`, `camera`, `CHUNKS`, `chunked`, `chunkFrustum`, `cullChunks`, `grainTex`, `M4`

### `02-sky.js` — 260 строк, 22 КБ

Небо и свет, вода Дона (WAKE), праздничное оформление; общие помощники: mat, mergeGeos, bake, freeze, flat, addSolid.

Разделы: небо и свет: 16:30, низкое золотое солнце (стр. 4) · праздничное оформление: «парк аттракционов» для трюков (стр. 174)

Имена: `SUN_DIR`, `HAZE`, `hemi`, `sun`, `DON_WATER`, `WAKE`, `TIMES`, `TIME`, `NIGHT`, `nightReg`, `skyDome`, `shafts`, `shaftTmp`, `tickSky`, `matCache`, `mat`, `GLOW`, `glowMat`, `mergeGeos`, `bake`, `FEST_M`, `FEST_COLS`, `FEST`, `festPut`, `FEST_BULB`, `festBulbs`, `festPole`, `festTri`, `festQuadUp`, `festBunting`, `festKicker`, `freeze`, `under`, `flat`, `textTex`, `walls`, `addSolid`

### `03-ground.js` — 117 строк, 7 КБ

Земля, полигон, автобан.

Разделы: земля и полигон (стр. 4) · автобан (стр. 62)

Имена: `markM`, `groundLabel`, `tower`, `beacon`, `TRIB`, `smooth`, `lerp`, `rampY`

### `04-rostov.js` — 580 строк, 54 КБ

Ростов из OpenStreetMap, рельеф правого берега, дома, дороги.

Разделы: Ростов: настоящий район из OpenStreetMap (стр. 4) · рельеф правого берега (стр. 75)

Имена: `dm`, `rectOf`, `CORE`, `inStrip`, `inWorldMap`, `inPoly`, `inRings`, `lineDist`, `bboxOf`, `ROAD_W`, `ROADS`, `deckH`, `deckAt`, `WATER`, `PIERS`, `TER`, `TX0`, `BANK`, `terLerp`, `terrainH`, `surfaceH`, `terrainN`, `M4T`, `DECKS`, `onCarriageway`, `ZONES`, `waterAt`, `roadPoint`, `placeName`, `CITY`

### `05-trickpark.js` — 70 строк, 4 КБ

Трюк-парк и трамплины.

Разделы: трюк-парк и трамплины (стр. 4)

Имена: `kicker`, `rings`, `ringQ`, `ring`, `buildRings`

### `06-arena.js` — 476 строк, 52 КБ

Ростов Арена снаружи и внутри.

Разделы: Ростов Арена: белая чаша с треугольным узором, козырёк, мачты; трасса вокруг (стр. 4) · внутри Арены: синий трек, аэротруба «888», горка-труба, «Баклажановый поток» (стр. 204)

Имена: `ARENA`, `tubePath`, `INNER`, `EIGHT`

### `07-eight.js` — 117 строк, 9 КБ

Дрифт-трек «Восьмёрка».

Разделы: дрифт-трек 888 (шоу «Восьмёрка»): праздничная площадка — бордюры, стрелки и шевроны, арка, гирлянды, шары, табло, фейерверк (стр. 4)

Имена: `SHOW`

### `08-slope.js` — 139 строк, 13 КБ

Запечённые тени домов, сетка склона.

Разделы: запечённые тени домов: один прозрачный слой над землёй, перерисовывается при смене времени суток (стр. 4) · склон правого берега: сетка рельефа, на которой нарисована земля (площади, улицы, рельсы, тени) (стр. 25)

Имена: `bakeShadows`, `HILL`, `SGRID`, `solidsNear`, `sgridAdd`

### `09-scenes.js` — 84 строк, 8 КБ

Сцены с подгрузкой, западная сцена.

Разделы: сцены: районы карты строятся, когда к ним подъезжаешь, и выгружаются вдали (стр. 4) · западная сцена: набережные у Темерницкого и железнодорожного мостов, Дон, дома (стр. 40)

Имена: `SCENES`, `addScene`, `sceneDist`, `sceneRun`, `sceneDrop`, `tickScenes`, `sceneChunk`, `sceneFlat`, `WEST_BOX`, `WESTSC`

### `10-railbridge.js` — 481 строк, 55 КБ

Ж/д разводной мост.

Разделы: железнодорожный разводной мост: стальной аттракцион (строится вместе с западной сценой) (стр. 4)

Имена: `DARK_STEEL`, `bridgeSteel`, `RAILB`

### `11-ships.js` — 118 строк, 11 КБ

Суда на Дону.

Разделы: суда на Дону: сухогруз и теплоход — по ним можно ездить и на них можно приземляться (стр. 4)

Имена: `SHIPS`

### `12-photo.js` — 329 строк, 32 КБ

Режим «Фото», кино-повтор, под водой, PRO-разгоны.

Разделы: режим качества «Фото»: тени, вода с отражением, крашеная сталь моста, ночная подсветка (стр. 4) · кино-повтор трюков у ж/д моста (стр. 199) · под водой: дно, поверхность снизу, бирюзовый туман, приглушённый звук (стр. 263) · PRO «Бесконечный Безлимит»: баклажановые разгоны (стр. 284)

Имена: `PHOTO`, `KINO`, `UNDER`, `inBox`, `BOOSTS`, `proBoost`

### `13-streets.js` — 86 строк, 7 КБ

Фонари, светофоры, «зебры».

Разделы: улицы Ростова: фонари, светофоры, «зебры» (стр. 4)

Имена: `SIGNALS`, `tickSignals`

### `14-car.js` — 807 строк, 88 КБ

Машины игрока: «восьмёрка» и внедорожник.

Разделы: машина игрока (стр. 4)

Имена: `paintIdx`, `PAINTS`, `glassify`, `smoothNormals`, `rubberMetal`, `makeVaz2108`, `carObj`, `VAZ_PARTS`, `SUV`, `TUNES`, `setTune`, `EGGPLANT`, `carEnv`, `paintCarEnv`, `setPaint`, `shadow`, `marker`

### `15-traffic.js` — 94 строк, 8 КБ

Трафик.

Разделы: трафик (стр. 4)

Имена: `traffic`, `LANES`, `TRAFFIC_N`, `modelGeo`, `TRAFFIC_KINDS`, `tq`, `teul`, `tickTraffic`

### `16-fx.js` — 243 строк, 24 КБ

Частицы, вечеринка 888, ряд машин на полигоне.

Разделы: частицы (стр. 4) · вечеринка 888: 8 секунд «чуда» после трюка — под удар песни игрока (стр. 77) · ряд машин на полигоне (стр. 224)

Имена: `SMOKE_TEX`, `SMOKE_FRAG`, `PUFFN`, `puffGeo`, `puffMat`, `puffPts`, `pi`, `puff`, `splashRing`, `splash`, `dust`, `tickPuffs`, `PARTY_BEAT`, `partyFx`, `PARTY`, `levelObjs`, `buildLevel`

### `17-state.js` — 167 строк, 9 КБ

Состояние, физика полигона.

Разделы: состояние (стр. 4) · физика полигона (уровни и уроки) (стр. 32)

Имена: `L`, `mode`, `rec`, `free`, `input`, `freshCar`, `zone`, `reset`, `rollErr`, `timeToGround`, `nozzle`, `step`, `cushion`, `BURST`, `landingReserve`, `sideJet`, `airControls`, `tumble`, `land`, `crash`

### `18-missions.js` — 179 строк, 15 КБ

Задания свободной езды.

Разделы: задания свободной езды (стр. 4)

Имена: `MISSIONS`, `rbDone`, `toastQ`, `queueToast`, `completeMission`, `slalomTick`, `SHOW_LAPS`, `onEightTrack`, `showBurn`, `spinOut`, `showCard`, `showFinish`, `eightShow`, `missionTick`

### `19-drive.js` — 145 строк, 11 КБ

Физика свободной езды, езда по стене, PRO-полёт.

Разделы: физика свободной езды (стр. 4) · присоски: езда по стене Ростов Арены (стр. 60) · PRO: полёт как в аэротрубе по всей карте (стр. 106)

Имена: `groundAt`, `hitSolid`, `applyLook`, `START`, `startFree`, `wallAttach`, `stepWall`, `wallLeave`, `stepProAir`

### `20-aerotube.js` — 146 строк, 11 КБ

Аэротруба, горка-труба и «Баклажановый поток» внутри Арены.

Разделы: аэротруба и трубы внутри Арены (стр. 4)

Имена: `aeroStart`, `stepAero`, `tubeV`, `tubeStart`, `stepTube`, `flowFinale`, `tubeScore`, `tubeExit`

### `21-freedrive.js` — 336 строк, 30 КБ

Свободная езда: шаг физики stepFree, взлёт и посадка, авария и возврат, утопление.

Имена: `respawn`, `sink`, `sinkStep`, `freeCrash`, `takeoff`, `stepFree`, `landFree`

### `22-ui.js` — 459 строк, 37 КБ

Результаты, меню, уроки, повтор, рекорды, «⋯», карта.

Разделы: результат уровня (стр. 4) · меню режимов (стр. 33) · уроки (стр. 68) · повтор с трибуны (стр. 130) · общая таблица рекордов: база опубликованной игры (стр. 187) · «⋯», тосты, карта (стр. 233)

Имена: `showResult`, `renderMenu`, `openMenu`, `hideLesson`, `start`, `lessonOpenUntil`, `startTraining`, `beginLesson`, `flash`, `trainTick`, `trainJumpResult`, `recordFree`, `replayBtnUntil`, `startFreeReplay`, `startReplay`, `stopReplay`, `endReplay`, `replayPose`, `board`, `pushScore`, `dockCloseAt`, `openDock`, `closeDock`, `syncDock`, `CAMS`, `nextCam`, `tilt`, `dzt`, `scrAngle`, `tiltSet`, `garageUntil`, `restart`, `toastUntil`, `showToast`, `mapC`, `MAPS`, `westImg`, `paintWorld`, `arenaB`, `PLACES`, `drawMap`, `mini`, `zoneName`, `isSand`, `zoneAt`, `drawMini`, `GO`

### `23-trainer.js` — 91 строк, 11 КБ

Тренажёр ж/д моста.

Разделы: тренажёр испытаний ж/д моста (стр. 4)

Имена: `TRAINER`, `QUALS`, `goFull`, `fullAsked`

### `24-audio.js` — 225 строк, 22 КБ

Звук.

Разделы: звук: мотор и эффекты синтезируются на лету; песня вечеринки — файл игрока (стр. 4)

Имена: `PARTY_MUSIC`, `sfx`

### `25-input.js` — 199 строк, 15 КБ

Управление, тренер, приборы.

Разделы: управление (стр. 4) · тренер и приборы (стр. 108)

Имена: `joy`, `ctrl`, `joyMode`, `wheel`, `DRIFT_VIS`, `driftUI`, `driftHands`, `dz`, `thr`, `brk`, `turn`, `joyHintUntil`, `joyEnd`, `setHintText`, `KEYS`, `keyOf`, `hold`, `coachHint`, `btnFor`, `lastHint`, `driftKitTick`, `speedFx`, `speedLines`, `ui`

### `26-frame.js` — 359 строк, 32 КБ

Кадр (главный цикл), ручки для тестов.

Разделы: кадр (стр. 4)

Имена: `camPos`, `render`, `layerGround`, `resize`, `wallBasis`, `perf`, `setTime`, `setQuality`, `trackPerf`, `last`, `testFast`, `CINE`, `frame`

## Данные: `arcade/data/`

### `osm-main.js` — 5 строк, 250 КБ

Имена: `OSM`

### `osm-west.js` — 5 строк, 224 КБ

Имена: `WEST`

### `photos.js` — 16 строк, 372 КБ

Имена: `PHOTO_WATER_TEX`, `PHOTO_SKY_SUNSET`, `PHOTO_SKY_DAY`, `PHOTO_SKY_RIVER`, `PHOTO_SKY_SEA`, `PHOTO_WOOD`, `PHOTO_GRAVEL`, `PHOTO_CONC`

### `sounds.js` — 18 строк, 197 КБ

Имена: `ENGINE_SND`

### `suv.js` — 5 строк, 650 КБ

Имена: `SUV_DATA`

### `vehicles.js` — 5 строк, 70 КБ

Имена: 

### `wheel.js` — 4 строк, 381 КБ

Имена: `WHEEL_DATA`

## Указатель имён

| Имя | Файл |
|---|---|
| `$` | `01-core.js` |
| `addScene` | `09-scenes.js` |
| `addSolid` | `02-sky.js` |
| `aeroStart` | `20-aerotube.js` |
| `AIR_SLOW` | `01-core.js` |
| `airControls` | `17-state.js` |
| `applyLook` | `19-drive.js` |
| `ARENA` | `06-arena.js` |
| `arenaB` | `22-ui.js` |
| `bake` | `02-sky.js` |
| `bakeShadows` | `08-slope.js` |
| `BANK` | `04-rostov.js` |
| `bboxOf` | `04-rostov.js` |
| `beacon` | `03-ground.js` |
| `beginLesson` | `22-ui.js` |
| `board` | `22-ui.js` |
| `BOOSTS` | `12-photo.js` |
| `bridgeSteel` | `10-railbridge.js` |
| `brk` | `25-input.js` |
| `btnFor` | `25-input.js` |
| `buildLevel` | `16-fx.js` |
| `buildRings` | `05-trickpark.js` |
| `BURST` | `17-state.js` |
| `camera` | `01-core.js` |
| `camPos` | `26-frame.js` |
| `CAMS` | `22-ui.js` |
| `carEnv` | `14-car.js` |
| `carObj` | `14-car.js` |
| `chunked` | `01-core.js` |
| `chunkFrustum` | `01-core.js` |
| `CHUNKS` | `01-core.js` |
| `CINE` | `26-frame.js` |
| `CITY` | `04-rostov.js` |
| `CLEAN_ROLL` | `01-core.js` |
| `closeDock` | `22-ui.js` |
| `coachHint` | `25-input.js` |
| `completeMission` | `18-missions.js` |
| `CORE` | `04-rostov.js` |
| `crash` | `17-state.js` |
| `ctrl` | `25-input.js` |
| `cullChunks` | `01-core.js` |
| `cushion` | `17-state.js` |
| `DARK_STEEL` | `10-railbridge.js` |
| `deckAt` | `04-rostov.js` |
| `deckH` | `04-rostov.js` |
| `DECKS` | `04-rostov.js` |
| `dm` | `04-rostov.js` |
| `dockCloseAt` | `22-ui.js` |
| `DON_WATER` | `02-sky.js` |
| `drawMap` | `22-ui.js` |
| `drawMini` | `22-ui.js` |
| `DRIFT_VIS` | `25-input.js` |
| `driftHands` | `25-input.js` |
| `driftKitTick` | `25-input.js` |
| `driftUI` | `25-input.js` |
| `DRILLS` | `01-core.js` |
| `dust` | `16-fx.js` |
| `dz` | `25-input.js` |
| `dzt` | `22-ui.js` |
| `EGGPLANT` | `14-car.js` |
| `EIGHT` | `06-arena.js` |
| `eightShow` | `18-missions.js` |
| `endReplay` | `22-ui.js` |
| `ENGINE_SND` | `sounds.js` |
| `FEST` | `02-sky.js` |
| `FEST_BULB` | `02-sky.js` |
| `FEST_COLS` | `02-sky.js` |
| `FEST_M` | `02-sky.js` |
| `festBulbs` | `02-sky.js` |
| `festBunting` | `02-sky.js` |
| `festKicker` | `02-sky.js` |
| `festPole` | `02-sky.js` |
| `festPut` | `02-sky.js` |
| `festQuadUp` | `02-sky.js` |
| `festTri` | `02-sky.js` |
| `flash` | `22-ui.js` |
| `flat` | `02-sky.js` |
| `flowFinale` | `20-aerotube.js` |
| `frame` | `26-frame.js` |
| `FREE` | `01-core.js` |
| `free` | `17-state.js` |
| `freeCrash` | `21-freedrive.js` |
| `freeze` | `02-sky.js` |
| `freshCar` | `17-state.js` |
| `fullAsked` | `23-trainer.js` |
| `G` | `01-core.js` |
| `garageUntil` | `22-ui.js` |
| `glassify` | `14-car.js` |
| `GLOW` | `02-sky.js` |
| `glowMat` | `02-sky.js` |
| `GO` | `22-ui.js` |
| `goFull` | `23-trainer.js` |
| `grainTex` | `01-core.js` |
| `groundAt` | `19-drive.js` |
| `groundLabel` | `03-ground.js` |
| `halt` | `01-core.js` |
| `halted` | `01-core.js` |
| `HAZE` | `02-sky.js` |
| `hemi` | `02-sky.js` |
| `hideLesson` | `22-ui.js` |
| `HILL` | `08-slope.js` |
| `hitSolid` | `19-drive.js` |
| `hold` | `25-input.js` |
| `inBox` | `12-photo.js` |
| `INNER` | `06-arena.js` |
| `inPoly` | `04-rostov.js` |
| `input` | `17-state.js` |
| `inRings` | `04-rostov.js` |
| `inStrip` | `04-rostov.js` |
| `inWorldMap` | `04-rostov.js` |
| `isSand` | `22-ui.js` |
| `joy` | `25-input.js` |
| `joyEnd` | `25-input.js` |
| `joyHintUntil` | `25-input.js` |
| `joyMode` | `25-input.js` |
| `keyOf` | `25-input.js` |
| `KEYS` | `25-input.js` |
| `kicker` | `05-trickpark.js` |
| `KINO` | `12-photo.js` |
| `L` | `17-state.js` |
| `land` | `17-state.js` |
| `landFree` | `21-freedrive.js` |
| `landingReserve` | `17-state.js` |
| `LANES` | `15-traffic.js` |
| `last` | `26-frame.js` |
| `lastHint` | `25-input.js` |
| `layerGround` | `26-frame.js` |
| `lerp` | `03-ground.js` |
| `lessonOpenUntil` | `22-ui.js` |
| `levelObjs` | `16-fx.js` |
| `LEVELS` | `01-core.js` |
| `lineDist` | `04-rostov.js` |
| `M4` | `01-core.js` |
| `M4T` | `04-rostov.js` |
| `makeVaz2108` | `14-car.js` |
| `mapC` | `22-ui.js` |
| `MAPS` | `22-ui.js` |
| `marker` | `14-car.js` |
| `markM` | `03-ground.js` |
| `mat` | `02-sky.js` |
| `matCache` | `02-sky.js` |
| `MAXQ` | `01-core.js` |
| `mergeGeos` | `02-sky.js` |
| `mini` | `22-ui.js` |
| `MISSIONS` | `18-missions.js` |
| `missionTick` | `18-missions.js` |
| `mode` | `17-state.js` |
| `modelGeo` | `15-traffic.js` |
| `MODELS` | `01-core.js` |
| `nextCam` | `22-ui.js` |
| `NIGHT` | `02-sky.js` |
| `nightReg` | `02-sky.js` |
| `nozzle` | `17-state.js` |
| `onCarriageway` | `04-rostov.js` |
| `onEightTrack` | `18-missions.js` |
| `openDock` | `22-ui.js` |
| `openMenu` | `22-ui.js` |
| `OSM` | `osm-main.js` |
| `paintCarEnv` | `14-car.js` |
| `paintIdx` | `14-car.js` |
| `PAINTS` | `14-car.js` |
| `paintWorld` | `22-ui.js` |
| `PARTY` | `16-fx.js` |
| `PARTY_BEAT` | `16-fx.js` |
| `PARTY_MUSIC` | `24-audio.js` |
| `partyFx` | `16-fx.js` |
| `perf` | `26-frame.js` |
| `persist` | `01-core.js` |
| `PHOTO` | `12-photo.js` |
| `PHOTO_CONC` | `photos.js` |
| `PHOTO_GRAVEL` | `photos.js` |
| `PHOTO_SKY_DAY` | `photos.js` |
| `PHOTO_SKY_RIVER` | `photos.js` |
| `PHOTO_SKY_SEA` | `photos.js` |
| `PHOTO_SKY_SUNSET` | `photos.js` |
| `PHOTO_WATER_TEX` | `photos.js` |
| `PHOTO_WOOD` | `photos.js` |
| `pi` | `16-fx.js` |
| `PIERS` | `04-rostov.js` |
| `placeName` | `04-rostov.js` |
| `PLACES` | `22-ui.js` |
| `proBoost` | `12-photo.js` |
| `puff` | `16-fx.js` |
| `puffGeo` | `16-fx.js` |
| `puffMat` | `16-fx.js` |
| `PUFFN` | `16-fx.js` |
| `puffPts` | `16-fx.js` |
| `pushScore` | `22-ui.js` |
| `QUALS` | `23-trainer.js` |
| `queueToast` | `18-missions.js` |
| `RAILB` | `10-railbridge.js` |
| `rampY` | `03-ground.js` |
| `rbDone` | `18-missions.js` |
| `rec` | `17-state.js` |
| `recordFree` | `22-ui.js` |
| `rectOf` | `04-rostov.js` |
| `render` | `26-frame.js` |
| `renderer` | `01-core.js` |
| `renderMenu` | `22-ui.js` |
| `replayBtnUntil` | `22-ui.js` |
| `replayPose` | `22-ui.js` |
| `reset` | `17-state.js` |
| `resize` | `26-frame.js` |
| `respawn` | `21-freedrive.js` |
| `restart` | `22-ui.js` |
| `ring` | `05-trickpark.js` |
| `ringQ` | `05-trickpark.js` |
| `rings` | `05-trickpark.js` |
| `rnd` | `01-core.js` |
| `ROAD_W` | `04-rostov.js` |
| `roadPoint` | `04-rostov.js` |
| `ROADS` | `04-rostov.js` |
| `rollErr` | `17-state.js` |
| `ROW0` | `01-core.js` |
| `RS` | `01-core.js` |
| `rubberMetal` | `14-car.js` |
| `save` | `01-core.js` |
| `scene` | `01-core.js` |
| `sceneChunk` | `09-scenes.js` |
| `sceneDist` | `09-scenes.js` |
| `sceneDrop` | `09-scenes.js` |
| `sceneFlat` | `09-scenes.js` |
| `sceneRun` | `09-scenes.js` |
| `SCENES` | `09-scenes.js` |
| `scrAngle` | `22-ui.js` |
| `seed` | `01-core.js` |
| `setHintText` | `25-input.js` |
| `setPaint` | `14-car.js` |
| `setQuality` | `26-frame.js` |
| `setTime` | `26-frame.js` |
| `setTune` | `14-car.js` |
| `sfx` | `24-audio.js` |
| `SGRID` | `08-slope.js` |
| `sgridAdd` | `08-slope.js` |
| `shadow` | `14-car.js` |
| `shafts` | `02-sky.js` |
| `shaftTmp` | `02-sky.js` |
| `SHIPS` | `11-ships.js` |
| `SHOW` | `07-eight.js` |
| `SHOW_LAPS` | `18-missions.js` |
| `showBurn` | `18-missions.js` |
| `showCard` | `18-missions.js` |
| `showFatal` | `01-core.js` |
| `showFinish` | `18-missions.js` |
| `showResult` | `22-ui.js` |
| `showToast` | `22-ui.js` |
| `sideJet` | `17-state.js` |
| `SIGNALS` | `13-streets.js` |
| `sink` | `21-freedrive.js` |
| `sinkStep` | `21-freedrive.js` |
| `skyDome` | `02-sky.js` |
| `slalomTick` | `18-missions.js` |
| `SMOKE_FRAG` | `16-fx.js` |
| `SMOKE_TEX` | `16-fx.js` |
| `smooth` | `03-ground.js` |
| `smoothNormals` | `14-car.js` |
| `solidsNear` | `08-slope.js` |
| `SPAWN` | `01-core.js` |
| `speedFx` | `25-input.js` |
| `speedLines` | `25-input.js` |
| `spinOut` | `18-missions.js` |
| `splash` | `16-fx.js` |
| `splashRing` | `16-fx.js` |
| `stage` | `01-core.js` |
| `START` | `19-drive.js` |
| `start` | `22-ui.js` |
| `startFree` | `19-drive.js` |
| `startFreeReplay` | `22-ui.js` |
| `startReplay` | `22-ui.js` |
| `startTraining` | `22-ui.js` |
| `step` | `17-state.js` |
| `stepAero` | `20-aerotube.js` |
| `stepFree` | `21-freedrive.js` |
| `stepProAir` | `19-drive.js` |
| `stepTube` | `20-aerotube.js` |
| `stepWall` | `19-drive.js` |
| `stopReplay` | `22-ui.js` |
| `sun` | `02-sky.js` |
| `SUN_DIR` | `02-sky.js` |
| `surfaceH` | `04-rostov.js` |
| `SUV` | `14-car.js` |
| `SUV_DATA` | `suv.js` |
| `syncDock` | `22-ui.js` |
| `T` | `01-core.js` |
| `takeoff` | `21-freedrive.js` |
| `TER` | `04-rostov.js` |
| `terLerp` | `04-rostov.js` |
| `terrainH` | `04-rostov.js` |
| `terrainN` | `04-rostov.js` |
| `testFast` | `26-frame.js` |
| `teul` | `15-traffic.js` |
| `textTex` | `02-sky.js` |
| `thr` | `25-input.js` |
| `tickPuffs` | `16-fx.js` |
| `tickScenes` | `09-scenes.js` |
| `tickSignals` | `13-streets.js` |
| `tickSky` | `02-sky.js` |
| `tickTraffic` | `15-traffic.js` |
| `tilt` | `22-ui.js` |
| `tiltSet` | `22-ui.js` |
| `TIME` | `02-sky.js` |
| `TIMES` | `02-sky.js` |
| `timeToGround` | `17-state.js` |
| `toastQ` | `18-missions.js` |
| `toastUntil` | `22-ui.js` |
| `tower` | `03-ground.js` |
| `tq` | `15-traffic.js` |
| `trackPerf` | `26-frame.js` |
| `traffic` | `15-traffic.js` |
| `TRAFFIC_KINDS` | `15-traffic.js` |
| `TRAFFIC_N` | `15-traffic.js` |
| `TRAINER` | `23-trainer.js` |
| `trainJumpResult` | `22-ui.js` |
| `trainTick` | `22-ui.js` |
| `TRIB` | `03-ground.js` |
| `tubeExit` | `20-aerotube.js` |
| `tubePath` | `06-arena.js` |
| `tubeScore` | `20-aerotube.js` |
| `tubeStart` | `20-aerotube.js` |
| `tubeV` | `20-aerotube.js` |
| `tumble` | `17-state.js` |
| `TUNES` | `14-car.js` |
| `turn` | `25-input.js` |
| `TX0` | `04-rostov.js` |
| `ui` | `25-input.js` |
| `under` | `02-sky.js` |
| `UNDER` | `12-photo.js` |
| `VAZ_PARTS` | `14-car.js` |
| `VMAXF` | `01-core.js` |
| `WAKE` | `02-sky.js` |
| `wallAttach` | `19-drive.js` |
| `wallBasis` | `26-frame.js` |
| `wallLeave` | `19-drive.js` |
| `walls` | `02-sky.js` |
| `WATER` | `04-rostov.js` |
| `waterAt` | `04-rostov.js` |
| `WEST` | `osm-west.js` |
| `WEST_BOX` | `09-scenes.js` |
| `westImg` | `22-ui.js` |
| `WESTSC` | `09-scenes.js` |
| `wheel` | `25-input.js` |
| `WHEEL_DATA` | `wheel.js` |
| `WORLD` | `01-core.js` |
| `yUp0` | `01-core.js` |
| `ZA` | `01-core.js` |
| `zone` | `17-state.js` |
| `zoneAt` | `22-ui.js` |
| `zoneName` | `22-ui.js` |
| `ZONES` | `04-rostov.js` |
