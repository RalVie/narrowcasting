export type BrowserAction =
  | {
      id?: string;
      type: "wait";
      waitMs: number;
    }
  | {
      id?: string;
      type: "click";
      selector: string;
      timeoutMs?: number;
    }
  | {
      id?: string;
      type: "refresh_interval";
      intervalSeconds: number;
    };

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
  webUrlRenderMode?: "iframe" | "browser";
  browserActions?: BrowserAction[];
}
