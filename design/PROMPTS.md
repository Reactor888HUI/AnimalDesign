# Промпты для нового дизайна «Ромашки»: комната «Пижон»

Пилотная комната — **барбершоп «Пижон»**: Эрик, Айя и 8 клиентов. Здесь больше всего участников, и это единственный барбершоп, где можно пройти визиты целиком. Всё, что придумаем здесь, потом переносим на остальные салоны.

**Главное правило:** тексты, диалоги, баллы, таймеры и ход игры не меняются. Меняется только оформление. Это проверяют два скрипта:

```bash
cd tools && npm install
node etalon.mjs check    # 1998 текстов, 95 таблиц данных, 150 игровых функций
node trace.mjs check     # полный проход «Пижона»: 173 события (реплики, варианты, итоги, деньги) идут в том же порядке
```

Скриншоты «до»: `screens/pijon/index.html`, 164 экрана на телефоне 390×844.

---

## Порядок работы

| Шаг | Что делаем | Промпт | Где |
|---|---|---|---|
| 1 | Исследование: какие стили вообще возможны | **П1** | Claude / ChatGPT / Gemini с режимом Deep Research |
| 2 | Быстрые картинки-настроения по 6–10 стилям | **П2** | Midjourney / GPT-image / Recraft / Leonardo |
| 3 | Макеты экранов в 2–3 лучших стилях с настоящими текстами | **П3** | Claude Code (я делаю HTML-макеты) |
| 4 | Лист персонажа: закрепляем внешность Эрика, Айи и клиентов | **П4** | генератор картинок |
| 5 | Все позы и эмоции по списку файлов | **П5** | генератор картинок + я обрабатываю |
| 6 | Фон «Пижона» | **П6** | генератор картинок |
| 7 | Сборка оболочки в игре | **П7** | Claude Code |

> Генераторы картинок плохо пишут русские буквы. На картинках-настроениях из П2 тексты могут выйти кашей, и это нормально: на них оцениваем стиль, а не надписи. Макеты с настоящими текстами делаем на шаге 3, в HTML.

---

## П1. Исследовательский промпт: варианты интерфейса

Вставьте в ИИ с режимом глубокого исследования (Claude Research, ChatGPT Deep Research, Gemini Deep Research). Приложите 6–8 скриншотов из `screens/pijon/`: меню, выбор салона, сцену с репликой, выбор ответа, разбор Айи, итог визита, итог смены.

