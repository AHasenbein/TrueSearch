import axios from "axios";

export type WebCandidate = {
  title: string;
  url: string;
  sourceType: "web";
  trustScore: number;
};

const preferredDomains = [
  ".gov",
  ".edu",
  "noaa.gov",
  "usgs.gov",
  "florida",
  "fao.org",
  "unep.org",
];

function trustScoreForUrl(url: string): number {
  const u = url.toLowerCase();
  const hit = preferredDomains.some((d) => u.includes(d));
  if (hit) return 0.9;
  if (u.includes(".org")) return 0.7;
  return 0.5;
}

function flattenTopics(topics: Array<Record<string, unknown>>): WebCandidate[] {
  const out: WebCandidate[] = [];
  for (const t of topics) {
    const firstURL = typeof t.FirstURL === "string" ? t.FirstURL : undefined;
    const text = typeof t.Text === "string" ? t.Text : undefined;
    if (firstURL && text) {
      out.push({
        title: text,
        url: firstURL,
        sourceType: "web",
        trustScore: trustScoreForUrl(firstURL),
      });
      continue;
    }
    const nested = t.Topics;
    if (Array.isArray(nested)) {
      out.push(...flattenTopics(nested as Array<Record<string, unknown>>));
    }
  }
  return out;
}

/**
 * Lightweight targeted web discovery using DuckDuckGo instant-answer API.
 * Returns URL candidates ranked by domain trust.
 */
export async function discoverWebSources(query: string, limit = 10): Promise<WebCandidate[]> {
  const scoped = `${query} sargassum florida site:gov OR site:edu OR site:org`;
  const { data } = await axios.get<Record<string, unknown>>("https://api.duckduckgo.com/", {
    params: {
      q: scoped,
      format: "json",
      no_html: 1,
      skip_disambig: 1,
    },
    timeout: 20_000,
    validateStatus: () => true,
  });

  const related = Array.isArray(data.RelatedTopics)
    ? (data.RelatedTopics as Array<Record<string, unknown>>)
    : [];
  const flattened = flattenTopics(related);
  const dedup = new Map<string, WebCandidate>();
  for (const c of flattened) {
    if (!dedup.has(c.url)) dedup.set(c.url, c);
  }
  return [...dedup.values()].sort((a, b) => b.trustScore - a.trustScore).slice(0, limit);
}

