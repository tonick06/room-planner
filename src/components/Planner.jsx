import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import SaveLoad from "./SaveLoad.jsx";
import { PALETTE, PX, GRID_PX, CVS, MIN_ZOOM, MAX_ZOOM, CLOSE_D, AXIS_SNAP } from "../constants.js";
import { uid, dist, snapPt, wallLen, polyPath, polyBounds, aabb, axisSnap, closestPtOnSeg, hitsWall, hitsOtherPiece, rectCorners, ptSegDist, segSeg } from "../geometry.js";
import { labelSt, inputSt, btnPrimSt, btnSt, btnSmSt } from "../styles.js";

export default function Planner({ username, token, onLogout, theme, toggleTheme }) {
  const [mode, setMode] = useState("draw");
  const [cursor, setCursor] = useState(null); const [guides, setGuides] = useState([]);
  const [selected, setSelected] = useState(null); const [info, setInfo] = useState("Toggle Draw ON to start");
  const [panel, setPanel] = useState("draw");
  const [newLabel, setNewLabel] = useState(""); const [newW, setNewW] = useState(100); const [newH, setNewH] = useState(50);
  const [newShape, setNewShape] = useState("rect"); const [snapOn, setSnapOn] = useState(true);
  const [drawingOn, setDrawingOn] = useState(false);
  const [editingWall, setEditingWall] = useState(null); const [editWallVal, setEditWallVal] = useState("");
  const [zoom, setZoom] = useState(1); const [panX, setPanX] = useState(0); const [panY, setPanY] = useState(0);
  const [history, setHistory] = useState([]); const [future, setFuture] = useState([]);
  const [dragCorner, setDragCorner] = useState(null);
  const [doorMode, setDoorMode] = useState(null); const [doorWidth, setDoorWidth] = useState(80);
  const [colorPicking, setColorPicking] = useState(null);
  const [overlayImg, setOverlayImg] = useState(null); const [overlayOpacity, setOverlayOpacity] = useState(0.3);
  const [overlayBounds, setOverlayBounds] = useState({ x: 100, y: 100, w: 600, h: 600 });
  const [importing, setImporting] = useState(false); const [importErr, setImportErr] = useState("");

  /* ── Multi-room state ── */
  const [rooms, setRooms] = useState(() => { const id = uid(); return [{ id, roomPts: [], pieces: [], doors: [], closed: false }]; });
  const [activeRoomId, setActiveRoomId] = useState(() => rooms[0].id);

  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  const activeRoom = rooms.find(r => r.id === activeRoomId) ?? rooms[0];
  const roomPts = activeRoom.roomPts;
  const pieces = activeRoom.pieces;
  const doors = activeRoom.doors;
  const closed = activeRoom.closed;

  const updRoom = useCallback(fn => {
    setRooms(prev => prev.map(r => r.id === activeRoomIdRef.current ? { ...r, ...fn(r) } : r));
  }, []);

  const setRoomPts = useCallback(v => updRoom(r => ({ roomPts: typeof v === "function" ? v(r.roomPts) : v })), [updRoom]);
  const setPieces  = useCallback(v => updRoom(r => ({ pieces:  typeof v === "function" ? v(r.pieces)  : v })), [updRoom]);
  const setDoors   = useCallback(v => updRoom(r => ({ doors:   typeof v === "function" ? v(r.doors)   : v })), [updRoom]);
  const setClosed  = useCallback(v => updRoom(r => ({ closed:  typeof v === "function" ? v(r.closed)  : v })), [updRoom]);

  const svgRef = useRef(null); const dragRef = useRef(null); const panRef = useRef(null);

  const snap_ = () => ({
    rooms: rooms.map(r => ({ ...r, roomPts: r.roomPts.map(p => ({ ...p })), pieces: r.pieces.map(p => ({ ...p, color: { ...p.color } })), doors: r.doors.map(d => ({ ...d })) })),
    activeRoomId,
  });
  const pushHistory = useCallback(() => { setHistory(h => [...h.slice(-50), snap_()]); setFuture([]); }, [rooms, activeRoomId]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setFuture(f => [...f, snap_()]);
    const prev = history[history.length - 1]; setHistory(h => h.slice(0, -1));
    setRooms(prev.rooms); setActiveRoomId(prev.activeRoomId);
    const ar = prev.rooms.find(r => r.id === prev.activeRoomId) ?? prev.rooms[0];
    if (ar.closed) { setMode("furnish"); setPanel("add"); } else { setMode("draw"); setPanel("draw"); }
  }, [history, rooms, activeRoomId]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setHistory(h => [...h, snap_()]);
    const next = future[future.length - 1]; setFuture(f => f.slice(0, -1));
    setRooms(next.rooms); setActiveRoomId(next.activeRoomId);
    const ar = next.rooms.find(r => r.id === next.activeRoomId) ?? next.rooms[0];
    if (ar.closed) { setMode("furnish"); setPanel("add"); } else { setMode("draw"); setPanel("draw"); }
  }, [future, rooms, activeRoomId]);

  useEffect(() => {
    const h = e => { if (e.target.tagName === "INPUT") return; if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); } if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  const vbX = -panX / zoom, vbY = -panY / zoom, vbW = CVS / zoom, vbH = CVS / zoom;

  const svgPt = useCallback(e => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); const src = e.touches ? e.touches[0] : e;
    pt.x = src.clientX; pt.y = src.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const computeSnap = useCallback(raw => {
    let p = snapOn ? snapPt(raw.x, raw.y) : { x: Math.round(raw.x), y: Math.round(raw.y) };
    const ax = axisSnap(p, roomPts, AXIS_SNAP); return { x: ax.x, y: ax.y, guides: ax.guides };
  }, [snapOn, roomPts]);

  const onWheel = useCallback(e => { e.preventDefault(); setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * (e.deltaY > 0 ? 0.9 : 1.1)))); }, []);
  useEffect(() => { const svg = svgRef.current; if (!svg) return; svg.addEventListener("wheel", onWheel, { passive: false }); return () => svg.removeEventListener("wheel", onWheel); }, [onWheel]);

  const onPanStart = useCallback((e, fromCanvas) => {
    if (e.button === 1 || (e.button === 0 && (e.altKey || fromCanvas))) {
      e.preventDefault();
      panRef.current = { startX: e.clientX - panX, startY: e.clientY - panY, sx: e.clientX, sy: e.clientY, moved: false };
    }
  }, [panX, panY]);
  const onPanMove = useCallback(e => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.sx, dy = e.clientY - panRef.current.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panRef.current.moved = true;
      setPanX(e.clientX - panRef.current.startX); setPanY(e.clientY - panRef.current.startY);
    }
  }, []);
  const onPanEnd = useCallback(() => {
    const wasPan = panRef.current?.moved;
    panRef.current = null;
    return wasPan;
  }, []);

  const onCanvasClick = useCallback(e => {
    if (panRef.current?.moved) return;
    if (mode === "furnish" && !e.target.closest(".furniture") && !e.target.closest(".corner-handle") && !doorMode) {
      setSelected(null); setInfo("");
    }
    if (doorMode && closed && roomPts.length >= 3) {
      const raw = svgPt(e); let bd = Infinity, bw = -1, bt = 0;
      for (let i = 0; i < roomPts.length; i++) { const a = roomPts[i], b = roomPts[(i + 1) % roomPts.length]; const c = closestPtOnSeg(a.x, a.y, b.x, b.y, raw.x, raw.y); const d = Math.sqrt((raw.x - c.x) ** 2 + (raw.y - c.y) ** 2); if (d < bd) { bd = d; bw = i; bt = c.t; } }
      if (bd < 30) { pushHistory(); setDoors(prev => [...prev, { id: uid(), wallIdx: bw, t: bt, type: doorMode, widthCm: doorWidth }]); setInfo(`${doorMode} placed`); } return;
    }
    if (!drawingOn || mode !== "draw" || closed) return;
    if (e.target.closest(".furniture") || e.target.closest(".corner-handle")) return;
    const raw = svgPt(e); const s = computeSnap(raw); const p = { x: s.x, y: s.y };
    if (roomPts.length >= 3 && dist(p, roomPts[0]) < CLOSE_D) { pushHistory(); setClosed(true); setMode("furnish"); setPanel("add"); setInfo("Room closed!"); setCursor(null); setGuides([]); setDrawingOn(false); return; }
    pushHistory(); setRoomPts(prev => [...prev, p]); setInfo(`Point ${roomPts.length + 1} placed`);
  }, [drawingOn, mode, closed, roomPts, svgPt, computeSnap, doorMode, doorWidth, pushHistory]);

  const onCanvasMove = useCallback(e => {
    if (panRef.current) { onPanMove(e); return; }
    const raw = svgPt(e); const s = computeSnap(raw);
    if (mode === "draw" && !closed && drawingOn) { setCursor({ x: s.x, y: s.y }); setGuides(s.guides); return; }
    if (mode === "draw" && !closed) { setCursor(null); setGuides([]); return; }
    if (dragCorner !== null) { const snapped = snapOn ? snapPt(raw.x, raw.y) : { x: Math.round(raw.x), y: Math.round(raw.y) }; setRoomPts(prev => prev.map((p, i) => i === dragCorner ? { x: snapped.x, y: snapped.y } : p)); return; }
    const d = dragRef.current; if (!d) return; if (e.cancelable) e.preventDefault();
    setPieces(prev => {
      const idx = prev.findIndex(pc => pc.id === d.id); if (idx < 0) return prev;
      const pc = prev[idx], bb = aabb(pc), nx = raw.x - d.offX - bb.w / 2, ny = raw.y - d.offY - bb.h / 2;
      const cand = { ...pc, x: nx, y: ny };
      const wh = closed && hitsWall(cand, roomPts), ih = hitsOtherPiece(cand, prev, pc.id);
      if (!wh && !ih) { setInfo(`${pc.label} — ${Math.round(nx / PX)}, ${Math.round(ny / PX)} cm`); const a = [...prev]; a[idx] = cand; return a; }
      const sx = { ...pc, x: nx }; if (!(closed && hitsWall(sx, roomPts)) && !hitsOtherPiece(sx, prev, pc.id)) { setInfo(`${pc.label} — ${Math.round(nx / PX)}, ${Math.round(pc.y / PX)} cm`); const a = [...prev]; a[idx] = sx; return a; }
      const sy = { ...pc, y: ny }; if (!(closed && hitsWall(sy, roomPts)) && !hitsOtherPiece(sy, prev, pc.id)) { setInfo(`${pc.label} — ${Math.round(pc.x / PX)}, ${Math.round(ny / PX)} cm`); const a = [...prev]; a[idx] = sy; return a; }
      setInfo(`${pc.label} — blocked`); return prev;
    });
  }, [mode, closed, svgPt, computeSnap, roomPts, drawingOn, dragCorner, snapOn, onPanMove]);

  const onPointerDown = useCallback((e, p) => {
    if (mode === "draw" || doorMode) return; e.stopPropagation(); pushHistory(); setSelected(p.id);
    const pt = svgPt(e), bb = aabb(p);
    dragRef.current = { id: p.id, offX: pt.x - (p.x + bb.w / 2), offY: pt.y - (p.y + bb.h / 2) };
    setPieces(prev => { const i = prev.findIndex(x => x.id === p.id); if (i < 0) return prev; const a = [...prev]; const [item] = a.splice(i, 1); a.push(item); return a; });
  }, [svgPt, mode, pushHistory, doorMode]);

  const onPointerUp = useCallback(() => { dragRef.current = null; if (dragCorner !== null) { pushHistory(); setDragCorner(null); } const wasPan = onPanEnd(); return wasPan; }, [dragCorner, pushHistory, onPanEnd]);

  useEffect(() => {
    const svg = svgRef.current; if (!svg) return; const opts = { passive: false };
    const mv = e => onCanvasMove(e), up = () => onPointerUp();
    svg.addEventListener("touchmove", mv, opts); svg.addEventListener("mouseup", up); svg.addEventListener("touchend", up); svg.addEventListener("mouseleave", up);
    return () => { svg.removeEventListener("touchmove", mv, opts); svg.removeEventListener("mouseup", up); svg.removeEventListener("touchend", up); svg.removeEventListener("mouseleave", up); };
  }, [onCanvasMove, onPointerUp]);

  const addPiece = () => {
    if (!newLabel.trim() || !closed) return; pushHistory();
    const pw = Math.round(newW * PX), ph = newShape === "circle" ? pw : Math.round(newH * PX);
    const bounds = polyBounds(roomPts); const ci = pieces.length % PALETTE.length;
    setPieces(prev => [...prev, { id: uid(), label: newLabel.trim(), widthCm: newW, heightCm: newShape === "circle" ? newW : newH, pw, ph, x: bounds.minX + 10, y: bounds.minY + 10, rot: 0, shape: newShape, color: PALETTE[ci] }]);
    setSelected(null); setNewLabel(""); setInfo(`Added`);
  };
  const deletePiece = id => { pushHistory(); setPieces(prev => prev.filter(p => p.id !== id)); if (selected === id) setSelected(null); };
  const rotate = deg => {
    if (!selected) return; pushHistory();
    setPieces(prev => prev.map(p => { if (p.id !== selected || p.shape === "circle") return p; const bb = aabb(p), cx = p.x + bb.w / 2, cy = p.y + bb.h / 2, nr = ((p.rot + deg) % 360 + 360) % 360, np = { ...p, rot: nr }, nbb = aabb(np); return { ...np, x: cx - nbb.w / 2, y: cy - nbb.h / 2 }; }));
  };

  const nudgePiece = useCallback((dx, dy) => {
    if (!selected || !closed) return;
    setPieces(prev => {
      const idx = prev.findIndex(p => p.id === selected); if (idx < 0) return prev;
      const pc = prev[idx], cand = { ...pc, x: pc.x + dx, y: pc.y + dy };
      if (!hitsWall(cand, roomPts) && !hitsOtherPiece(cand, prev, pc.id)) { setInfo(`${pc.label} — ${Math.round(cand.x / PX)}, ${Math.round(cand.y / PX)} cm`); const a = [...prev]; a[idx] = cand; return a; }
      if (dx !== 0) { const sx = { ...pc, x: pc.x + dx }; if (!hitsWall(sx, roomPts) && !hitsOtherPiece(sx, prev, pc.id)) { const a = [...prev]; a[idx] = sx; return a; } }
      if (dy !== 0) { const sy = { ...pc, y: pc.y + dy }; if (!hitsWall(sy, roomPts) && !hitsOtherPiece(sy, prev, pc.id)) { const a = [...prev]; a[idx] = sy; return a; } }
      setInfo(`${pc.label} — blocked`); return prev;
    });
  }, [selected, closed, roomPts]);

  useEffect(() => {
    const h = e => { if (!selected || e.target.tagName === "INPUT") return; const ar = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]; if (!ar.includes(e.key)) return; e.preventDefault(); const step = e.ctrlKey ? 10 : e.shiftKey ? PX : 1; const m = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }; nudgePiece(...m[e.key]); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [selected, nudgePiece]);

  /* ── Room management ── */
  const resetRoom = () => { pushHistory(); updRoom(() => ({ roomPts: [], pieces: [], doors: [], closed: false })); setSelected(null); setMode("draw"); setPanel("draw"); setCursor(null); setGuides([]); setDrawingOn(false); setDoorMode(null); setInfo("Toggle Draw ON"); };
  const undoPoint = () => { if (closed || roomPts.length === 0) return; pushHistory(); setRoomPts(p => p.slice(0, -1)); };
  const closeRoom = () => { if (roomPts.length < 3) return; pushHistory(); setClosed(true); setMode("furnish"); setPanel("add"); setCursor(null); setGuides([]); setDrawingOn(false); setInfo("Room closed!"); };
  const resizeWall = (i, cm) => { if (cm < 1) return; pushHistory(); setRoomPts(prev => { const pts = prev.map(p => ({ ...p })); const a = pts[i], bi = (i + 1) % pts.length, b = pts[bi]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1; pts[bi] = { x: a.x + (dx / l) * cm * PX, y: a.y + (dy / l) * cm * PX }; return pts; }); };
  const startEditWall = (i, cm) => { setEditingWall(i); setEditWallVal(String(cm)); };
  const confirmEditWall = i => { const v = parseInt(editWallVal); if (v > 0) resizeWall(i, v); setEditingWall(null); setEditWallVal(""); };
  const setItemColor = (id, color) => { pushHistory(); setPieces(prev => prev.map(p => p.id === id ? { ...p, color } : p)); };

  const addRoom = () => {
    pushHistory();
    const newId = uid();
    setRooms(prev => [...prev, { id: newId, roomPts: [], pieces: [], doors: [], closed: false }]);
    setActiveRoomId(newId);
    setSelected(null); setMode("draw"); setPanel("draw"); setCursor(null); setGuides([]); setDrawingOn(false); setDoorMode(null); setInfo("Toggle Draw ON");
  };

  const switchRoom = id => {
    if (id === activeRoomId) return;
    setActiveRoomId(id);
    const r = rooms.find(x => x.id === id);
    if (r?.closed) { setMode("furnish"); setPanel("add"); } else { setMode("draw"); setPanel("draw"); }
    setSelected(null); setCursor(null); setGuides([]); setDoorMode(null);
  };

  const deleteRoom = () => {
    if (rooms.length <= 1) { resetRoom(); return; }
    pushHistory();
    const idx = rooms.findIndex(r => r.id === activeRoomId);
    const newRooms = rooms.filter(r => r.id !== activeRoomId);
    const newActive = newRooms[Math.max(0, idx - 1)];
    setRooms(newRooms); setActiveRoomId(newActive.id);
    if (newActive.closed) { setMode("furnish"); setPanel("add"); } else { setMode("draw"); setPanel("draw"); }
    setSelected(null); setCursor(null); setGuides([]); setDoorMode(null);
  };

  const loadRoom = data => {
    pushHistory();
    if (data.rooms) {
      const newRooms = data.rooms.map(r => ({ ...r, id: uid() }));
      setRooms(newRooms); setActiveRoomId(newRooms[0].id);
      const ar = newRooms[0];
      if (ar.closed) { setMode("furnish"); setPanel("add"); } else { setMode("draw"); setPanel("draw"); }
    } else if (data.roomPts) {
      updRoom(() => ({ roomPts: data.roomPts, pieces: data.pieces || [], doors: data.doors || [], closed: true }));
      setMode("furnish"); setPanel("add");
    }
    setCursor(null); setGuides([]); setDrawingOn(false); setDoorMode(null);
  };

  const fileInputRef = useRef(null);

  /* ── Gemini image upload ── */
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      setOverlayImg(base64); setOverlayOpacity(0.3); setImportErr("");
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const maxW = 800, maxH = 800;
        let w, h;
        if (aspect > 1) { w = maxW; h = maxW / aspect; } else { h = maxH; w = maxH * aspect; }
        setOverlayBounds({ x: 100, y: 100, w: Math.round(w), h: Math.round(h) });
      };
      img.src = base64;
      setImporting(true);
      try {
        const b64data = base64.split(",")[1];
        const mediaType = file.type || "image/png";
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/analyze-floorplan`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64data, mimeType: mediaType }),
        });
        const parsed = await response.json();
        if (parsed.points && parsed.points.length >= 3) {
          pushHistory();
          const ob = { x: 100, y: 100 };
          const img2 = new Image();
          img2.onload = () => {
            const xs = parsed.points.map(p => p.x), ys = parsed.points.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const normPts = parsed.points.map(p => ({ x: (p.x - minX) / (maxX - minX || 1), y: (p.y - minY) / (maxY - minY || 1) }));
            let ow, oh;
            if (parsed.widthM && parsed.heightM && parsed.widthM > 0 && parsed.heightM > 0) {
              ow = Math.round(parsed.widthM * 100 * PX); oh = Math.round(parsed.heightM * 100 * PX);
            } else {
              const shapeAspect = (maxX - minX) / (maxY - minY || 1);
              if (shapeAspect > 1) { ow = 800; oh = Math.round(800 / shapeAspect); } else { oh = 800; ow = Math.round(800 * shapeAspect); }
            }
            const newPts = normPts.map(p => ({ x: Math.round(ob.x + p.x * ow), y: Math.round(ob.y + p.y * oh) }));
            setOverlayBounds({ x: ob.x, y: ob.y, w: ow, h: oh });
            setRoomPts(newPts); setClosed(true); setMode("furnish"); setPanel("room");
            const pad = 80;
            const newZoom = Math.min(1, CVS / (ob.x + ow + pad), CVS / (ob.y + oh + pad));
            setZoom(newZoom); setPanX(CVS / 2 - (ob.x + ow / 2) * newZoom); setPanY(CVS / 2 - (ob.y + oh / 2) * newZoom);
            const dimInfo = parsed.widthM ? ` — ${parsed.widthM}×${parsed.heightM}m` : " (no dimensions found, drag to adjust)";
            setInfo(`Room detected${dimInfo}! Drag corners to refine.`);
          };
          img2.src = base64;
        } else {
          setImportErr("Couldn't detect room outline. Try tracing manually.");
        }
      } catch (err) {
        console.error("Import error:", err);
        setImportErr("AI analysis failed. Make sure your proxy server is running.");
      }
      setImporting(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearOverlay = () => { setOverlayImg(null); setImportErr(""); };

  const exportPNG = () => {
    const svg = svgRef.current; if (!svg) return;
    const allPts = rooms.flatMap(r => r.roomPts);
    if (allPts.length === 0) return;
    const clone = svg.cloneNode(true); const b = polyBounds(allPts);
    clone.setAttribute("viewBox", `${b.minX - 40} ${b.minY - 40} ${b.maxX - b.minX + 80} ${b.maxY - b.minY + 80}`);
    clone.querySelectorAll("[fill='var(--canvas-bg)']").forEach(el => el.setAttribute("fill", theme === "dark" ? "#141414" : "#eeeee8"));
    clone.querySelectorAll("[fill='var(--room-fill)']").forEach(el => el.setAttribute("fill", theme === "dark" ? "#1e1e1e" : "#ffffff"));
    clone.querySelectorAll("[stroke='var(--wall)']").forEach(el => el.setAttribute("stroke", theme === "dark" ? "#e0e0e0" : "#333"));
    const data = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: "image/svg+xml" }); const url = URL.createObjectURL(blob);
    const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = img.width * 2; c.height = img.height * 2; const ctx = c.getContext("2d"); ctx.fillStyle = theme === "dark" ? "#141414" : "#eeeee8"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); const a = document.createElement("a"); a.download = "floor-plan.png"; a.href = c.toDataURL("image/png"); a.click(); URL.revokeObjectURL(url); };
    img.src = url;
  };

  const selectedPiece = pieces.find(p => p.id === selected);
  const area = useMemo(() => { if (!closed || roomPts.length < 3) return 0; let a = 0; for (let i = 0; i < roomPts.length; i++) { const j = (i + 1) % roomPts.length; a += roomPts[i].x * roomPts[j].y - roomPts[j].x * roomPts[i].y; } return Math.abs(a / 2) / (PX * PX) / 10000; }, [roomPts, closed]);

  const gridLines = useMemo(() => {
    const l = [];
    const x0 = Math.floor(vbX / GRID_PX) * GRID_PX, x1 = Math.ceil((vbX + vbW) / GRID_PX) * GRID_PX;
    const y0 = Math.floor(vbY / GRID_PX) * GRID_PX, y1 = Math.ceil((vbY + vbH) / GRID_PX) * GRID_PX;
    for (let x = x0; x <= x1; x += GRID_PX) { const m = ((x / GRID_PX) % 5) === 0; l.push(<line key={`gx${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke={m ? "var(--grid1)" : "var(--grid2)"} strokeWidth={m ? 1 : 0.5} />); }
    for (let y = y0; y <= y1; y += GRID_PX) { const m = ((y / GRID_PX) % 5) === 0; l.push(<line key={`gy${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke={m ? "var(--grid1)" : "var(--grid2)"} strokeWidth={m ? 1 : 0.5} />); }
    return l;
  }, [vbX, vbY, vbW, vbH]);

  const wallLabels = useMemo(() => {
    if (roomPts.length < 2) return []; const labels = [], len = closed ? roomPts.length : roomPts.length - 1;
    for (let i = 0; i < len; i++) { const a = roomPts[i], b = roomPts[(i + 1) % roomPts.length]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, cm = wallLen(a, b); const dx = b.x - a.x, dy = b.y - a.y; let angle = (Math.atan2(dy, dx) * 180) / Math.PI; if (angle > 90) angle -= 180; if (angle < -90) angle += 180; const nx = -dy, ny = dx, nl = Math.sqrt(nx * nx + ny * ny) || 1; labels.push(<text key={`wl${i}`} x={mx + (nx / nl) * 14} y={my + (ny / nl) * 14} fontSize="11" fontFamily="'JetBrains Mono', monospace" fill="var(--warn)" textAnchor="middle" dominantBaseline="central" transform={`rotate(${angle},${mx + (nx / nl) * 14},${my + (ny / nl) * 14})`}>{cm}cm</text>); }
    return labels;
  }, [roomPts, closed]);

  const doorElements = useMemo(() => doors.map(d => {
    if (d.wallIdx >= roomPts.length) return null;
    const a = roomPts[d.wallIdx], b = roomPts[(d.wallIdx + 1) % roomPts.length];
    const px = a.x + (b.x - a.x) * d.t, py = a.y + (b.y - a.y) * d.t;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / l, uy = dy / l, hw = (d.widthCm * PX) / 2, isDoor = d.type === "door";
    return (<g key={d.id}><line x1={px - ux * hw} y1={py - uy * hw} x2={px + ux * hw} y2={py + uy * hw} stroke={isDoor ? "var(--door-col)" : "var(--window-col)"} strokeWidth="5" /><line x1={px - ux * hw} y1={py - uy * hw} x2={px + ux * hw} y2={py + uy * hw} stroke="var(--room-fill)" strokeWidth="3" />{isDoor && <path d={`M${px - ux * hw},${py - uy * hw} A${hw},${hw} 0 0,1 ${px - ux * hw + uy * hw},${py - uy * hw - ux * hw}`} fill="none" stroke="var(--door-col)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />}<text x={px - uy * 12} y={py + ux * 12} fontSize="9" fontFamily="'JetBrains Mono', monospace" fill={isDoor ? "var(--door-col)" : "var(--window-col)"} textAnchor="middle" dominantBaseline="central" opacity="0.8">{isDoor ? "Door" : "Win"}</text></g>);
  }), [doors, roomPts]);

  const tabs = closed ? ["room", "add", "items", "d/w", "import", "save"] : ["draw", "import", "save"];

  const WallRow = ({ i, cm }) => {
    const isEd = editingWall === i;
    return (<div style={{ fontSize: 10, color: "var(--fg4)", padding: "6px 10px", background: "var(--bg4)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "space-between", border: isEd ? "1px solid var(--warn)" : "1px solid var(--border4)" }}>
      <span style={{ color: "var(--fg3)", fontWeight: 500 }}>Wall {i + 1}</span>
      {isEd ? (<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="number" value={editWallVal} onChange={e => setEditWallVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") confirmEditWall(i); if (e.key === "Escape") { setEditingWall(null); setEditWallVal(""); } }} autoFocus style={{ width: 55, padding: "3px 5px", fontSize: 11, background: "var(--bg5)", border: "1px solid var(--warn)", borderRadius: 4, color: "var(--warn)", outline: "none", fontFamily: "inherit", textAlign: "right" }} />
        <span style={{ color: "var(--fg5)", fontSize: 10 }}>cm</span>
        <button onClick={() => confirmEditWall(i)} style={{ background: "var(--accent)", border: "none", color: "#000", fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>✓</button>
      </div>) : (<span onClick={() => startEditWall(i, cm)} style={{ color: "var(--warn)", cursor: "pointer", padding: "2px 6px", borderRadius: 3, background: "var(--warn-bg)" }}>{cm} cm ✎</span>)}
    </div>);
  };

  return (
    <div data-theme={theme} style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }} tabIndex={0}>
      {/* ── Header ── */}
      <div style={{ padding: "8px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, background: "var(--accent)", borderRadius: 2 }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--fg2)" }}>Room Planner</span>
        </div>
        <span style={{ fontSize: 9, color: "var(--fg6)", background: "var(--bg5)", padding: "2px 8px", borderRadius: 4 }}>{username}</span>
        {closed && <span style={{ fontSize: 9, color: "var(--warn)", background: "var(--warn-bg)", padding: "2px 8px", borderRadius: 4 }}>{area.toFixed(1)} m²</span>}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {rooms.map((r, i) => (
            <button key={r.id} onClick={() => switchRoom(r.id)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: r.id === activeRoomId ? "1px solid var(--accent)" : "1px solid var(--border3)", background: r.id === activeRoomId ? "var(--accent)" : "var(--bg6)", color: r.id === activeRoomId ? "#000" : "var(--fg5)", cursor: "pointer", fontFamily: "inherit", fontWeight: r.id === activeRoomId ? 600 : 400 }}>
              R{i + 1}{r.closed ? "" : " ✏"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={addRoom} style={{ ...btnSmSt, fontWeight: 600 }}>+ Room</button>
        {rooms.length > 1 && <button onClick={deleteRoom} style={{ ...btnSmSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Del R</button>}
        <button onClick={undo} disabled={history.length === 0} style={{ ...btnSmSt, opacity: history.length === 0 ? 0.3 : 1 }}>↩</button>
        <button onClick={redo} disabled={future.length === 0} style={{ ...btnSmSt, opacity: future.length === 0 ? 0.3 : 1 }}>↪</button>
        {rooms.some(r => r.closed) && <button onClick={exportPNG} style={{ ...btnSmSt, background: "var(--accent2)", color: "var(--accent)", borderColor: "var(--accent)" }}>Export</button>}
        {!closed && <button onClick={() => setDrawingOn(v => { const n = !v; setInfo(n ? "Drawing ON" : "Drawing OFF"); if (!n) { setCursor(null); setGuides([]); } return n; })} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, border: drawingOn ? "1px solid var(--accent)" : "1px solid var(--border3)", background: drawingOn ? "var(--accent)" : "var(--bg6)", color: drawingOn ? "#000" : "var(--fg4)", cursor: "pointer", fontFamily: "inherit" }}>{drawingOn ? "✏ ON" : "✏ OFF"}</button>}
        {doorMode && <button onClick={() => setDoorMode(null)} style={{ ...btnSmSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Cancel {doorMode}</button>}
        <label style={{ fontSize: 10, color: "var(--fg5)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} style={{ accentColor: "var(--accent)" }} />Snap</label>
        <span style={{ fontSize: 9, color: "var(--fg7)" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={toggleTheme} style={{ ...btnSmSt }}>{theme === "dark" ? "☀" : "☾"}</button>
        <button onClick={onLogout} style={{ ...btnSmSt, color: "var(--fg4)" }}>Out</button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 250, background: "var(--bg3)", borderRight: "1px solid var(--border2)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--border2)" }}>
            {tabs.map(tab => (<button key={tab} onClick={() => setPanel(tab)} style={{ flex: 1, padding: "9px 0", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", background: panel === tab ? "var(--bg5)" : "transparent", color: panel === tab ? "var(--fg2)" : "var(--fg6)", border: "none", borderBottom: panel === tab ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit" }}>{tab}</button>))}
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {panel === "draw" && (<>
              <p style={{ fontSize: 11, color: "var(--fg4)", lineHeight: 1.5 }}>Toggle <b style={{ color: "var(--accent)" }}>✏ ON</b>, click to place corners. Drag canvas to pan, scroll to zoom.{roomPts.length >= 3 && " Click green dot or Close Room."}</p>
              {roomPts.length >= 2 && (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}><label style={labelSt}>Walls</label>{roomPts.slice(0, -1).map((p, i) => <WallRow key={`dw${i}`} i={i} cm={wallLen(p, roomPts[i + 1])} />)}</div>)}
              <div style={{ display: "flex", gap: 6 }}><button onClick={undoPoint} disabled={roomPts.length === 0} style={{ ...btnSt, flex: 1, opacity: roomPts.length === 0 ? 0.3 : 1 }}>Undo pt</button><button onClick={closeRoom} disabled={roomPts.length < 3} style={{ ...btnPrimSt, flex: 1, opacity: roomPts.length < 3 ? 0.3 : 1 }}>Close Room</button></div>
            </>)}
            {panel === "room" && (<>
              <p style={{ fontSize: 11, color: "var(--fg4)", lineHeight: 1.5 }}>Drag corners to reshape. Click lengths to edit. <b style={{ color: "var(--warn)" }}>{area.toFixed(1)} m²</b></p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{roomPts.map((p, i) => <WallRow key={`rw${i}`} i={i} cm={wallLen(p, roomPts[(i + 1) % roomPts.length])} />)}</div>
              <button onClick={resetRoom} style={{ ...btnSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Redraw</button>
            </>)}
            {panel === "add" && (<>
              <div><label style={labelSt}>Label</label><input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Bed" style={inputSt} onKeyDown={e => e.key === "Enter" && addPiece()} /></div>
              <div style={{ display: "flex", gap: 6 }}>{["rect", "circle"].map(s => (<button key={s} onClick={() => setNewShape(s)} style={{ flex: 1, padding: "7px 0", fontSize: 9, fontWeight: 500, textTransform: "uppercase", background: newShape === s ? "var(--accent)" : "var(--bg5)", color: newShape === s ? "#000" : "var(--fg4)", border: newShape === s ? "1px solid var(--accent)" : "1px solid var(--border3)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>{s === "rect" ? "Rect" : "Circle"}</button>))}</div>
              <div><label style={labelSt}>{newShape === "circle" ? "Diameter cm" : "Width cm"}</label><input type="number" value={newW} onChange={e => setNewW(Math.max(5, parseInt(e.target.value) || 5))} style={inputSt} /></div>
              {newShape === "rect" && <div><label style={labelSt}>Height cm</label><input type="number" value={newH} onChange={e => setNewH(Math.max(5, parseInt(e.target.value) || 5))} style={inputSt} /></div>}
              <button onClick={addPiece} style={btnPrimSt}>+ Add Item</button>
            </>)}
            {panel === "items" && (<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {pieces.length === 0 && <p style={{ fontSize: 11, color: "var(--fg6)", textAlign: "center", padding: 16 }}>No items</p>}
              {pieces.map(p => (<div key={p.id} onClick={() => { setSelected(p.id); setColorPicking(null); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, background: selected === p.id ? "var(--accent2)" : "var(--bg4)", border: selected === p.id ? "1px solid var(--accent)" : "1px solid var(--border4)", cursor: "pointer" }}>
                <div onClick={e => { e.stopPropagation(); setColorPicking(colorPicking === p.id ? null : p.id); }} style={{ width: 12, height: 12, borderRadius: p.shape === "circle" ? "50%" : 2, background: p.color.fill, flexShrink: 0, cursor: "pointer", border: "1px solid var(--border3)" }} title="Colour" />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div><div style={{ fontSize: 8, color: "var(--fg5)" }}>{p.shape === "circle" ? `${p.widthCm}⌀` : `${p.widthCm}×${p.heightCm}`}</div></div>
                <button onClick={e => { e.stopPropagation(); deletePiece(p.id); }} style={{ background: "none", border: "none", color: "var(--fg6)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }} onMouseEnter={e => e.target.style.color = "var(--danger)"} onMouseLeave={e => e.target.style.color = "var(--fg6)"}>✕</button>
              </div>))}
              {colorPicking && (<div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 0" }}>{PALETTE.map((c, i) => (<div key={i} onClick={() => { setItemColor(colorPicking, c); setColorPicking(null); }} style={{ width: 20, height: 20, borderRadius: 4, background: c.fill, cursor: "pointer", border: "2px solid var(--border3)" }} />))}</div>)}
            </div>)}
            {panel === "d/w" && (<>
              <p style={{ fontSize: 11, color: "var(--fg4)", lineHeight: 1.5 }}>Pick type, then click a wall to place.</p>
              <div><label style={labelSt}>Width cm</label><input type="number" value={doorWidth} onChange={e => setDoorWidth(Math.max(20, parseInt(e.target.value) || 20))} style={inputSt} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setDoorMode("door")} style={{ flex: 1, ...btnSt, background: doorMode === "door" ? "var(--door-col)" : "var(--bg5)", color: doorMode === "door" ? "#000" : "var(--fg)", borderColor: doorMode === "door" ? "var(--door-col)" : "var(--border3)" }}>🚪 Door</button>
                <button onClick={() => setDoorMode("window")} style={{ flex: 1, ...btnSt, background: doorMode === "window" ? "var(--window-col)" : "var(--bg5)", color: doorMode === "window" ? "#000" : "var(--fg)", borderColor: doorMode === "window" ? "var(--window-col)" : "var(--border3)" }}>🪟 Window</button>
              </div>
              {doors.length > 0 && (<><label style={labelSt}>Placed</label>{doors.map(d => (<div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--fg4)", padding: "5px 8px", background: "var(--bg4)", borderRadius: 4, border: "1px solid var(--border4)" }}><span>{d.type === "door" ? "🚪" : "🪟"} Wall {d.wallIdx + 1} · {d.widthCm}cm</span><button onClick={() => { pushHistory(); setDoors(prev => prev.filter(x => x.id !== d.id)); }} style={{ background: "none", border: "none", color: "var(--fg6)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕</button></div>))}</>)}
            </>)}
            {panel === "import" && (<>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
              <p style={{ fontSize: 11, color: "var(--fg4)", lineHeight: 1.5 }}>Upload a floor plan image. AI will detect the room outline automatically.</p>
              <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={{ ...btnPrimSt, opacity: importing ? 0.5 : 1 }}>{importing ? "Analyzing..." : "📐 Upload Floor Plan"}</button>
              {importing && <p style={{ fontSize: 10, color: "var(--accent)", textAlign: "center" }}>Gemini is analyzing your floor plan...</p>}
              {importErr && <p style={{ fontSize: 10, color: "var(--warn)", lineHeight: 1.4 }}>{importErr}</p>}
              {overlayImg && (<>
                <div>
                  <label style={labelSt}>Overlay Opacity</label>
                  <input type="range" min="0" max="100" value={Math.round(overlayOpacity * 100)} onChange={e => setOverlayOpacity(parseInt(e.target.value) / 100)} style={{ width: "100%", accentColor: "var(--accent)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--fg6)" }}><span>Hidden</span><span>{Math.round(overlayOpacity * 100)}%</span><span>Full</span></div>
                </div>
                <button onClick={clearOverlay} style={{ ...btnSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Remove Overlay</button>
                {!closed && <p style={{ fontSize: 10, color: "var(--fg5)", lineHeight: 1.4 }}>Toggle <b style={{ color: "var(--accent)" }}>✏ ON</b> and trace over the image to draw walls manually.</p>}
                {closed && <p style={{ fontSize: 10, color: "var(--fg5)", lineHeight: 1.4 }}>Go to the <b>Room</b> tab and drag corners to align with the overlay.</p>}
              </>)}
            </>)}
            {panel === "save" && <SaveLoad token={token} rooms={rooms} onLoad={loadRoom} onInfo={setInfo} />}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <svg ref={svgRef} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} style={{ width: "100%", height: "100%", display: "block", userSelect: "none", touchAction: "none", cursor: doorMode ? "crosshair" : mode === "draw" && drawingOn ? "crosshair" : panRef.current?.moved ? "grabbing" : "grab" }} onClick={onCanvasClick} onMouseMove={onCanvasMove} onMouseDown={e => {
              const onEmpty = !e.target.closest(".furniture") && !e.target.closest(".corner-handle");
              if (onEmpty && e.button === 0 && !drawingOn && !doorMode) { onPanStart(e, true); }
              else { onPanStart(e, false); }
            }}>
              <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="var(--canvas-bg)" />
              {gridLines}
              {overlayImg && <image href={overlayImg} x={overlayBounds.x} y={overlayBounds.y} width={overlayBounds.w} height={overlayBounds.h} opacity={overlayOpacity} style={{ pointerEvents: "none" }} />}
              {guides.map((g, i) => g.axis === "x" ? <line key={`ag${i}`} x1={g.val} y1={0} x2={g.val} y2={CVS} stroke="var(--guide)" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" /> : <line key={`ag${i}`} x1={0} y1={g.val} x2={CVS} y2={g.val} stroke="var(--guide)" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />)}
              {rooms.filter(r => r.id !== activeRoomId).map((room, ri) => {
                const rpts = room.roomPts, rclosed = room.closed;
                return (
                  <g key={room.id} opacity="0.45" style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); switchRoom(room.id); }}>
                    {rclosed && rpts.length >= 3 && <path d={polyPath(rpts)} fill="var(--room-fill)" stroke="none" />}
                    {rpts.length >= 2 && rpts.map((p, i) => { if (!rclosed && i === rpts.length - 1) return null; const n = rpts[(i + 1) % rpts.length]; return <line key={`iw${ri}${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="var(--wall)" strokeWidth="2.5" strokeLinecap="round" />; })}
                    {room.doors.map(d => { if (d.wallIdx >= rpts.length) return null; const a = rpts[d.wallIdx], b = rpts[(d.wallIdx + 1) % rpts.length]; const px = a.x + (b.x - a.x) * d.t, py = a.y + (b.y - a.y) * d.t; const dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1; const ux = dx / l, uy = dy / l, hw = (d.widthCm * PX) / 2; return <line key={d.id} x1={px - ux * hw} y1={py - uy * hw} x2={px + ux * hw} y2={py + uy * hw} stroke={d.type === "door" ? "var(--door-col)" : "var(--window-col)"} strokeWidth="4" />; })}
                    {room.pieces.map(p => { const bb = aabb(p), cx = p.x + bb.w / 2, cy = p.y + bb.h / 2; return (<g key={p.id} transform={`translate(${cx},${cy}) rotate(${p.rot})`}>{p.shape === "circle" ? <circle cx="0" cy="0" r={p.pw / 2} fill={p.color.fill} fillOpacity="0.2" stroke={p.color.stroke} strokeWidth="1.5" /> : <rect x={-p.pw / 2} y={-p.ph / 2} width={p.pw} height={p.ph} rx="3" fill={p.color.fill} fillOpacity="0.2" stroke={p.color.stroke} strokeWidth="1.5" />}</g>); })}
                    {rclosed && rpts.length >= 3 && (() => { const b = polyBounds(rpts); return <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} fontSize="13" fontFamily="'JetBrains Mono', monospace" fill="var(--fg4)" textAnchor="middle" dominantBaseline="central">R{rooms.indexOf(room) + 1}</text>; })()}
                  </g>
                );
              })}
              {closed && roomPts.length >= 3 && <path d={polyPath(roomPts)} fill="var(--room-fill)" stroke="none" />}
              {roomPts.length >= 2 && roomPts.map((p, i) => { if (!closed && i === roomPts.length - 1) return null; const n = roomPts[(i + 1) % roomPts.length]; return <line key={`w${i}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="var(--wall)" strokeWidth="3" strokeLinecap="round" />; })}
              {doorElements}
              {mode === "draw" && !closed && cursor && roomPts.length > 0 && (<><line x1={roomPts[roomPts.length - 1].x} y1={roomPts[roomPts.length - 1].y} x2={cursor.x} y2={cursor.y} stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />{roomPts.length >= 3 && dist(cursor, roomPts[0]) < CLOSE_D * 2 && <circle cx={roomPts[0].x} cy={roomPts[0].y} r={CLOSE_D} fill="var(--accent)" fillOpacity="0.15" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" />}</>)}
              {roomPts.map((p, i) => (<circle key={`dot${i}`} className="corner-handle" cx={p.x} cy={p.y} r={closed ? 6 : 4} fill={i === 0 && mode === "draw" && !closed ? "var(--accent)" : (dragCorner === i ? "var(--corner-active)" : "var(--corner-dot)")} stroke="var(--bg)" strokeWidth="1.5" style={{ cursor: closed ? "grab" : "default" }} onMouseDown={e => { if (!closed) return; e.stopPropagation(); pushHistory(); setDragCorner(i); }} />))}
              {wallLabels}
              {pieces.map(p => {
                const bb = aabb(p), cx = p.x + bb.w / 2, cy = p.y + bb.h / 2, isSel = selected === p.id, dim = p.shape === "circle" ? `${p.widthCm}⌀` : `${p.widthCm}×${p.heightCm}`;
                return (<g key={p.id} className="furniture" transform={`translate(${cx},${cy}) rotate(${p.rot})`} style={{ cursor: "grab" }} onMouseDown={e => onPointerDown(e, p)} onTouchStart={e => { e.preventDefault(); onPointerDown(e, p); }}>
                  {p.shape === "circle" ? (<><circle cx="0" cy="0" r={p.pw / 2} fill={p.color.fill} fillOpacity={isSel ? 0.6 : 0.35} stroke={p.color.stroke} strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={isSel ? "5 3" : "none"} /><circle cx="0" cy="0" r={p.pw * 0.28} fill="none" stroke={p.color.stroke} strokeWidth="1" opacity="0.5" /></>) : (<rect x={-p.pw / 2} y={-p.ph / 2} width={p.pw} height={p.ph} rx="3" fill={p.color.fill} fillOpacity={isSel ? 0.6 : 0.35} stroke={p.color.stroke} strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={isSel ? "5 3" : "none"} />)}
                  <text fontSize="10" fontWeight="500" fontFamily="'JetBrains Mono', monospace" fill={p.color.text} x="0" y="-4" textAnchor="middle" dominantBaseline="central">{p.label}</text>
                  <text fontSize="7" fontFamily="'JetBrains Mono', monospace" fill={p.color.sub} x="0" y="7" textAnchor="middle" dominantBaseline="central">{dim}</text>
                </g>);
              })}
            </svg>
          </div>
          <div style={{ padding: "6px 14px", background: "var(--bg2)", borderTop: "1px solid var(--border2)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", minHeight: 40 }}>
            {selectedPiece ? (<>
              <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 500 }}>{selectedPiece.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <button onClick={() => rotate(-90)} style={btnSmSt}>↺90</button><button onClick={() => rotate(-1)} style={btnSmSt}>↺1</button>
                <span style={{ fontSize: 10, minWidth: 32, textAlign: "center", color: "var(--fg2)", background: "var(--bg5)", borderRadius: 4, padding: "2px 5px", border: "1px solid var(--border3)", fontFamily: "inherit" }}>{Math.round(selectedPiece.rot)}°</span>
                <button onClick={() => rotate(1)} style={btnSmSt}>↻1</button><button onClick={() => rotate(90)} style={btnSmSt}>↻90</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}><button onClick={() => nudgePiece(-1, 0)} style={btnSmSt}>←</button><button onClick={() => nudgePiece(0, -1)} style={btnSmSt}>↑</button><button onClick={() => nudgePiece(0, 1)} style={btnSmSt}>↓</button><button onClick={() => nudgePiece(1, 0)} style={btnSmSt}>→</button></div>
              <button onClick={() => deletePiece(selected)} style={{ ...btnSmSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Del</button>
              <span style={{ fontSize: 8, color: "var(--fg7)", marginLeft: "auto" }}>{info}</span>
            </>) : (<span style={{ fontSize: 10, color: "var(--fg6)" }}>{info}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