```text
Ты — арт-директор и UX-исследователь мобильных игр. Помоги выбрать новый визуальный стиль для существующей игры.

О ИГРЕ
«Симулятор парикмахера — Академия Льва Кравца». Обучающая браузерная игра-новелла для парикмахеров и барберов
(аудитория 18–45 лет, Россия, в основном играют с телефона). Игрок — мастер (Кира — парикмахер, Эрик — барбер).
Клиент приходит, игрок за 30 секунд выбирает реплику из 3 вариантов, персонажи разыгрывают ответ на сцене,
виртуальный технолог Айя хвалит или объясняет ошибку. Есть шкала настроения клиента, баллы, деньги мастера,
норма времени визита, ранги («Железные ножницы» и т. д.), экзамен.
Пилотная локация — барбершоп «Пижон»: лофт, кирпич, кожаный диван, барберский столб. Клиенты — 8 мужчин
от 24 до 58 лет (боксёр на «бэхе», седой руководитель с бородой, договорщик в костюме, творческий рыжий парень,
осторожный аналитик, молчаливый мужчина в пальто, мастер на все руки с бородой, импульсивный загорелый мужчина).

ЧТО СЕЙЧАС (скриншоты приложены)
Экран телефона 390×844 разделён на две части. Сверху — сцена: фон-иллюстрация и полноростовые персонажи в
полуреалистичном стиле «цифровая иллюстрация». Над сценой — панель из 7 круглых иконок (настроение, баллы,
деньги, ранг, сброс, музыка, голос). Реплики показываются пузырём с портретом говорящего. Снизу — панель с
заголовком визита, вариантами ответа (карточки), таймером, чипами «Настроение +12», «+2 балла», блоком
«Айя: …» и тёмной кнопкой «Дальше». Палитра — шалфей, белый, жёлтый, фиолетовый у Айи.

ОГРАНИЧЕНИЯ
- Тексты, механики и структура экранов не меняются. Меняем оформление: цвета, шрифты, форму элементов,
  стиль персонажей и фонов, анимации, компоновку на экране телефона.
- Реплики длинные (до 250 знаков) и на русском: шрифт должен хорошо читаться и поддерживать кириллицу.
- Персонажи — набор картинок: полный рост (стоит, сидит в кресле под пелериной, без верхней одежды,
  с телефоном, 4 эмоции в полный рост) и квадратные портреты 5 эмоций. Это примерно 130 картинок на одну
  локацию. Стиль должен позволять держать одинаковую внешность персонажа на десятках картинок.
- Игра — HTML/CSS/JS без движка. Эффекты должны делаться силами CSS, SVG или лёгкой JS-анимации.

ЗАДАЧА
1. Предложи 8–10 принципиально разных визуальных направлений для этой игры: от безопасных до смелых.
   Обязательно рассмотри: казуальный мобайл (Homescapes, Project Makeover), аниме-новеллу, плоскую векторную
   иллюстрацию (Duolingo), комикс или графический роман, премиальный тёмный стиль с золотом, неоновый лофт,
   3D-чиби или стиль «пластилин/игрушка», пиксель-арт (Coffee Talk, VA-11 Hall-A), интерфейс-мессенджер
   (диалоги как переписка). Добавь свои варианты, если видишь лучше.
2. Для каждого направления дай:
   - название и одну фразу-настроение;
   - 3–5 игр или приложений-референсов, вышедших в 2019–2026, и что именно у них взять;
   - палитру (6 цветов HEX: фон, поверхность, текст, акцент, «хорошо», «плохо»);
   - пару шрифтов с кириллицей (Google Fonts);
   - как выглядят: панель показателей, пузырь реплики, карточка варианта ответа, таймер, разбор Айи, кнопка;
   - стиль персонажей: как рисовать, как передавать эмоции, насколько легко держать одинаковую внешность;
   - мобильную компоновку: как делить экран между сценой и выбором, что крупно, что под большим пальцем;
   - 2–3 микроанимации, которые сделают игру «живой»;
   - оценки от 1 до 5: подходит взрослым профессионалам; читаемость длинных реплик; стоимость
     производства 130 картинок; риск «детскости»; насколько выделяется среди конкурентов;
   - готовую фразу-стиль на английском для генератора картинок (Midjourney / GPT-image).
3. Сведи всё в таблицу-сравнение и порекомендуй 3 направления для экспериментальных макетов, объяснив выбор.
4. Отдельно: лучшие практики интерфейса обучающих игр с выбором реплик (обратная связь, таймер,
   доступность, размер шрифта, контраст, тёмная тема) — 10 пунктов со ссылками.
Указывай источники и ссылки на референсы.
```

---

## П2. Картинка-настроение для каждого стиля

Один и тот же кадр во всех стилях, чтобы сравнивать честно. Подставьте вместо `{STYLE}` фразу-стиль из каталога ниже или из результата П1. Формат — вертикальный, как телефон.

```text
Mobile game UI screenshot, vertical 9:19.5 phone screen, educational barbershop visual novel.
Top half: game scene inside a loft barbershop (red brick wall, black leather barber chairs, chesterfield sofa,
barber pole, Edison lamps, concrete floor). A tattooed young barber (24, dark undercut, beard, black t-shirt,
brown leather apron) stands facing a muscular client (27, black bomber jacket, buzz cut, small scar over eyebrow).
Small round avatar of a friendly female AI assistant (violet glow) in the top-right corner of the scene.
A speech bubble with the client's portrait. Thin status bar on top with 4 stat pills (mood, points, money, rank).
Bottom half: title card "Client 1 of 8", a 30-second countdown bar, three tappable answer cards with dialogue text,
one card highlighted. Clean hierarchy, large readable text, thumb-friendly buttons.
Style: {STYLE}.
--ar 9:19 --v 7
```

Для GPT-image и Recraft уберите `--ar 9:19 --v 7` и допишите в начало «vertical phone screenshot 1170×2532».

