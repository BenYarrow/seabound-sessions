---
title: Photographer attribution
tags: [photographers, media-library, filament, frontend, security, n+1]
status: stable
completed: 2026-08-06
commits: [2492772, f995b87, ffe2870, 089b443, e0f31e5, 4d37100, ea84ad1, e3d8dce, 66ae8c9, c66f8f6, 042a38c, 16e07f0, 0ad19f2, e646bb1, 36ec0bb, edfdb8c, 9d751e3, c56113e, 704748d, 14cf267, 433641a, ceabf8f, 21f7348, 8ccd48c, 1456e97, 78f07b7, bce51c7, 5dc28b3, b1e5784, 4435371]
spec: docs/superpowers/specs/2026-08-06-photographer-attribution-design.md
plan: docs/superpowers/plans/2026-08-06-photographer-attribution.md
pr: 46
---

# Photographer attribution

A photographer supplied images for a spot the site had no photography for.
His work needed a credit wherever it appears, linking to a destination of
his choosing (Instagram, for now), plus a way for the admin to tell his
images apart from the site's own at a glance. He didn't want a page or an
account — but the owner needed to be able to give him (or a future
photographer) one later, from the admin form alone, with no reopened
development cycle. That constraint shaped almost every decision below.

## Why a standalone `photographers` table, not a user role

`users` carries auth semantics: password hashes, panel access, a policy
layer that already branches on `isOwner()` / `isContributor()`. A credit is
not an account, and giving every credited person a login-capable row would
mean every one of those policies permanently carrying a third case for
people who may never sign in.

`Tag` is the precedent already in this repo: a standalone, auth-free model
that grew a full public presence — hub page, masthead, thumbnail, SEO —
without ever needing to touch `users` or a policy's role checks. Doing the
same for photographers keeps the blast radius of "add a photographer" at
one new table.

It's also the better foundation for a *future* login, not just the page
today. Profile content (`bio`, `socials`, `profile_blocks`, masthead) lives
on the `photographers` row from day one. Granting someone a login later is
then only a question of **who may edit that row** — a `user_id` FK plus an
invite flow — not a data migration to move profile fields off `users` onto
a new table after the fact. Had this been built as a user role instead,
profile data would already be sitting on `users` rows for people who have
no account, which is exactly backwards.

## Why `credit_link` stores a key, not a URL

The active link target is stored as a key (`instagram`, `website`,
`profile`, …) and resolved against the photographer's `socials` map at read
time — never as a second, independent copy of the URL. `Photographer::
creditPayload()` does the resolution; `CREDIT_LINK_OPTIONS` on the model
lists the six link kinds plus `none`.

The payoff: if the owner later wants every one of a photographer's credits
to point at the on-site profile instead of Instagram, that's changing one
Select value in the admin, with no deploy. If the URL had been duplicated
into `credit_link` directly, switching link targets — or just updating a
changed Instagram handle — would mean hunting down and editing every
credited image individually, or writing a migration to do it for them.
Storing a key instead of a value is what makes "give him a page" a
config change rather than a code change, which is the whole point of the
feature.

The admin Select only ever offers `profile` when `hasPublicPage()` is true,
so a target with no URL behind it can never be selected in the first place.

## Visibility is derived, not a manual flag

`Photographer::hasPublicPage()` is true when the record has a slug **and**
non-empty `profile_blocks`. There is no separate `is_published` toggle to
remember to flip.

This mirrors `User::hasPublicProfile()` (a contributor earns a page by
having ≥1 published guide), and for the same underlying reason: once the
*capability* to have a page exists, a manual flag means someone has to
remember to turn it on, and — worse — someone can turn it on for a
photographer with nothing in the content builder yet, publishing a thin,
empty page that's bad for him and bad for SEO. With the gate derived from
content, filling in the content builder **is** the decision to publish.
There is no separate switch to forget, and no way to expose an empty page
by accident.

## The Postgres `json`-has-no-equality-operator trap

