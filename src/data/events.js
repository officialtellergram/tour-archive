/**
 * The tournament calendar — what drives the landing page.
 *
 * The featured collection is never hand-picked: it is computed from today's
 * date against this calendar, so the homepage rolls itself forward as events
 * occur. On GitHub Pages the daily rebuild re-evaluates this at 07:20 UTC, and
 * the browser recomputes it live, so the flip from "upcoming" to "now open" to
 * "the next event" needs no deploy at all.
 *
 * To feature a new tournament: add its event here and its collection to
 * collections.js. That's the entire process.
 */

export const events = [
  {
    id: 'tour-championship-2026',
    collection: 'tour-championship-2026',
    title: 'The 2026 TOUR Championship',
    venue: 'East Lake Golf Club',
    city: 'Atlanta, Georgia',
    // Competition rounds Thu 27 – Sun 30 Aug 2026, per pgatour.com and the
    // tourchampionship.com ticket window (gates open Wed 26). Verified 2026-08-02.
    starts: '2026-08-27',
    ends: '2026-08-30',
    /** The drop stays open this many days after the trophy is handed over. */
    dropCloses: '2026-09-13',
  },
];

const day = 86400000;
const parse = (d) => new Date(`${d}T12:00:00Z`).getTime();

/** live | upcoming | closing | past — relative to `now`. */
export function eventPhase(event, now = Date.now()) {
  const starts = parse(event.starts);
  const ends = parse(event.ends);
  const closes = parse(event.dropCloses || event.ends);
  if (now < starts) return 'upcoming';
  if (now <= ends + day) return 'live';
  if (now <= closes) return 'closing';
  return 'past';
}

/**
 * The event the landing page features right now:
 * a live/closing event wins; otherwise the nearest upcoming; otherwise the
 * most recently finished (so the page never goes blank between seasons).
 */
export function featuredEvent(now = Date.now()) {
  const phased = events.map((e) => ({ ...e, phase: eventPhase(e, now) }));
  return (
    phased.find((e) => e.phase === 'live') ||
    phased.find((e) => e.phase === 'closing') ||
    phased
      .filter((e) => e.phase === 'upcoming')
      .sort((a, b) => parse(a.starts) - parse(b.starts))[0] ||
    phased.sort((a, b) => parse(b.ends) - parse(a.ends))[0] ||
    null
  );
}

/** Whole days until the event starts (0 when underway or past). */
export function daysUntil(event, now = Date.now()) {
  return Math.max(0, Math.ceil((parse(event.starts) - now) / day));
}

/** Human date range: "27 – 30 August 2026". */
export function dateRange(event) {
  const s = new Date(`${event.starts}T12:00:00Z`);
  const e = new Date(`${event.ends}T12:00:00Z`);
  const month = (d) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const sameMonth = month(s) === month(e);
  return sameMonth
    ? `${s.getUTCDate()} – ${e.getUTCDate()} ${month(e)} ${e.getUTCFullYear()}`
    : `${s.getUTCDate()} ${month(s)} – ${e.getUTCDate()} ${month(e)} ${e.getUTCFullYear()}`;
}
