import axios from "axios";
import { extractArticleText } from "./htmlExtract.js";

export async function fetchAndExtractText(url: string): Promise<string> {
  const { data } = await axios.get<string>(url, {
    timeout: 45_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TrueSearch/1.0; +https://example.com) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    maxRedirects: 5,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return extractArticleText(data);
}
