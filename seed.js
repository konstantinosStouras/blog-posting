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

export const DEFAULT_SETTINGS = {
  title: 'UCD blog',
  tagline: 'Posts by curious UCD students',
  module: 'BMGT45540 Managing Innovative Projects',
  challenge: 'PM Challenge 2026',
  categories: MEGATRENDS,
  minWords: 900,
  maxWords: 1100,
  requireApproval: false,   // true = student posts wait for a lecturer before going public
  submissionsOpen: true,
  deadline: '',             // ISO date shown on the Write page, e.g. 2026-11-28
  allowComments: true,
  guide: `<p>The goal of the <strong>PM Challenge</strong> is to promote peer learning and discussion on the impact of a <em>megatrend</em> on business and society. Investigate how <strong>one organisation of your choice</strong> is facing a particular aspect of one of the six megatrends, and write a blog post (not an essay: use hyperlinks to your sources, and add figures, tables or statistics) of <strong>900 to 1,100 words</strong> that answers:</p>
<ol>
<li>Why is the megatrend you selected important to your organisation's management?</li>
<li>How will the organisation's management be affected, positively or negatively, by the megatrend?</li>
<li>What steps is management currently taking to mitigate these effects in the short term (next two years) and the medium term (two to ten years out)?</li>
<li>What other steps do you recommend management take in the short and medium terms?</li>
<li>What are one or two important open questions on this issue that merit comments from your classmates?</li>
</ol>
<p>Roughly a quarter of the post should go to each of the first four questions, with a few sentences for the last. Ground your analysis in top outlets such as FT50 journals, <em>Harvard Business Review</em>, <em>MIT Sloan Management Review</em>, <em>California Management Review</em> or <em>The Economist</em>. Choose the <strong>category</strong> matching your megatrend, add a <strong>featured image</strong> and a few <strong>tags</strong>. To keep peer review anonymous, write under a non-identifying pen name.</p>`,
};

export const SEED_USERS = [
  {uid: 'u-admin', role: 'admin', penName: 'kstouras', firstName: 'Konstantinos', lastName: 'Stouras', email: 'kstouras@gmail.com', affiliation: 'UCD Smurfit', studentId: '', website: 'https://www.stouras.com', bio: 'Module coordinator.'},
  {uid: 'u-lect', role: 'lecturer', penName: 'tutor_eve', firstName: 'Eve', lastName: 'Lecturer', email: 'eve.lecturer@example.com', affiliation: 'UCD Smurfit', studentId: '', website: '', bio: 'Teaching assistant (sample account).'},
  {uid: 'u-s1', role: 'student', penName: 'idkmc', firstName: 'Aoife', lastName: 'Student', email: 'aoife.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000001', website: '', bio: ''},
  {uid: 'u-s2', role: 'student', penName: 'greenbean', firstName: 'Liam', lastName: 'Student', email: 'liam.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000002', website: '', bio: ''},
  {uid: 'u-s3', role: 'student', penName: 'northstar', firstName: 'Priya', lastName: 'Student', email: 'priya.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000003', website: '', bio: ''},
  {uid: 'u-s4', role: 'student', penName: 'quietriver', firstName: 'Tomás', lastName: 'Student', email: 'tomas.student@example.com', affiliation: 'UCD Smurfit MSc', studentId: '26000004', website: '', bio: ''},
];

const d = (iso) => new Date(iso).getTime();
const P = (o) => ({status: 'published', featured: false, ...o, createdAt: d(o.date), updatedAt: d(o.date), publishedAt: d(o.date)});
const sample = '<p class="caption"><em>Sample post about a fictional organisation, shown to illustrate the expected structure.</em></p>';

