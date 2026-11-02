# UCD blog

Click a student’s module writing-time total to open a private breakdown of their posts and expandable sessions. It uses the complete authorised student/module report, independent of page search, and retains the roster’s sorting and Excel export.

Staff reports include “Student totals by module”: one row per student/module, summing recorded active time across all their current posts (all statuses), with zero rows for enrolled students who have no posts. The Excel download includes a “Student module totals” worksheet. The report uses the same private module scope as rosters and session history; module and student searches filter the totals without reducing them to a subset of posts.

Private per-post session history appears in People & invitations and module rosters and in the Excel “Writing sessions” sheet. Each active period records start, last edit/checkpoint, end and active seconds, with UTC timestamps and pause reasons. Idle pauses or returning to a post start new periods. New `writingHistory` records are write-only for the student and readable only by the admin / module instructor. Legacy `writingSessions` totals remain available, with unavailable historical timestamps left blank. Session checkpoints saved locally are retried after reopening the same post.

Writing activity starts only after an editing action, pauses after 30 seconds without editing or immediately on leaving/hiding the editor, and resumes on a new editing action. No student-facing timer is displayed; accumulated times remain in private staff reports and Excel exports.

Student post writing time is recorded in private `writingSessions` documents and summed per post in People & invitations / module rosters and the Excel “Post writing time” sheet. The timer counts visible, focused editor time, pauses in preview, uses a browser lock to avoid simultaneous editor tabs, checkpoints every 15 seconds and retries locally pending checkpoints on reopening that post. This is approximate browser telemetry, not proof of typing. Time before this feature cannot be reconstructed. Column headings cycle ascending, descending and original order. Post typography is fixed; semantic styles remain available and pasted font families/sizes are stripped.

Admins have a private walkthrough at `/admin/guide` and searchable user and invitation records at `/admin/people`. Instructors use `/review/roster` for their assigned modules only. Both records views export `.xlsx` files with bold column headings, normal body text, frozen headings and text-formatted university IDs. Filters apply to downloads. Named student invitations track pending email recipients; shared class links track enrolments without inventing recipient identities. The guide content is stored in the admin-only Firestore document `adminContent/guide`. Every admin page (`/admin/guide`, `/admin/people`, `/admin/grading`, `/admin/feedback`, `/admin/modules`, `/admin/settings`, `/admin/data`) is drawn under one head with the admin tab strip, and the instructor area does the same for `/review/posts`, `/review/queue`, `/review/comments` and `/review/roster`. `/admin/people` is the one place for people: everyone who has signed in with a role selector, the Invite an instructor form, every invitation with who sent it, and the writing-time records; `/admin/users`, `/admin/invite` and the old `/invitations` lead there. Instructors never see another instructor's invitations: `peopleReport` and the Firestore rules scope module invitations to the modules they teach. Staff previews (View as Instructor X, View as Student) are described under Implementation.

The platform admin alone has an **AI grading** assistant at `/admin/grading` (`ai-grading.js`). It is not offered to other instructors. The admin saves their own API keys for Anthropic, OpenAI, Google and xAI in the browser only (localStorage, never the database), picks one of each lab's top models or types any model id, and a reasoning effort. The grader persona, the grading instructions and the feedback-polishing prompt (the prompts from the old grading spreadsheet, with each blog's brief inserted as `{brief}`) are edited on the page and stored in the admin-only document `adminContent/grader`. Grading sends the post text, the brief and the persona from the browser straight to the chosen lab; the reply (grade out of 10, summary, feedback) is stored per post in the admin-only `aiReviews` collection beside the admin's own final grade and feedback, which can be polished with the same model. The table covers the modules the admin teaches, with the student's name, university ID and email, and downloads as Excel in the layout of the old sheet. Request building and reply parsing live in `ai-providers.js` and `ai-grading-model.js` and are unit-tested; the local prototype has a demo grader that needs no key.

Live platform: https://www.stouras.com/ucd-blog/

UCD blog hosts public **blogs**, each written on by one or more **modules**.

- A **blog** is a public canvas plus the exercise written on it: the brief, the
  category list (for example the six megatrends), the organisation field, the
  word target, an outline the student can insert, a pre-publish checklist and
  whether comments are open. Blogs are owned by instructors. Address:
  `/<url-name>`, directly under the site: `/ucd-blog/project-management`.
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
  code and a link which prefills it. Instructor invitations expire
  after seven days and are single-use.
- Instructors create several modules from My modules → Create module.
- Each public canvas has a stable `/module/<url-name>` address.
- Module settings → Invite students generates an invitation code and registration link
  for that module. Student codes are reusable for a class and standing: a code
  stays valid every academic year until the instructor or the admin revokes it,
  and generating another code never cancels the earlier ones. Two modules
  writing on the same blog hand out different codes, so each student lands in
  their own module. Existing members remain enrolled after revocation.
- Students write and comment under an **alias** generated at random when their
  account is created (adjective-noun-number, `aliases.js`). It is shown on posts
  and comments with the publication date, cannot be edited by the student, and
  the rules reject any other pen name on a student profile. Instructors keep an
  editable pen name and see the real name behind each alias in the roster.
- Visitors see a single **Log in** button; the dialog offers *Register with your
  invitation code* for first-time users, and a first Google sign-in without a
  profile is asked for the code as well. Registration requires an invitation code. Instructors enter name, school or
  university, university email, and optionally Gmail. Students also enter their
  university ID. Email/password and Google sign-in are supported.
