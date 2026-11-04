# UCD blog

Click a student’s module writing-time total to open a private breakdown of their posts and expandable sessions. It uses the complete authorised student/module report, independent of page search, and retains the roster’s sorting and Excel export.

Staff reports include “Student totals by module”: one row per student/module, summing recorded active time across all their current posts (all statuses), with zero rows for enrolled students who have no posts. The Excel download includes a “Student module totals” worksheet. The report uses the same private module scope as rosters and session history; module and student searches filter the totals without reducing them to a subset of posts.

Private per-post session history appears in People & invitations and module rosters and in the Excel “Writing sessions” sheet. Each active period records start, last edit/checkpoint, end and active seconds, with UTC timestamps and pause reasons. Idle pauses or returning to a post start new periods. New `writingHistory` records are write-only for the student and readable only by the admin / module instructor. Legacy `writingSessions` totals remain available, with unavailable historical timestamps left blank. Session checkpoints saved locally are retried after reopening the same post.

Writing activity starts only after an editing action, pauses after 30 seconds without editing or immediately on leaving/hiding the editor, and resumes on a new editing action. No student-facing timer is displayed; accumulated times remain in private staff reports and Excel exports.

Writing time on an author’s own post (a student’s, and since 3 November 2026 an instructor’s or the admin’s too; nothing is recorded in a preview, where nothing can be saved) is recorded in private `writingHistory` documents and summed per post in People & invitations / module rosters (the Blog posting analytics table: each post’s title linking to it, its module as “code: title”, its window from creation to its last publication or update, active time, idle time, time away, utilisation, and its sessions and the breaks between them) and the Excel “Blog posting analytics” sheet. Active time is time editing the post’s text (typing, deleting, toolbar formatting; the details sheet does not count), idle time the rest of the window, utilisation their ratio. Time away is the part of the window when the author was not signed in on the site: every signed-in tab beats once a minute into a private `presence` document per visit and module (`presence.js`; the admin’s visits carry no module and are the admin’s alone to read), a tab left open counts as present whether or not it is visible, and visits are recorded since 4 November 2026, so a window that starts earlier leaves time away blank. A post with no session recorded (written before tracking, or by an instructor before instructors were tracked) says so in its Sessions column and leaves idle time and utilisation blank rather than showing 0%. The timer counts visible, focused editor time, pauses in preview, uses a browser lock to avoid simultaneous editor tabs, checkpoints every 15 seconds and retries locally pending checkpoints on reopening that post. This is approximate browser telemetry, not proof of typing. Time before this feature cannot be reconstructed. Column headings cycle ascending, descending and original order. Post typography is fixed; semantic styles remain available and pasted font families/sizes are stripped.

Admins have a private walkthrough at `/admin/guide` and searchable user and invitation records at `/admin/people`. Instructors use `/instructor` for their assigned modules only. Both records views export `.xlsx` files with bold column headings, normal body text, frozen headings and text-formatted university IDs. Filters apply to downloads. A module's invitation row shows its city and how many students joined through it, without inventing recipient identities (the named, per-email invitations of before 3 November 2026 are no longer offered; their records keep their status). The guide content is stored in the admin-only Firestore document `adminContent/guide`. Every admin page (`/admin/guide`, `/admin/people`, `/admin/grading`, `/admin/feedback`, `/admin/modules`, `/admin/settings`, `/admin/data`) is drawn under one head with the admin tab strip, and the instructor area is one page at `/instructor` (since 4 November 2026: the counts, posts by module and academic year, what the blog stores for the admin, and the roster and invitation records of the modules in scope; the old `/review` address and its tabs, `/review/posts`, `/review/queue`, `/review/comments` and `/review/roster`, redirect to it, and the posts table, the review queue, the comments list and the CSV export are gone). `/admin/people` is the one place for people: everyone who has signed in with a role selector, the Invite an instructor form, every invitation with who sent it, and the writing-time records; `/admin/users`, `/admin/invite` and the old `/invitations` lead there. Instructors never see another instructor's invitations: `peopleReport` and the Firestore rules scope module invitations to the modules they teach. Staff previews (View as Instructor X, View as Student) are described under Implementation.