The public-page scope originally compared `profile_blocks` against the
literal `'[]'` (Filament's content-builder writes an empty array, not
`null`, when every block is removed). That comparison passed on the test
suite — SQLite — and would have thrown on Postgres the moment it ran,
because Postgres's plain `json` column type (unlike `jsonb`) has no
equality operator at all.

This is the exact SQLite/Postgres divergence project memory already warns
about, and it was caught before merge only because the fixer verified the
scope against the real Postgres dev database rather than trusting the
green test suite. The fix removes the comparison rather than working around
it: a `saving()` hook normalises `[] → null` on every save, so the scope
becomes a plain `whereNotNull('profile_blocks')` — no JSON operator
involved at all. `hasPublicPage()` in PHP and `scopeWithPublicPage()` in SQL
are then provably equivalent, because the `[] → null` invariant is what
makes `filled()` and `whereNotNull` agree.

Two things fall out of this that are recorded but not fixed: the
normalisation happens in the `saving` hook, so `updateQuietly()`/
`saveQuietly()`/bulk query-builder updates would bypass it (no such call
site exists today); and `slug` uses `whereNotNull` in SQL but `filled()` in
PHP, which disagree for an empty *string* slug (SQL sees `''` as not null;
`filled('')` is false) — reachable only via a name that slugifies to
nothing, e.g. `"!!!"`. Both pre-existing, both latent.

## The `MediaLibrary::$with = ['photographer']` batching decision

`imagePayload()` reads the photographer relation on every image. Without
eager loading, a destinations page with a dozen cards would issue a
photographer query per credited card — silent today at ~5% credit
coverage, and increasingly expensive as more photographers are added.
`MediaLibrary` already declares `$with`, so `'photographer'` was added
there rather than requiring every controller to remember to chain
`->with('thumbnailMedia.photographer')` correctly.

### The guard is a scaling invariant, not an absolute ceiling

The original plan called for asserting the request issues fewer than some
fixed number of queries. The number chosen (35) turned out to already
exceed the actual regressed count (24) — a ceiling that could never trip,
so it never guarded anything. Tightening the ceiling to 20 would have
"fixed" that instance, but the review pushed back on the shape of the
guard itself: **any absolute ceiling invites being raised** the next time
it trips for an unrelated reason (a new eager load, a new filter query),
and each raise quietly erodes the guard until it stops catching the
regression it exists for.

The test (`tests/Feature/PhotographerQueryCountTest.php`) instead asserts a
*scaling invariant*: the same `/destinations` request, run once against 2
credited spots and once against 10, must issue the **same** number of
queries against the `photographers` table specifically. A batched
(`$with`) load runs once per parent query regardless of row count, so that
number is flat (1 and 1); an unbatched load runs once per credited image,
so it grows (2 and 10). The invariant ties pass/fail directly to the thing
that actually matters — count independent of data volume — rather than to
a number that has to be re-guessed every time something else changes the
baseline.

Investigating this surfaced a genuine, pre-existing, unrelated N+1:
`MediaLibrary::getUrl()`/`getThumbnailUrl()` call Spatie's own
`getFirstMediaUrl()`, which lazily resolves that model's own `media` morph
relation once per `MediaLibrary` instance — not covered by `$with`, so
every image on every page costs one extra query, independent of
photographers entirely. A whole-request query-count assertion could never
pass with this present, which is why the guard narrows to the
`photographers` table rather than the total count — narrowing the
assertion to the thing it actually governs, not to paper over a bug found
along the way. Recorded as a follow-up in `docs/TODO.md` with the likely
fix (add `'media'` to `$with`, then widen the test back).

## The opt-in → opt-out media-scoping sweep

`MediaLibraryResource::getEloquentQuery()` and `folderOptions()` scoped the
media library with `if ($user && $user->isContributor()) { restrict }`.
That's an opt-**in** restriction: a role introduced later that isn't
`contributor` — a photographer with a login, say — falls through the
check entirely and sees the whole media library, including house media
that role was never meant to see. The fix, applied everywhere this pattern
existed, inverts the condition to `if ($user && ! $user->isOwner())`:
behaviourally identical for today's two roles, but safe against every role
added later, because the check now fails *closed* by default instead of
failing open.

