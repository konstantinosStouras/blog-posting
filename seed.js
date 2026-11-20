// Sample content for local mode and for the first run of a new Firebase project.
// Every organisation below is FICTIONAL; the posts only show the shape and tone of
// a good PM Challenge post. Real posts analyse real organisations.
const img = (seed, w = 900, h = 560) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const MEGATRENDS = [
  {slug: 'global-power-shifts', name: 'Global power shifts and geopolitical realignments'},
  {slug: 'future-of-work', name: 'The future of work and workforce transformation'},
  {slug: 'digital-transformation', name: 'Digital transformation'},
  {slug: 'sustainability', name: 'Sustainability and climate change'},
  {slug: 'demographic-shifts', name: 'Demographic shifts and urbanization'},
  {slug: 'health-wellbeing', name: 'Health and well-being revolution'},
];

// The industries a post can be related to. Site-wide (every blog shares the list), several per post.
export const INDUSTRIES = [
  {slug: 'agriculture-food', name: 'Agriculture and food'},
  {slug: 'automotive', name: 'Automotive'},
  {slug: 'aviation-aerospace', name: 'Aviation and aerospace'},
  {slug: 'banking-finance', name: 'Banking and financial services'},
  {slug: 'construction-real-estate', name: 'Construction and real estate'},
  {slug: 'consumer-goods-retail', name: 'Consumer goods and retail'},
  {slug: 'education', name: 'Education'},
  {slug: 'energy-utilities', name: 'Energy and utilities'},
  {slug: 'entertainment-media', name: 'Entertainment and media'},
  {slug: 'government-public-sector', name: 'Government and public sector'},
  {slug: 'healthcare-pharma', name: 'Healthcare and pharmaceuticals'},
  {slug: 'hospitality-tourism', name: 'Hospitality and tourism'},
  {slug: 'insurance', name: 'Insurance'},
  {slug: 'manufacturing', name: 'Manufacturing'},
  {slug: 'mining-materials', name: 'Mining and materials'},
  {slug: 'nonprofit', name: 'Non-profit and NGOs'},
  {slug: 'professional-services', name: 'Professional services and consulting'},
  {slug: 'technology-software', name: 'Technology and software'},
  {slug: 'telecommunications', name: 'Telecommunications'},
  {slug: 'transport-logistics', name: 'Transport and logistics'},
];
export const MAX_INDUSTRIES = 5;
export const industryName = slug => INDUSTRIES.find(i => i.slug === slug)?.name || slug || '';

// Site-wide settings are only the masthead. Everything about an exercise (brief,
// categories, word target, outline, checklist, comments policy) belongs to a BLOG,
// and cohort matters (academic year, deadline, approval, open/closed) to a MODULE.
export const DEFAULT_SETTINGS = {
  title: 'UCD blog',
  tagline: 'Posts by curious UCD students',
};