- University email is not restricted to UCD. When Google is used, its verified
  sign-in email is separate from the university contact email supplied in the form.
- Invitation links are generated for the admin/instructor to share; no invitation
  email is sent automatically.

Invitation codes are convenient shared secrets, not passwords. Instructor
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
`/module/managing-innovative-projects?trend=sustainability&org=Ryanair&year=2026&tag=ESG`.
Filtering happens in the browser on the published posts already fetched; no
Firestore index is involved. Old `/category/…`, `/tag/…` and `/search/…`
links redirect into `/posts?…`.

To check the design against the sample posts without touching the live
database, start `python dev-server.py 8787` (the `ucd-blog-local` launch
configuration) and open `http://127.0.0.1:8787/?local`. The router keeps the
`?local` flag on every address it navigates to, so reloads stay on the sample
data; a link opened in a new tab without it uses the live database.

## Implementation

Plain HTML and ES modules, with Firebase Authentication and Firestore.
`platform.js` contains module and invitation pages; `auth.js` contains sign-in
and registration; `registration.js` validates profile details. The real access
controls live in `firestore.rules`.

### Addresses

Every page has a clean path, with no `#`: `/project-management`,
`/2026/10/my-post`, `/admin/feedback`. `router.js` owns this. The code speaks
only in those app routes and writes links root-relative; the router reads where
the app is mounted from its own URL (`/ucd-blog/` on stouras.com, `/` on a dev
server), prefixes links as they enter the page, intercepts clicks and uses
`history.pushState`. In-page anchors (`#comments`, footnotes) keep working.

A static host has no file at `/ucd-blog/project-management`. GitHub Pages serves the root
`404.html` of the stouras.com repository instead, and that page sends the
browser to `/ucd-blog/?redirect=<path>`; the router restores the path before
the app starts, so a reload or a typed deep link lands on the right page.
`dev-server.py` does the same locally. Old `/…` addresses, in bookmarks or in
links shared before this change, are rewritten to the clean path on load.

### Previews: View as Instructor X, View as Student

As in a learning platform, the account menu lets staff see the site as someone
else. The admin gets **View as Instructor X** for every instructor; on a blog
canvas, an instructor of one of its modules (or the admin) gets **View as
Student**. The header then shows the person's own name with *as Student* or
*as X* under it, the menu opens with "Viewing as …" and a × that returns to
their own view. A preview is a view of that browser tab only: the backend still
acts as the real account, so every write is refused until the preview is closed
(`store.js`), and nothing is recorded in the writer.

### Who is shown where

The account control at the top right shows the signed-in person's own name and,
after a Google sign-in, their Google picture. A student's random alias appears
only where their writing does: the byline of posts and comments, the writer's
byline and the My posts page.

Firebase project: `stouras-ucd-blog` (display name **UCD blog**), database `eur3`.
The public web configuration is in `firebase-config.js`. See `_SETUP-FIREBASE.md`.

## Feedback button

Every page carries a **Feedback** button at the bottom right, for visitors,
students, instructors and the admin alike, signed in or not (the same idea as
the Feedback page on stouras.com/lit). The dialog takes any mix of three inputs:
a written note, up to five **screenshots** (dropped, browsed or pasted with
Ctrl+V; downscaled and JPEG-compressed in the browser) and one **voice note**
recorded with the microphone (MediaRecorder: Opus/WebM in Chrome and Firefox,
AAC/MP4 in Safari; it stops itself at three minutes or at the size limit). Name
and e-mail are optional and prefilled for a signed-in account. Each submission
gets a ticket such as `BLOG-261031-K3QP`, shown on the thank-you panel.

Storage is Firestore only, no Storage bucket: `feedback/{id}` holds the text,
ticket, who, page, browser and counts; each screenshot or voice note is its own
data-URL document in `feedback/{id}/attachments/{n}`, so nothing approaches
the 1 MB document limit. The rules let anyone create one bounded submission
(a signed-in submitter may record only their own uid) and let the admin alone
read, close, reopen or delete. The admin reads them at `/admin/feedback`:
newest first by day, Open / Closed / All, thumbnails that enlarge, inline audio
players, **Mark complete & reply** (records the resolution, closes the ticket
and opens a pre-composed e-mail when the submitter left an address),
**Download .md** (the layout of the private lit-feedback-log mirror, for handing
a ticket to an assistant) and Delete. Limits, validation and the ticket format
live in `feedback-model.js` and are unit-tested; the widget and inbox are in
`feedback.js`. Deploy `firestore.rules` after pulling this change.

## Validation

Install development dependencies, then run `npm test`. With Java 21 or newer,
`npm run test:rules` runs isolated Firestore permission tests on a demo project.
`tests/preview-server.mjs` is an optional emulator-only browser QA server.
Test libraries recommend Node 24.12 or newer. They are not served by the app.

## Publish

Push this repository, then update only the `ucd-blog` submodule pointer on the
`master` branch of `konstantinosStouras.github.io`. GitHub Pages serves that site
at stouras.com. Always pass `--project stouras-ucd-blog` when deploying rules.

## First-time blog setup

The one-off walkthrough for creating the Project Management and Operations
blogs and attaching the five modules on the live site is in `_SETUP-BLOGS.md`.
