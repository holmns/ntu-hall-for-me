/**
 * Address redaction for listing text.
 *
 * Hiding the map pin is pointless if the description says "Blk 644 #12-345,
 * Singapore 640644". Providers write the address into the free text without
 * thinking about it, so the platform has to catch it.
 *
 * Patterns are deliberately high-precision: each needs a structural marker (a
 * `#`, the word "blk"/"block", or a 6-digit postal code) rather than any bare
 * number. "Bus 199" and "10 minute walk" must never be redacted, because
 * mangling ordinary sentences is worse than the leak.
 *
 * Building/condo names ("The Centris") are NOT detectable this way and are
 * knowingly out of scope.
 */

export type LocationMatch = { text: string; kind: string };

const PATTERNS: { kind: string; re: RegExp }[] = [
  // Singapore unit number: #12-345, #B1-01
  { kind: "unit number", re: /#\s?[a-z]?\d{1,3}\s?-\s?\d{1,4}[a-z]?/gi },
  // Block number: Blk 644, Block 181A, Blk644
  { kind: "block number", re: /\b(?:blk|block)\s?\.?\s?\d{1,4}[a-z]?\b/gi },
  // Singapore postal code: a standalone 6-digit token. Rents are 3-4 digits
  // and phone numbers are 8, so neither collides.
  { kind: "postal code", re: /\b\d{6}\b/g },
];

/** Find address-like fragments, for warning a provider as they type. */
export function findLocationDetails(text: string): LocationMatch[] {
  const matches: LocationMatch[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = m[0].trim();
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ text: value, kind });
    }
  }
  return matches;
}

const PLACEHOLDER = "[hidden]";

/**
 * Replace address-like fragments with a visible placeholder. Used for the
 * public view of a listing; the full text is restored once the address is
 * unlocked, so nothing is permanently destroyed.
 */
export function redactLocationDetails(text: string): string {
  let output = text;
  for (const { re } of PATTERNS) {
    output = output.replace(re, PLACEHOLDER);
  }
  // Collapse runs like "[hidden], [hidden]" from adjacent matches.
  return output
    .replace(/(?:\[hidden\][,\s]*){2,}/g, `${PLACEHOLDER} `)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function hasLocationDetails(text: string): boolean {
  return findLocationDetails(text).length > 0;
}
