/**
 * Print the hash for a new Curation Desk passphrase.
 *
 *   node scripts/desk-pass.mjs "the new phrase"
 *
 * Paste the output into DESK_PASSPHRASE_HASH in src/curate/config.js and
 * push. Input is trimmed + lowercased, exactly as the desk does it.
 */
import { createHash } from 'node:crypto';

const phrase = process.argv.slice(2).join(' ').trim().toLowerCase();
if (!phrase) {
  console.error('usage: node scripts/desk-pass.mjs "the new phrase"');
  process.exit(1);
}
console.log(createHash('sha256').update(phrase).digest('hex'));
