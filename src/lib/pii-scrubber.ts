export interface ScrubResult {
  scrubbed: string;
  redactions: string[];
  redactionCount: number;
}

// CIBC-aware PII patterns
const PATTERNS: { label: string; regex: RegExp }[] = [
  // Card numbers: 16-digit groups (xxxx xxxx xxxx xxxx or xxxxxxxxxxxxxxxx)
  {
    label: "CARD_NUMBER",
    regex: /\b(?:\d{4}[\s-]){3}\d{4}\b|\b\d{16}\b/g,
  },
  // Masked card numbers: xxxx xxxx xxxx 1234 style (already partially masked)
  {
    label: "CARD_NUMBER",
    regex: /\b[Xx*]{4}[\s-][Xx*]{4}[\s-][Xx*]{4}[\s-]\d{4}\b/g,
  },
  // CIBC field labels — redact the label + value, including masked values (e.g. "Transit Number: -")
  {
    label: "TRANSIT_NUMBER",
    regex: /\bTransit\s*(?:Number|No\.?)\s*:[ \t]*[\d -]*/gi,
  },
  {
    label: "INSTITUTION_NUMBER",
    regex: /\bInstitution\s*(?:Number|No\.?)\s*:[ \t]*[\d -]*/gi,
  },
  {
    label: "ACCOUNT_NUMBER",
    regex: /\bAccount\s*(?:Number|No\.?|#)?\s*:[ \t]*[\d -]*/gi,
  },
  // CIBC account display format: NNNNN-NN-NNNNN or NNNNN-NNN-NNNNNNN (hyphen-separated)
  // e.g. 06552-63-22980 or 00012-010-1234567
  {
    label: "ACCOUNT_NUMBER",
    regex: /\b\d{4,6}-\d{2,3}-\d{4,8}\b/g,
  },
  // Canadian transit/institution/account space-separated: e.g. 00012 345 1234567
  {
    label: "TRANSIT_NUMBER",
    regex: /\b\d{5}\s\d{3}\s\d{7}\b/g,
  },
  // SIN: 9 digits, optionally separated by spaces or dashes
  {
    label: "SIN",
    regex: /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g,
  },
  // Canadian phone numbers
  {
    label: "PHONE",
    regex:
      /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  // Canadian postal codes
  {
    label: "POSTAL_CODE",
    regex: /\b[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d\b/g,
  },
  // Email addresses
  {
    label: "EMAIL",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  // CIBC name greeting lines: "Dear John Smith," or "Hello Jane Doe"
  {
    label: "NAME",
    regex: /\b(?:Dear|Hello|Hi)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+[,.]?/g,
  },
  // Street addresses (number + street name + type)
  {
    label: "ADDRESS",
    regex:
      /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Lane|Ln|Way|Cres|Court|Ct|Place|Pl|Terrace|Terr)\.?\b/g,
  },
];

export function scrubPII(text: string): ScrubResult {
  const redactions: string[] = [];
  let scrubbed = text;

  for (const { label, regex } of PATTERNS) {
    scrubbed = scrubbed.replace(regex, (match) => {
      redactions.push(`[${label}: ${match.trim()}]`);
      return `[${label}_REDACTED]`;
    });
  }

  return {
    scrubbed,
    redactions,
    redactionCount: redactions.length,
  };
}