This was the intended scope from the spec, but tracing every occurrence of
the pattern took three passes — each one was believed complete, and each
review found more:

1. **`MediaLibraryResource::getEloquentQuery()` and `folderOptions()`** —
   the two sites the spec named directly.
2. **`MediaPickerBrowser` (×4)**, including the network-callable
   `isSelectableByCurrentUser` authorisation gate, and
   **`SpotGuideResource::getEloquentQuery()`** — the same shape, found by
   grepping for the pattern rather than trusting the spec's list was
   exhaustive.
3. **`CreateMediaLibrary::mutateFormDataBeforeCreate()`** and
   **`EditSpotGuide::afterSave()`** — the two sites that took the longest
   to surface, because neither *looked* like an authorisation check:
   - `CreateMediaLibrary` decided whose media an upload belonged to with
     `if (! auth()->user()?->isContributor())` — a future role that isn't
     recognised as a contributor would have its uploads silently filed as
     **house media** instead of their own scoped library. Nothing errors;
     the images just quietly end up in the wrong place.
   - `EditSpotGuide::afterSave()` decided whether editing an already-approved
     guide should re-flag it back to review (and notify the owner) with the
     same opt-in shape — a future role could edit **live, approved content**
     without the change ever being re-reviewed or the owner ever being told.

Every one of these conversions was proven individually: each fix ships
with a test using a **fictional role** (`'photographer'`, which doesn't
exist as a real `users.role` value yet) asserting the opt-out behaviour
holds, and each was verified by **reverting that one fix alone** and
watching its own test fail. That individual-revert discipline is what
caught the third pass's last gap — the four `MediaPickerBrowser` fixes in
pass two were reverted *together* as a batch to sanity-check the tests,
which is exactly what let the missing `saveUpload()` test hide until pass
three looked harder.