// The PM Challenge exercise, applied to the maintainer's project-management blog.
// Other instructors' blogs start from EMPTY_EXERCISE and define their own.
export const PM_EXERCISE = {
  categoryLabel: 'Megatrend',
  categories: MEGATRENDS,
  organisationLabel: 'Organisation(s) studied',
  minWords: 4500,
  maxWords: 5500,
  brief: `<h2>PM Challenge /thisYear</h2>
<p>Choose one existing organisation and one aspect of one of the six megatrends. Write a blog post of <strong>/wordTarget</strong> for your classmates. Use a project management technique taught in class to investigate the case and support your recommendation. Link to credible sources where you use them and include a figure, table or statistic where it helps explain your analysis.</p>
<ol>
<li><strong>How is the megatrend affecting your organisation?</strong> Focus on one part of its work, such as how it delivers a service, manages a project or supports its workforce. Use evidence to explain what is changing and why it matters.</li>
<li><strong>How is the organisation responding?</strong> Examine one initiative. Distinguish what the organisation has announced, what it has implemented and what the evidence shows about its impact so far.</li>
<li><strong>What does a technique taught in class reveal about this case?</strong> Choose a project management technique, explain why it fits and apply it using evidence from the case. State your assumptions, show your result and explain what it tells you about the organisation’s options.</li>
<li><strong>What should the organisation do next, and why?</strong> Use a specific finding from your technique to recommend an action for the next two years. Explain why you favour it over a plausible alternative, what trade-off it involves and what evidence should guide action in years three to ten.</li>
<li><strong>Who would benefit from your recommendation, and who might bear the costs or risks?</strong> Examine the likely consequences for two groups. Explain where their interests align or conflict and how that affects your judgement.</li>
</ol>
<h2>Marking rubric</h2>
<ul>
<li><strong>1. Explain the impact (15%).</strong> Adequate work describes a relevant change. Excellent work uses case evidence to show how the trend affects a specific activity and why the effect matters.</li>
<li><strong>2. Assess the response (15%).</strong> Adequate work describes an initiative and its intended benefits. Excellent work distinguishes plans, actions and observed results, and explains what remains uncertain.</li>
<li><strong>3. Apply a class technique (30%).</strong> Adequate work applies a relevant technique and reports a result. Excellent work justifies the choice, shows how evidence and assumptions produce the result, and interprets its implications for the options.</li>
<li><strong>4. Support a recommendation (30%).</strong> Adequate work proposes a feasible action with a general rationale. Excellent work uses a specific result to justify one option over another, weighs a trade-off and identifies evidence that would warrant continuing or changing course.</li>
<li><strong>5. Evaluate stakeholder consequences (10%).</strong> Adequate work identifies two groups and a likely effect on each. Excellent work explains how benefits, costs or risks arise for each group and uses that comparison to defend or refine the recommendation.</li>
</ul>
<h2>Length and sources</h2>
<p>Your post should be <strong>/wordTarget</strong>, excluding the text of tables, table captions, figure captions, appendices and links. Reference every source you mention with a hyperlink, as opposed to a list of references at the end. I highly encourage you to read and reference top outlets such as the <a href="https://www.ft.com/content/3405a512-5cbb-11e1-8f1f-00144feabdc0" target="_blank" rel="noopener">FT50</a> research journals, <em>Harvard Business Review</em>, <em>MIT Sloan Management Review</em>, <em>California Management Review</em>, <em>The Economist</em>, <em>Bloomberg Businessweek</em>, <em>Forbes</em>, and major newspapers or trustworthy articles on the web.</p>
<h2>Submitting your post</h2>
<p>Write and publish your post on this blog, logged in through the invitation from your instructor (how it works is explained below). When you publish, select your megatrend as the post's <strong>category</strong>, choose an informative <strong>featured image</strong> (one that relates closely to or summarises your post; it is shown on the blog's canvas) and add appropriate <strong>tags</strong>. Once your post is published:</p>
<ol>
<li>Fill out <a href="https://docs.google.com/forms/d/e/1FAIpQLSdBXMZFyq1-Ie8864nVZz27cORIJ_fsWxhHnLnMMOOTQ0vL9w/viewform" target="_blank" rel="noopener">this Google form</a>, making sure all the required information is provided accurately.</li>
<li>Download the designated template from Brightspace and complete it with the details it asks for. No additional information is necessary beyond what the template outlines.</li>
<li>Convert the completed Word template to PDF.</li>
<li>Upload the PDF to the relevant Assignment on Brightspace. Multiple submissions are allowed; I will normally grade the most recent one unless you say otherwise in the comments.</li>
</ol>
<p>Overall, this exercise lets you synthesise the knowledge gained from our module and combine it with your own experience and research.</p>`,
  // {organisation} and {category} are filled in from the post's side panel.
  outline: `<h2>How {category} is affecting {organisation}</h2><p></p>
<h2>The organisation’s response and results so far</h2><p></p>
<h2>Applying a project management technique</h2><p></p>
<h2>My recommendation and the evidence behind it</h2><p></p>
<h2>Who benefits and who bears the costs or risks?</h2><p></p>`,
  checklist: ["Explain the change using case evidence","Assess one initiative and its results","Apply a class technique and interpret the result","Use the result to justify your recommendation and weigh an alternative","Compare consequences for two stakeholder groups","Link claims to credible sources"],
};
export const EMPTY_EXERCISE = {categoryLabel: 'Category', categories: [], organisationLabel: '', minWords: 4500, maxWords: 5500, brief: '<h2>/blogTitle Challenge /thisYear</h2><p>Write a blog post of <strong>/wordTarget</strong>.</p>', outline: '', checklist: []};
// The reply rules shown under the comment box: every blog starts with these; an instructor
// rewrites them in Blog settings, and they apply to every post on that blog's canvas.
export const DEFAULT_REPLY_RULES = 'Be nice, and be specific: reply to what the author actually argued, with your own reasoning and, where you can, evidence. Disagreement is welcome; dismissiveness is not. If you use AI to help, make sure the idea is yours and the words are too.';
export const replyRulesOf = blog => (blog && typeof blog.replyRules === 'string' && blog.replyRules.trim()) || DEFAULT_REPLY_RULES;

