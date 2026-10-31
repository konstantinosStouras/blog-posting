# UCD blog

The class blog for the *PM Challenge* in BMGT45540 Managing Innovative Projects,
replacing the Edublogs site at ucdprojectmanagement.edublogs.org. Live at
<https://www.stouras.com/ucd-blog/>.

Students research how one organisation is facing one of six megatrends and
publish a 900–1,100-word blog post under a pen name. Classmates read, comment on
the author's open questions and later review each other's posts.

## What is here

Plain HTML + ES modules, no build step, like the other stouras.com apps.

| File | Role |
|---|---|
| `index.html`, `styles.css` | shell and the look (white page, blue title, serif post titles, orange hashtags, three-column canvas) |
| `app.js` | hash router and every page: canvas, post, category/tag/author/archive/search, the challenge brief, compose, My posts, Profile, Lecturer area, Admin area |
| `editor.js` | the compose editor: WYSIWYG toolbar, image upload (resized inline), tables, captions, link shortcut, the five-question outline |
| `permissions.js` | the three levels (student ⊂ lecturer ⊂ admin) as drawn in the browser |
| `store.js` | picks the backend: `backend-local.js` (localStorage, seeded) or `backend-firebase.js` (Auth + Firestore) |
| `auth.js` | header account control: *View as* switcher in local mode; sign-in/register modal in Firebase mode |
| `seed.js` | sample posts (fictional organisations), sample accounts, default settings and the challenge brief |
| `firestore.rules` | the real authorisation, see `_SETUP-FIREBASE.md` |

## The three levels

- **Student**: read, comment, write and publish their own posts, edit their own, keep drafts, edit profile (pen name, name, student number).
- **Lecturer**: everything above, plus read all drafts, edit/unpublish/feature any post, approve queued posts, delete any comment, see the roster (pen name → student) and download the CSV for grading and peer-review assignment.
- **Admin**: everything above, plus assign roles, site settings (title, tagline, word target, deadline, approval required, submissions open, comments open, categories, the brief) and data export.

## Run locally

Any static server, e.g.

```bash
python -m http.server 8765
```

then open <http://localhost:8765/>. In local mode use *View as* (top right) to try each level; **Admin → Data** resets the sample data.

## Go live for the class

Follow [`_SETUP-FIREBASE.md`](_SETUP-FIREBASE.md): create the Firebase project, paste its web config into `firebase-config.js`, switch on Google + e-mail sign-in, create Firestore and deploy the rules.

## Deploy

This repository is mounted as the git submodule `ucd-blog` inside
`konstantinosStouras.github.io`, which GitHub Pages serves as stouras.com. After
pushing here, update the pointer there:

```bash
cd ../konstantinosStouras.github.io && git submodule update --remote ucd-blog && git add ucd-blog && git commit -m "ucd-blog: update" && git push
```