Every row of the four People tables ends in a **Delete** column, which asks before it acts and then removes the record from the site (`people.js`; the backend methods `deleteAccount`, `removeMember`, `deleteModuleInvite`, `deleteTeacherInvite` and `deletePost`). In Registered users the admin deletes the account: its profile, directory row, registration mark, role and every module and blog membership go, and so do its unpublished posts, while its published posts stay on the blog with their comments (the sign-in itself cannot be removed from the browser, so the person may sign in again, arrives as a new account and must enter a module's invitation code before writing); an instructor's Registered users are their modules' members, and Delete there removes the student from those modules (the module and blog memberships), keeping the account and the posts. In Invitations it deletes the invitation together with its registration code (unless the city has since been given to another invitation; revoking, which keeps the record, is still done from the module's Invite students page); an instructor's invitation is the admin's alone. In Student totals by module it removes the student from that module, and in Blog posting analytics it deletes the post with its comments, likes, votes and bookmarks. The admin cannot delete their own row. The Firestore rules let a module's staff delete its invitations and codes, a student's memberships and its posts, and the admin alone delete profiles, directory rows, roles and instructor invitations.

The platform admin alone has an **AI grading** assistant at `/admin/grading` (`ai-grading.js`). It is not offered to other instructors. The admin saves their own API keys for Anthropic, OpenAI, Google and xAI in the browser only (localStorage, never the database), picks one of each lab's top models or types any model id, and a reasoning effort. The grader persona, the grading instructions and the feedback-polishing prompt (the prompts from the old grading spreadsheet, with each blog's brief inserted as `{brief}`) are edited on the page and stored in the admin-only document `adminContent/grader`. Grading sends the post text, the brief and the persona from the browser straight to the chosen lab; the reply (grade out of 10, summary, feedback) is stored per post in the admin-only `aiReviews` collection beside the admin's own final grade and feedback, which can be polished with the same model. The table covers the modules the admin teaches, with the student's name, university ID and email, and downloads as Excel in the layout of the old sheet. Request building and reply parsing live in `ai-providers.js` and `ai-grading-model.js` and are unit-tested; the local prototype has a demo grader that needs no key.
The admin alone also runs the **peer review** of blogs (study guide section 5.3, "Others' blog assessment") at `/admin/peer` (`peer-review.js`); no other instructor sees it. It is an option the admin turns on per module and year in the module settings, together with the peer-review deadline (a module is reused year after year: a round covers the posts published in one academic year and the students who joined in it). Once the module's submissions are closed, one click assigns each student the posts of four classmates: the students with a published post are shuffled (with a stored seed, so the draw can be redone) and placed round a circle, and each reviews the next four posts round it, so nobody reviews their own post, nobody gets a post twice, every post gets exactly four reviewers and every student gives exactly four reviews; the draw is checked row by row (`verifyAssignments`) before it is saved, and a student without a published post is not a reviewer until their post is published (Fill the gaps then brings them in), so every post has exactly four different reviewers and every reviewer exactly four different posts of others. Each assignment is one document in `peerReviews` (`moduleId_postId_reviewerUid`); the round's state is `peerRounds/{moduleId}`. A student sees "Peer review: 2 of 4 assessments submitted" on their module card, the list at `/peer-review`, and on each assigned post a **Submit blog assessment** button in the side column that opens a sheet with the guide's questions, a whole-number rating from 1 to 10 and constructive feedback of any length; they may edit it until the round closes (or the module's peer-review deadline passes). The author never sees who reviewed them. The dashboard shows, by post, the grades received with the mean, a leniency-adjusted mean (each grade less its reviewer's own average, plus the class mean) and a flag when reviewers disagree by three points or more, and, by reviewer, what each student submitted. With the model and key chosen on the AI grading page, the admin merges the peer reviews with the AI review into one feedback for the author ("4+1", stored on the post's `aiReviews` document) and scores each student's reviewing ("review the reviewer", stored in `peerReviewerNotes`, the 10% component); both prompts are editable and stored in `adminContent/peer`. Releasing a post writes `peerSummaries/{postId}` (average, final feedback, the anonymous reviews), which the author then sees beside their post; releasing a reviewer's grade and note shows them on the student's list page. After the draw the admin notifies the students from their own mail program: an Email button on each reviewer's row opens the letter filled in (the old mail-merge letter, adapted: assessments are entered on the site, no Google form), Copy copies it, and a mail-merge sheet carries the same merge fields for Word; the template is editable and stored with the prompts in `adminContent/peer`. The site can also send the letters itself from the admin's own mailbox (`mail.js`, the pure parts in `mail-model.js`): the Microsoft 365 account, so they come from the UCD address, through Microsoft Graph, or the Google account through the Gmail API, each after a sign-in popup that grants the send permission for about an hour and is never stored; one Send button per reviewer or one batch with a Stop, a test to oneself, an optional "Send as" alias, and the date on the reviewer's note (`noticeSentAt`, `noticeTo`). The Microsoft route needs the site registered once in Microsoft Entra (`MICROSOFT_CLIENT_ID` in `firebase-config.js`); the Google route needs the Gmail API enabled once in the site's Google Cloud project. Both tables download as Excel, and so do the assignments themselves (one row per reviewer: student ID, name, email, then the author's name and the link of each assigned post). The arithmetic, the prompts and the sheets are in `peer-review-model.js` and unit-tested; the rules for the four collections are in `firestore.rules` with their tests.