const T0 = new Date('2026-09-01T09:00:00').getTime();
export const SEED_BLOGS = [
  {id: 'project-management', title: 'Project Management', description: 'How organisations face the megatrends shaping business and society: blog posts by UCD project management students.', teacherIds: ['u-admin'], createdBy: 'u-admin', createdAt: T0, updatedAt: T0, allowComments: true, ...PM_EXERCISE},
  {id: 'operations', title: 'Operations', description: 'Blog posts by students of BMGT41040 Operations, Innovation and Management.', teacherIds: ['u-admin'], createdBy: 'u-admin', createdAt: T0, updatedAt: T0, allowComments: true, ...EMPTY_EXERCISE, brief: '<h2>OIM Challenge /thisYear</h2><p>Write a blog post of <strong>/wordTarget</strong>.</p>'},
];
const M = (o) => ({description: '', teacherIds: ['u-admin'], teacherName: 'Konstantinos Stouras', createdBy: 'u-admin', createdAt: T0, updatedAt: T0, submissionsOpen: true, requireApproval: false, deadline: '2026-11-28', ...o});
export const SEED_MODULES = [
  M({id: 'bmgt45540-2026-27', code: 'BMGT45540', title: 'Managing Innovative Projects', blogId: 'project-management'}),
  M({id: 'bmgt46260-2026-27', code: 'BMGT46260', title: 'Managing Performance', blogId: 'project-management'}),
  M({id: 'bmgt2017d-2026-27', code: 'BMGT2017D', title: 'Project Management', blogId: 'project-management'}),
  M({id: 'pm-singapore-2026-27', code: '', title: 'Project Management Singapore', blogId: 'project-management'}),
  M({id: 'bmgt41040-2026-27', code: 'BMGT41040', title: 'Operations, Innovation and Management', blogId: 'operations', deadline: ''}),
];
export const SEED_MEMBERSHIPS = [
  {uid: 'u-s1', moduleId: 'bmgt45540-2026-27'}, {uid: 'u-s2', moduleId: 'bmgt45540-2026-27'},
  {uid: 'u-s3', moduleId: 'bmgt46260-2026-27'}, {uid: 'u-s4', moduleId: 'bmgt41040-2026-27'},
];

export const SEED_USERS = [
  {uid: 'u-admin', role: 'admin', penName: 'kstouras', firstName: 'Konstantinos', lastName: 'Stouras', email: 'kstouras@gmail.com', affiliation: 'UCD Smurfit', studentId: '', website: 'https://www.stouras.com', bio: 'Module coordinator.'},
  {uid: 'u-lect', role: 'lecturer', penName: 'tutor_eve', firstName: 'Eve', lastName: 'Lecturer', email: 'eve.lecturer@example.com', affiliation: 'UCD Smurfit', studentId: '', website: '', bio: 'Teaching assistant (sample account).'},
  {uid: 'u-s1', role: 'student', penName: 'quiet-heron-482', firstName: 'Aoife', lastName: 'Student', email: 'aoife.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000001', website: '', bio: ''},
  {uid: 'u-s2', role: 'student', penName: 'amber-falcon-731', firstName: 'Liam', lastName: 'Student', email: 'liam.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000002', website: '', bio: ''},
  {uid: 'u-s3', role: 'student', penName: 'swift-osprey-215', firstName: 'Priya', lastName: 'Student', email: 'priya.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000003', website: '', bio: ''},
  {uid: 'u-s4', role: 'student', penName: 'mellow-birch-908', firstName: 'Tomás', lastName: 'Student', email: 'tomas.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000004', website: '', bio: ''},
];

const d = (iso) => new Date(iso).getTime();
const P = (o) => ({status: 'published', featured: false, moduleId: 'bmgt45540-2026-27', blogId: 'project-management', academicYear: '2026/27', ...o, createdAt: d(o.date), updatedAt: d(o.date), publishedAt: d(o.date)});
const sample = '<p class="caption"><em>Sample post about a fictional organisation, shown to illustrate the expected structure.</em></p>';

