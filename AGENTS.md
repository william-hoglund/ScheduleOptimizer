<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Study Planner — working notes

Architecture, database design and the session plan live in `../docs/PLAN.md`.
**Read that first.** This file is the short version: things that will bite you.

## Next.js 16 gotchas (verified against the bundled docs)

- **`middleware.ts` is now `proxy.ts`**, and the exported function is `proxy`.
  The `edge` runtime is not supported there — it is Node only, which is fine for
  Supabase auth. Config flags renamed too (`skipMiddlewareUrlNormalize` →
  `skipProxyUrlNormalize`).
- **Request APIs are async, with no synchronous fallback.** `await cookies()`,
  `await headers()`, `await params`, `await searchParams`. Sync access was
  removed in 16, not just deprecated.
- **Turbopack is the default** for `dev` and `build`. No `--turbopack` flag.
- **`next lint` was removed.** `npm run lint` calls the ESLint CLI directly.
- `typedRoutes: true` is on: a `<Link href>` to a route that does not exist is a
  build error. Create the page (even a placeholder) before linking to it.
- After deleting or adding a route, run `npx next typegen` — stale
  `.next/types` will fail `tsc` with a confusing "cannot find module" error.

## Things that pass typecheck AND build but break at runtime

Both of these shipped a green build and a broken page during Session 1. Check
for them by hand.

1. **Never pass a function from a Server Component to a Client Component.**
   Lucide icons are functions. `<NavLink icon={SomeIcon} />` from a server
   component throws "Functions cannot be passed directly to Client Components".
   Pass a rendered element instead: `icon={<SomeIcon />}`. See
   `src/components/layout/nav-link.tsx`.
2. **Base UI parts need their parent context.** `DropdownMenuLabel` renders
   `Menu.GroupLabel` and throws unless it is inside a `Menu.Group` /
   `Menu.RadioGroup`. Read the generated `src/components/ui/*.tsx` before
   composing unfamiliar parts.
3. **Never nest `<Button>` inside a Base UI trigger.** `<DialogTrigger
   render={<Button/>}>` makes both components write `data-slot`, and they
   resolve in a different order on the server than in the browser — a hydration
   mismatch that only shows up in the console. Style the trigger directly with
   `buttonVariants(...)` instead (see `CourseFormDialog`, `ButtonLink`).

**So: always load a page in a browser before calling it done.** A green
`npm run build` does not mean the page renders.

## shadcn/ui here is Base UI, not Radix

- Composition uses a **`render` prop**, not `asChild`.
- A `Button` that renders a link must also set `nativeButton={false}`, or it
  gets button semantics with link behaviour. Use `ButtonLink` / `ButtonAnchor`
  from `src/components/common/button-link.tsx` — that is what they are for.

## Supabase

- **`middleware.ts` is `proxy.ts`** here (Next 16). It refreshes the session on
  every request. Next's docs say proxy is for *optimistic* checks only — the
  real guard is `requireUser()` in `src/app/(dashboard)/layout.tsx`, with RLS
  underneath.
- **Use `getUser()`, never `getSession()`** for authorisation. `getSession()`
  only decodes a cookie the client could have forged; `getUser()` verifies it.
- **Three clients, three purposes:** `client.ts` (browser), `server.ts` (RSC,
  actions, routes — still the anon key, so RLS applies), `admin.ts` (service
  role, bypasses RLS). If a query fails, fix the policy — do not reach for
  `admin.ts`.
- **Schema and types move together.** `supabase/migrations/*.sql` and
  `src/lib/supabase/types.ts` are hand-kept in sync. Change both in one commit,
  then `npm run db:bundle`.
- **`npm run check:rls` is the security test that matters.** It hits every table
  anonymously and fails if any returns a row. Run it after any migration.
- Applying migrations: paste `supabase/APPLY_ALL.sql` into the Supabase SQL
  Editor. There is no Supabase CLI on this machine.

