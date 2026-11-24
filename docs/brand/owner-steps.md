# Утром: что нажать руками (оформление Telegram, GitHub, Vercel)

Всё, что можно сделать кодом, уже в PR «brand kit». Здесь только то, что делается в интерфейсах BotFather и GitHub. Около 10 минут.

Файлы удобнее всего брать прямо с сайта после деплоя: всё из `public/brand/` открывается по адресу `https://mercat-ai.vercel.app/brand/<файл>`. Откройте ссылку на телефоне, сохраните картинку и отправьте её в BotFather. До деплоя те же файлы лежат в репозитории в папке `public/brand/` (на GitHub: открыть файл → Download raw).

## 1. Telegram: аватар бота

1. Откройте [@BotFather](https://t.me/BotFather), отправьте `/setuserpic`.
2. Выберите `@hackathonproj1_bot`.
3. Отправьте **как фото** (не файлом) картинку [`bot-avatar.png`](https://mercat-ai.vercel.app/brand/bot-avatar.png), 640×640. Лампа стоит по центру, Telegram обрежет её в круг, ничего не потеряется.

Имя, описание, «about», команды и кнопку меню выставляет код (сессия engine). Здесь их не трогайте, иначе следующий деплой перезапишет.

## 1б. Telegram: баннер бота (картинка в пустом чате)

Это картинка, которую человек видит над «Что умеет этот бот?», когда впервые открывает бота.

1. В @BotFather отправьте `/setdescriptionpic`.
2. Выберите `@hackathonproj1_bot`.
3. Отправьте **как фото** [`bot-description-640x360.png`](https://mercat-ai.vercel.app/brand/bot-description-640x360.png) (узбекский) или [`bot-description-ru-640x360.png`](https://mercat-ai.vercel.app/brand/bot-description-ru-640x360.png) (русский), 640×360.

## 2. Telegram: главное Mini App и экран загрузки

1. В @BotFather: `/mybots` → `@hackathonproj1_bot` → **Bot Settings** → **Configure Mini App**.
2. Если Mini App ещё не включено: **Enable Mini App** и адрес `https://mercat-ai.vercel.app/tg`. Если адрес уже стоит, не меняйте его.
3. Найдите настройки экрана загрузки (**Loading screen**; в разных версиях BotFather кнопки называются чуть по-разному, ищите слова icon / color):
   - **Иконка:** отправьте файлом [`miniapp-loading.svg`](https://mercat-ai.vercel.app/brand/miniapp-loading.svg). Это одноцветный контур лампы одним путём: Telegram сам красит его в цвет темы и пускает по нему блик, пока приложение грузится.
   - **Цвета.** Ставим ровно те, которыми Mini App красит себя при старте (`src/components/miniapp/native.ts`, `STAGE`), чтобы при переходе ничего не мигало:

     | Что | Светлая тема | Тёмная тема |
     |---|---|---|
     | Фон (background) | `#F2F2F6` | `#000000` |
     | Шапка (header) | `#F2F2F6` | `#000000` |

   Если BotFather просит цвет без решётки, вводите `F2F2F6` и `000000`.
4. Проверка: закройте Telegram полностью, откройте бота и нажмите кнопку меню. Сначала должен появиться контур лампы на фоне в цвет приложения, потом само приложение.

## 3. Telegram: канал и пост-анонс

- Обложка для поста о запуске: [`tg-cover.png`](https://mercat-ai.vercel.app/brand/tg-cover.png) (узбекский), [`tg-cover-ru.png`](https://mercat-ai.vercel.app/brand/tg-cover-ru.png), [`tg-cover-en.png`](https://mercat-ai.vercel.app/brand/tg-cover-en.png), 1280×720.
- Аватар канала Mercat, если он есть: тот же `bot-avatar.png`.
- Превью ссылки на сайт Telegram кэширует. Если в чатах всё ещё старая картинка, отправьте ссылку `https://mercat-ai.vercel.app` боту [@WebpageBot](https://t.me/WebpageBot): он обновит превью. Новая картинка: тёмная сцена, десять ламп и строка «Kanalingiz uchun haftalik postlar · Mercat».

## 4. GitHub: картинка для соцсетей

1. Репозиторий `stuffdealerog-collab/mercat` → **Settings** → **General**.
2. Блок **Social preview** → **Edit** → **Upload an image…**
3. Файл [`public/brand/github-social.png`](../../public/brand/github-social.png), 1280×640.

Заодно, по желанию: на главной странице репозитория шестерёнка у блока **About** → Website `https://mercat-ai.vercel.app`, описание «An AI marketing department for Telegram channels».

README с новой шапкой и скриншотами появится сам после мержа PR.

## 5. Vercel

Ничего. Favicon, иконки для телефона, `manifest.webmanifest` и картинки превью уходят вместе с деплоем. После деплоя можно открыть и проверить:

- https://mercat-ai.vercel.app/opengraph-image.png
- https://mercat-ai.vercel.app/manifest.webmanifest
- https://mercat-ai.vercel.app/icon.svg

Свой домен нужен только если хочется адрес красивее, чем `mercat-ai.vercel.app`: Vercel → проект `mars-hackathon-app` → **Settings** → **Domains** → **Add**. После этого поменять `PUBLIC_URL` и снова запустить `pnpm set-webhook`. Перед демо лучше не трогать.
