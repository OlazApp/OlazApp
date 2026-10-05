import "server-only";

/*
 * Headlines from public RSS feeds of crypto newsrooms. Only the title, a
 * short teaser and the link are shown; every item opens at its source.
 */

export type Headline = {
  id: string;
  title: string;
  teaser: string;
  link: string;
  source: string;
  at: number;
  image: string | null;
  robinhood: boolean;
};

const FEEDS = [
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "The Block", url: "https://www.theblock.co/rss.xml" },
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeText(raw: string) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (item: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(item);
  return m ? decodeText(m[1]) : "";
};

function imageOf(item: string) {
  const m =
    /<media:content[^>]+url="([^"]+)"/i.exec(item) ||
    /<media:thumbnail[^>]+url="([^"]+)"/i.exec(item) ||
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image/i.exec(item);
  return m && m[1].startsWith("https://") ? m[1].replace(/&amp;/g, "&") : null;
}

function teaserOf(text: string) {
  if (text.length <= 180) return text;
  const cut = text.slice(0, 180);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

let cache: { at: number; value: Headline[] } | null = null;

export async function headlines(): Promise<Headline[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value;
  const lists = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; news reader)" },
          cache: "no-store",
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
        return items.slice(0, 25).map((item): Headline | null => {
          const title = tag(item, "title");
          const link = tag(item, "link") || tag(item, "guid");
          const at = Date.parse(tag(item, "pubDate"));
          if (!title || !/^https:\/\//.test(link) || !Number.isFinite(at)) return null;
          const teaser = teaserOf(tag(item, "description"));
          return {
            id: `${feed.source}:${link}`,
            title,
            teaser,
            link,
            source: feed.source,
            at,
            image: imageOf(item),
            robinhood: /robinhood/i.test(`${title} ${teaser}`),
          };
        });
      } catch {
        return [];
      }
    }),
  );
  const value = lists
    .flat()
    .filter((h): h is Headline => h !== null)
    .sort((a, b) => b.at - a.at)
    .slice(0, 60);
  if (value.length > 0) cache = { at: Date.now(), value };
  return value.length > 0 ? value : (cache?.value ?? []);
}