## FullCalendar

- **Every `@fullcalendar/*` package must be pinned to the same version (6.1.21).**
  `core` and `react` publish a stable 7.x, but the view plugins (daygrid,
  timegrid, list, interaction) do not — installing "latest" silently mixes v7
  with v6 and breaks. v6 supports React 19.
- `timeZone` is set to the student's **profile** zone via `@fullcalendar/luxon3`.
  Without that plugin FullCalendar only understands `"local"` and `"UTC"`, and
  the grid would disagree with what the forms store.
- Styling is done by remapping FullCalendar's own CSS variables onto our tokens
  in `globals.css` (`.fc { --fc-border-color: var(--border); … }`) plus
  `sp-event-*` classes. Do not set per-event inline colours — they would not
  follow dark mode.
- The grid briefly lays out collapsed before FullCalendar's first measure pass.
  That is its behaviour with `height="auto"`, not a bug; screenshots taken
  during it look wrong while the DOM is already correct.

## The planner engine (`src/lib/planner/`)

- **Pure. Keep it that way.** No Supabase, no React, no Next, no clock. `now`
  and `seed` are arguments. This is what makes it reproducible and testable —
  if you find yourself wanting to import a service here, put the adapter in
  `src/server/` instead.
- **Epoch minutes internally.** Time zones and DST are resolved once, in
  `availability/build-availability.ts`. Nothing downstream should convert
  anything.
- **Hard constraints are absolute; scoring is preference.** A new rule that
  must never be broken goes in `constraints/hard-constraints.ts`, not as a big
  negative weight in the scorer.
- **`findConflicts` runs over the finished plan** as a second, independent
  check. If it ever reports something, the placement loop has a bug — the plan
  is still returned, with a critical warning.
- **After changing the engine, mutation-test the change.** Break it deliberately
  and confirm a test fails. Three of the original tests passed against a broken
  engine; see `docs/PLAN.md` § "Session 5 verification".
- The late-hours penalty is currently **not decisive** in integrated runs. It is
  unit-tested in isolation and kept as a guard for other weightings. Do not
  write an integration test claiming to cover it.

## Import and export (`src/lib/calendar/`, `src/lib/export/`)

- **The `.ics` reader is ours** (`ics-parse.ts`), not a package. Keep it pure,
  and route every wall-clock conversion through `lib/calendar/time.ts`.
  Recurrence is expanded on **wall-clock values**, never by adding hours to an
  instant — a weekly 10:00 lecture must survive the clock change. There is a
  test for exactly that; do not "simplify" it away.
- **A parser must know what component it is inside.** `VTIMEZONE` has its own
  `DTSTART` and `VALARM` its own `SUMMARY`. Both will quietly become event data
  if the BEGIN/END stack is dropped.
- **Nothing an import produces is written without the review screen.** Parsing
  returns a preview; a separate action writes the ticked rows and re-validates
  them. Rows that duplicate something start unticked.
- **Occurrences of a recurring event need distinct external ids**
  (`uid::startIso`). `calendar_events` is unique on (user, source, external id),
  so a shared UID makes the second insert fail.
- **A URL the student pasted is hostile input.** Anything fetching one goes
  through `lib/net/url-safety.ts` *and* the DNS check in `server/ics-fetch.ts`,
  with both re-run on every redirect hop. Do not swap the manual redirect
  handling for `redirect: "follow"`.
- **The PDF and PNG writers are hand-rolled and have no library under them.**
  `lib/export/pdf.ts` emits WinAnsi text (so å, ä, ö survive) and computes its
  own xref byte offsets; `plan-svg.ts` must stay self-contained — an external
  font or image inside an SVG is refused by the browser and can taint the canvas
  so `toBlob()` throws.
- **Look at the rendered output after touching either.** Both shipped a green
  build with overlapping text: a two-line row advanced by one line's height, and
  a time column sized for "08:15–09:45" that "10:15 AM–12:00 PM" ran straight
  through. Page budgeting in `plan-layout.ts` is derived from that geometry —
  change one, change the other.

