import * as cheerio from "cheerio";

/**
 * Best-effort article body extraction for static HTML.
 * Removes script/style/nav/footer/aside and keeps main/article or largest text block.
 */
export function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();

  const candidates = [
    $("main").text(),
    $("article").text(),
    $('[role="main"]').text(),
    $(".article-body, .post-content, #content, #main").first().text(),
  ].filter(Boolean);

  let text = candidates.find((t) => t.trim().length > 400);
  if (!text) {
    $("header, nav, footer, aside").remove();
    text = $("body").text();
  }

  return text.replace(/\s+/g, " ").trim();
}
