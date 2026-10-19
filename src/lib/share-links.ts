/**
 * Links that open a person's own WhatsApp, email or SMS app with a ready message, so they can send
 * their referral link to someone. Pure: it only builds the address; nothing is sent from our side.
 */

export interface ShareMessage {
  /** The full message text, which already contains the link. */
  text: string;
  /** Email subject line. */
  subject: string;
}

export interface ShareLinks {
  whatsapp: string;
  email: string;
  sms: string;
}

export function buildShareLinks({ text, subject }: ShareMessage): ShareLinks {
  const body = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${body}`,
    email: `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`,
    sms: `sms:?&body=${body}`,
  };
}
