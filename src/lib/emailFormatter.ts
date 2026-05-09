/**
 * Email formatting and detection utilities
 */

export interface EmailContent {
  isEmail: boolean;
  subject?: string;
  to?: string;
  from?: string;
  cc?: string;
  body: string;
}

/**
 * Detects if content looks like an email and extracts email fields
 */
export function parseEmail(content: string): EmailContent {
  // Check for common email patterns: Subject:, To:, From:, CC:, BCC:, Date:
  const emailPatterns = [
    /^Subject\s*:/m,
    /^To\s*:/m,
    /^From\s*:/m,
    /^CC\s*:/m,
    /^BCC\s*:/m,
  ];
  
  const isEmail = emailPatterns.some(pattern => pattern.test(content));
  
  if (!isEmail) {
    return { isEmail: false, body: content };
  }

  // Extract email fields
  const subjectMatch = content.match(/^Subject\s*:\s*(.+?)(?:\n|$)/mi);
  const toMatch = content.match(/^To\s*:\s*(.+?)(?:\n|$)/mi);
  const fromMatch = content.match(/^From\s*:\s*(.+?)(?:\n|$)/mi);
  const ccMatch = content.match(/^CC\s*:\s*(.+?)(?:\n|$)/mi);

  // Extract body (everything after the first blank line following headers)
  const bodyMatch = content.match(/\n\n(.+)$/s) || content.match(/\n(.+)$/s);
  const body = bodyMatch ? bodyMatch[1].trim() : content;

  return {
    isEmail: true,
    subject: subjectMatch ? subjectMatch[1].trim() : undefined,
    to: toMatch ? toMatch[1].trim() : undefined,
    from: fromMatch ? fromMatch[1].trim() : undefined,
    cc: ccMatch ? ccMatch[1].trim() : undefined,
    body,
  };
}

/**
 * Checks if content should NOT be shown in an email block
 * (i.e., user didn't ask for an email)
 */
export function shouldShowEmailBlock(userQuery: string, contentAnalysis: EmailContent): boolean {
  if (!contentAnalysis.isEmail) return false;

  const emailKeywords = /\b(email|compose|draft|send|write a.*email|write an.*email)\b/i;
  const hasEmailIntent = emailKeywords.test(userQuery);

  // Only show email block if user explicitly asked for email
  return hasEmailIntent;
}
