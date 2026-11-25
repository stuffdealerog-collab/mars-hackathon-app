/**
 * The privacy policy, terms and data-deletion texts in Uzbek (Latin), Russian and English. Plain and honest: what
 * Mercat stores, what it reads from connected platforms (read-only), and how to disconnect and delete. `[text](url)`
 * becomes a link; {operator}, {contact} and {bot} are filled in by the page.
 */

export type LegalLang = "uz" | "ru" | "en";
export type LegalKind = "privacy" | "terms" | "deletion";

export interface LegalSection {
  h: string;
  p: string[];
}

export interface LegalDoc {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

export const NAV: Record<LegalLang, Record<LegalKind, string> & { updated: string; home: string }> = {
  uz: { privacy: "Maxfiylik siyosati", terms: "Foydalanish shartlari", deletion: "Ma’lumotlarni o‘chirish", updated: "Yangilangan sana", home: "Bosh sahifa" },
  ru: { privacy: "Политика конфиденциальности", terms: "Условия использования", deletion: "Удаление данных", updated: "Обновлено", home: "Главная" },
  en: { privacy: "Privacy policy", terms: "Terms of use", deletion: "Data deletion", updated: "Last updated", home: "Home" },
};

const GOOGLE_PERMISSIONS = "https://myaccount.google.com/permissions";
const GOOGLE_PRIVACY = "https://policies.google.com/privacy";
const YOUTUBE_TERMS = "https://www.youtube.com/t/terms";
const GOOGLE_USER_DATA = "https://developers.google.com/terms/api-services-user-data-policy";
const META_TERMS = "https://developers.facebook.com/terms/";

export const LEGAL: Record<LegalKind, Record<LegalLang, LegalDoc>> = {
  privacy: {
    uz: {
      title: "Maxfiylik siyosati",
      description: "Mercat qanday ma’lumotlarni saqlaydi, ulangan tarmoqlardan nimani o‘qiydi va ularni qanday o‘chirish mumkin.",
      intro:
        "Mercat — kichik biznes uchun marketing yordamchisi: Telegram kanalini o‘qiydi, reja tuzadi va postlar yozadi. Xizmatni {operator} yuritadi ({city}). Savollar uchun: {contact}.",
      sections: [
        {
          h: "Nimani saqlaymiz",
          p: [
            "Telegram hisobingiz: Telegram ID, ism, foydalanuvchi nomi va til. Bularni Telegram botni yoki ilovani ochganingizda beradi.",
            "Kanalingiz: ommaviy t.me sahifasidagi postlar va raqamlar, Mercat yozgan tahlil, reja va postlar, savollarga bergan javoblaringiz.",
            "Foydalanish: qaysi ekran va tugmalardan foydalanilgani. Bosh sahifaga va «Mercat qanday ishlaydi» sahifasiga kirishlarni o‘z hisoblagichimiz cookie’siz, har kuni yangilanadigan anonim kalit bilan sanaydi. Shu ikki sahifada Google Analytics (reklama signallari o‘chirilgan) va Yandex Metrica (seans yozuvisiz) ham ishlaydi va o‘z analitika cookie’larini qo‘yadi; Studiya, ilova va bot ularni yuklamaydi.",
            "Brauzeringizda Studiya va ilova kirish kalitingiz, brendlaringiz va tilni mahalliy xotirada (localStorage) saqlaydi. Studiyadan tarmoq ulayotganingizda 10 daqiqalik cookie kirishni brauzeringizga bog‘laydi. Reklama cookie’lari yo‘q.",
            "Postlar uchun chizilgan rasmlar (rasm xizmati serverida saqlanadi).",
          ],
        },
        {
          h: "Boshqa tarmoqlarni ulasangiz",
          p: [
            "Instagram, Meta reklama, YouTube yoki Google Ads’ni faqat o‘zingiz, «Ulash» tugmasi orqali ulaysiz. Mercat ular uchun kirish kalitini (token) saqlaydi: u AES-256-GCM bilan shifrlangan, kalit esa ma’lumotlar bazasidan tashqarida turadi.",
            "Har kuni o‘qiladigan raqamlar: ko‘rishlar, qamrov, obunachilar soni, layklar, izohlar soni, ulashishlar, saqlashlar, profil havolasi bosilishi; reklamada xarajat, ko‘rsatishlar, bosishlar, boshlangan yozishmalar, lidlar, xaridlar, konversiyalar; YouTube’da ko‘rishlar, tomosha vaqti, obunachilar. Shuningdek hisob nomi, post izohining birinchi 200 belgisi, video va kampaniya nomlari.",
            "O‘qimaymiz: shaxsiy xabarlar, izohlar matni, obunachilarning kimligi, auditoriya demografiyasi.",
            "Faqat o‘qiymiz: Mercat bu tarmoqlarda hech narsa joylamaydi, o‘zgartirmaydi, o‘chirmaydi va pul sarflamaydi. So‘raladigan ruxsatlar: Instagram — instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement (sahifa biznes portfelda bo‘lsa business_management); Meta reklama — ads_read; YouTube — youtube.readonly va yt-analytics.readonly; Google Ads — adwords (faqat hisobotlarni o‘qish uchun).",
          ],
        },
        {
          h: "Ma’lumotdan qanday foydalanamiz",
          p: [
            "Raqamlaringizni Mercat’da, Telegram kanalingiz yonida ko‘rsatish uchun. Ma’lumot sotilmaydi, reklama beruvchilarga berilmaydi va AI modellarini o‘qitishda ishlatilmaydi.",
            "Tahlil va postlarni yozish uchun kanalingizning ommaviy postlari va javoblaringiz Anthropic (Claude) ga yuboriladi; u ularni biz uchun qayta ishlaydi. Tokenlar hech qachon yuborilmaydi.",
            "Mercat’ning Google API’laridan olingan ma’lumotdan foydalanishi va uni uzatishi [Google API Services User Data Policy]({googleUserData}) talablariga, jumladan Limited Use talablariga mos keladi.",
            "Mercat kanalingiz raqamlarini o‘qish uchun YouTube API Services’dan foydalanadi. YouTube ulansa, siz [YouTube foydalanish shartlari]({youtubeTerms})ga rozilik bildirasiz; Google ma’lumotlarni [Google maxfiylik siyosati]({googlePrivacy}) bo‘yicha qayta ishlaydi. Meta ma’lumotlari [Meta Platform Terms]({metaTerms}) bo‘yicha ishlatiladi.",
          ],
        },
        {
          h: "Kim bilan ishlaymiz",
          p: [
            "Vercel (hosting, Yevropa), Neon (ma’lumotlar bazasi), Anthropic (matn yozuvchi AI), fal.ai va Higgsfield (rasmlar), Telegram (bot va ilova). Ular ma’lumotni faqat Mercat uchun qayta ishlaydi.",
          ],
        },
        {
          h: "Qancha saqlaymiz",
          p: [
            "Ulangan tarmoq raqamlari ulanish turgan paytda har kuni yangilanadi. 30 kun yangilanmagan post, video va kampaniya ma’lumotlari o‘chiriladi; 30 kundan eski YouTube raqamlari ham.",
            "Uzsangiz, token va shu tarmoqdan o‘qilgan barcha raqamlar darhol o‘chiriladi. Kirish tarmoqning o‘zida tugasa (u yerda Mercat’ni o‘chirgan bo‘lsangiz yoki muddati o‘tgan bo‘lsa) va qayta ulamasangiz, Mercat buni keyingi yangilashda sezadi va ulanishni raqamlari bilan o‘chiradi: Google — 7 kun ichida, Meta — 30 kun ichida. Facebook yoki Instagram sozlamalarida Mercat’ni o‘chirsangiz, hammasi darhol o‘chiriladi.",
            "Brend, postlar va Telegram ma’lumotlari o‘chirishni so‘ragunigizcha saqlanadi.",
          ],
        },
        {
          h: "Qanday uzish va o‘chirish mumkin",
          p: [
            "Mercat’da: Studiya yoki ilova → «Boshqa tarmoqlar» → «Uzish».",
            "Tarmoqning o‘zida: Instagram yoki Facebook → Sozlamalar → «Ilovalar va saytlar» (Biznes integratsiyalari) → Mercat’ni o‘chirish; Google → [hisob ruxsatlari]({googlePermissions}). Meta bizga xabar beradi va biz ulanishni avtomatik o‘chiramiz.",
            "Hammasini o‘chirish uchun {contact} ga yozing: 30 kun ichida o‘chiramiz va javob beramiz. Batafsil: [Ma’lumotlarni o‘chirish](/data-deletion).",
          ],
        },
        {
          h: "Xavfsizlik va o‘zgarishlar",
          p: [
            "Hamma aloqa HTTPS orqali. Tokenlar shifrlangan, loglarga yozilmaydi va brauzerga berilmaydi. Ulash faqat kanal egasining Telegram hisobi orqali mumkin.",
            "Mercat biznes egalari uchun; 16 yoshdan kichiklar uchun emas. Matn o‘zgarsa, sana yangilanadi; muhim o‘zgarishlarni botda aytamiz.",
          ],
        },
      ],
    },
    ru: {
      title: "Политика конфиденциальности",
      description: "Какие данные хранит Mercat, что читает из подключённых площадок и как всё удалить.",
      intro:
        "Mercat — помощник по маркетингу для малого бизнеса: читает Telegram-канал, составляет план и пишет посты. Сервисом управляет {operator} ({city}). По вопросам: {contact}.",
      sections: [
        {
          h: "Что мы храним",
          p: [
            "Аккаунт Telegram: ID, имя, username и язык. Их передаёт Telegram, когда вы открываете бота или приложение.",
            "Ваш канал: посты и цифры с публичной страницы t.me, разбор, план и посты, которые написал Mercat, и ваши ответы на вопросы.",
            "Использование: какими экранами и кнопками пользовались. Заходы на главную и на страницу «Как работает Mercat» наш собственный счётчик считает без cookie, по анонимному ключу, который меняется каждый день. На этих двух страницах работают ещё Google Analytics (рекламные сигналы выключены) и Яндекс Метрика (без записи сеансов), они ставят свои аналитические cookie; Студия, приложение и бот их не загружают.",
            "В браузере Студия и приложение хранят ключ входа, ваши бренды и язык в локальном хранилище (localStorage). Пока вы подключаете площадку из Студии, cookie на 10 минут привязывает вход к вашему браузеру. Рекламных cookie нет.",
            "Картинки, нарисованные для постов (хранятся у сервиса картинок).",
          ],
        },
        {
          h: "Если вы подключаете другие площадки",
          p: [
            "Instagram, рекламу Meta, YouTube или Google Ads подключаете только вы сами, кнопкой «Подключить». Mercat хранит для них ключ доступа (токен): он зашифрован AES-256-GCM, а ключ шифрования хранится вне базы данных.",
            "Цифры, которые читаем каждый день: просмотры, охват, число подписчиков, лайки, число комментариев, репосты, сохранения, нажатия на ссылку в профиле; в рекламе — расход, показы, клики, начатые переписки, лиды, покупки, конверсии; в YouTube — просмотры, время просмотра, подписчики. А также название аккаунта, первые 200 символов подписи к посту, названия видео и кампаний.",
            "Не читаем: личные сообщения, текст комментариев, кто ваши подписчики, демографию аудитории.",
            "Только чтение: Mercat ничего не публикует, не меняет, не удаляет и не тратит на этих площадках. Запрашиваемые разрешения: Instagram — instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement (и business_management, если страница в бизнес-портфолио); реклама Meta — ads_read; YouTube — youtube.readonly и yt-analytics.readonly; Google Ads — adwords (только для чтения отчётов).",
          ],
        },
        {
          h: "Как мы используем данные",
          p: [
            "Чтобы показать вам ваши цифры в Mercat, рядом с Telegram-каналом. Данные не продаются, не передаются рекламодателям и не используются для обучения AI-моделей.",
            "Чтобы написать разбор и посты, публичные посты канала и ваши ответы отправляются в Anthropic (Claude), который обрабатывает их для нас. Токены не отправляются никогда.",
            "Использование и передача Mercat данных, полученных из Google API, соответствует [Google API Services User Data Policy]({googleUserData}), включая требования Limited Use.",
            "Mercat использует YouTube API Services, чтобы читать цифры вашего канала. Подключая YouTube, вы соглашаетесь с [Условиями использования YouTube]({youtubeTerms}); Google обрабатывает данные по своей [Политике конфиденциальности]({googlePrivacy}). Данные Meta используются по [Meta Platform Terms]({metaTerms}).",
          ],
        },
        {
          h: "С кем мы работаем",
          p: [
            "Vercel (хостинг, Европа), Neon (база данных), Anthropic (AI, который пишет тексты), fal.ai и Higgsfield (картинки), Telegram (бот и приложение). Они обрабатывают данные только для Mercat.",
          ],
        },
        {
          h: "Сколько храним",
          p: [
            "Цифры подключённых площадок обновляются каждый день, пока подключение действует. Данные о постах, видео и кампаниях, которые не обновлялись 30 дней, удаляются; цифры YouTube старше 30 дней — тоже.",
            "Если вы отключите площадку, токен и все прочитанные с неё цифры сразу удаляются. Если доступ закончился на самой площадке (вы удалили там Mercat или срок доступа истёк) и вы не подключили её снова, Mercat заметит это при следующем обновлении и удалит подключение и его цифры: Google — в течение 7 дней, Meta — в течение 30 дней. Если удалить Mercat в настройках Facebook или Instagram, всё удаляется сразу.",
            "Бренд, посты и данные Telegram хранятся, пока вы не попросите их удалить.",
          ],
        },
        {
          h: "Как отключить и удалить",
          p: [
            "В Mercat: Студия или приложение → «Другие площадки» → «Отключить».",
            "На самой площадке: Instagram или Facebook → Настройки → «Приложения и сайты» (Бизнес-интеграции) → удалить Mercat; Google → [разрешения аккаунта]({googlePermissions}). Meta сообщит нам, и мы удалим подключение автоматически.",
            "Чтобы удалить всё, напишите {contact}: удалим в течение 30 дней и ответим. Подробнее: [Удаление данных](/data-deletion?lang=ru).",
          ],
        },
        {
          h: "Безопасность и изменения",
          p: [
            "Всё соединение — по HTTPS. Токены зашифрованы, не пишутся в логи и не отдаются в браузер. Подключить площадку можно только из Telegram-аккаунта владельца канала.",
            "Mercat предназначен для владельцев бизнеса, не для детей младше 16 лет. Если текст изменится, обновим дату; о важных изменениях скажем в боте.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy policy",
      description: "What Mercat stores, what it reads from connected platforms, and how to delete it all.",
      intro:
        "Mercat is a marketing helper for small businesses: it reads a Telegram channel, makes a plan and writes posts. The service is run by {operator} ({city}). Questions: {contact}.",
      sections: [
        {
          h: "What we store",
          p: [
            "Your Telegram account: Telegram ID, name, username and language, which Telegram passes on when you open the bot or the Mini App.",
            "Your channel: the posts and numbers on its public t.me page, the analysis, plans and posts Mercat writes, and your answers to its questions.",
            "Usage: which screens and buttons were used. Our own counter counts visits to the home page and to “How Mercat works” without cookies, with an anonymous key that changes every day. Those two pages also run Google Analytics (ad signals off) and Yandex Metrica (no session recording), which set their own analytics cookies; the Studio, the Mini App and the bot never load them.",
            "In your browser, the Studio and the Mini App keep your sign-in key, your brands and your language in local storage. While you connect a platform from the Studio, a cookie that lasts 10 minutes ties the sign-in to your browser. Mercat sets no advertising cookies.",
            "Pictures made for posts (kept by the image service).",
          ],
        },
        {
          h: "If you connect other platforms",
          p: [
            "Only you connect Instagram, Meta ads, YouTube or Google Ads, with the Connect button. Mercat keeps an access token for each: it is encrypted with AES-256-GCM, and the encryption key is kept outside the database.",
            "The numbers read each day: views, reach, follower count, likes, comment counts, shares, saves and profile link taps; for ads: spend, impressions, clicks, messages started, leads, purchases and conversions; for YouTube: views, watch time and subscribers. Also the account name, the first 200 characters of a post's caption, and video and campaign names.",
            "We do not read private messages, the text of comments, who your followers are, or audience demographics.",
            "Read-only: Mercat never posts, edits, deletes or spends anything on these platforms. Permissions asked: Instagram — instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement (plus business_management when the Page is in a business portfolio); Meta ads — ads_read; YouTube — youtube.readonly and yt-analytics.readonly; Google Ads — adwords (used only to read reports).",
          ],
        },
        {
          h: "How we use it",
          p: [
            "To show you your numbers in Mercat, next to your Telegram channel. The data is not sold, not shared with advertisers, and not used to train AI models.",
            "To write analyses and posts, your channel's public posts and your answers are sent to Anthropic (Claude), which processes them for us. Tokens are never sent.",
            "Mercat's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy]({googleUserData}), including the Limited Use requirements.",
            "Mercat uses YouTube API Services to read your channel's numbers. By connecting YouTube you agree to the [YouTube Terms of Service]({youtubeTerms}); Google processes data under the [Google Privacy Policy]({googlePrivacy}). Meta data is used under the [Meta Platform Terms]({metaTerms}).",
          ],
        },
        {
          h: "Who processes it for us",
          p: [
            "Vercel (hosting, in Europe), Neon (database), Anthropic (the AI that writes texts), fal.ai and Higgsfield (pictures), and Telegram (the bot and the Mini App). They process data only for Mercat.",
          ],
        },
        {
          h: "How long we keep it",
          p: [
            "Numbers from connected platforms are refreshed every day while the connection is on. Post, video and campaign details not refreshed for 30 days are deleted, and so are YouTube numbers older than 30 days.",
            "When you disconnect, the token and every number read through it are deleted at once. If access ends at the platform (you removed Mercat there, or the access ran out) and you do not connect again, Mercat notices at the next update and deletes the connection and its numbers: Google within 7 days, Meta within 30 days. Removing Mercat in Facebook or Instagram settings deletes them at once.",
            "Your brand, posts and Telegram details are kept until you ask us to delete them.",
          ],
        },
        {
          h: "How to disconnect and delete",
          p: [
            "In Mercat: the Studio or the Mini App → Other platforms → Disconnect.",
            "At the platform: Instagram or Facebook → Settings → Apps and websites (Business integrations) → remove Mercat; Google → [your account's permissions]({googlePermissions}). Meta tells us, and we delete the connection automatically.",
            "To delete everything, write to {contact}: we delete it within 30 days and reply when it is done. More: [Data deletion](/data-deletion?lang=en).",
          ],
        },
        {
          h: "Security and changes",
          p: [
            "Every connection uses HTTPS. Tokens are encrypted, never written to logs and never sent to the browser. Only the channel owner's Telegram account can connect a platform.",
            "Mercat is for business owners, not for children under 16. If this text changes, the date above changes; we announce important changes in the bot.",
          ],
        },
      ],
    },
  },

  terms: {
    uz: {
      title: "Foydalanish shartlari",
      description: "Mercat’dan foydalanish shartlari.",
      intro: "Mercat’dan foydalanib, siz quyidagi shartlarga rozilik bildirasiz. Xizmatni {operator} yuritadi ({city}). Aloqa: {contact}.",
      sections: [
        { h: "Mercat nima", p: ["Mercat Telegram kanalingizni o‘qiydi, nimani yaxshilash mumkinligini ko‘rsatadi, haftalik reja tuzadi va postlar yozadi. Ulangan boshqa tarmoqlardan raqamlarni faqat o‘qiydi."] },
        {
          h: "Siz va kanalingiz",
          p: [
            "Siz o‘zingiz ulagan kanal va hisoblarning egasi yoki ularni boshqarish huquqiga ega bo‘lishingiz kerak.",
            "Har bir post siz tasdiqlagandan keyingina chiqadi. Joylangan matn uchun siz javobgarsiz: narx, manzil va faktlarni tekshiring — Mercat xato qilishi mumkin.",
          ],
        },
        {
          h: "Ulangan tarmoqlar",
          p: [
            "Instagram, Meta reklama, YouTube va Google Ads’dan Mercat faqat raqamlarni o‘qiydi: hech narsa joylamaydi, o‘zgartirmaydi va pul sarflamaydi. Istalgan payt uzishingiz mumkin.",
            "YouTube’ni ulab, [YouTube foydalanish shartlari]({youtubeTerms})ga rozilik bildirasiz. Meta va Google’ning o‘z shartlari ham amal qiladi.",
          ],
        },
        {
          h: "Taqiqlangan",
          p: ["Spam, qonunga zid tovar va xizmatlar reklamasi, aldovchi va’dalar, boshqa birovning kanali yoki hisobidan ruxsatsiz foydalanish, xizmatni buzishga urinish."],
        },
        {
          h: "Cheklovlar",
          p: [
            "Ba’zi imkoniyatlarning kunlik limiti bor. Pullik tarif bo‘lsa, narx to‘lovdan oldin ko‘rsatiladi.",
            "Xizmat «boricha» beriladi: uzilishlar bo‘lishi mumkin, raqamlar tarmoqlarning o‘zidan keladi. Bilvosita zararlar uchun javob bermaymiz.",
          ],
        },
        {
          h: "To‘xtatish",
          p: [
            "Istalgan payt foydalanishni to‘xtatib, ma’lumotlarni o‘chirishni so‘rashingiz mumkin ([Ma’lumotlarni o‘chirish](/data-deletion)). Shartlar buzilsa, kirishni to‘xtatishimiz mumkin.",
            "Shartlar O‘zbekiston Respublikasi qonunlariga bo‘ysunadi. Ma’lumotlar haqida: [Maxfiylik siyosati](/privacy).",
          ],
        },
      ],
    },
    ru: {
      title: "Условия использования",
      description: "Условия использования Mercat.",
      intro: "Пользуясь Mercat, вы соглашаетесь с этими условиями. Сервисом управляет {operator} ({city}). Связь: {contact}.",
      sections: [
        { h: "Что такое Mercat", p: ["Mercat читает ваш Telegram-канал, показывает, что можно улучшить, составляет план на неделю и пишет посты. С подключённых площадок только читает цифры."] },
        {
          h: "Вы и ваш канал",
          p: [
            "Вы должны быть владельцем или иметь право управлять каналом и аккаунтами, которые подключаете.",
            "Каждый пост выходит только после вашего подтверждения. За опубликованный текст отвечаете вы: проверяйте цены, адреса и факты — Mercat может ошибаться.",
          ],
        },
        {
          h: "Подключённые площадки",
          p: [
            "С Instagram, рекламы Meta, YouTube и Google Ads Mercat только читает цифры: ничего не публикует, не меняет и не тратит. Отключить можно в любой момент.",
            "Подключая YouTube, вы соглашаетесь с [Условиями использования YouTube]({youtubeTerms}). Действуют и собственные условия Meta и Google.",
          ],
        },
        {
          h: "Запрещено",
          p: ["Спам, реклама незаконных товаров и услуг, вводящие в заблуждение обещания, использование чужого канала или аккаунта без разрешения, попытки взломать сервис."],
        },
        {
          h: "Ограничения",
          p: [
            "У некоторых функций есть дневные лимиты. Если появится платный тариф, цена будет показана до оплаты.",
            "Сервис предоставляется «как есть»: возможны перерывы, цифры приходят от самих площадок. За косвенные убытки мы не отвечаем.",
          ],
        },
        {
          h: "Прекращение",
          p: [
            "Вы можете перестать пользоваться сервисом в любой момент и попросить удалить данные ([Удаление данных](/data-deletion?lang=ru)). При нарушении условий мы можем закрыть доступ.",
            "Условия регулируются законодательством Республики Узбекистан. О данных: [Политика конфиденциальности](/privacy?lang=ru).",
          ],
        },
      ],
    },
    en: {
      title: "Terms of use",
      description: "The terms for using Mercat.",
      intro: "By using Mercat you agree to these terms. The service is run by {operator} ({city}). Contact: {contact}.",
      sections: [
        { h: "What Mercat is", p: ["Mercat reads your Telegram channel, shows what could be better, makes a weekly plan and writes posts. From other platforms you connect, it only reads numbers."] },
        {
          h: "You and your channel",
          p: [
            "You must own, or have the right to manage, the channel and the accounts you connect.",
            "Every post goes out only after you approve it. You are responsible for what is published: check prices, addresses and facts, because Mercat can make mistakes.",
          ],
        },
        {
          h: "Connected platforms",
          p: [
            "From Instagram, Meta ads, YouTube and Google Ads, Mercat only reads numbers: it never posts, changes anything or spends money. You can disconnect at any time.",
            "By connecting YouTube you agree to the [YouTube Terms of Service]({youtubeTerms}). Meta's and Google's own terms also apply.",
          ],
        },
        {
          h: "Not allowed",
          p: ["Spam, ads for illegal goods or services, misleading promises, using someone else's channel or account without permission, and attempts to break the service."],
        },
        {
          h: "Limits",
          p: [
            "Some features have daily limits. If a paid plan appears, its price is shown before you pay.",
            "The service is provided as is: there may be interruptions, and the numbers come from the platforms themselves. We are not liable for indirect losses.",
          ],
        },
        {
          h: "Ending",
          p: [
            "You can stop using Mercat at any time and ask us to delete your data ([Data deletion](/data-deletion?lang=en)). We may close access if these terms are broken.",
            "These terms are governed by the laws of the Republic of Uzbekistan. About data: [Privacy policy](/privacy?lang=en).",
          ],
        },
      ],
    },
  },

  deletion: {
    uz: {
      title: "Ma’lumotlarni o‘chirish",
      description: "Mercat’dagi ma’lumotlaringizni qanday o‘chirish mumkin.",
      intro: "Ma’lumotlaringizni istalgan payt o‘chirishingiz mumkin. Uch yo‘l bor.",
      sections: [
        {
          h: "1. Bitta tarmoqni uzish",
          p: ["Studiya yoki ilovada «Boshqa tarmoqlar» → «Uzish». Token va shu tarmoqdan o‘qilgan barcha raqamlar darhol o‘chiriladi."],
        },
        {
          h: "2. Tarmoqning o‘zida Mercat’ni o‘chirish",
          p: [
            "Instagram yoki Facebook: Sozlamalar → «Ilovalar va saytlar» (Biznes integratsiyalari) → Mercat → o‘chirish. Meta bizga xabar beradi va biz Instagram hamda Meta reklama ulanishlarini avtomatik o‘chiramiz.",
            "Google (YouTube, Google Ads): [hisob ruxsatlari]({googlePermissions}) → Mercat → kirishni olib tashlash. Mercat buni keyingi yangilashda sezadi va ulanishni raqamlari bilan 7 kun ichida o‘chiradi.",
          ],
        },
        {
          h: "3. Hammasini o‘chirish",
          p: ["Brend, postlar, javoblar va Telegram ma’lumotlarini o‘chirish uchun {contact} ga «ma’lumotlarimni o‘chiring» deb yozing. 30 kun ichida o‘chiramiz va javob beramiz."],
        },
      ],
    },
    ru: {
      title: "Удаление данных",
      description: "Как удалить свои данные из Mercat.",
      intro: "Удалить свои данные можно в любой момент. Есть три способа.",
      sections: [
        {
          h: "1. Отключить одну площадку",
          p: ["В Студии или приложении: «Другие площадки» → «Отключить». Токен и все прочитанные с площадки цифры удаляются сразу."],
        },
        {
          h: "2. Удалить Mercat на самой площадке",
          p: [
            "Instagram или Facebook: Настройки → «Приложения и сайты» (Бизнес-интеграции) → Mercat → удалить. Meta сообщит нам, и мы автоматически удалим подключения Instagram и рекламы Meta.",
            "Google (YouTube, Google Ads): [разрешения аккаунта]({googlePermissions}) → Mercat → закрыть доступ. Mercat заметит это при следующем обновлении и удалит подключение и его цифры в течение 7 дней.",
          ],
        },
        {
          h: "3. Удалить всё",
          p: ["Чтобы удалить бренд, посты, ответы и данные Telegram, напишите {contact} «удалите мои данные». Удалим в течение 30 дней и ответим."],
        },
      ],
    },
    en: {
      title: "Data deletion",
      description: "How to delete your data from Mercat.",
      intro: "You can delete your data at any time. There are three ways.",
      sections: [
        {
          h: "1. Disconnect one platform",
          p: ["In the Studio or the Mini App: Other platforms → Disconnect. The token and every number read through it are deleted at once."],
        },
        {
          h: "2. Remove Mercat at the platform",
          p: [
            "Instagram or Facebook: Settings → Apps and websites (Business integrations) → Mercat → Remove. Meta tells us, and we delete the Instagram and Meta ads connections automatically.",
            "Google (YouTube, Google Ads): [your account's permissions]({googlePermissions}) → Mercat → Remove access. Mercat notices at the next update and deletes the connection and its numbers within 7 days.",
          ],
        },
        {
          h: "3. Delete everything",
          p: ["To delete your brand, posts, answers and Telegram details, write \"delete my data\" to {contact}. We delete it within 30 days and reply when it is done."],
        },
      ],
    },
  },
};

/** The status line for a Meta data-deletion request (/data-deletion?code=…). */
export const DELETION_STATUS: Record<LegalLang, string> = {
  uz: "So‘rov {code}: Instagram va Meta reklama ulanishlari hamda ular orqali o‘qilgan raqamlar o‘chirildi.",
  ru: "Запрос {code}: подключения Instagram и рекламы Meta и все прочитанные через них цифры удалены.",
  en: "Request {code}: the Instagram and Meta ads connections and every number read through them were deleted.",
};

/** A code Mercat did not issue (or a cut-off link): nothing is confirmed. */
export const DELETION_UNKNOWN: Record<LegalLang, string> = {
  uz: "So‘rov {code} topilmadi. Havola to‘liq ochilganini tekshiring.",
  ru: "Запрос {code} не найден. Проверьте, что ссылка открыта целиком.",
  en: "Request {code} was not found. Check that the whole link was opened.",
};

export const LINKS: Record<string, string> = {
  googlePermissions: GOOGLE_PERMISSIONS,
  googlePrivacy: GOOGLE_PRIVACY,
  youtubeTerms: YOUTUBE_TERMS,
  googleUserData: GOOGLE_USER_DATA,
  metaTerms: META_TERMS,
};
