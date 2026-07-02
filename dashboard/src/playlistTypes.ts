export interface PlaylistItem {
  id: string;
  mediaId: string;
  type: "image" | "video" | "web_url" | "rss_feed";
  file: string;
  duration: number;
  durationMode?: "auto" | "clip";
}

export interface Playlist {
  id?: string;
  name?: string;
  version: number;
  updatedAt: string;
  items: PlaylistItem[];
}

export interface PlaylistRecord extends Playlist {
  id: string;
  name: string;
}