### Каталог стартовых стилей

| # | Направление | Фраза `{STYLE}` | Плюсы | Риски |
|---|---|---|---|---|
| A | Казуальный мобайл | `glossy casual mobile game UI like Homescapes and Project Makeover, chunky rounded buttons with soft 3D bevel, saturated warm palette, cel-shaded semi-realistic characters` | знакомо, ярко, «игра» | может выглядеть детским и шаблонным |
| B | Аниме-новелла | `modern anime visual novel UI like Love and Deepspace, clean cel-shaded anime characters, elegant translucent panels, soft gradients, pastel and violet accents` | эмоции читаются, легко держать одну внешность | не всем взрослым мастерам близко |
| C | Плоская векторная иллюстрация | `flat vector illustration UI like Duolingo and Headspace, bold simple shapes, no outlines, friendly geometric characters, big rounded type, bright limited palette` | дёшево, чисто, отлично на телефоне | меньше «салонной» атмосферы |
| D | Комикс / графический роман | `graphic novel UI, inked line art with halftone shading, comic panels and speech balloons, limited palette of brick red, black and cream, bold hand-lettered headings` | ярко, по-взрослому, диалоги как в комиксе | рисовать сложнее, нужна единая линия |
| E | Премиум-салон | `luxury salon app UI, matte black and champagne gold, thin serif headings, frosted glass panels, soft studio lighting, refined semi-realistic painted characters` | статусно, подходит премиум-сегменту | для эконом-салонов слишком «дорого» |
| F | Неоновый лофт | `neon loft night aesthetic UI, dark brick, magenta and cyan neon accents, glowing outlines, synthwave mood, stylized semi-realistic characters with rim light` | эффектно для барбершопа | читаемость длинных текстов, усталость глаз |
| G | 3D-игрушка | `3D stylized toy-like characters like Pixar and Animal Crossing, soft clay materials, rounded proportions, warm studio lighting, pill-shaped glossy UI` | очень дружелюбно, современно | риск «детскости»; генерировать одинаково сложно |
| H | Пиксель-арт | `cozy pixel art UI like Coffee Talk and VA-11 Hall-A, 32-bit detailed sprites, warm lamp light, chunky pixel frames, retro dialogue box` | уютно, «чилл», дёшево по анимации | мелко на телефоне; не всем взрослым близко |
| I | Мессенджер | `chat messenger UI as game interface, dialogue shown as message bubbles with avatars, typing indicator, answer options as quick replies, clean iOS-like design` | максимум читаемости, привычно всем | сцена и персонажи уходят на второй план |
| J | Акварель / ручной рисунок | `hand-painted watercolor and ink illustration UI, textured paper panels, warm muted palette, sketchy expressive characters, editorial magazine typography` | тепло, «с душой», необычно | трудно держать одинаковые позы и эмоции |

---

## П3. Макет экранов в выбранном стиле (для Claude Code)

Когда из П2 выберете 2–3 стиля, отправьте мне:

```text
Сделай HTML-макеты в стиле «{название}» для экранов «Пижона»: главное меню, выбор салона, сцена с репликой
клиента, решение 1 с таймером, разбор Айи после ответа, итог визита, итог смены. Бери настоящие тексты
из etalon/texts.md и скриншоты из screens/pijon/. Картинки персонажей пока старые. Экран 390×844,
светлая и тёмная тема. Сложи макеты рядом на одной странице для сравнения.
```

---

## П4. Лист персонажа: закрепляем внешность

Сначала для каждого персонажа делаем один лист с поворотами. Потом он служит образцом для всех поз: в Midjourney — `--cref` (по персонажу) и `--sref` (по стилю), в GPT-image — приложить лист картинкой.

```text
Character turnaround sheet, {STYLE}. Full body, front view, 3/4 view facing right, side view, back view,
plus 5 head close-ups: neutral, happy smile, skeptical raised eyebrow, angry, sad.
Plain white background, even lighting, consistent proportions, no text.
Character: {ОПИСАНИЕ ИЗ ТАБЛИЦЫ}
```

### Описания персонажей «Пижона» (внешность взята из текстов игры)

