import "server-only";

// Best-effort Beehiiv subscribe for calculator leads. Never throws: the lead
// is already durable in Postgres by the time this runs, so a Beehiiv outage
// must not block the unlock. Await it in the action — fire-and-forget work
// can be killed after the response on Vercel serverless.
export async function subscribeToNewsletter(email: string): Promise<boolean> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    console.warn("beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set; skipping subscribe");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          utm_source: "calculator",
          utm_medium: "organic",
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    // 2xx covers new and already-existing subscribers (Beehiiv returns the
    // existing subscription rather than an error).
    if (!res.ok) {
      console.error(`beehiiv: subscribe failed with ${res.status} for ${email}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("beehiiv: subscribe request failed", e);
    return false;
  }
}
