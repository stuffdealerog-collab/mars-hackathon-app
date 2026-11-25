# Connectors: owner setup

Mercat can read numbers from the owner's Instagram, Meta ads, YouTube and Google Ads. It only reads: no posting,
no ad changes, no spending. Everything stays off until the variables below are set in Vercel, and while an app is
in test mode only the Telegram ids in `CONNECTOR_TESTERS` see it.

Below: what to do in each developer console, the exact redirect URIs, the Vercel variables (names only) and how long
each review takes. Start the reviews early: they take calendar time, not work.

Replace `https://<host>` with the production address (today `https://mercat-ai.vercel.app`). A custom domain
(for example `mercat.uz`) is better for Google's brand verification; if you switch, update `PUBLIC_URL` and every
redirect URI below.

## 0. Before any console

1. **Legal entity and contact email.** Meta's Business Verification needs the registered name (YaTT or MChJ),
   address and a document. Put the name and a support email into `src/app/(legal)/operator.ts` (`entity`,
   `email`) and deploy. Until then the pages name "the Mercat team" and the bot.
2. **Check the legal pages are live** (both reviews open them):
   - `https://<host>/privacy` (Uzbek; `?lang=ru`, `?lang=en`)
   - `https://<host>/terms`
   - `https://<host>/data-deletion`
3. **The token key.** Generate it on your own computer and paste it straight into Vercel, never into a chat:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` → Vercel → Project → Settings →
   Environment Variables → `CONNECTOR_TOKEN_KEY`, **Production only**. Losing or changing it means every owner
   reconnects. To rotate: move the old value to `CONNECTOR_TOKEN_KEY_PREV`, set a new `CONNECTOR_TOKEN_KEY`.
4. **Testers.** `CONNECTOR_TESTERS` = comma-separated Telegram user ids (yours and the pilot clients'). The same
   people must also be testers in the Meta app and test users in Google (below).

## 1. Meta: one app for Instagram and Meta ads

Both connect through **Facebook Login for Business**, each with its own configuration. Instagram must be a
professional (business or creator) account linked to a Facebook Page.

1. **business.facebook.com** → create a business portfolio under the legal entity.
2. **developers.facebook.com** → My Apps → Create app → type **Business**, linked to that portfolio.
3. **App settings → Basic**
   - App domains: `<host>` (without https://)
   - Privacy Policy URL: `https://<host>/privacy`
   - Terms of Service URL: `https://<host>/terms`
   - User data deletion → Data deletion callback URL: `https://<host>/api/connect/meta/data-deletion`
   - App icon 1024×1024, category, contact email
   - Copy **App ID** → Vercel `META_APP_ID`, **App Secret** → `META_APP_SECRET` (Production only)
4. **Add product: Facebook Login for Business** → Settings
   - Valid OAuth Redirect URIs (both):
     - `https://<host>/api/connect/callback/instagram`
     - `https://<host>/api/connect/callback/meta_ads`
   - Deauthorize callback URL: `https://<host>/api/connect/meta/deauthorize`
   - Data deletion request URL: `https://<host>/api/connect/meta/data-deletion`
   - Strict Mode for redirect URIs: on
