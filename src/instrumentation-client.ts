import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error reporting; `instrumentation.ts` covers the server.
 *
 * Until 2026-10-06 neither side reported anything: Sentry was initialised only
 * when a DSN was set, and production had none, so guest Clove and the feedback
 * form returned 500s for weeks with nothing noticing. The server half catches
 * failures like that; this half catches a page crashing on someone's phone,
 * which no log on our side would ever show.
 *
 * Errors only — no performance tracing, no session replay. The app holds
 * pantry, diet and allergy data, so the same scrubbing as the server applies.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
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
