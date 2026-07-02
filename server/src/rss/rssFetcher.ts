export interface ResolvedRssEntry {
  title: string;
  summary: string | null;
  link: string | null;
  image: string | null;
  publishedAt: string | null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(value: string) {
  return decodeEntities(stripCdata(value).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTag(block: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return match?.[1] ? stripHtml(match[1]) : null;
}

function extractAttribute(block: string, tag: string, attribute: string) {
  const match = new RegExp(`<${tag}[^>]*\\s${attribute}=["']([^"']+)["'][^>]*>`, "i").exec(block);
  return match?.[1] ? decodeEntities(match[1]).trim() : null;
}

function extractImage(block: string) {
  return (
    extractAttribute(block, "media:content", "url") ??
    extractAttribute(block, "media:thumbnail", "url") ??
    extractAttribute(block, "enclosure", "url") ??
    null
  );
}

function normalizeDate(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : value;
}

export async function fetchRssItems(feedUrl: string, maxItems: number): Promise<ResolvedRssEntry[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) {
      console.warn("rss fetch failed", { feedUrl, status: response.status });
      return [];
    }

    const xml = await response.text();
    const matches = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
    const atomMatches =
      matches.length > 0 ? [] : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
    const blocks = (matches.length > 0 ? matches : atomMatches).slice(0, maxItems).map((match) => match[1] ?? "");

    return blocks.map((block) => ({
      title: extractTag(block, "title") ?? "Untitled",
      summary: extractTag(block, "description") ?? extractTag(block, "summary") ?? extractTag(block, "content"),
      link: extractTag(block, "link") ?? extractAttribute(block, "link", "href"),
      image: extractImage(block),
      publishedAt: normalizeDate(extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated"))
    }));
  } catch (error) {
    console.warn("rss fetch failed", {
      feedUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}
