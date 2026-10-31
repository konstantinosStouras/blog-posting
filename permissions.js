// The three levels. Each level has everything the one below it has, plus more.
// This mirrors firestore.rules, which is the real authorisation; the browser
// copy only decides what is DRAWN. Keep the two in step.
export const ROLES = ['student', 'lecturer', 'admin'];
export const rank = role => Math.max(0, ROLES.indexOf(role || 'student'));

export function can(user, action, post, settings = {}) {
  if (!user) return action === 'read';
  const r = rank(user.role);
  const own = post && post.authorId === user.uid;
  switch (action) {
    case 'write':        return settings.submissionsOpen !== false || r >= 1;
    case 'edit':         return !!post && (own || r >= 1);            // students: own posts; lecturers: any
    case 'delete':       return !!post && ((own && post.status !== 'published') || r >= 2); // students: own drafts; admin: anything
    case 'publish':      return !post ? true : (own && !(settings.requireApproval && r < 1)) || r >= 1;
    case 'unpublish':    return !!post && (own || r >= 1);
    case 'approve':      return r >= 1;   // review queue, when requireApproval is on
    case 'feature':      return r >= 1;
    case 'comment':      return settings.allowComments !== false;
    case 'deleteComment':return !!post && (post.authorId === user.uid || r >= 1); // here `post` is the comment
    case 'roster':       return r >= 1;   // see who is behind each pen name
    case 'manageUsers':  return r >= 2;
    case 'settings':     return r >= 2;
    default:             return false;
  }
}
