# Switching on the Firebase side

## Current deployment — 31 October 2026

The live project is **UCD blog**, ID `stouras-ucd-blog`, project number
`513789063041`. Google and Email/Password authentication are enabled. Authorized
domains include `stouras.com`, `www.stouras.com`, and `localhost`. The default
Firestore database is in `eur3` (Europe), with this repository's rules and
indexes deployed. The maintainer upgraded the project to Blaze; its linked
billing account is also named **UCD blog**. The public web configuration is in
`firebase-config.js`.

The following instructions remain as a setup reference. Project creation and
quota approval are already complete. Live mode starts with an empty database;
prototype sample posts are not imported. Email/password users receive a
verification email and must verify before posting. The account menu provides
verification resend and refresh controls; the login form provides password reset.

The blog ships in **local mode**: every post, comment and account lives in the
visitor's own browser, seeded with sample posts, and a "View as" switcher stands
in for sign-in. That is enough to look at the design and try the three levels,
and nothing is shared between browsers. For the class it needs its own Firebase
project, one per app as on the other stouras.com sites.

Budget: the free Spark plan is enough. Images are stored inside the post
document (resized JPEG, under ~500 KB), so no Storage bucket is needed.

## 0. Free a project slot

The Google account `kstouras@gmail.com` is at its Cloud project quota
(2026-10-31: creating `stouras-ucd-blog` failed with
*"you have exceeded your allotted project quota"*). Either delete a project you
no longer use (Firebase console → project → Settings → **Delete project**;
deleted projects count against the quota for ~30 days) or ask for a higher quota
at <https://support.google.com/code/contact/project_quota_increase>.

## 1. Create the project

Either in the console (<https://console.firebase.google.com> → **Add project**,
Google Analytics **off**) or from this folder:

```bash
firebase projects:create stouras-ucd-blog --display-name "UCD Project Management Blog"
```

## 2. Register a web app and paste its config

```bash
firebase apps:create WEB ucd-blog --project stouras-ucd-blog
firebase apps:sdkconfig WEB --project stouras-ucd-blog
```

(or Project settings → **Your apps** → **Web**, nickname `ucd-blog`, no Hosting).
Copy `apiKey`, `authDomain`, `projectId` and `appId` into
[`firebase-config.js`](firebase-config.js). **A web config is not a secret**; the
rules in step 5 are what protect the data. Commit it: the moment it lands the
site leaves local mode.

## 3. Sign-in methods

Authentication → **Get started** → Sign-in method:

- **Google**: enable, set the support e-mail.
- **Email/Password**: enable (students who registered on the old class blog with
  a username and password will feel at home). Leave e-mail link off.

Then Authentication → Settings → **Authorized domains**: add `stouras.com` and
`www.stouras.com` (`localhost` is already there).

`enabledProviders` in `firebase-config.js` lists the buttons the modal draws;
keep it in step with what is switched on.

## 4. Create the Firestore database

Firestore Database → **Create database** → production mode → `eur3` (Europe).
The region cannot be changed afterwards.

## 5. Deploy the security rules — before telling the class

```bash
firebase deploy --only firestore:rules --project stouras-ucd-blog
```

ALWAYS pass `--project`. The CLI otherwise falls back to a project it remembers
per directory, which is how OperationsAcademia's rules once landed in the
`stouras-answerarena` database.

What the rules do ([`firestore.rules`](firestore.rules)):

| Collection | Who can do what |
|---|---|
| `posts/{id}` | anyone reads a **published** post; the author (or staff) reads drafts; a verified student creates/edits their **own** post and may publish it directly unless *approval required* is on, in which case it waits as `pending`; students cannot set `featured`; lecturers edit/publish/unpublish/feature any post; only the admin deletes a published one |
| `comments/{id}` | world-readable; a verified account creates one under its own uid; the author or staff deletes |
| `profiles/{uid}` | the owner; staff may read (name, student number behind a pen name) |
| `userDirectory/{uid}` | roster row written by the account about itself, `email` pinned to the sign-in token; staff read |
| `registeredUsers/{uid}` | contentless registration mark `{t}` |
| `roles/{uid}` | `student` / `lecturer` / `admin`, **written by the admin only**; the Admin area's Users tab |
| `settings/site` | world-readable; admin writes (title, tagline, word target, approval, deadline, categories, brief) |
| everything else | closed |

`isAdmin()` hardcodes `kstouras@gmail.com` **with a verified e-mail**, exactly
as on operationsacademia.org and /lit/, and additionally honours `roles/{uid}`
= `admin`. The copy in `firebase-config.js` only decides whether admin screens
are drawn.

## 6. First sign-in

Sign in with Google as the maintainer. The Admin area appears. Go to **Admin →
Users & roles** to promote a teaching assistant to `lecturer`; go to **Site
settings** to set the deadline and whether student posts need approval. Sample
posts are **not** seeded into Firestore; the canvas starts empty.

## 7. Later, if wanted

- **ORCID / Microsoft sign-in** for UCD accounts: same recipe as /lit/
  (`_ORCID-SIGNIN-SETUP.md`), needs Identity Platform.
- **Peer-review assignment** (each student reviews four posts): the roster and
  CSV export already carry what the current Google Form + Word template collect.
  A `reviews` collection and a Reviews tab would replace them.
- **Scheduled jobs** (reminder e-mails before the deadline) would use a service
  account in GitHub Actions, as the OA and lit mailers do.
