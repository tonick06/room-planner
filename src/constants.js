export const THEME_CSS = `
[data-theme="dark"] {
  --bg: #111; --bg2: #0a0a0a; --bg3: #0d0d0d; --bg4: #141414; --bg5: #1a1a1a; --bg6: #2a2a2a;
  --fg: #ddd; --fg2: #eee; --fg3: #aaa; --fg4: #888; --fg5: #666; --fg6: #555; --fg7: #444;
  --border: #222; --border2: #1a1a1a; --border3: #333; --border4: #1e1e1e;
  --accent: #1D9E75; --accent2: #1a2a20; --warn: #f0a040; --warn-bg: #1a1a0a; --danger: #E24B4A; --danger-border: #4A1B0C;
  --wall: #e0e0e0; --room-fill: #1e1e1e; --canvas-bg: #141414;
  --grid1: #2a2a2a; --grid2: #1e1e1e; --guide: #1D9E75;
  --door-col: #E8D88A; --window-col: #7BC8F6;
  --input-bg: #141414; --input-border: #2a2a2a;
  --corner-dot: #e0e0e0; --corner-active: #f0a040;
}
[data-theme="light"] {
  --bg: #f5f5f0; --bg2: #ffffff; --bg3: #fafaf8; --bg4: #eeeee8; --bg5: #e8e8e0; --bg6: #d8d8d0;
  --fg: #2a2a2a; --fg2: #1a1a1a; --fg3: #555; --fg4: #666; --fg5: #888; --fg6: #999; --fg7: #bbb;
  --border: #ddd; --border2: #e0e0e0; --border3: #ccc; --border4: #ddd;
  --accent: #148a60; --accent2: #e0f5ec; --warn: #c07820; --warn-bg: #fff8e8; --danger: #d03030; --danger-border: #f0c0c0;
  --wall: #333; --room-fill: #ffffff; --canvas-bg: #eeeee8;
  --grid1: #d8d8d0; --grid2: #e8e8e2; --guide: #148a60;
  --door-col: #a08020; --window-col: #3090c0;
  --input-bg: #fff; --input-border: #ddd;
  --corner-dot: #333; --corner-active: #c07820;
}
`;

export const PALETTE = [
  { fill: "#1D9E75", stroke: "#085041", text: "#d0fff4", sub: "#9FE1CB" },
  { fill: "#378ADD", stroke: "#042C53", text: "#e0f0ff", sub: "#B5D4F4" },
  { fill: "#BA7517", stroke: "#633806", text: "#fff8e0", sub: "#FAC775" },
  { fill: "#D85A30", stroke: "#4A1B0C", text: "#ffe8dc", sub: "#F5C4B3" },
  { fill: "#8F6BBE", stroke: "#3C3489", text: "#f0e8ff", sub: "#CECBF6" },
  { fill: "#E24B4A", stroke: "#7A1A1A", text: "#ffe0e0", sub: "#F5B3B3" },
  { fill: "#2BA89E", stroke: "#0A4A45", text: "#d0fff8", sub: "#A0E0D8" },
  { fill: "#C4A030", stroke: "#5A4A10", text: "#fff8d0", sub: "#E8D88A" },
];

export const PX = 2;
export const GRID_CM = 10;
export const GRID_PX = GRID_CM * PX;
export const SNAP_D = 8;
export const CLOSE_D = 14;
export const CVS = 1200;
export const AXIS_SNAP = 10;
export const WALL_BUF = 3;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 4;
