import axios from "axios";

export type SsPaperHit = {
  paperId: string;
  title: string;
  year?: number;
  authors?: { name: string }[];
  abstract?: string;
  url?: string;
  openAccessPdf?: { url?: string };
  externalIds?: Record<string, string>;
};

type SsSearchResponse = {
  data?: SsPaperHit[];
  next?: number;
};

const BASE = "https://api.semanticscholar.org/graph/v1";

export async function searchSemanticScholar(
  query: string,
  limit = 15
): Promise<SsPaperHit[]> {
  const fields = [
    "paperId",
    "title",
    "year",
    "authors",
    "abstract",
    "url",
    "openAccessPdf",
    "externalIds",
  ].join(",");

  const { data } = await axios.get<SsSearchResponse>(`${BASE}/paper/search`, {
    params: { query, limit, fields },
    timeout: 30_000,
    validateStatus: () => true,
  });

  if (!Array.isArray(data?.data)) {
    return [];
  }
  return data.data;
}