| Персонаж | Файлы | Описание для промпта |
|---|---|---|
| **Эрик**, барбер, 24 | `eric_*` | `young male barber, 24, confident and slightly cocky with self-irony, dark hair in a sharp undercut with textured top, well-groomed short beard, tattoo sleeves on both arms, black t-shirt, brown leather barber apron, black jeans, boots` |
| **Айя**, виртуальный технолог | `aya_*` | `friendly female AI mentor, about 25, warm smile, wavy shoulder-length light-brown hair, soft violet glow around her, elegant and kind, explains rather than scolds; shown as round head-and-shoulders avatar` |
| **Артём**, 27 — прямой, нетерпеливый, боксёр | `man_artem_*` | `muscular man, 27, boxer build, buzz cut, small scar above eyebrow, black bomber jacket over black t-shirt, dark jeans, impatient and direct` |
| **Виктор Павлович**, 58 — руководитель, любит контроль | `man_viktor_*` | `distinguished man, 58, thick grey beard, grey hair neatly combed back, dark navy three-piece suit, white shirt, authoritative posture, used to being in control` |
| **Марк**, 33 — договорщик, торгуется | `man_mark_*` | `slick businessman, 33, platinum blond hair styled up, grey suit, white t-shirt underneath, smartphone in hand, charming negotiator smile` |
| **Денис**, 24 — творческий, чувствительный | `man_denis_*` | `creative young man, 24, curly ginger hair, plum-coloured shirt, slim build, open friendly smile, sensitive artistic vibe` |
| **Алексей**, 30 — аналитик, точный | `man_aleksey_*` | `slim careful man, 30, short blond hair, beige bomber jacket, neat and precise, cautious look, holds a phone with a reference haircut photo` |
| **Вадим**, 55 — сдержанный, молчаливый | `man_vadim_*` | `lean reserved man, 55, salt-and-pepper hair, grey wool overcoat over a sweater, quiet and calm, minimal expressions` |
| **Михаил**, 48 — практичный, мастер на все руки | `man_mikhail_*` | `stocky practical man, 48, thick beard with grey streaks, olive work shirt with rolled-up sleeves, traces of machine oil on fingers, down-to-earth` |
| **Роман**, 38 — эмоциональный, импульсивный | `man_roman_*` | `tanned energetic man, 38, white linen shirt, short dark hair, expressive gestures, impatient and emotional` |

---

## П5. Позы и эмоции: что именно нарисовать

### Технические требования (одинаковые для всех)

- **Полный рост:** персонаж смотрит **вправо** (код сам зеркалит), стопы касаются нижнего края картинки, прозрачный фон. Если генератор не умеет прозрачность — чистый ровный фон, вырезку сделаю я. Готовая высота — 760 px, ширина любая: игра сама подхватит пропорции.
- **Поза «сидит» (`_sit`):** клиент **вместе с барберским креслом** под чёрной пелериной. Кресло — часть картинки, а не фона.
- **Портреты эмоций (`_e0`, `_*_bust`, `eric_e*`, `eric_b*`):** квадрат, голова и плечи, 240×240 (готовим из 1024×1024). У Айи — 400×400, круглая обрезка, прозрачный фон.
- Свет, масштаб и линия во всей серии одинаковые. Каждую позу генерируем от листа персонажа (П4).

Шаблон для одной позы:

```text
{STYLE}. Full body character, facing right in 3/4 view, feet touching the bottom edge, transparent background,
no shadow, no text. Same character as reference sheet: {ОПИСАНИЕ}. Pose: {ПОЗА}.
```

### Список файлов комнаты «Пижон»: 131 картинка

**Эрик — 17**

| Файл | Поза или эмоция |
|---|---|
| `eric_stand` | стоит спокойно, руки свободно |
| `eric_walk` | идёт, шаг вправо |
| `eric_greet` | приветствует: рука поднята, улыбка |
| `eric_cut` | стрижёт: машинка или ножницы в руке, корпус чуть наклонён |
| `eric_phone` | говорит по телефону |
| `eric_think` | задумался: рука у подбородка |
| `eric_diploma` | держит сертификат барбера, гордый (сцена выхода из Академии) |
| `eric_e0`…`eric_e4` | портрет: спокоен, улыбается, сомневается, расстроен, счастлив |
| `eric_b0`…`eric_b4` | крупный бюст с теми же 5 эмоциями |