## Accessibility

- **Re-run the audit after UI work.** There is no headless browser here, so it
  is manual: copy `node_modules/axe-core/axe.min.js` into `public/`, load it
  with a script tag in the page, `await axe.run()`, then **delete the file** —
  ESLint reads `public/` and it is 570 kB. Every page currently returns zero
  violations in light and dark, at 1280 / 375 / 320 px.
- **shadcn's defaults are not automatically accessible.** `CardTitle` renders a
  `<div>` (so a card title is not a heading), and `TabsTrigger` shipped
  `text-foreground/60`, which fails WCAG AA on `bg-muted`. Check generated
  components rather than assuming.
- **Heading levels must not skip.** The visual size comes from a utility class,
  so the right level costs nothing — `<h2 className="label-caps">` looks
  identical to the `<h3>` it replaced.
- **Every layout with a `<main>` renders `<SkipLink />` above it**, and the
  `<main>` carries `tabIndex={-1}` — without it, following the link moves the
  anchor but not the reading position.
- **Base UI restores focus when a dialog closes**, including dialogs opened
  programmatically rather than through a `DialogTrigger`. This was tested by
  disabling a hand-written replacement and confirming the behaviour survived —
  do not add focus-restoration machinery without repeating that test.
- **Colours:** `npm run check:contrast` now covers `muted-foreground on muted`
  as well as on background and card. Add the pair when you introduce a new
  surface, or nothing will catch a 4.1:1 label.

## GDPR

- **The export reads through the normal Supabase client, never `admin.ts`.**
  RLS is what guarantees the file can only contain the caller's own rows; the
  service-role client would remove that guarantee for the sake of nothing.
- **`calendar_connections` is deliberately not exported**, and the file says so
  in its `notes`. It holds OAuth tokens.
- Account deletion is **not built**. It needs the service-role key or a
  `security definer` function against `auth.users`; the Privacy tab states this
  rather than hiding it.

## Calendars and day rules (Session 12)

- **An imported event belongs to a calendar** (`calendar_sources`), and the
  calendar is what carries meaning: a timetable per programme, one for work.
  Feed ids are unique **per calendar**, not per user — two universities issue
  the same UIDs — which is why the unique index includes `source_id`.
- **A day rule is a threshold, not a flag.** `block` / `reduce` only apply once
  that calendar's events on one local date pass `day_effect_threshold_minutes`.
  A 45-minute stand-up must stay an ordinary hole in the day; eight hours at the
  office takes the day. Do not "simplify" the threshold away.
- **Minutes are counted per calendar.** Lectures must never push a *work* rule
  over its threshold.
- **The rule is resolved once, in `availability/apply-day-effects.ts`,** and
  applied as a hard constraint — a blocked day loses its windows. It is not a
  scoring penalty.
- **Feasibility reads the caps too** (`capacityWithDayCaps`). Summing raw
  windows would promise a working evening the student has already written off.
- **Clashes are reported, never resolved.** `lib/calendar/detect-clashes.ts` is
  pure and deliberately says nothing about which lecture to skip.
- **Everything here degrades when the migration is absent.** `calendar_sources`
  arrived in `0007`; Import & export and the calendar filter hide themselves
  rather than failing, like study groups on Insights.

## To-dos and segments (Session 13)

- **A to-do is a task**, not a separate list. `task_type` carries the errand
  kinds (`application`, `appointment`, `admin`, `errand`); `/todos` filters on
  them and Deadlines shows the coursework. One table, because both compete for
  the same hours.
- **`fixed_start_at` moves a to-do out of the task list.** With a time set it
  becomes a planner *obstacle* (`planner-service` maps it into `fixedEvents`)
  and must be filtered out of the schedulable tasks — otherwise the engine
  plans time to do the thing it has just blocked out time for.
