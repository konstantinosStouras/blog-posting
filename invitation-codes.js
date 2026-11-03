// Invitation codes.
//
// A module's student invitation code is one of eight cities, fixed: the module's link is
// https://www.stouras.com/ucd-blog/<blog>/join/madrid and its code "madrid", for every
// year's cohort, until the instructor chooses another city (which retires the old link
// at once). One city serves one module at a time across the whole platform, so the code
// alone tells the platform which module to enrol a student in, and the blog in the
// link must be the module's own.
export const JOIN_CITIES = ['madrid', 'dublin', 'paris', 'berlin', 'athens', 'seattle', 'singapore', 'milano'];
export const normalizeCode = value => String(value || '').trim().toLowerCase();
export const isJoinCity = code => JOIN_CITIES.includes(normalizeCode(code));
export const cityLabel = code => { const c = normalizeCode(code); return c ? c[0].toUpperCase() + c.slice(1) : ''; };

// Instructor invitations (admin → one instructor, bound to an email, a week long) keep a
// random city plus three digits (Ottawa-521): memorable, but not guessable.
export const CITIES = ['Madrid','Paris','London','Dublin','Rome','Berlin','Lisbon','Athens','Vienna','Prague','Warsaw','Budapest','Helsinki','Oslo','Stockholm','Copenhagen','Amsterdam','Brussels','Zurich','Geneva','Venice','Milan','Naples','Turin','Florence','Bologna','Valencia','Seville','Malaga','Granada','Bilbao','Barcelona','Porto','Coimbra','Galway','Cork','Belfast','Edinburgh','Glasgow','Oxford','Cambridge','York','Bath','Bristol','Cardiff','Liverpool','Manchester','Brighton','Bordeaux','Lyon','Nice','Marseille','Toulouse','Nantes','Strasbourg','Hamburg','Munich','Bremen','Cologne','Dresden','Bonn','Salzburg','Innsbruck','Lucerne','Basel','Lausanne','Krakow','Gdansk','Riga','Tallinn','Vilnius','Sofia','Bucharest','Zagreb','Split','Dubrovnik','Ljubljana','Sarajevo','Belgrade','Skopje','Tirana','Istanbul','Ankara','Izmir','Antalya','Cairo','Alexandria','Rabat','Casablanca','Marrakesh','Tunis','Nairobi','Kampala','Kigali','Lagos','Accra','Dakar','Luanda','Lusaka','Harare','Pretoria','Durban','Windhoek','Tokyo','Kyoto','Osaka','Nagoya','Sapporo','Kobe','Hiroshima','Seoul','Busan','Beijing','Shanghai','Chengdu','Nanjing','Hangzhou','Suzhou','Taipei','Singapore','Bangkok','Phuket','Hanoi','Danang','Jakarta','Bandung','Manila','Cebu','Mumbai','Delhi','Jaipur','Agra','Chennai','Kolkata','Bengaluru','Kathmandu','Colombo','Dhaka','Karachi','Lahore','Islamabad','Doha','Dubai','Muscat','Amman','Beirut','Riyadh','Jeddah','Sydney','Melbourne','Brisbane','Perth','Adelaide','Darwin','Canberra','Auckland','Wellington','Hamilton','Christchurch','Toronto','Ottawa','Montreal','Quebec','Vancouver','Calgary','Edmonton','Halifax','Winnipeg','Boston','Chicago','Seattle','Denver','Austin','Dallas','Houston','Phoenix','Atlanta','Miami','Orlando','Tampa','Detroit','Portland','Salem','Raleigh','Nashville','Memphis','Pittsburgh','Cleveland','Baltimore','Buffalo','Albany','Honolulu','Anchorage','Havana','Kingston','Nassau','Panama','Bogota','Medellin','Cartagena','Quito','Cuenca','Lima','Cusco','Arequipa','Santiago','Valparaiso','Montevideo','Asuncion','Brasilia','Recife','Salvador','Fortaleza','Curitiba','Cordoba','Mendoza','Rosario'];
export function randomCity() { return CITIES[crypto.getRandomValues(new Uint32Array(1))[0] % CITIES.length]; }
export function randomCode() { const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100; return `${randomCity()}-${n}`; }

// A student code is standing: it stays valid every academic year until the instructor or
// the admin replaces or revokes it, so its expiresAt holds this far-future moment rather than a date.
export const STANDING_EXPIRY = Date.UTC(9999, 11, 31);
export const isStanding = invite => (invite?.expiresAt || 0) >= STANDING_EXPIRY;
export const expiryLabel = (invite, fmt) => isStanding(invite) ? 'Until revoked' : fmt(invite.expiresAt);
// Student codes handed out before 3 Nov 2026 were a random city and three digits (ottawa-521)
// behind a link with a UUID; they are retired, and no longer accepted.
export const isRetiredStudentCode = invite => invite?.kind !== 'instructor' && !!invite?.code && !isJoinCity(invite.code);
