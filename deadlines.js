// New deadlines store an absolute instant and the zone the instructor selected.
// Date-only records retain the end of the calendar day used by the original draw.
const legacyZone = 'Europe/Dublin';
export const currentZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function wallTime(at, timeZone) {
  const format = new Intl.DateTimeFormat('en-GB', {timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const parts = Object.fromEntries(format.formatToParts(at).map(p => [p.type, p.value]));
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
}

export function makeDeadline(local, zone) {
  if (!local) return '';
  const nominal = Date.parse(local + ':00Z');
  // Sample both sides of a clock change. Round-trip each possible UTC offset.
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = nominal + delta;
    const offset = Date.parse(wallTime(sample, zone) + ':00Z') - sample;
    const at = nominal - offset;
    if (wallTime(at, zone) === local) candidates.add(at);
  }
  if (!candidates.size) throw Error('That local time is skipped by a clock change. Choose another time.');
  if (candidates.size > 1) throw Error('That local time occurs twice. Choose another time or enter the intended time in UTC.');
  return {at: [...candidates][0], zone};
}

export function deadlineAt(value) {
  if (!value) return NaN;
  if (typeof value === 'object') return value.at;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  return makeDeadline(value + 'T23:59', legacyZone).at + 59999;
}

export function deadlineInput(value) {
  const zone = value?.zone || currentZone();
  return {zone, local: value ? wallTime(deadlineAt(value), zone) : ''};
}

export function fmtDeadline(value) {
  if (!value) return '';
  const zone = value.zone || legacyZone;
  return new Intl.DateTimeFormat('en-GB', {timeZone: zone, day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset'}).format(deadlineAt(value));
}
