import * as Sentry from "@sentry/nextjs";

/**
 * Sentry was in package.json but never wired — no config files, no imports, so
 * the app paid the bundle cost and got none of the alerting. Errors went to
 * `console.error` and vanished into the Vercel log stream (audit M10).
 *
 * Initialised here rather than in `sentry.*.config.ts` because that's the
 * supported entry point on current Next.js.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // No DSN configured (local dev) — stay silent.

  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

      // The app handles health, dietary and allergy data. Never let Sentry
      // attach request bodies, cookies or headers by default.
      sendDefaultPii: false,

      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
          // Query strings can carry search terms — scrub them too.
          if (event.request.url) {
            event.request.url = event.request.url.split("?")[0];
          }
        }
        delete event.user;
        return event;
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
