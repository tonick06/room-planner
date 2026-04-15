import { useState, useCallback, useEffect } from "react";
import { labelSt, inputSt, btnSmSt } from "../styles.js";

export default function SaveLoad({ token, rooms, onLoad, onInfo }) {
  const [name, setName] = useState(""); const [saved, setSaved] = useState([]);
  const api = (path, opts = {}) => fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const refresh = useCallback(async () => {
    try { const res = await api("/api/rooms"); if (res.ok) setSaved(await res.json()); } catch {}
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  const save = async () => {
    if (!name.trim()) { onInfo("Enter a name"); return; }
    if (!rooms.some(r => r.closed)) { onInfo("Close at least one room first"); return; }
    try {
      const res = await api("/api/rooms", { method: "POST", body: JSON.stringify({ name: name.trim(), data: { rooms } }) });
      if (res.ok) { refresh(); onInfo(`Saved "${name.trim()}"`); setName(""); }
    } catch { onInfo("Save failed"); }
  };
  const del = async (id, n) => {
    try { await api(`/api/rooms/${id}`, { method: "DELETE" }); refresh(); onInfo(`Deleted "${n}"`); } catch { onInfo("Delete failed"); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div><label style={labelSt}>Save as</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} placeholder="Floor plan name..." style={{ ...inputSt, flex: 1 }} />
          <button onClick={save} style={{ ...btnSmSt, background: "var(--accent)", color: "#000", borderColor: "var(--accent)", fontWeight: 600 }}>Save</button>
        </div>
      </div>
      <label style={labelSt}>Saved floor plans</label>
      {saved.length === 0 && <p style={{ fontSize: 11, color: "var(--fg6)", textAlign: "center", padding: 12 }}>None yet</p>}
      {saved.map(entry => {
        const roomCount = entry.data?.rooms?.length ?? 1;
        const itemCount = entry.data?.rooms?.reduce((a, r) => a + (r.pieces?.length || 0), 0) ?? 0;
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border4)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</div>
              <div style={{ fontSize: 9, color: "var(--fg6)" }}>{roomCount} {roomCount === 1 ? "room" : "rooms"} · {itemCount} items</div>
            </div>
            <button onClick={() => { onLoad(entry.data); onInfo(`Loaded "${entry.name}"`); }} style={{ ...btnSmSt, background: "var(--accent2)", color: "var(--accent)", borderColor: "var(--accent)" }}>Load</button>
            <button onClick={() => del(entry.id, entry.name)} style={{ ...btnSmSt, color: "var(--danger)", borderColor: "var(--danger-border)" }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
