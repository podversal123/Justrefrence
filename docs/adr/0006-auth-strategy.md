# ADR-0006: Supabase Auth for sessions, custom server-verified flow for mobile/WhatsApp OTP

## Status
Accepted

## Context
The brief requires email auth, mobile OTP, and WhatsApp OTP (via MSG91), plus Member ID/Referral ID as login-adjacent identifiers (Q-32), mandatory 2FA for staff roles, and 30-minute idle logout (Q-37 default).

## Decision
- Supabase Auth issues and manages the actual session (JWT in an HttpOnly cookie) and handles email/password + email-OTP natively.
- Mobile OTP and WhatsApp OTP are a **custom flow layered on top**, not native Supabase features: the server generates a code, stores only its hash in `otp_verifications`, sends it via MSG91 (SMS) or MSG91 WhatsApp Business API, verifies the user-submitted code server-side against the hash, and only then creates/exchanges for a Supabase session for that user — the raw code is never used as a client-side auth credential and never persisted in plaintext.
- Member ID and Referral ID are **display identifiers**, not credentials (Q-32's adopted default) — login is always by email or verified mobile number.
- Staff roles (`SUPER_ADMIN`/`ADMIN`/`FINANCE`/`SUPPORT`) require 2FA (TOTP) from day one; member 2FA is left off by default pending Q-33's confirmation, with the schema/UI ready to switch on.

## Consequences
- One consistent session mechanism (Supabase JWT) regardless of which factor was used to establish it, so the rest of the app (RBAC, `authorize()`) doesn't need to know or care whether the user logged in via password, email OTP, or mobile/WhatsApp OTP.
- OTP rate limiting and hashing are the app's own responsibility for the mobile/WhatsApp path (Supabase doesn't cover a WhatsApp channel), so this logic is built once in `src/server/domain/identity` and reused by both the mobile-OTP and WhatsApp-OTP call sites.

## Alternatives considered
- **A fully custom auth system, bypassing Supabase Auth entirely** — rejected: throws away Supabase's session management, password-reset flows, and RLS-JWT integration for no benefit, since the OTP customization needed is additive, not a replacement of the whole system.
- **Twilio instead of / alongside MSG91** — kept as a documented provider-interface swap (`SmsProvider`/`WhatsAppProvider`), not a hard dependency on MSG91, per the brief's "MSG91 or Twilio" phrasing and the Cost doc's MSG91-specific pricing.
