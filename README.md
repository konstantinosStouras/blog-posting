# UCD blog

Student post writing time is recorded in private `writingSessions` documents and summed per post in People & invitations / module rosters and the Excel “Post writing time” sheet. The timer counts visible, focused editor time, pauses in preview, uses a browser lock to avoid simultaneous editor tabs, checkpoints every 15 seconds and retries locally pending checkpoints on reopening that post. This is approximate browser telemetry, not proof of typing. Time before this feature cannot be reconstructed. Column headings cycle ascending, descending and original order. Post typography is fixed; semantic styles remain available and pasted font families/sizes are stripped.

Admins have a private walkthrough at `#/admin/guide` and searchable user and invitation records at `#/admin/people`. Instructors use `#/review/roster` for their assigned modules only. Both records views export `.xlsx` files with bold column headings, normal body text, frozen headings and text-formatted university IDs. Filters apply to downloads. Named student invitations track pending email recipients; shared class links track enrolments without inventing recipient identities. The guide content is stored in the admin-only Firestore document `adminContent/guide`.

Live platform: https://www.stouras.com/ucd-blog/

UCD blog hosts public **blogs**, each written on by one or more **modules**.

- A **blog** is a public canvas plus the exercise written on it: the brief, the
  category list (for example the six megatrends), the organisation field, the
  word target, an outline the student can insert, a pre-publish checklist and
  whether comments are open. Blogs are owned by instructors. Address:
  `#/blog/<url-name>`.
- A **module** is one cohort: code, title, academic year (e.g. 2026/27),
  roster, invitations, deadline and whether student posts need approval. When
  an instructor creates a module they either create a new, separate blog for it
  or attach it to one of their existing blogs, so several modules can share one
  canvas (the maintainer's project-management modules do; BMGT41040 has its own
  Operations blog).
- Every post carries its module, its blog and the module's academic year, so
  the instructor area lists posts by blog, module and year, and the canvas
  offers the same facets to readers.

Published posts are readable without signing in. Writing, commenting and
liking require a verified account and an invitation-based membership in a
module. A student who signs in lands on the blog of their module, with a
**Write your blog post** button; members of any module on a blog may comment on
all of its posts.

## Accounts and invitations

- The verified Google account `kstouras@gmail.com` is the platform admin.
- Admin → Invite instructor generates an email-bound instructor invitation, a
  city-name code and a link which prefills it. Instructor invitations expire
  after seven days and are single-use.
- Instructors create several modules from My modules → Create module.
- Each public canvas has a stable `#/module/<url-name>` address.
- Module settings → Invite students generates a city code and registration link
  for that module. Student invitations are reusable for a class, expire after
  30 days, and can be revoked. Existing members remain enrolled after revocation.
- Registration requires an invitation code. Instructors enter name, school or
  university, university email, and optionally Gmail. Students also enter their
  university ID. Email/password and Google sign-in are supported.
- University email is not restricted to UCD. When Google is used, its verified
  sign-in email is separate from the university contact email supplied in the form.
- Invitation links are generated for the admin/instructor to share; no invitation
  email is sent automatically.

City codes are convenient shared invitation codes, not passwords. Instructor
invitations additionally require the invited verified email. Private profiles
and module rosters are not public. Instructors access only assigned modules.

## Writing

The writer is laid out like Substack's post editor: back and a Saved chip on the
left, **Preview** and **Continue** on the right, one formatting toolbar (undo,
Style, bold, italic, strikethrough, code, link, image, quote, lists, More), then
a centred column with Title, subtitle, byline and the text in Spectral. Drafts
autosave two seconds after a change and the chip flashes green. Preview shows the
post as readers see it on a phone or a desktop, with Share and Done. Continue
opens the details step (featured image, category, organisation, tags, word
target, checklist) whose button is Publish, or Submit for review when the module
requires approval. Published posts are not edited live: changes wait for Update.

Beyond text formatting (headings, bold, italic, strikethrough, inline code, text
colour, highlight, superscript and subscript, links, images with a legend, block
and pull quotes, callouts, bulleted and numbered lists, alignment), the **More**
menu inserts rich blocks: a code block with a language picker (highlight.js), a
divider, a live **financial chart** (TradingView embed by symbol and interval),
**footnotes** collected at the end of the post, **LaTeX** with a live preview
(KaTeX), and a **poll** readers vote on (one vote per account, optional time
limit, optional hidden counts). Blocks are stored as plain HTML with their source
in data attributes and rendered by `blocks.js` on the post page, in the preview
and in the writer; the libraries load from cdnjs only when a page needs them.
Tables are not built in the writer: bring them as images with a legend. The ⓘ
button at the bottom left shows characters, words, sentences, reading and
speaking time.

## Canvas filters

Every canvas (a module's public page, All posts, an author or month archive) is
drawn by `canvas.js`: cards plus facets for megatrend, organisation, year, tags
and, across modules, the module itself, with free-text search and sorting. Facet
counts follow the other active filters. The state lives in the hash query, so a
filtered view is a shareable link, for example
`#/module/managing-innovative-projects?trend=sustainability&org=Ryanair&year=2026&tag=ESG`.
Filtering happens in the browser on the published posts already fetched; no
Firestore index is involved. Old `#/category/…`, `#/tag/…` and `#/search/…`
links redirect into `#/posts?…`.

To check the design against the sample posts without touching the live
database, open the dev server with `?local` before the hash, e.g.
`http://127.0.0.1:8787/?local#/` (the `ucd-blog-local` launch configuration).

## Implementation

Plain HTML and ES modules, with Firebase Authentication and Firestore.
`platform.js` contains module and invitation pages; `auth.js` contains sign-in
and registration; `registration.js` validates profile details. The real access
controls live in `firestore.rules`.

Firebase project: `stouras-ucd-blog` (display name **UCD blog**), database `eur3`.
The public web configuration is in `firebase-config.js`. See `_SETUP-FIREBASE.md`.

## Validation

Install development dependencies, then run `npm test`. With Java 21 or newer,
`npm run test:rules` runs isolated Firestore permission tests on a demo project.
`tests/preview-server.mjs` is an optional emulator-only browser QA server.
Test libraries recommend Node 24.12 or newer. They are not served by the app.

## Publish

Push this repository, then update only the `ucd-blog` submodule pointer on the
`master` branch of `konstantinosStouras.github.io`. GitHub Pages serves that site
at stouras.com. Always pass `--project stouras-ucd-blog` when deploying rules.