Deliberately left alone, and worth recording so it isn't "fixed" by
accident later: `MyProfile` (self-only by design — an opt-out here would
*grant* a future role a page they shouldn't have), `EditSpotGuide::
getHeaderActions()` (hides a button only, not a data boundary), and
`canAccessPanel()` (already an allow-list, which is the safe direction).

## The credit-badge click hijack

`ImageCredit` renders inside `CoverImage`, which is used as a card image
on 9 Inertia `<Link>`-wrapped surfaces and inside a `<button onClick>` on 5
gallery/search surfaces. A click on the credit badge is still, structurally,
a click inside that ancestor — so without stopping propagation, the
ancestor's own handler fired too: clicking "© Name" navigated to the
*card's* destination instead of the photographer's link, or double-fired a
lightbox toggle underneath the badge it was clicking.

Fixed with `event.stopPropagation()` on the badge's anchor/`Link`, verified
against the installed Inertia source (`Link` runs the caller's `onClick`
first and only checks `event.defaultPrevented` afterwards — never
propagation — so the badge's own navigation still fires) and against
React's synthetic event dispatch (`stopPropagation` genuinely halts the
fiber walk to ancestor handlers; root event delegation doesn't matter here).
The plain-text (unlinked) credit deliberately does **not** stop
propagation: it has no navigation of its own to protect, and stopping it
there would turn the badge into a dead click zone on an otherwise-clickable
card.

## Why `CoverImage` does not hardcode `relative`

`CoverImage` needs its wrapper to be a valid positioning context for the
absolutely-positioned credit badge. The obvious fix — always add `relative`
— breaks several existing callers. `ContentWithBackgroundImage` passes
`absolute inset-0 w-full h-full` to intentionally pull the image out of
flow inside a flex layout; Tailwind's generated CSS always places
`.relative` **after** `.absolute`/`.fixed`/`.sticky` in the stylesheet
(verified against the actual built CSS, not assumed), so at equal
specificity a forced `relative` would win the cascade over the caller's
`absolute` and silently pull the image back into flow, breaking that
layout. `CoverImage` instead only adds `relative` when the caller's
`className` doesn't already contain an explicit position utility
(`hasExplicitPosition()`, a small token whitelist that also accounts for
variant-prefixed classes like `lg:absolute`).

## Why `SingleImage` deliberately does not use `CoverImage`

The plan called for converting `SingleImage`'s raw `<img>` to `CoverImage`.
That would have been wrong: `CoverImage` forces `object-cover` into a
caller-sized wrapper with no intrinsic height, which is right for a
cropped tile but wrong for `SingleImage`, whose entire point is showing an
image full-width at its own natural aspect ratio. Wrapped in `CoverImage`
without an explicit height, the image would either collapse to nothing or
get cropped — a visible regression, not a refactor. The plain `<img>`
stays; only the surrounding `<button>` gained `relative block w-full` so
it's a correctly sized positioning context for the badge (an unstyled
button is `inline-block` and shrinks to its content, which would anchor
the badge to the wrong box).

The gallery and single-image **lightboxes** do show the credit — the
full-size view is the image a reader is actually looking at, so it matters
most there. `fslightbox-react@2` has no caption support and no equality
operator either, so a credited slide is passed as a custom JSX source
(image + badge, via the shared `CreditedLightboxSlide`) rather than a plain
URL string; uncredited slides stay plain strings. Along the way, the
hardcoded lightbox bounds (`max-h-[85vh] max-w-[90vw]`) turned out not to
match the library's own internal slide-sizing math — traced twice,
independently, into `node_modules`: the library's height margin is always
`0.9 × innerHeight`, but the width margin is only `0.9 × innerWidth` above
992px; below that it's full width. Credited slides were therefore
consistently 5 points shorter everywhere and up to 10 points narrower on
mobile — worst exactly where most of the site is read. Fixed to
`max-h-[90vh]` plus `min-[993px]:max-w-[90vw]` (993, not Tailwind's `lg`
breakpoint of 1024, specifically to avoid a 993–1023px mismatch band).

## Out of scope: the photographer login

`ROLE_PHOTOGRAPHER`, an invite action, panel gating, and a self-edit page
were never built, on purpose. Giving a photographer a page does not
require giving him an account: if the owner wants a photographer to have a
public presence, filling in the admin form is sufficient and it goes live
with no dev cycle — the firm requirement behind this whole feature. A
login is a separate, rarer need (a photographer wanting to edit his *own*
page) and by far the more expensive piece — a new role, a policy pass over
every resource, a fresh authorisation surface. The page unblocks the
owner; the login unblocks the photographer, and only the first is a
bottleneck the owner would actually hit.

The schema (`photographers.user_id`, unread today) and the shared
`PhotographerProfileForm::schema()` (mirroring how `ContributorResource`
and `MyProfile` already share `ContributorProfileForm::schema()`) both
anticipate it, so building the login later is a pure feature addition:
create a `User` with the new role, link `photographers.user_id`, reuse the
existing signed-link `SetPasswordController` (already entirely
role-agnostic), and point the existing form schema at
`auth()->user()->photographer`.

## Final pre-merge review fixes

A last whole-branch review on top of the per-task passes above found two
Critical and several Important issues, all fixed before merge:

- **Hover transforms buried the credit badge.** `CoverImage` put the
  caller's `group-hover:scale-*`/`transition-transform` utilities on the
  wrapper `<span>`. A non-`none` `transform` creates a new stacking
  context, so on hover the badge's `z-10` was trapped inside the wrapper
  and painted beneath a later `absolute inset-0` sibling overlay (card
  vignettes/scrims) — on surfaces where that overlay lacked
  `pointer-events-none`, the click never reached the credit link at all.
  The same misplacement also regressed the intended zoom effect: the scale
  used to apply to the `<img>` (frame fixed, photo zooms inside it); on the
  wrapper it scaled — and `overflow-hidden`-clipped — the badge too. Fixed
  by adding `CoverImage.imageClassName`, applied to the `<img>`, and moving
  every call site's transform utilities onto it.
- **Two lightboxes dropped the credit.** `ImagePair.tsx` and
  `SplitImageText.tsx` still reduced every image to a bare URL string for
  `FsLightbox`, silently losing the credit `Gallery.tsx`/`SingleImage.tsx`
  already preserve via `CreditedLightboxSlide`. Both now use the same
  credited-vs-plain-string branch.
- **The photographer roster and bulk-assign action were reachable by
  contributors** via `/admin/media-libraries` — `MediaLibraryPolicy` gates
  the resource generally but doesn't know about the photographer-specific
  additions. `PhotographerResource` was already owner-only, but the
  `photographer_id` Select (`->preload()`), the `photographer.name` column,
  the photographer `SelectFilter`, and the `assignPhotographer`
  `BulkAction` on `MediaLibraryResource` were not, letting a contributor
  enumerate every photographer and falsely credit their own upload to one.
  All four are now owner-gated (the bulk action via `->authorize()`, which
  also blocks a forged direct call, not just the button).
- **The exclusion list was incomplete and inconsistently applied.** The
  spec excluded map pins ("a badge there is illegible") but the same
  reasoning was never extended to circular avatars/portraits or other
  small thumbnails — and even where it obviously should have applied, it
  was inconsistent: `PhotographerRollUp`/`Photographers/Show` already
  passed `showCredit={false}` on their portraits, but the byte-for-byte
  equivalent `ContributorRollUp`/`Contributors/Show` did not, nor did the
  `SpotGuide/Show` author avatar, `SearchPanel`'s 40px thumbnail, or
  `Pages/Search.tsx`'s 96×80 thumbnail. The rule is now: **map pins,
  circular avatars/portraits, and thumbnails below roughly 128px on a
  side** all opt out, applied uniformly.
- **Two idioms for the same role-scoping rule, with opposite guest
  behaviour.** `MediaLibraryResource` (×2) and `MediaPickerBrowser` (×4)
  used `$user && ! $user->isOwner()`, under which a guest (null user)
  skipped scoping entirely and got the *unscoped* query — the opposite of
  what "opt-out for the owner" is supposed to guarantee. `CreateMediaLibrary`
  and `EditSpotGuide::afterSave` already used the fail-closed
  `! $user?->isOwner()` form, under which a guest gets the *most*
  restrictive branch. A third site with the same unscoped form
  (`SpotGuideResource::getEloquentQuery`) was found during the sweep.
  Standardised all seven on the fail-closed form.
- **`PhotographerPolicy` was missing abilities Filament resolves as
  *allow*.** Filament's `authorize()` helper defaults a missing ability on
  an *existing* policy to `Response::allow()`. `PhotographerResource` ships
  a `DeleteBulkAction` and `Photographer` uses `SoftDeletes`, so
  `deleteAny`/`restore`/`restoreAny`/`forceDelete`/`forceDeleteAny` were all
  implicitly open to anyone reaching the resource. Added, all owner-only.
- **`user_id` was mass-assignable** on `Photographer` despite being read by
  nothing today — removed from `$fillable`.
- **An empty-string slug could desync `hasPublicPage()` from the sitemap
  scope.** `hasPublicPage()` uses `filled($this->slug)` (false for `''`);
  `scopeWithPublicPage()` used `whereNotNull('slug')` (true for `''`, since
  SQL `''` is not `NULL`). A punctuation-only name (e.g. `"!!!"`) slugifies
  to `''` via `Str::slug()`, so the `saving` hook's auto-fill could store an
  empty string, which the scope would then advertise in the sitemap while
  the controller 404s it. First fixed at what looked like the single point
  the slug is ever assigned — the `saving` hook falls back to a random slug
  when `Str::slug($name)` is empty — on the reasoning that one enforcement
  point is harder to regress than several call sites that all have to agree.
  That reasoning held only for slugs that go *through* the hook. It doesn't:
  the fallback is gated on `filled($photographer->name)`, so a record saved
  with a blank **name** (e.g. built directly by a factory/seed, bypassing the
  admin form) skips the hook entirely and can still end up with `slug = ''`.
  A later commit (`4435371`) closed that residual gap by adding
  `->where('slug', '!=', '')` to `scopeWithPublicPage()` as a second,
  independent guard, and corrected the docblock's overstated claim.
- `resolveCreditUrl()` now uses `route('photographers.show', $slug, false)`
  instead of a hardcoded `/photographers/{slug}` string (the explicit
  `false` keeps it a relative path, since `ImageCredit` decides
  internal-vs-external by a leading `/`).
- `ring-white`/`text-gray-500` on the photographer/contributor roll-up
  cards and profile portraits (4 files) were **attempted** as a swap to
  `ring-cream`/`text-secondary/60` — raw non-themed utilities that won't
  flip once dark mode exists. The `ring-cream` half was reverted a commit
  later (`b1e5784`): both profile pages render the portrait inside a
  `bg-cream` `BlockWrapper`, so `ring-cream` is exactly the section
  background and the halo vanished entirely; on the two roll-up cards
  (no background of their own) it degraded to a near-invisible warm smudge
  against white. This project has no dark-mode token layer yet (no
  `darkMode` key, no `.dark` selectors anywhere), so the swap deleted a
  visible design element for no present benefit. All four portraits are
  back on `ring-white` today, with a comment at one site
  (`Photographers/Show.tsx`) explaining why so it isn't re-attempted
  piecemeal — the fix belongs in the dark-mode token-layer sweep
  (`docs/TODO.md`) as one pass across the whole site, not a one-off per
  component. The `text-gray-500` → `text-secondary/60` half was kept: both
  roll-up intros sit on light backgrounds, and `secondary` at 60% opacity
  reads at least as dark/legible as `gray-500` there, so it was a genuine
  equivalent rather than a regression.
- The `credit_link` admin column showed the raw stored key (e.g.
  `instagram`) instead of its `Photographer::CREDIT_LINK_OPTIONS` label.

## Known follow-ups

- **Pre-existing `media` N+1** (see above) — tracked in `docs/TODO.md`,
  fixable by adding `'media'` to `MediaLibrary::$with`.
- The `credit_link` Select reads the DB-loaded record and neither the
  socials fields nor the content builder are `->live()`, so adding page
  content or a social URL makes the new option selectable only after
  save-and-reload, not in the same admin session. Conservative (fails
  safe), matches the spec, but is a papercut.
- The `<a>`-in-`<a>`/`<a>`-in-`<button>` nesting the badge lives inside is
  pre-existing structure (predates this feature), not introduced here.
  Event dispatch is proven clean; only a real cross-browser keyboard/AT
  pass could clear the HTML5 validity concern fully.

## Not verified live

Browser automation became unavailable mid-build. Verified before it broke:
badge renders correctly positioned with correct `href`/`target`/`rel`/
`aria-label`; all `CoverImage` wrappers keep the caller's position; no
horizontal overflow at mobile/tablet/desktop widths on the affected pages.
Not verified: an actual mouse click on a credit badge inside a card grid
navigating correctly, the focus ring rendering unclipped when tabbed to,
and assistive-technology tab order around the pre-existing nested-anchor
structure. Worth an owner eyeball before or shortly after launch.

## Test plan

Builds cumulatively across the branch; test count grew from 278 to 306+ as
tasks landed, with a per-task pass (PHP + Vitest, `npm run build` clean)
followed by a whole-branch review. `Photographer` model coverage: the full
`creditPayload()` resolution matrix, `hasPublicPage()` true/false cases,
soft-delete nulling and restoring a credit, `/photographers/{slug}` 404
paths, the `list_photographers` resolver, sitemap inclusion, the
scaling-invariant N+1 guard, and the media-scoping hardening's fictional-role
tests (each independently proven by reverting its own fix).