Live platform: https://www.stouras.com/ucd-blog/

UCD blog hosts public **blogs**, each written on by one or more **modules**.

- A **blog** is a public canvas plus the exercise written on it: the brief, the
  category list (for example the six megatrends), the organisation field, the
  word target, an outline the student can insert, a pre-publish checklist and
  whether comments are open. Blogs are owned by instructors. Address:
  `/<url-name>`, directly under the site: `/ucd-blog/project-management`.
  The brief is written in the post editor (its toolbar and writing surface,
  `editor.js`, in a sheet: `brief-editor.js`), never as HTML: **Edit the
  brief** on The brief page saves it to the blog at once, and the same button
  on Blog settings, under a preview of the brief, hands it to the form for
  **Save blog**. The sheet refuses a brief over the 60,000 characters the
  rules allow (an image pasted into it is stored inside it).
- A **module** is one cohort: code, title, academic year (e.g. 2026/27),
  roster, invitations, deadline and whether student posts need approval. When
  an instructor creates a module they either create a new, separate blog for it
  or attach it to one of their existing blogs, so several modules can share one
  canvas (the maintainer's project-management modules do; BMGT41040 has its own
  Operations blog).
- Every post carries its module, its blog and the module's academic year, so
  the instructor area lists posts by blog, module and year, and the canvas
  offers the same facets to readers.

Nothing is readable without signing in. A published post is visible to the
students of its own module, to that module's instructors and to the owners of
its blog, and to nobody else: a student never sees the posts of another
module, whether it shares their blog (two cohorts of the same instructor on one
canvas) or belongs to another instructor. The Firestore rules enforce this, so a
post query must name the module (or owned blog) it asks for; `store.js` narrows
every read in the browser to the same world, and the pages say so. Writing,
commenting and liking require a verified account and an invitation-based
membership in a module. A student who signs in lands on the blog of their
module and reads and comments on their own module's posts. Every page of a
blog (its canvas, its brief and each of its posts) draws the blog's action row
under its masthead: **Write your blog post** and **The brief**, plus **Blog
settings** and **Review posts** for the blog's instructors. There is no Write
button beside the avatar: the account menu holds everything personal.

## Accounts and invitations

- The verified Google account `kstouras@gmail.com` is the platform admin.
- Admin → Invite instructor generates an email-bound instructor invitation, a
  code and a link which prefills it. Instructor invitations expire
  after seven days and are single-use.
- Instructors create several modules from My modules → Create module, and
  delete one they teach from its Settings page (the admin, any module): the
  roster and the blog memberships it brought go with it and its invitation
  code is retired; the blog stays. A module with posts is not deleted until
  its posts are deleted from Review posts.
- Each public canvas has a stable `/module/<url-name>` address.
- My modules → Invite students gives the module its invitation: one of eight
  fixed cities (madrid, dublin, paris, berlin, athens, seattle, singapore,
  milano; `JOIN_CITIES` in `invitation-codes.js`). The link is the blog's
  address plus the city, `https://www.stouras.com/ucd-blog/project-management/join/madrid`,
  and the code is the city, `madrid`. It is standing: the same link serves every
  year's cohort until the instructor chooses another city (which retires the old
  link at once) or retires it without replacement. A city serves one module at a
  time across the platform, so the code alone names the module and two modules
  writing on the same blog have different cities; the picker greys out the cities
  in use, and a revoked city may be taken over by any module. The link's blog
  must be the module's own, or the page refuses it. Existing members remain
  enrolled after a change. The codes handed out before 3 November 2026 (a random
  city and three digits behind a link with a UUID) are retired: they no longer
  resolve, the old `/join/…` links say so, the rosters list them as "Retired",
  and choosing a city revokes them.
