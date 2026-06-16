/**
 * genId — Collision-resistant unique id generator.
 *
 * Plain `Date.now().toString()` collides when multiple ids are generated in
 * the same millisecond (e.g. AI batch task extraction, bulk duplicate, rapid
 * subtask add). All collisions previously caused "complete one → all
 * complete" style bugs because the items shared the same id.
 *
 * This produces ids of the form `<timestamp>-<random>` which are:
 *  - Sortable by creation time (timestamp prefix)
 *  - Unique across same-tick batches (random suffix)
 *  - Stable string format compatible with existing storage
 *
 * Use `genId()` everywhere a new entity (task, folder, section, recording,
 * comment, note, subtask, calendar event) needs an id.
 */
export const genId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
