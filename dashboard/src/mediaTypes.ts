export interface MediaItem {
  id: string;
  mediaId: string;
  filename: string;
  type: "image" | "video";
  size: number;
}
