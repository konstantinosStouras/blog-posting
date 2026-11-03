# Setting up the blogs and modules on the live site

A walkthrough for the maintainer, done once in the browser at
<https://www.stouras.com/ucd-blog/>. Sign in with Google as `kstouras@gmail.com`
(the admin). Everything below is also what any invited instructor does for their
own modules, minus the admin-only parts.

The outcome:

| Blog (public canvas) | URL | Modules writing on it |
|---|---|---|
| Project Management | `/project-management` | BMGT45540 Managing Innovative Projects · BMGT46260 Managing Performance · BMGT2017D Project Management · Project Management Singapore |
| Operations | `/operations` | BMGT41040 Operations, Innovation and Management |

## 1. Turn the existing module into the Project Management blog

The live module `managing-innovative-projects` (BMGT45540) predates blogs, so it
has no canvas yet.

1. Header → **My modules**. BMGT45540 appears under *Modules without a blog*.
   Click **Settings**.
2. Fill in: **Module code** `BMGT45540`, **Academic year** `2026/27`,
   **Module title** `Managing Innovative Projects`, a **Deadline** if you want it
   shown to students, and whether student posts need approval.
3. Under **Blog canvas** choose **Create a new, separate blog for this module**:
   **Blog title** `Project Management`, **Public URL name** `project-management`.
4. **Save module**. You land on the new blog's settings.

## 2. Write the Project Management exercise

On **Blog settings**:

1. Fill in the brief, the category label *Megatrend* with the six megatrends,
   the *Organisation(s) studied* field, the 900–1,100 word target, the outline
   students can insert and the checklist (the local prototype's sample blog,
   seeded from `PM_EXERCISE` in `seed.js`, shows the wording).
2. Add a **Description** (shown above the canvas), for example *How
   organisations face the megatrends shaping business and society: blog posts
   by UCD project management students.*
3. Leave **Allow comments** ticked. **Save blog**.

Check the public page: `https://www.stouras.com/ucd-blog/project-management`.
The old link `/module/managing-innovative-projects` now redirects there.

## 3. Create the other three project-management modules

For each of the three, **My modules → Create module**:

| Module code | Title | Academic year | Blog canvas |
|---|---|---|---|
| `BMGT46260` | Managing Performance | `2026/27` | Post to one of my existing blogs → **Project Management** |
| `BMGT2017D` | Project Management | `2026/27` | → **Project Management** |
| *(leave empty)* | Project Management Singapore | `2026/27` | → **Project Management** |

Set the deadline and approval per module; they are cohort settings. **Create
module** returns to the blog's settings, where the module is now listed under
*Modules writing on this blog*.

## 4. Create the Operations module with its own blog

**My modules → Create module**: code `BMGT41040`, title
`Operations, Innovation and Management`, academic year `2026/27`, **Blog
canvas → Create a new, separate blog**: title `Operations`, URL name
`operations`. Save. On its Blog settings write the Operations brief (or leave
it for later), decide whether it has categories (leave the list empty for none)
and whether to ask for an organisation. Without categories the Operations
canvas simply shows no megatrend chips.

## 5. Invite the students

Per module: **My modules → Invite students**, choose a city and **Create the
invitation link**. The link is the blog's address plus the city, for example
`https://www.stouras.com/ucd-blog/project-management/join/madrid`, and the
invitation code is the city, `madrid`. Share the link (it prefills the code and
ties the student to that module only) or just the code. It is the module's for
good: next year's cohort uses the same link, until you switch to another city,
which retires the old link at once. There are eight cities (madrid, dublin,
paris, berlin, athens, seattle, singapore, milano) and each serves one module at
a time, so the modules sharing the Project Management blog each have their own
city and the picker greys out the ones in use. Students register with name, university, university email
and ID, verify their email, and land on the module's blog with a **Write your
blog post** button. Students see, and comment on, the posts of their own module
only, never another module's, even one sharing the blog; you, as the blog's
owner, see every module on it, and the instructor area lists posts by module
and academic year.

## Next year

Keep the same modules: their invitation links and cities still work, and each post is
stamped with the academic year it is published in. Posts stay on one canvas,
filterable by academic year; the Instructor area and the CSV export filter by
blog, module and year.
