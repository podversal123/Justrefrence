import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Transport-security headers only make sense when the site is really served
 * over HTTPS. `upgrade-insecure-requests` rewrites same-origin http:// requests
 * (including redirect targets) to https://, which breaks a production build
 * run locally over plain http://localhost (ERR_SSL_PROTOCOL_ERROR on every
 * redirect, e.g. an anonymous visitor following a link to /cart). So they are
 * enabled on Vercel (VERCEL=1 at build time) or when ENFORCE_HTTPS=1 is set
 * for another HTTPS host — see docs/environment.md.
 */
const enforceHttps =
  !isDev && (process.env["VERCEL"] === "1" || process.env["ENFORCE_HTTPS"] === "1");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "*.supabase.co";

/**
 * Static (non-nonce) CSP — deliberately chosen over the per-request nonce
 * approach (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
 * because nonces force every page to render dynamically, which would drop
 * static/cached rendering of the public catalog pages. The trade-off:
 * `script-src 'unsafe-inline'` does not block injected inline scripts, but
 * everything else (framing, <object>, <base>, form targets, outbound
 * connections, third-party script/frame origins) is locked down. Upgrade
 * path: move to nonces in proxy.ts if inline-script XSS protection is needed.
 *
 * Third parties: Razorpay (checkout.js + its payment iframe, see
 * pay-now-client.tsx) and Supabase (REST/auth/realtime + storage images).
 */
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https://${supabaseHost} https://*.razorpay.com`,
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.razorpay.com`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(enforceHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          ...(enforceHttps
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