export const SEED_POSTS = [
  P({id: 'p1', slug: 'from-seaweed-to-sustainable-agriculture', date: '2026-10-31T09:00:00', authorId: 'u-s1', authorName: 'idkmc', category: 'sustainability', organisation: 'Kelpwise Biotech (fictional)', tags: ['agriculture', 'Climate Action', 'Seaweed Biotechnology', 'Sustainability'], featuredImage: img('ucd-seaweed'), featured: true,
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
  P({id: 'p2', slug: 'green-by-design-how-nordlys-is-redefining-corporate-sustainability', date: '2026-10-29T14:00:00', authorId: 'u-s2', authorName: 'greenbean', category: 'sustainability', organisation: 'Nordlys Home (fictional)', tags: ['Carbon Neutrality', 'circular economy', 'Climate Change', 'Corporate Sustainability', 'ESG', 'Green Supply Chain', 'Scope 3 Emissions', 'Waste Reduction'], featuredImage: '',
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
  P({id: 'p3', slug: 'building-green-is-only-the-beginning', date: '2026-10-27T10:30:00', authorId: 'u-s3', authorName: 'northstar', category: 'sustainability', organisation: 'Harbourline Developments (fictional)', tags: ['Green Buildings', 'Sustainability', 'Real Estate', 'Project Management'], featuredImage: img('ucd-tower'),
    title: 'Building Green Is Only the Beginning: How Harbourline Can Turn Sustainable Design into Lasting Building Performance',
    body: `<p>Sustainability can look straightforward on paper. In practice, managing a certified green building for thirty years is a far harder project than designing one. This post looks at <strong>Harbourline Developments</strong>, a fictional property developer, and asks what happens after the ribbon is cut.</p>
<h2>Why it matters to management</h2><p>Green certification drives rental premiums, but the premium evaporates if measured energy performance drifts from the design model.</p>
<h2>How management is affected</h2><p>Facilities teams inherit assumptions made by architects they never met. The project only succeeds if handover includes a performance baseline and an owner for it.</p>
<h2>Current steps</h2><p>Harbourline now writes a two-year post-occupancy evaluation into every contract and keeps a small team on each building until it passes.</p>
<h2>Recommendations</h2><p>Treat each building as a product with a lifecycle roadmap, and report the gap between modelled and measured performance publicly.</p>
<h2>Open questions</h2><p>Who should bear the cost when a building underperforms: the developer, the operator or the tenant?</p>` + sample}),
  P({id: 'p4', slug: 'the-race-to-address-the-hybrid-fitness-boom', date: '2026-10-24T16:00:00', authorId: 'u-s4', authorName: 'quietriver', category: 'health-wellbeing', organisation: 'Stride Athletics (fictional)', tags: ['Fitness', 'Health', 'Consumer Trends', 'Digital Products'], featuredImage: img('ucd-fitness'),
    title: "Stride Athletics' Race to Address the Hybrid Fitness Boom",
    body: `<p>The health and well-being megatrend has turned exercise into a lifestyle identity. <strong>Stride Athletics</strong>, a fictional sportswear brand, is betting that the customer of 2030 trains in the gym, at home and online in the same week.</p>
<h2>Why it matters</h2><p>Hybrid athletes buy more categories and churn faster. Management must decide whether Stride is a product company or a membership company.</p>
<h2>Effects on management</h2><p>Digital subscriptions require software release cadences that a seasonal apparel calendar was never built for.</p>
<h2>Current steps</h2><p>A cross-functional squad now ships app features every fortnight; the medium-term plan is a loyalty layer connecting purchases to training data.</p>
<h2>Recommendations</h2><p>Protect the squad from the seasonal planning cycle and measure it on retention, not launches.</p>
<h2>Open questions</h2><p>Does owning training data create more value than the privacy risk it carries?</p>` + sample}),
  P({id: 'p5', slug: 'keep-ai-at-the-front-desk', date: '2026-10-20T11:00:00', authorId: 'u-s1', authorName: 'idkmc', category: 'digital-transformation', organisation: 'Bayfront Hotels Group (fictional)', tags: ['AI', 'Hospitality', 'Digital Transformation', 'Service Operations'], featuredImage: img('ucd-hotel'),
    title: 'Keep AI at the Front Desk? Can Technology Improve Hospitality at Bayfront Hotels',
    body: `<p>Digital transformation in hospitality is often sold as cost cutting. For <strong>Bayfront Hotels Group</strong>, a fictional luxury operator, the harder question is whether automation can raise service quality rather than just lower headcount.</p>
<h2>Why it matters</h2><p>Guests now expect the convenience of an app and the warmth of a concierge in the same stay.</p>
<h2>Effects on management</h2><p>Every automated touchpoint is a project with a service-recovery plan attached: when the chatbot fails, a human must appear within minutes.</p>
<h2>Current steps</h2><p>Mobile check-in across all properties this year; an AI concierge pilot in two flagships over the next three.</p>
<h2>Recommendations</h2><p>Define service-level agreements for the human fallback before scaling any AI feature.</p>
<h2>Open questions</h2><p>Will guests pay a premium for human service once automation is the norm?</p>` + sample}),
  P({id: 'p6', slug: 'the-cooling-crisis-engineering-sustainability-into-the-data-centre-boom', date: '2026-10-15T09:00:00', authorId: 'u-s2', authorName: 'greenbean', category: 'digital-transformation', organisation: 'Frostline Infrastructure (fictional)', tags: ['Data Centres', 'Energy', 'Ireland', 'Sustainability'], featuredImage: img('ucd-datacentre'),
    title: 'The Cooling Crisis: How Frostline Is Engineering Sustainability Into the Data Centre Boom',
    body: `<p>Ireland hosts a disproportionate share of Europe's data centres, and <strong>Frostline Infrastructure</strong>, a fictional operator, sits at the centre of the debate about grid capacity and water use.</p>
<h2>Why it matters</h2><p>Planning permission increasingly depends on demonstrating energy and water strategies, so sustainability has become the critical path of every build.</p>
<h2>Effects on management</h2><p>Projects now carry regulatory milestones that can stop construction entirely, which changes how risk is priced.</p>
<h2>Current steps</h2><p>Heat-reuse agreements with district heating schemes and on-site battery storage to shave peak demand.</p>
<h2>Recommendations</h2><p>Publish a water-use baseline per site and make it part of the project charter.</p>
<h2>Open questions</h2><p>Should a country cap data-centre growth even when the economic benefits are large?</p>` + sample}),
  P({id: 'p7', slug: 'anticipating-africa-a-race-to-build-the-cities-of-tomorrow', date: '2026-10-10T13:00:00', authorId: 'u-s3', authorName: 'northstar', category: 'demographic-shifts', organisation: 'Meridian Urban Partners (fictional)', tags: ['Urbanization', 'Africa', 'Infrastructure', 'Demographics'], featuredImage: img('ucd-city'),
    title: "Anticipating Africa: Meridian's Race to Build the Cities of Tomorrow",
    body: `<p>By 2050 most of the world's urban growth will happen in Africa. <strong>Meridian Urban Partners</strong>, a fictional infrastructure developer, is trying to plan cities faster than they grow.</p>
<h2>Why it matters</h2><p>Demographic growth is the demand forecast; the risk is in sequencing water, power and housing projects so none becomes the bottleneck.</p>
<h2>Effects on management</h2><p>Programme management across dozens of interdependent projects with different funders and timelines.</p>
<h2>Current steps</h2><p>A shared digital master plan updated quarterly and an infrastructure-first phasing rule.</p>
<h2>Recommendations</h2><p>Adopt rolling-wave planning and keep community consultation as a standing workstream rather than a milestone.</p>
<h2>Open questions</h2><p>How much should be planned centrally, and how much left to emerge?</p>` + sample}),
  {id: 'p8', slug: 'remote-work-at-a-global-bank', title: 'Remote work at a global bank (draft in progress)', authorId: 'u-s4', authorName: 'quietriver', category: 'future-of-work', organisation: '', tags: ['Remote Work'], featuredImage: '', status: 'draft', featured: false,
    body: '<p>Notes so far: hybrid policy announced; need numbers on office utilisation and attrition.</p>', createdAt: d('2026-10-30T18:00:00'), updatedAt: d('2026-10-30T18:00:00'), publishedAt: null},
];

export const SEED_COMMENTS = [
  {id: 'c1', postId: 'p6', authorId: 'u-s3', authorName: 'northstar', createdAt: d('2026-10-16T08:10:00'), body: 'Really clear explanation of why planning permission has become the critical path. Do you know whether heat reuse has actually been delivered anywhere in Ireland yet?'},
  {id: 'c2', postId: 'p6', authorId: 'u-s2', authorName: 'greenbean', createdAt: d('2026-10-16T12:40:00'), body: 'Good question. Two schemes are in planning but, as far as I could find, none is live. I would love a classmate with an engineering background to weigh in.'},
  {id: 'c3', postId: 'p7', authorId: 'u-s1', authorName: 'idkmc', createdAt: d('2026-10-12T19:00:00'), body: 'The rolling-wave planning recommendation fits the lecture on uncertainty well. One worry: does quarterly updating of a master plan create its own coordination cost?'},
  {id: 'c4', postId: 'p7', authorId: 'u-lect', authorName: 'tutor_eve', createdAt: d('2026-10-13T09:00:00'), body: 'Nice structure. For the final version, link each recommendation to the evidence you cite in the first half.'},
];
