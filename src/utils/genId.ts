/**
 * genId — Collision-resistant unique id generator.
 *
 * Plain `Date.now().toString()` collides when multiple ids are generated in
 * the same millisecond (e.g. AI batch task extraction, bulk duplicate, rapid
 * subtask add). All collisions previously caused "complete one → all
 * complete" style bugs because the items shared the same id.
 *
 * This now produces UUIDs so new tasks, notes, folders, and sections can be
 * mirrored to the backend immediately. Creation sorting should use createdAt /
 * modifiedAt instead of parsing the id.
 *
 * Use `genId()` everywhere a new entity (task, folder, section, recording,
 * comment, note, subtask, calendar event) needs an id.
 */
export const genId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
