# TODO — Seabound Sessions (Laravel)

Forward-looking backlog. Completed work is recorded in `docs/history/` and the `SITREP.md` roadmap, not here.

## Sailable-days ranking (follow-ups)
- [ ] **Prod data on partial data** — the admin "Fetch all weather" only populated a few spots (suspected Cloud queue-worker timeout on the batched `FetchAllWeatherJob`). Run a full **synchronous** `php artisan weather:fetch` on Cloud; if it still fails per-spot, capture the `✓/✗` output and either chunk the button into per-spot queued jobs or lengthen the worker timeout. **This re-fetch is now also what corrects the climate averages** — the partial-month fix is self-healing but only applies on the next fetch, so until it runs, prod charts keep the inflated figures.
- [ ] **Unpublish the `test` dummy spot guide** — it tops every month's ranking in the data.
- [ ] **Optional: water-temp signal** — the air-temp note + opt-in min-temp filter shipped (#42), but they use *air* temp (`climate.avgTemp`). Water temp is arguably more relevant to wetsuit choice; would need a new fetched field (Open-Meteo has sea-surface temp for coastal points) + storage. Bigger than the air-temp version.
- [ ] **Optional: rainfall / storm signal** — raised in the 2026-09-29 feedback round (e.g. is Le Morne's May a wet month? Karpathos's Jan/Feb reads as "reasonable wind" but is stormy). We don't fetch it today: `WeatherFetcher` asks Open-Meteo's archive only for `temperature_2m,wind_speed_10m,wind_gusts_10m`. The same endpoint also serves hourly `precipitation` / `rain` / `weather_code` (and daily `precipitation_sum` / `precipitation_hours`), so it's one param + a column on `weather_records` (e.g. typical rainy days or mm per month) + a backfill fetch. Show it alongside the temp note on cards / on the spot-guide charts; keep it out of the wind ranking, same rule as temperature.
- [ ] **Optional: chart grouping in the URL** — the "Compare by spot / country / continent" control on the weather charts is local state (it changes how the charts read, not which spots match). Add a `chart=` param to `destinationFilters.ts` if shared links should carry it.
- [ ] **Optional: sustained/gust UI toggle** — both daily columns are stored; a filter-bar toggle could expose sustained-only vs the blend.
- [ ] **Climate charts: `mph_*`/`kph_*` are double-rounded.** `WeatherFetcher` stores them as pre-rounded integers and `DestinationController` then averages and rounds those integers again, so the mph/kph curves do not exactly equal the kts curve converted. The clean fix is to drop the four derived columns and convert client-side from kts (`ktsToUnit()` already exists) — a schema change plus a frontend change, deliberately kept out of the partial-months correctness fix.
- [ ] **Concurrent fetches for one spot can now collide.** Climate rows are replaced (delete-then-insert) rather than upserted, so two overlapping `fetchForSpot` calls for the same spot (e.g. the auto-on-create job racing the dashboard "Fetch all") can have the second transaction delete zero rows and then violate `unique(spot_guide_id, year, month)`. It rolls back, so no data loss, and it is unlikely with a single supervised worker — but the old `updateOrCreate` was idempotent here. An `upsert()` plus a "delete rows not in this set" pass would restore that.
- [ ] **Expect 2 rows, not 3, for the just-elapsed month during the first few days of a new month.** Open-Meteo's archive lags real time by several days, so a month that has just ended fails the day-count completeness gate until the archive catches up. Every stored row is still a complete month and equal weighting stays valid — this is only a note so nobody chases it as a bug when a verification script reports that month as "odd".

## Performance
- [ ] **Pre-existing N+1 on Spatie media URLs — every image on every page.** `MediaLibrary::getUrl()` / `getThumbnailUrl()` call Spatie's `getFirstMediaUrl()`, which lazily resolves that model's own `media` morph relation once per `MediaLibrary` instance. It is not covered by `MediaLibrary::$with`, so a page issues one extra query per image — a destinations grid of twelve cards does twelve. Surfaced (not caused) by the photographer-credit query-count guard in `tests/Feature/PhotographerQueryCountTest.php`, which had to narrow its assertion to the `photographers` table because a whole-request equality assertion can never pass while this exists. Likely fix: add `'media'` to `MediaLibrary::$with` alongside `'photographer'`, then widen that test back to total query count. Verify against real Postgres and check the Filament admin lists don't regress on memory.

## Content curation (from the featured/content brainstorm — A #25, B #26, C #27; all shipped)
- [ ] Optional: a test locking the list-block empty/all-draft-picks contract (resolved `[]` → renders nothing) — the homepage's default state now relies on that guard (safe by construction today). From #26 review.
- [ ] Optional: cache the list-block picker `->options()` query (`Blog`/`SpotGuide` title lists) if the content library grows large — currently re-queried per admin form render. From #26 review.
- [ ] Optional: a light DOM test of the quick-nav active-on-scroll math (`SpotGuideNav`) — the section-derivation helper is unit-tested, but the scroll→active mapping is inspection-only (the headless preview dispatches no scroll/IO events). From #27 review. Deep-linking to `#section` on load is also a possible follow-up.

## Testing sweep
Public controllers all covered. Remaining:
- [ ] Helpers/logic units — weather-data transforms, `LiveWeatherController` caching (external HTTP + response cache)
- [ ] `Api\WeatherDataController` (index + show)
- [ ] Filament resources — smoke tests (lowest priority)
- [ ] **Photographer credit-badge suppression (`showCredit={false}` on map pins, circular avatars, small thumbnails) is behaviour-only, untested.** The suppression lives entirely inside `CoverImage.tsx` (`const credit = !isString && showCredit ? image.credit : null`) — a plain JSX/React conditional, not extractable into the already-tested pure helper (`resolveCredit()` in `resources/js/Helpers/imageCredit.ts`). This project's Vitest setup is `environment: 'node'` with no jsdom or `@testing-library/react` installed (deliberately — see `docs/history/2026-08-06-photographer-attribution.md`), so there is no way to render `CoverImage` and assert the badge is absent. A regression that dropped `showCredit={false}` from any of the 9 gated call sites would pass every existing test. Closing this needs the React component-testing setup (jsdom + Testing Library) added first.

## Tooling
- [ ] CI pipeline (GitHub Actions) running `php artisan test` on every PR — **against PostgreSQL** (the suite runs on SQLite locally for speed; a Postgres CI job closes the dev/prod engine-parity gap and would have caught the Vite-dependent-suite fragility immediately). Also run the JS suite (`npm run test:js`, Vitest — added #24) and a Linux `npm run build`.
- [ ] Add `.nvmrc` pinning Node 22 so the correct version is auto-selected
- [ ] Set up husky + lint-staged + eslint-plugin-jsdoc pre-commit enforcement (JSDoc-on-every-function rule)
- [ ] Case-sensitivity guard for `@/…` imports — macOS resolves mismatched-case paths (e.g. `@/helpers` → tracked `@/Helpers`) but the case-sensitive Linux/Cloud build fails with `vite:load-fallback ENOENT` (bit us on the first deploy, fixed in #18). Add `eslint-plugin-import` case-sensitive resolution, or a Linux CI `npm run build`, so it fails locally not on deploy.

## Dev tooling — pull production DB (follow-ups)
`db:pull-from-production` shipped (#31, DB-only). Remaining:
- [ ] `--with-media` flag: sync the R2 media objects down to local disk so pulled prod images render locally (needs read-only R2 access key/secret). Today pulled rows reference R2 paths absent locally, so those images 404 in local dev.
- [ ] Optional: upgrade the local Postgres *server* from 16 → 17 to match prod, which silences the benign `SET transaction_timeout` notice pg_restore emits when a PG17 dump lands on a PG16 server (data restores fine regardless).

## Authoring UX
- [ ] **Draft / live preview (Pages & Blogs + unsaved edits)** — logged-in preview of unpublished **Spot Guides** shipped for the owner/author (2026-07-13, contributor workflow — a Filament "Preview" action + owner/author-gated `@show` + banner). Still to do: the same for **Pages / Blogs**, and previewing *edited-but-unsaved* form state (the harder part — feeding in-progress form data to the front end). Their public controllers still hard-filter `is_published`.

## Contributor workflow (follow-ups)
Sub-project 1 shipped 2026-07-13 (see history + SITREP). Remaining:
- [ ] **Email delivery** — wire the `mail` channel so contributor **invite links** and **workflow notifications** (submitted / published / changes-requested) send by email. Built email-ready (Laravel notification classes on the `database` channel; the invite link is shown in-panel to copy today). Depends on real transactional mail (see "Rebrand + launch").
- [ ] On Cloud/staging: set **`MAPBOX_TOKEN`** (map picker won't render without it) and confirm **`APP_URL`** matches the domain (signed set-password invite links are built from it).

### Contributor profiles (sub-project 2 — shipped 2026-07-15, #36; follow-ups)
- [ ] **On Cloud post-deploy:** drop the **"Contributor roll-up"** content block onto the About page's content builder (the `about-us`→`about` slug rename runs via migration; the block auto-lists public-profile contributors).
- [ ] **Team feedback pass** on the profile page + spot-guide author-card design (Ben is sharing for review) — revisit styling if needed.
- [ ] Optional: switch `/contributors` → `/crew` (one named-route change + a 301 redirect once a public domain exists) — pending a naming decision.
- [ ] A Livewire `fillForm(...)->call('save')` test for the My Profile page (current tests cover the policy gate + model persistence, not the page's form round-trip).
- [ ] Optional: a per-slug 301 when a contributor/tag is retired (keeps inbound links alive once the site is public/indexed).
- [ ] Optional: a dedicated notification for "contributor edited a live guide" (today an approved-guide edit reuses `GuideSubmittedForReview` when it auto-flags back to review).

## Blog tags (follow-ups)
Shipped 2026-07-14 (crawlable `/blog/tags/{slug}` pages, tag bar, post chips, owner-only admin, sitemap). Remaining polish (all Minor, none blocking — from the whole-branch review):
- [ ] **Visual eyeball** the new gradient masthead fallback, now the site-wide default for every image-less page (`StaticMasthead` no-image branch — full-viewport deep-teal gradient + glows + wave motif). Never seen live (browser preview tooling was unresponsive at build time). Check across: blog index/tag/hub, search, generic pages, homepage (no-image), and especially a **SpotGuide with no masthead image** (centred title + SpotOverview over the gradient — a central vignette was added for contrast; confirm it reads well at wide + mobile widths). Plus the tag bar/chips. These reuse raw colour utilities, so they inherit the blog's light-only state; the dark-mode token-layer sweep below will subsume that.
- [ ] Consolidate the duplicated post-projection shape (`{id,title,slug,published_at,thumbnail,seo_description}`) used in `BlogController` (×2) + `TagController` into one helper (e.g. a `Blog` card accessor).
- [ ] Consolidate `formatDate`: `Tag.tsx` + `Index.tsx` define a local copy while `Show.tsx` imports the shared `@/Helpers/helpers` one.
- [ ] Minor: `Tag::publishedBlogs()` duplicates `blogs()`'s query; redundant `->map()` after `->get([...])` in `BlogController@index` tags; sitemap runs one query per tag (N+1, cached, fine at small scale); `TagResource` shares `navigationSort=3` with `PageResource` (harmless — alphabetical tie-break orders it correctly).

## Sailable-days ranking (follow-ups)
Shipped 2026-07-28 (`/destinations` ranks spots by typical sailable days for a chosen month + minimum wind, client-side, URL-synced filters — see `docs/history/2026-07-28-sailable-days-ranking.md`). Remaining polish (all Minor/non-blocking, from per-task + whole-branch review):
- [ ] **Prod: run `php artisan weather:fetch` (or the admin "Fetch all weather" button) once after deploy** to populate `spot_sailable_days` for existing spots — the table ships empty until the next fetch.
- [ ] **Owner: live-browser visual/responsive/dark-mode eyeball** of the redesigned `/destinations` page (light + dark, mobile/tablet/desktop, live drag-the-minimum reordering, sticky filter bar) — the local `.test` Herd host blocked automated browser control during the build.
- [ ] Sailable metric: optional **sustained/gust UI toggle** — the ranking switched to gust-based (`qualifying_gust_kts`) post-build, but the sustained column (`qualifying_wind_kts`) is already stored and unused; a toggle would let a user compare the two.
- [ ] `climate` map's mph/kph/gust fields are untested server-side; add at least one assertion covering them.
- [ ] `test_index_keeps_alphabetical_order_regardless_of_which_year_has_data` (`DestinationSailablePayloadTest`) is tautological — can't distinguish old vs new ordering; tighten or replace.
- [ ] Memoise `allTitles`/`destinationOptions` in `Pages/Destinations/Index.tsx` (currently recomputed every render, so the `colours` memo never actually hits).
- [ ] `rankSpots()`'s `peak()` is recomputed inside the sort comparator (O(n) × O(n log n) — immaterial at current spot counts, but worth hoisting if the roster grows).
- [ ] `WindUnit` type (`resources/js/Helpers/sailableDays.ts`) lacks JSDoc.
- [ ] `statFor()` in `Index.tsx` does a linear `find` per card (O(n²) at scale) — index the ranked array by title instead.
- [ ] Remove dead `resources/js/Helpers/weatherDataHelpers.ts` (`prepareYearlyWindData`/`prepareYearlyTempData`) — zero importers since the charts moved to `climate.ts`; also drop its line from CLAUDE.md's Helpers list.

## Frontend
- [ ] Match the single-spot `chartColors` trio (wind/gust/temp on spot-guide pages, `resources/js/Helpers/colours.ts`) to the new muted generated family, so single-spot and multi-destination charts share one look. Left out of the destinations light-theme work (#24) to keep scope tight.
- [ ] Dark-mode token layer (CSS vars on `:root` / `html.dark`), no-flash theme switch, CI colour-guard test — sweep includes `SearchPanel` (currently raw `bg-white`/`gray-*`). Would eventually subsume the hardcoded light utilities added for the destinations light theme (#24).
- [ ] Full responsive audit across mobile / tablet / desktop breakpoints
- [ ] `CoverImage`: add an `eager` prop and use it for above-the-fold mastheads (currently `loading="lazy"` on all covers — LCP cost on heroes)
- [ ] Focal points: multi-select (gallery/slider) focal-set UI (single-select preview only today); focal `fetch()` failure feedback/rollback; prune/retype unused `Card.tsx`
- [ ] Media pipeline (post-launch): Spatie conversions (sizes + WebP + responsive `srcset`) + optional Cloudflare CDN/R2 — image perf (no AWS)

## Photographer attribution — security follow-ups (surfaced, not caused, by #photographer-attribution's final review)

These three were found while auditing the photographer-attribution branch's
media-scoping security work but are pre-existing, independent of that
feature, and deliberately out of scope for that PR. 1 and 2 deserve their
own short branch soon.

- [ ] **`SpotGuidePolicy` has no `deleteAny`, so a contributor can bulk-delete
  their own published, owner-approved guide.** `SpotGuidePolicy::delete()`
  explicitly forbids deleting a published guide, but Filament's
  `DeleteBulkAction` does no per-record re-check — it only consults
  `deleteAny`, which is missing from the policy and therefore defaults to
  allow (see the `PhotographerPolicy` fix in
  `docs/history/2026-08-06-photographer-attribution.md`, same root cause).
  Same gap for `RestoreBulkAction`/`restoreAny`.
- [ ] **`POST /admin/media/{media}/focal` has no authorization.**
  `app/Http/Controllers/Admin/MediaFocalController.php`'s route only has
  `['web', 'auth']` middleware — any authenticated panel user (any
  contributor) can rewrite the focal point of every house image and every
  other contributor's image by iterating ids.
- [ ] **The `MediaPicker` form field does no scoped `exists` validation.** A
  contributor can set a `*_media_id` to a house-media id via the Livewire
  payload directly and read back its URL/name, bypassing the intended
  per-contributor media scoping.

## Backend hardening
- [ ] Dispatch `FetchSpotWeatherJob` from the `SpotGuide::created` hook with `->afterCommit()` so the auto-fetch stays correct even if the Filament panel later enables `->databaseTransactions()`. Correct today (panel has no DB transactions, so the row is committed before dispatch), but the guarantee is currently implicit. Note: a naive `->afterCommit()` breaks the dispatch test under `RefreshDatabase`'s wrapping transaction — needs test-config care.
- [ ] Remove the one-off SQLite→Postgres migration tooling once the migration is proven and no longer needed: the `sqlite_legacy` connection in `config/database.php`, the `db:import-from-sqlite` command, and the stale `database/database.sqlite` file.
- [ ] Dependency advisories: 4 low-severity, **dev-only** advisories remain (`symfony/dom-crawler` XXE, `symfony/yaml` ReDoS / Billion-Laughs) — no fix published in the 7.4.x constraint window; revisit on a future `composer update`.
- [ ] Soft-delete/slug reuse for **Blog & Page** — a soft-deleted record's unique slug stays reserved, so recreating with the same slug fails. Fixed for **SpotGuide** (2026-07-13, partial unique index `WHERE deleted_at IS NULL` + validation scoped to non-trashed); apply the same to Blog & Page (background task queued).

## Single-admin security (PRE-LAUNCH — required)
The single owner login has been hardened with a strong env-driven password (set at deploy-time via `AdminUserSeeder`) and panel access restricted to the owner email only. What remains is optional 2FA and production environment configuration:
- [ ] Keep Filament **registration off** (already off — never add `->registration()`).
- [ ] Optional: enable **2FA** (Filament two-factor plugin) on the admin account.
- [ ] **Production environment (deploy-time, not code):**
  - `APP_ENV=production`, `APP_DEBUG=false` (no stack-trace/query leakage)
  - `SESSION_SECURE_COOKIE=true`, HTTPS enforced
  - `QUEUE_CONNECTION=database` with a supervised worker process running (weather triggers)
  - Real transactional mail configured (see "Rebrand + launch")

## Rebrand + launch — seaboundsessions.com (PRE-LAUNCH)

Rebrand code changes shipped 2026-07-30 (#44, see [history](history/2026-07-30-rebrand-seabound-sessions.md)).
Everything below is production/third-party state that code can't change.

### Production data still carrying the old brand
- [ ] **Three content records** — fixed in local dev only; the same edits are needed on prod via the admin: the `home` Page's **title** *and* `seo_description`, the `blog` Page's `seo_description`, and the `dakhla` spot guide's `seo_description`.
- [ ] **Owner account display name** — still `Seabound Souls` in the prod DB (it's the house "Written by" byline). Either re-run `php artisan db:seed --class=AdminUserSeeder` (note: this also rotates the password to `ADMIN_PASSWORD`) or edit the name directly.
- [ ] **`public/robots.txt`** — the `Sitemap:` line points at `https://seabound-souls-production-ewycw6.laravel.cloud/sitemap.xml`. That host is stale twice over: the Cloud application has since been renamed, and the custom domain will supersede it. Update to `https://seaboundsessions.com/sitemap.xml` at cutover. (The sitemap itself is a dynamic cached route whose URLs adapt to the serving host — only this static line is host-specific.)

### Domain cutover
- [ ] **Attach the domain** in Cloud → Environment → Network settings; add the DNS records it specifies at Namecheap (expect an **A** record at the apex — you're not on Cloudflare). Refresh until status reads **Connected**.
- [ ] **Canonical host = apex** (`https://seaboundsessions.com`), with `www` redirecting to it — set the redirect behaviour in Cloud's Add-domain dialog. Serving both splits SEO across two hosts.
- [ ] **Set the custom domain as the environment's primary domain.** Cloud derives the injected `APP_URL` from it — confirmed live: renaming the Cloud application updated `APP_URL` automatically. A manual custom `APP_URL` override is therefore probably unnecessary; check the injected value after redeploy and only override if it still shows the vanity host. (Custom vars override injected ones — you can't edit the injected block directly.)
- [ ] **Order matters:** don't point `APP_URL` at the new domain until it resolves. Signed contributor invite links embed the host in their signature, so any link minted against a mismatched `APP_URL` fails verification.
- [ ] **Environment variable changes need a redeploy** to take effect.
- [ ] Submit the sitemap in **Google Search Console** for the new domain. (Note `*.laravel.cloud` hosts carry `X-Robots-Tag: noindex, nofollow`; custom domains don't — so indexing starts cleanly at cutover.)
- [ ] Decide what happens to **seaboundsouls.com / .co.uk** — if the old Next.js site is still serving on either, 301 it to the new domain rather than letting it lapse.

### Credential rotation (owner, Cloud dashboard)
- [ ] **Rotate the production DB password and R2 bucket access key.** Both were provisioned at the 2026-07-09 Cloud launch; the DB password was additionally shared in chat during `db:pull-from-production` setup (see `docs/history/2026-07-11-pull-production-db.md`). Neither has been rotated since. This is `SITREP.md`'s standing "post-launch owner tasks" recommendation — tracked here so it isn't only a roadmap mention. Rotate both via the Cloud dashboard and update the corresponding env vars (redeploy required to pick them up).

### Third-party keys (domain-bound — these fail *after* cutover)
- [ ] **Mapbox URL restrictions are not saving.** New account `benyarrow95`; a restricted token was created and deployed, but as of the last probe it still returned **200** for `Referer: https://evil-scraper.test/` — i.e. no restriction is enforcing. Likely the "Add URL" button wasn't clicked (the URL counter must read above zero). Verify with: allowed hosts → 200, `example.com` → **403**. Until that flip is observed, prod is running an effectively unrestricted token.
- [ ] **Mapbox allow-list must include the Cloud vanity host**, not just the custom domain — prod serves from the vanity host until cutover. It changed when the Cloud app was renamed, so the old entry is dead; remove it once the new one is confirmed.
- [ ] **reCAPTCHA** — new keys issued and installed locally (site key ends `fSbIqB`). Confirm the Google console lists **both** the dev host and `seaboundsessions.com`. Subdomains are auto-included, so the apex covers `www` — but registering `www` alone would *not* cover the apex. Server-side verification fails on a hostname mismatch, which looks like a silently broken form, not a config error.
- [ ] **Real transactional email** (Resend/Postmark) + verify the sending domain for seaboundsessions.com (SPF/DKIM/DMARC), then swap `MAIL_MAILER` off Herd's catcher. Contact-enquiry notifications and contributor invites go live with no code change. `MAIL_FROM_NAME` follows `APP_NAME`, already updated.

### Local repo rename (optional, planned)
The GitHub repo is renamed; renaming the local directory to match has four path-keyed consequences:
- [ ] `public/storage` is an **absolute** symlink and will dangle (all media 404) — `rm public/storage && php artisan storage:link`.
- [ ] `php artisan optimize:clear` — `bootstrap/cache/` holds absolute paths.
- [ ] `git remote set-url origin <new-repo-url>` (GitHub redirects, but don't leave it implicit).
- [ ] The Claude Code **project memory dir** is keyed on the absolute path (`~/.claude/projects/-Users-...-seabound-souls-laravel/`) — rename it to match or future sessions start with empty memory. Also update `memory_dir` in `.claude/skills/reconcile-everything/project.md`.
- [ ] Herd derives the local domain from the folder name, so `seaboundsouls.test` changes — update `APP_URL` in `.env`, and the Mapbox allow-list entry if the dev host is listed there.