- **Zero minutes means "not stated", never "instant".** `resolveMinutes` falls
  back to the type's default; a to-do that reached the planner as zero-length
  work would be scheduled into nothing.
- **The engine keeps its own `TaskType`** (`lib/planner/types.ts`) and imports
  nothing from Supabase. Adding a task kind means adding it there *and* to
  `TYPE_IMPORTANCE` and `TYPE_METHOD` — both are exhaustive `Record`s, so the
  typechecker will tell you.
- **Segments change defaults and words, never the algorithm.**
  `lib/segments.ts` holds both sets; a professional starts at 6 h a week,
  90-minute sessions, 17:30–22:00 and weekends on. If you find yourself
  branching inside `lib/planner/`, the feature is in the wrong place.

## This machine

- **`node_modules` has been silently damaged twice** — once emptied, once
  filled with 1,218 duplicate `" 2"` directories. Symptoms are not obvious:
  `next dev` starts and never binds, `vitest` hangs at 0% CPU, `tsc` reports
  `Cannot find type definition file for 'node 2'`. Check `du -sh node_modules`
  (healthy ≈ 700 MB) and `find node_modules -name "* 2" | wc -l` before
  debugging anything else; `rm -rf node_modules && npm ci` fixes both.
- **`next` CLI commands need `NEXT_TELEMETRY_DISABLED=1`** or they hang for
  minutes with no output at all.
- **Do not poll a compiling dev server with short-timeout `curl`.** An aborted
  request kills it with an unhandled `ECONNRESET`. Wait on the port, or just
  load the page in the browser.
- Never run several `tsc --noEmit` at once — they starve each other and none
  finishes.

## Conventions

- **Never put database or AI calls in a component.** Queries live in
  `src/server/*`, pure domain logic in `src/lib/*`. Components render.
- **The planner engine (`src/lib/planner/`) stays pure.** No Supabase, no React,
  no `new Date()` inside it — `now` and `seed` are arguments, which is what
  makes it reproducible and testable.
- **Times:** absolute moments are `timestamptz` (UTC); recurring preferences are
  wall-clock `time` + `day_of_week`. Never add 24h to get tomorrow — DST days
  are 23 or 25 hours long.
- **All wall-clock ↔ instant conversion goes through `lib/calendar/time.ts`**,
  server-side, using the profile timezone. `new Date("2026-08-01T17:00")` parses
  in the *server's* zone (UTC on Vercel), which would shift every Swedish
  student's deadline by an hour or two. `tests/calendar/time.test.ts` covers
  both DST transitions.
- **Server code reads the clock only through `server/clock.ts`.** Calling
  `Date.now()` during render is impure and the React lint rules reject it; the
  planner also needs a single seam so tests can pin "now".
- **Pass `now` from server to client as a prop.** Reading the clock in a client
  component gives a different value during hydration and mismatches.
- **Both locales, always.** Adding an English string means adding the Swedish
  one. `npm run check:messages` fails the build otherwise. Translation keys are
  type-checked against `en.json`.
- **Form schemas avoid `z.coerce`, `.default()` and `.transform()`.** Each makes
  the schema's input type differ from its output type, which React Hook Form
  cannot express with one form type. Convert numbers at the input
  (`register(name, { valueAsNumber: true })`) and normalise empty strings to
  null in the service layer.
- **Validation messages are codes, not sentences** (`lib/validation/messages.ts`),
  translated by `useValidationText()`. That lets one schema serve both the
  server and a bilingual client.
- **Colours:** change a value in `globals.css` and you must change it in
  `scripts/check-contrast.mjs` too. `npm run check:contrast` enforces WCAG AA.
- Secrets never get a `NEXT_PUBLIC_` prefix. See `.env.example`.

## Commands

```bash
npm run verify   # typecheck + lint + contrast + messages + build
npm run dev
```

Run `npm run verify` before finishing any session.
