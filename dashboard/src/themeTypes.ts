export type ThemeOrientation = "landscape" | "portrait";
export type ThemeRegionType = "program" | "image" | "text";

export interface ThemeRegion {
  id: string;
  name: string;
  type: ThemeRegionType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Theme {
  id: string;
  name: string;
  orientation: ThemeOrientation;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundMediaId?: string;
  regions: ThemeRegion[];
  options?: Record<string, unknown>;
}