export const SEED_POSTS = [
  P({id: 'p1', slug: 'from-seaweed-to-sustainable-agriculture', date: '2026-10-31T09:00:00', authorId: 'u-s1', authorName: 'quiet-heron-482', category: 'sustainability', organisation: 'Kelpwise Biotech (fictional)', industries: ['agriculture-food', 'healthcare-pharma'], tags: ['agriculture', 'Climate Action', 'Seaweed Biotechnology', 'Sustainability'], featuredImage: img('ucd-seaweed'), featured: true,
    title: 'From Seaweed to Sustainable Agriculture: How Kelpwise Can Scale Climate-Resilient Innovation',
    body: `<p>As climate change continues to threaten global food production, innovative solutions are urgently needed to help farmers grow crops under challenging conditions. One company offering a promising path forward is <strong>Kelpwise Biotech</strong>, a fictional Singapore-founded start-up that cultivates and ferments seaweed into plant biostimulants.</p>
<h2>Why is sustainability and climate change important to Kelpwise's management?</h2>
<p>Pressure on global food systems is pushing agriculture to produce more while using fewer resources. For Kelpwise this is both a business opportunity and a management responsibility: its products are only valuable if they demonstrably improve soil structure, water retention and crop resilience under real farm conditions.</p>
<h2>How will the megatrend affect Kelpwise's management?</h2>
<p>Heat and water stress create demand in exactly the regions that are hardest to serve. Scaling from pilot plots to thousands of hectares means Kelpwise must manage a project portfolio spanning field trials, regulatory approvals and distribution partnerships, each with different risk profiles.</p>
<h2>What is management doing now?</h2>
<p>In the short term the company is running multi-season trials with partner farms and publishing results openly. In the medium term it plans a licensed production model so that regional partners can ferment locally rather than ship biomass across oceans.</p>
<h2>What else should management do?</h2>
<p>Management should treat every new market as a stage-gated project with explicit kill criteria, and publish sustainability metrics (farmer income, emissions, water-use efficiency) so that customers and investors can distinguish demonstrated benefits from anticipated ones.</p>
<h2>Two questions remain open</h2>
<p><strong>Question 1:</strong> How should Kelpwise balance rapid international expansion with the need for reliable evidence across different agricultural environments?</p>
<p><strong>Question 2:</strong> Should the company prioritise commercial growth or invest more heavily in demonstrating measurable benefits for the seaweed-farming communities on which its supply chain depends?</p>` + sample}),
  P({id: 'p2', slug: 'green-by-design-how-nordlys-is-redefining-corporate-sustainability', date: '2026-10-29T14:00:00', authorId: 'u-s2', authorName: 'amber-falcon-731', category: 'sustainability', organisation: 'Nordlys Home (fictional)', industries: ['consumer-goods-retail', 'manufacturing'], tags: ['Carbon Neutrality', 'circular economy', 'Climate Change', 'Corporate Sustainability', 'ESG', 'Green Supply Chain', 'Scope 3 Emissions', 'Waste Reduction'], featuredImage: '',
    title: 'Green by Design: How Nordlys Home is Redefining Corporate Sustainability in the Fight Against Climate Change',
    body: `<p>Why is climate change important to Nordlys Home's management? Climate change is a notable megatrend affecting the fictional furniture retailer's resource availability, operating costs and reputation with a generation of customers who read sustainability reports before they read price tags.</p>
<h2>Why the megatrend matters</h2>
<p>Timber, foam and shipping are all exposed to carbon pricing and supply shocks. Nordlys sources from forty countries, so Scope 3 emissions dwarf everything the company controls directly.</p>
<h2>How management is affected</h2>
<p>Positively, a credible circular product line opens a repair-and-resale revenue stream. Negatively, every supplier audit adds cost and slows new product introduction, which is the lifeblood of a fast-moving retailer.</p>
<h2>Current steps</h2>
<p>Short term: a take-back scheme in flagship stores and a switch to recycled polyester fill. Medium term: redesigning its best-selling range for disassembly so that components can be reused.</p>
<h2>Recommendations</h2>
<p>Run the take-back scheme as a proper pilot project with a measurable hypothesis, and tie supplier contracts to verified emissions data rather than self-reporting.</p>
<h2>Open questions</h2>
<p>Can a low-price retailer ever make circularity pay without raising prices? And who should own the risk of a redesign that customers do not want?</p>` + sample}),
  P({id: 'p3', moduleId: 'bmgt46260-2026-27', slug: 'building-green-is-only-the-beginning', date: '2026-10-27T10:30:00', authorId: 'u-s3', authorName: 'swift-osprey-215', category: 'sustainability', organisation: 'Harbourline Developments (fictional)', industries: ['construction-real-estate'], tags: ['Green Buildings', 'Sustainability', 'Real Estate', 'Project Management'], featuredImage: img('ucd-tower'),
    title: 'Building Green Is Only the Beginning: How Harbourline Can Turn Sustainable Design into Lasting Building Performance',
    body: `<p>Sustainability can look straightforward on paper. In practice, managing a certified green building for thirty years is a far harder project than designing one. This post looks at <strong>Harbourline Developments</strong>, a fictional property developer, and asks what happens after the ribbon is cut.</p>
<h2>Why it matters to management</h2><p>Green certification drives rental premiums, but the premium evaporates if measured energy performance drifts from the design model.</p>
<h2>How management is affected</h2><p>Facilities teams inherit assumptions made by architects they never met. The project only succeeds if handover includes a performance baseline and an owner for it.</p>
<h2>Current steps</h2><p>Harbourline now writes a two-year post-occupancy evaluation into every contract and keeps a small team on each building until it passes.</p>
<h2>Recommendations</h2><p>Treat each building as a product with a lifecycle roadmap, and report the gap between modelled and measured performance publicly.</p>
<h2>Open questions</h2><p>Who should bear the cost when a building underperforms: the developer, the operator or the tenant?</p>` + sample}),
  P({id: 'p4', moduleId: 'bmgt41040-2026-27', blogId: 'operations', slug: 'the-race-to-address-the-hybrid-fitness-boom', date: '2026-10-24T16:00:00', authorId: 'u-s4', authorName: 'mellow-birch-908', category: '', organisation: 'Stride Athletics (fictional)', industries: ['consumer-goods-retail'], tags: ['Fitness', 'Health', 'Consumer Trends', 'Digital Products'], featuredImage: img('ucd-fitness'),
    title: "Stride Athletics' Race to Address the Hybrid Fitness Boom",
    body: `<p>The health and well-being megatrend has turned exercise into a lifestyle identity. <strong>Stride Athletics</strong>, a fictional sportswear brand, is betting that the customer of 2030 trains in the gym, at home and online in the same week.</p>
<h2>Why it matters</h2><p>Hybrid athletes buy more categories and churn faster. Management must decide whether Stride is a product company or a membership company.</p>
<h2>Effects on management</h2><p>Digital subscriptions require software release cadences that a seasonal apparel calendar was never built for.</p>
<h2>Current steps</h2><p>A cross-functional squad now ships app features every fortnight; the medium-term plan is a loyalty layer connecting purchases to training data.</p>
<h2>Recommendations</h2><p>Protect the squad from the seasonal planning cycle and measure it on retention, not launches.</p>
<h2>Open questions</h2><p>Does owning training data create more value than the privacy risk it carries?</p>` + sample}),
  P({id: 'p5', slug: 'keep-ai-at-the-front-desk', date: '2026-10-20T11:00:00', authorId: 'u-s1', authorName: 'quiet-heron-482', category: 'digital-transformation', organisation: 'Bayfront Hotels Group (fictional)', industries: ['hospitality-tourism', 'technology-software'], tags: ['AI', 'Hospitality', 'Digital Transformation', 'Service Operations'], featuredImage: img('ucd-hotel'),
    title: 'Keep AI at the Front Desk? Can Technology Improve Hospitality at Bayfront Hotels',
    body: `<p>Digital transformation in hospitality is often sold as cost cutting. For <strong>Bayfront Hotels Group</strong>, a fictional luxury operator, the harder question is whether automation can raise service quality rather than just lower headcount.</p>
<h2>Why it matters</h2><p>Guests now expect the convenience of an app and the warmth of a concierge in the same stay.</p>
<h2>Effects on management</h2><p>Every automated touchpoint is a project with a service-recovery plan attached: when the chatbot fails, a human must appear within minutes.</p>
<h2>Current steps</h2><p>Mobile check-in across all properties this year; an AI concierge pilot in two flagships over the next three.</p>
<h2>Recommendations</h2><p>Define service-level agreements for the human fallback before scaling any AI feature.</p>
<h2>Open questions</h2><p>Will guests pay a premium for human service once automation is the norm?</p>` + sample}),
  P({id: 'p6', slug: 'the-cooling-crisis-engineering-sustainability-into-the-data-centre-boom', date: '2026-10-15T09:00:00', authorId: 'u-s2', authorName: 'amber-falcon-731', category: 'digital-transformation', organisation: 'Frostline Infrastructure (fictional)', industries: ['technology-software', 'energy-utilities'], tags: ['Data Centres', 'Energy', 'Sustainability'], featuredImage: img('ucd-datacentre'),
    title: 'The Cooling Crisis: How Frostline Is Engineering Sustainability Into the Data Centre Boom',
    body: `<p>As data centres compete for grid capacity, <strong>Frostline Infrastructure</strong>, a fictional operator, sits at the centre of the debate about grid capacity and water use.</p>
<h2>Why it matters</h2><p>Planning permission increasingly depends on demonstrating energy and water strategies, so sustainability has become the critical path of every build.</p>
<h2>Effects on management</h2><p>Projects now carry regulatory milestones that can stop construction entirely, which changes how risk is priced.</p>
<h2>Current steps</h2><p>Heat-reuse agreements with district heating schemes and on-site battery storage to shave peak demand.</p>
<h2>Recommendations</h2><p>Publish a water-use baseline per site and make it part of the project charter.</p>
<h2>Open questions</h2><p>Should a country cap data-centre growth even when the economic benefits are large?</p>` + sample}),
  P({id: 'p7', moduleId: 'bmgt46260-2026-27', slug: 'anticipating-africa-a-race-to-build-the-cities-of-tomorrow', date: '2026-10-10T13:00:00', authorId: 'u-s3', authorName: 'swift-osprey-215', category: 'demographic-shifts', organisation: 'Meridian Urban Partners (fictional)', industries: ['construction-real-estate', 'government-public-sector'], tags: ['Urbanization', 'Africa', 'Infrastructure', 'Demographics'], featuredImage: img('ucd-city'),
    title: "Anticipating Africa: Meridian's Race to Build the Cities of Tomorrow",
    body: `<p>By 2050 most of the world's urban growth will happen in Africa. <strong>Meridian Urban Partners</strong>, a fictional infrastructure developer, is trying to plan cities faster than they grow.</p>
<h2>Why it matters</h2><p>Demographic growth is the demand forecast; the risk is in sequencing water, power and housing projects so none becomes the bottleneck.</p>
<h2>Effects on management</h2><p>Programme management across dozens of interdependent projects with different funders and timelines.</p>
<h2>Current steps</h2><p>A shared digital master plan updated quarterly and an infrastructure-first phasing rule.</p>
<h2>Recommendations</h2><p>Adopt rolling-wave planning and keep community consultation as a standing workstream rather than a milestone.</p>
<h2>Open questions</h2><p>How much should be planned centrally, and how much left to emerge?</p>` + sample}),
  {id: 'p8', moduleId: 'bmgt41040-2026-27', blogId: 'operations', academicYear: '2026/27', slug: 'remote-work-at-a-global-bank', title: 'Remote work at a global bank (draft in progress)', authorId: 'u-s4', authorName: 'mellow-birch-908', category: 'future-of-work', organisation: '', tags: ['Remote Work'], featuredImage: '', status: 'draft', featured: false,
    body: '<p>Notes so far: hybrid policy announced; need numbers on office utilisation and attrition.</p>', createdAt: d('2026-10-30T18:00:00'), updatedAt: d('2026-10-30T18:00:00'), publishedAt: null},
];

export const SEED_COMMENTS = [
  {id: 'c1', postId: 'p6', authorId: 'u-s3', authorName: 'swift-osprey-215', createdAt: d('2026-10-16T08:10:00'), likedBy: ['u-s2'], body: 'Really clear explanation of why planning permission has become the critical path. Do you know whether heat reuse has actually been delivered at any of these sites yet?'},
  {id: 'c2', postId: 'p6', parentId: 'c1', authorId: 'u-s2', authorName: 'amber-falcon-731', createdAt: d('2026-10-16T12:40:00'), body: 'Good question. Two schemes are in planning but, as far as I could find, none is live. I would love a classmate with an engineering background to weigh in.'},
  {id: 'c3', postId: 'p7', authorId: 'u-s1', authorName: 'quiet-heron-482', createdAt: d('2026-10-12T19:00:00'), body: 'The rolling-wave planning recommendation fits the lecture on uncertainty well. One worry: does quarterly updating of a master plan create its own coordination cost?'},
  {id: 'c4', postId: 'p7', authorId: 'u-lect', authorName: 'tutor_eve', createdAt: d('2026-10-13T09:00:00'), body: 'Nice structure. For the final version, link each recommendation to the evidence you cite in the first half.'},
];