- Students write and comment under an **alias** generated at random when their
  account is created (adjective-noun-number, `aliases.js`). It is shown on posts
  and comments with the publication date, cannot be edited by the student, and
  the rules reject any other pen name on a student profile. Instructors keep an
  editable pen name and see the real name behind each alias in the roster.
- Each blog's canvas (`/project-management`) and its published posts are
  public: a visitor with the link sees the masthead, a Home menu, Log in and
  the canvas of the blog's published posts, and may open and read any of them;
  a signed-in student sees the same whole canvas whatever module they belong
  to. Which module a post was written in, and that several modules may share
  one canvas, is shown to the module's instructors, the blog's owners and the
  admin only (the module facet, the module on a card and on a post). The brief,
  the comments, drafts and everything else are for the module's members and
  instructors once they log in. Elsewhere visitors see a
  single **Log in** button; the dialog offers *Register with your
  invitation code* for first-time users, and a first Google sign-in without a
  profile is asked for the code as well. Registration requires an invitation code. Instructors enter name, school or
  university, university email, and optionally Gmail. Students also enter their
  university ID. Email/password and Google sign-in are supported.
- University email is not restricted to UCD. When Google is used, its verified
  sign-in email is separate from the university contact email supplied in the form.
- Invitation links are generated for the admin/instructor to share; no invitation
  email is sent automatically.

Invitation codes are convenient shared secrets, not passwords: a city is easy
to pass on, and the instructor switches city when a link has travelled too far.
Instructor invitations keep a random city and three digits, expire after a week
and additionally require the invited verified email. The code index
(`registrationCodes/{code}`) holds routing data only, is read one code at a time
and never listed, and names the module's blog so a link can be checked against it. Private profiles
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
links redirect into `/posts?…`. Hovering a card (or tabbing into it) lifts it
on a white sheet edged with a blue line inside a soft blue halo, over a
blue-tinted shadow, zooms its cover image slowly under a soft gradient, slides a
"Read the post" ribbon up over the image and draws a blue underline under the
title; a card without an image colours its top rule orange instead. The effect
is CSS alone (styles.css, the card's hover), so visitors get it as well as
members; readers who asked their system for less motion keep the colours, the
shadow and the ribbon without the movement, and select mode keeps its outline.
The grid stands 36px below the tag cloud (`.canvas-grid`, 22px of padding over
the cloud's margin) so a hovered card's halo, which reaches 24px above the
card, never touches the tags.
The blog cards on Explore blogs (and a student's My blogs) light up the same
way: the whole card opens the blog, and on hover it rises with a blue border
and halo while the title's underline draws itself (styles.css,
`.module-card.linked`).

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
else. The admin gets **View as Instructor X** for every instructor; on a blog's
pages, an instructor gets **View as Student** for each of their modules writing
on it, the admin for every module on the blog (named when there are several,
*View as Student of BMGT45540*, since each module's students see their own
module's posts alone). The header then shows the person's own name with *as Student* or
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

Every module and the stylesheet are addressed with `?v=<stamp>` in `index.html`, a
hash of their contents (`tools/stamp.mjs`). The pre-commit hook in `.githooks`
(switched on by `npm install`) writes it into each commit, and the Cache stamp
workflow adds it to any commit made without the hook, so a browser that kept old
files from a previous visit never runs them beside new ones. `npm run stamp` by hand.

Firestore keeps the documents it has fetched on disk (IndexedDB). The first page of a
visit is drawn from that copy without waiting for the network (`backend-firebase.js`
`getDoc`/`getDocs`: the cache answers while the same read goes to the server, and when
the server's answer differs the page is redrawn in place, `notify('refresh')`); after
the first page every read goes to the server, as the cache is not narrowed by the
rules. A first visit, with nothing on disk, waits for the server as before.

Even a cached read waits for Firebase to start (a third to half a second: the SDK opens
its store and confirms the sign-in with Google's servers), so `store.js` also keeps the
raw answers of the last visit's reads, the account and the settings in localStorage
under the build's cache stamp, and draws the first page from them the moment the code
runs. Once Firebase is ready, every answer that page used is asked again and compared
(the account too), and the page is redrawn in place if anything differs; a read the
snapshot cannot answer, and every write, waits for Firebase. Another account on the
same browser starts its own snapshot.

## First-time blog setup

The one-off walkthrough for creating the Project Management and Operations
blogs and attaching the five modules on the live site is in `_SETUP-BLOGS.md`.