5. **Facebook Login for Business → Configurations → Create configuration** (twice):
   - **"Mercat Instagram"**: token type *User access token*; assets *Pages* and *Instagram accounts*;
     permissions `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`
     (add `business_management` if the owners' Pages sit in a business portfolio). Copy its Configuration ID →
     Vercel `META_IG_CONFIG_ID`.
   - **"Mercat ads"**: token type *User access token*; assets *Ad accounts*; permission `ads_read`. Copy its
     Configuration ID → `META_ADS_CONFIG_ID`.
6. **App settings → Advanced**: turn on **Require App Secret** (Mercat signs every call with `appsecret_proof`).
7. **Add product: Marketing API** (the Limited tier comes automatically).
8. **App roles → Roles**: add yourself and the pilot clients as **Testers** (Facebook accounts). Each accepts on
   developers.facebook.com (it needs a free Meta developer registration).
9. **Security Center → Business verification**: legal name, address, registration document, website, phone.
   Third-party reports say up to ~14 business days; Meta publishes no figure.
10. **App Review** (after at least one successful call with each permission, i.e. after a tester connected):
    request **Advanced Access** for `instagram_basic`, `instagram_manage_insights`, `pages_show_list`,
    `pages_read_engagement`, `ads_read` (and `business_management` if used). Each needs a screencast: the
    Connect button in Mercat → Meta's dialog → back in Mercat → the Connections card with numbers → Disconnect.
    Reviewers cannot log in with Telegram: give them a Studio link from a demo Telegram account (the bot's
    "open on computer" link carries a 7-day key; mint a fresh one right before submitting) and step-by-step
    notes. Meta publishes no review time.
11. After approval: switch the app to **Live**, then set Vercel `CONNECTOR_LIVE` to include `instagram,meta_ads`
    so every owner (not only testers) sees them.

Notes:
- A Meta user token lasts about 60 days and data access about 90; Mercat cannot renew it on the server. The card
  shows "connect again in N days" in the last 10 days, and the bot tells the owner once when it ends.
- If an owner removes Mercat in Facebook/Instagram settings, Meta calls the deauthorize URL and Mercat deletes
  the connection and its numbers.

## 2. Google: one Cloud project for YouTube and Google Ads

1. **console.cloud.google.com** → New project.
2. **APIs & Services → Library**: enable **YouTube Data API v3**, **YouTube Analytics API**, **Google Ads API**.
3. **Google Auth Platform → Branding**: app name "Mercat", support email, 120×120 logo, home page
   `https://<host>`, privacy policy `https://<host>/privacy`, terms `https://<host>/terms`, authorized domain
   `<host>` (a custom domain is advised: Google may not accept `*.vercel.app` for brand verification), developer
   contact email.
4. **Audience**: User type **External**. While in *Testing*, add yourself and the pilots' Gmail accounts as test
   users (up to 100).
5. **Data access**: add scopes `openid`, `https://www.googleapis.com/auth/youtube.readonly`,
   `https://www.googleapis.com/auth/yt-analytics.readonly`, `https://www.googleapis.com/auth/adwords`.
6. **Clients → Create client → Web application**
   - Authorized redirect URIs:
     - `https://<host>/api/connect/callback/youtube`
     - `https://<host>/api/connect/callback/google_ads`
     - (for local testing only) `http://localhost:3000/api/connect/callback/youtube` and `…/google_ads`
   - Copy Client ID → Vercel `GOOGLE_OAUTH_CLIENT_ID`, Client secret → `GOOGLE_OAUTH_CLIENT_SECRET`
     (Production only).
7. **Publishing status → In production**, early. In *Testing* the refresh tokens die after 7 days and every
   owner would have to reconnect weekly. In production, unverified: owners see a "Google hasn't verified this
   app" warning and there is a 100-user cap, but tokens stop expiring.
8. **Domain ownership**: verify `<host>` in Google Search Console (Settings → Ownership verification; the HTML tag
   method needs a `<meta name="google-site-verification">` in the site's head: ask the lead to add
   `verification: { google: … }` to `src/app/layout.tsx` metadata, it is not part of this change).
9. **Verify branding** (minutes), then **submit verification** for the sensitive scopes: an unlisted YouTube
   video of the consent screen and the card using the data, plus one sentence per scope on why it is needed.
   Google says verification "may take several months". Until then: the warning screen and the 100-user cap.
10. **Google Ads API access** (Cloud Console → Google Ads API → Overview). Per Google's September 2026 onboarding
    change (checked 2026-11-25), access levels belong to the Cloud project and no developer token or manager
    account is needed:
    - *Test* access comes when the API is enabled: test accounts only.
    - Apply for **Explorer** (automated "in most cases", 2,880 operations/day on real accounts): enough for
      read-only reports.
    - **Basic** follows minutes after brand verification.
    - Until real-account access is granted, Mercat shows the owner "waiting for Google access" (it maps
      `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`).
    - If your console still asks for a developer token (an older setup), put it in `GOOGLE_ADS_DEVELOPER_TOKEN`;
      Mercat sends it only when set.
11. **YouTube quota**: the default 10,000 units/day is plenty (about 3 units per channel per day). No audit needed.
12. After verification: set `CONNECTOR_LIVE` to include `youtube` (and `google_ads` once it has real-account
    access).

## 3. Vercel variables (names only; all Production only)

| Variable | What | Required |
|---|---|---|
| `CONNECTOR_TOKEN_KEY` | base64 of 32 random bytes, encrypts tokens | yes |
| `CONNECTOR_TOKEN_KEY_PREV` | the previous key during a rotation | no |
| `CONNECTOR_TESTERS` | Telegram ids who see test-mode connectors | for test mode |
| `CONNECTOR_LIVE` | providers whose app review is done, e.g. `instagram,meta_ads` | after review |
| `CONNECTOR_ENABLED` | optional allowlist / kill switch: `instagram,youtube`, or `none` | no |
| `META_APP_ID`, `META_APP_SECRET` | Meta app | for Instagram / Meta ads |
| `META_IG_CONFIG_ID` | Facebook Login for Business configuration (Instagram) | for Instagram |
| `META_ADS_CONFIG_ID` | Facebook Login for Business configuration (ads_read) | for Meta ads |
| `META_GRAPH_VERSION` | default `v27.0` | no |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Web client | for YouTube / Google Ads |
| `GOOGLE_ADS_API_VERSION` | default `v26` | no |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | only for older Google Ads setups | no |
| `PUBLIC_URL` | the production address; redirect URIs are built from it | already set |

Connectors never run on Vercel **preview** deployments: previews share the production database and the redirect
URIs are registered for production only. After changing variables, redeploy.

## 4. How long things take

| Step | Time |
|---|---|
| Meta app, configurations, testers | an hour |
| Meta Business Verification | up to ~14 business days (third-party figure) |
| Meta App Review (Advanced Access) | no published time; reports range from days to weeks |
| Google project, client, test users | an hour |
| Google brand verification | minutes, after the domain is verified |
| Google sensitive-scope verification | "may take several months" (Google) |
| Google Ads Explorer access | automated in most cases |

Test mode works right away for the people you added as testers, so the demo does not wait for any review.

## 5. Check it works (one tester per platform)

1. Open the Studio from the bot on a computer (or the Mini App) for your own brand.
2. The "Other platforms" card shows the four platforms with a "test mode" badge.
3. Connect → the provider's page → back in Mercat: "Instagram is connected", and the bot says the same.
4. Within a few minutes the card shows 7-day numbers; "Refresh" pulls them again.
5. Disconnect → the row goes back to "Connect"; the numbers are deleted.
6. Repeat from the Mini App on a phone (the sign-in opens in the phone's browser; "Open in Telegram" brings you
   back).

The card is not mounted in the Studio or the Mini App by this change: see the PR's integration notes.
