// Title and description of one YouTube video through the Data API. Transcript
// capture is a roadmap item; Miguel can paste one into the note meanwhile.
export async function fetchVideoMeta(
  videoId: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<{ title: string; description: string } | null> {
  if (!apiKey || !videoId) return null;
  const params = new URLSearchParams({ part: "snippet", id: videoId, key: apiKey });
  const res = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}.`);
  const body = (await res.json()) as { items?: { snippet?: { title?: string; description?: string } }[] };
  const snippet = body.items?.[0]?.snippet;
  return snippet?.title ? { title: snippet.title, description: snippet.description ?? "" } : null;
}
