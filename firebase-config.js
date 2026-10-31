// Public web-app identifiers, not administrator credentials (the same pattern as
// stouras.com/wearwell and /lit). What protects the data is firestore.rules.
//
// Until the PASTE_ placeholders are replaced the site runs in LOCAL MODE: every
// post, comment and account lives in this browser's localStorage, seeded with
// sample content, and a "View as" switcher stands in for sign-in. The moment a
// real config lands here the same pages read and write Firestore instead.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID',
};
// Sign-in buttons shown in the account modal. Keep in sync with what is enabled
// in Firebase console -> Authentication -> Sign-in method.
export const enabledProviders = ['google.com', 'password'];
// The maintainer. Must match isAdmin() in firestore.rules, which is the real
// authorisation; this copy only decides whether admin screens are drawn.
export const ADMIN_EMAIL = 'kstouras@gmail.com';
export const firebaseEnabled = () => !/^PASTE_/.test(firebaseConfig.apiKey);
