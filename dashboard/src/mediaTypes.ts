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

export interface RssStyle {
  backgroundColor?: string;
  textColor?: string;
  titleColor?: string;
  accentColor?: string;
  cardBackgroundColor?: string;
  titleSize?: "small" | "normal" | "large" | "extra-large";
  bodySize?: "small" | "normal" | "large" | "extra-large";
  metaSize?: "small" | "normal" | "large" | "extra-large";
}

export interface MediaItem {
  id: string;
  mediaId: string;
  filename: string;
  type: "image" | "video" | "web_url" | "rss_feed";
  size: number;
  title?: string;
  url?: string;
  duration?: number;
  webUrlPlaybackMode?: "timed" | "persistent";
  maxItems?: number;
  rssStyle?: RssStyle;
  webUrlRenderMode?: "iframe" | "browser";
  browserActions?: BrowserAction[];
  originalFilename?: string;
  playbackFilename?: string;
  processedAt?: string;
  processingError?: string;
  processingStatus?: "uploaded" | "analyzing" | "processing" | "ready" | "failed";
  status?: "trashed";
  trashedAt?: string;
  trashFiles?: string[];
  thumbnailFilename?: string;
  videoProfile?: {
    audioCodec?: string | null;
    bitrate?: number | null;
    container?: string | null;
    durationSeconds?: number | null;
    height?: number | null;
    level?: number | null;
    piSafe?: boolean;
    pixelFormat?: string | null;
    profile?: string | null;
    videoCodec?: string | null;
    width?: number | null;
  };
}
