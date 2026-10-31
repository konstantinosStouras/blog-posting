// The three levels. Each level has everything the one below it has, plus more.
// This mirrors firestore.rules, which is the real authorisation; the browser
// copy only decides what is DRAWN. Keep the two in step.
export const ROLES = ['student', 'lecturer', 'admin'];
export const rank = role => Math.max(0, ROLES.indexOf(role || 'student'));

export function can(user, action, post, settings = {}) {
  if (!user) return action === 'read';
  const r = rank(user.role);
  const own = post && post.authorId === user.uid;
  const staff = r >= 2 || (r >= 1 && (!user.managedModuleIds || user.managedModuleIds.includes(post?.moduleId)));
  switch (action) {
    case 'write':        return settings.submissionsOpen !== false || staff;
    case 'edit':         return !!post && (own || staff);
    case 'delete':       return !!post && ((own && post.status !== 'published') || r >= 2); // students: own drafts; admin: anything
    case 'publish':      return !post ? true : (own && !settings.requireApproval) || staff;
    case 'unpublish':    return !!post && (own || staff);
    case 'approve':      return staff;
    case 'feature':      return staff;
    case 'comment':      return settings.allowComments !== false;
    case 'deleteComment':return !!post && (post.authorId === user.uid || staff);
    case 'roster':       return r >= 1;   // see who is behind each pen name
    case 'manageUsers':  return r >= 2;
    case 'settings':     return r >= 2;
    default:             return false;
  }
}
