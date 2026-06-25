export type ThemeOrientation = "landscape" | "portrait";
export type ThemeRegionType = "program" | "logo" | "image" | "text" | "clock";
export type ThemeObjectFit = "contain" | "cover" | "stretch" | "center";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeClockFormat = "HH:mm" | "HH:mm:ss" | "dd-MM-yyyy HH:mm";

export interface ThemeRegion {
  id: string;
  name: string;
  type: ThemeRegionType;
  x: number;
  y: number;
  width: number;
  height: number;
  mediaId?: string;
  file?: string;
  objectFit?: ThemeObjectFit;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  text?: string;
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: ThemeTextAlign;
  textColor?: string;
  backgroundColor?: string;
  padding?: number;
  cornerRadius?: number;
  clockFormat?: ThemeClockFormat;
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