**Айя — 8**

| Файл | Эмоция |
|---|---|
| `aya_c0` | объясняет: открытая ладонь, спокойная улыбка |
| `aya_c1` | хвалит: большой палец вверх, широкая улыбка |
| `aya_c2` | предупреждает: поднятый палец, серьёзная, но мягкая |
| `aya_c3` | подбадривает: кулачки у груди, подмигивает (главное меню) |
| `aya_e0`…`aya_e3` | запасные портреты (в коде сейчас не используются — можно не делать) |

**Клиенты — 105.** Набор у всех одинаковый, но у некоторых части нет:

| Файл | Поза |
|---|---|
| `man_X_stand` | входит или стоит в верхней одежде |
| `man_X_nocoat` | без верхней одежды (бомбер, пальто, пиджак сняты). Нет у Дениса, Михаила, Романа |
| `man_X_sit` | сидит в барберском кресле под пелериной |
| `man_X_phone` | смотрит в телефон или говорит по телефону. У Артёма только портрет |
| `man_X_happy` / `_angry` / `_skeptic` / `_sad` | эмоция в полный рост: доволен; злится, указывает пальцем; скрестил руки, бровь поднята; опустил плечи. У Артёма только портреты |
| `man_X_e0` | портрет: нейтральный |
| `man_X_happy_bust` / `_angry_bust` / `_skeptic_bust` / `_sad_bust` / `_phone_bust` | портреты пяти эмоций |
| `man_aleksey_photo` | экран телефона с фото желаемой стрижки (Алексей показывает мастеру) |

Сколько картинок у каждого клиента: Артём 9, Виктор 14, Марк 14, Денис 13, Алексей 15, Вадим 14, Михаил 13, Роман 13.

**Фон — 1:** `barber_pijon` (П6).

**Порядок:** Эрик и Айя (видны всё время) → Артём (первый клиент, на нём проверяем весь конвейер) → остальные семь.

---

## П6. Фон «Пижона»

Размер 1672×941. Персонажи ходят по линии пола примерно на 73% высоты, поэтому композицию держим как сейчас: пол занимает нижнюю половину и остаётся пустым.

```text
{STYLE}. Wide interior of a loft barbershop called "PIJON", empty, no people, eye-level front view, 16:9.
Left: glass entrance door with street view, reception desk with coffee machine, shelf with grooming products.
Center back wall: red brick, two mirrors with Edison sconces, two black leather barber chairs, washing sink,
barber pole. Right: brown chesterfield sofa with coffee table, plants, black door, gold sign "PIJON barbershop".
Bottom half of the image: wide empty polished concrete floor (characters will stand there). Warm evening light.
--ar 16:9
```

---

## П7. Сборка оболочки (для Claude Code)

```text
Применяем стиль «{название}» к копии игры в этом репозитории. Правила:
- Меняй только оформление: CSS, вёрстку, шрифты, иконки, анимации, картинки в assets/
  (те же имена файлов). Тексты, данные и игровую логику не трогай.
- Визуальные функции и константы, которые можно менять, перечислены в tools/etalon.mjs
  (VISUAL_FUNCS, VISUAL_DATA). Остальное — нельзя.
- Сохрани id #stage #scene #dlg #panel и классы .choice .next .who .say — на них держится автопроверка.
- После каждого шага запускай: node tools/etalon.mjs check && node tools/trace.mjs check.
  Потом node tools/trace.mjs shots и покажи скриншоты «было/стало» рядом.
- Мобильный экран 390×844 — главный. Проверь также 360×740 и планшет.
```

---

## Как держать персонажей одинаковыми

1. Один лист персонажа (П4) — и все позы генерируются только от него.
2. Одна и та же фраза-стиль и один `--sref` (картинка-образец стиля) на всю серию.
3. Сначала делаем полностью одного персонажа (Артёма) и проверяем в игре. Только потом остальных.
4. Обработку беру на себя: вырезка фона, выравнивание стоп по низу, размер, сжатие в webp, проверка в игре и скриншоты «было/стало».
