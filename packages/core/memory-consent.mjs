/** Consent boundary for assistant-supplied preferences. Pure functions: no I/O, no memory access, no AI calls. */
import { LEVELS, MODES } from './matching.mjs';

export const CONSENT_FIELDS = ['languages', 'interests', 'level', 'hours', 'mode'];
const MAX_LANGUAGES = 8, MAX_LANGUAGE_LENGTH = 25, MAX_INTEREST_LENGTH = 120, MAX_REJECTED_KEYS = 20, MAX_KEY_LENGTH = 40;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Keep only the typed fields an assistant may share. Only key names are reported back, never values,
 * so rejected private context is not echoed or stored. Out-of-range or wrongly typed values for allowed
 * keys are rejected too. `valid` is false only when the input is not an object at all.
 */
export function validateConsentPreferences(input = {}) {
  if (!isPlainObject(input)) return { valid: false, sanitized: {}, rejected: [] };
  const sanitized = {}, rejected = [];
  const reject = key => rejected.push(String(key).slice(0, MAX_KEY_LENGTH));

  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value === undefined) continue;
    if (key === 'languages') {
      const items = Array.isArray(value) ? value : null;
      const cleaned = items?.every(x => typeof x === 'string')
        ? [...new Set(items.map(x => x.trim()).filter(x => x.length > 0 && x.length <= MAX_LANGUAGE_LENGTH))].slice(0, MAX_LANGUAGES) : null;
      if (cleaned) sanitized.languages = cleaned; else reject(key);
    } else if (key === 'interests') {
      if (typeof value === 'string') sanitized.interests = value.trim().slice(0, MAX_INTEREST_LENGTH); else reject(key);
    } else if (key === 'level') {
      if (LEVELS.includes(value)) sanitized.level = value; else reject(key);
    } else if (key === 'mode') {
      if (MODES.includes(value)) sanitized.mode = value; else reject(key);
    } else if (key === 'hours') {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 40) sanitized.hours = value; else reject(key);
    } else reject(key);
  }
  return { valid: true, sanitized, rejected: rejected.slice(0, MAX_REJECTED_KEYS) };
}

/** Human-readable recap of what was shared, so the user can confirm it matches what they approved. */
export function buildConsentSummary(sanitized = {}) {
  const lines = [];
  if (sanitized.languages?.length) lines.push(`Languages: ${sanitized.languages.join(', ')}`);
  if (sanitized.interests) lines.push(`Interests: ${sanitized.interests}`);
  if (sanitized.level) lines.push(`Experience level: ${sanitized.level}`);
  if (sanitized.hours !== undefined) lines.push(`Available time: ${sanitized.hours} hour${sanitized.hours === 1 ? '' : 's'}`);
  if (sanitized.mode) lines.push(`Opportunity type: ${sanitized.mode}`);
  if (lines.length === 0) return 'No preferences were shared. Contributor will use its defaults.';
  return `Shared with Contributor for this session:\n${lines.map(x => `- ${x}`).join('\n')}`;
}
