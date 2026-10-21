// A story's version (SPEC §16.2): the first 16 hex characters of its text's SHA-256. The studio,
// `mm timeline`, `mm check` (which records the version it checked in out/check.json) and `mm export`
// (which refuses a report of another version) all name a story by it.
import { createHash } from 'node:crypto';

export const versionOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
