# UCD blog

Live platform: https://www.stouras.com/ucd-blog/

UCD blog hosts a separate public blog canvas for each instructor's module.
Published posts are readable without signing in. Writing, editing and commenting
require a verified account and an invitation-based membership in the module.

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
