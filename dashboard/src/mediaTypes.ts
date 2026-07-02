export interface MediaItem {
  id: string;
  mediaId: string;
  filename: string;
  type: "image" | "video" | "web_url" | "rss_feed";
  size: number;
  title?: string;
  url?: string;
  duration?: number;
  maxItems?: number;
}
