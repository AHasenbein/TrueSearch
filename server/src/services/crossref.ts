import axios from "axios";

export type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string }[];
  issued?: { "date-parts"?: number[][] };
  link?: { URL: string; "content-type"?: string }[];
  abstract?: string;
};

type CrossrefMessage = {
  items?: CrossrefWork[];
};

export async function searchCrossref(query: string, rows = 15): Promise<CrossrefWork[]> {
  const { data } = await axios.get<{ message?: CrossrefMessage }>(
    "https://api.crossref.org/works",
    {
      params: { query, rows },
      headers: { "User-Agent": "TrueSearch/1.0 (mailto:example@example.com)" },
      timeout: 30_000,
    }
  );
  return data.message?.items ?? [];
}

export function workToAbstract(work: CrossrefWork): string | undefined {
  if (!work.abstract) return undefined;
  // Crossref returns JATS-like tags; strip crudely for LLM consumption.
  return work.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
