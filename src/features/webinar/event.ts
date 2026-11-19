// The one webinar this page registers for. To run the next one, change these
// values: a new SOURCE keeps each webinar's registrants a separate list in
// `leads` (the unique index is per email + source).
export const WEBINAR = {
  source: "webinar-2026-12-07",
  /** December 7, 2026, 6:00 pm CST (UTC-6). */
  startsAt: "2026-12-08T00:00:00Z",
  dateLine: "The webinar is on December 7 at 6 pm Central.",
} as const;
