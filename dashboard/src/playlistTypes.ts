export interface PlaylistItem {
  id: string;
  mediaId: string;
  type: "image" | "video";
  file: string;
  duration: number;
}

export interface Playlist {
  version: number;
  updatedAt: string;
  items: PlaylistItem[];
}
