// The three levels. Each level has everything the one below it has, plus more.
// This mirrors firestore.rules, which is the real authorisation; the browser
// copy only decides what is DRAWN. Keep the two in step.
export const ROLES = ['student', 'lecturer', 'admin'];
export const rank = role => Math.max(0, ROLES.indexOf(role || 'student'));

// The deadline day counts in full, in the reader's time zone (the same reading as the author's late note).
export const pastDeadline = settings => !!settings?.deadline && Date.now() > new Date(settings.deadline + 'T23:59:59').getTime();

export function can(user, action, post, settings = {}) {
  if (!user) return action === 'read';
  const r = rank(user.role);
  const own = post && post.authorId === user.uid;
  // Instructors moderate posts in the modules they teach and on the blogs they own
  // (a shared canvas can carry posts from several modules).
  const staff = r >= 2 || (r >= 1 && (!user.managedModuleIds || user.managedModuleIds.includes(post?.moduleId) || (user.managedBlogIds || []).includes(post?.blogId)));
  switch (action) {
    case 'write':        return settings.submissionsOpen !== false || staff;
    // The rules refuse student updates once submissions close. A student's post that is published
    // after the module deadline stays as it is: the deadline closes editing for published posts.
    case 'edit':         return !!post && (staff || (own && settings.submissionsOpen !== false && !(post.status === 'published' && pastDeadline(settings))));
    case 'delete':       return !!post && ((own && post.status !== 'published') || r >= 2); // students: own drafts; admin: anything
    case 'publish':      return !post ? true : (own && !settings.requireApproval) || staff;
    case 'approve':      return staff;
    case 'comment':      return settings.allowComments !== false;
    case 'deleteComment':return !!post && (post.authorId === user.uid || staff);
    case 'editComment':  return !!post && post.authorId === user.uid;   // one's own words only; staff delete, they do not rewrite
    case 'roster':       return r >= 1;   // see who is behind each pen name
    case 'manageUsers':  return r >= 2;
    case 'settings':     return r >= 2;
    default:             return false;
  }
}
