import { useState } from "react";
import { labelSt, inputSt, btnPrimSt } from "../styles.js";

export default function AuthScreen({ onLogin, theme, toggleTheme }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!email.trim() || !pw.trim()) { setErr("Fill in both fields"); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/${isSignup ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: pw }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Something went wrong"); return; }
      onLogin(data.token, data.email);
    } catch { setErr("Cannot reach server — is it running?"); }
    finally { setLoading(false); }
  };
  return (
    <div data-theme={theme} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ width: 340, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--fg2)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Room Planner</span>
          </div>
          <button onClick={toggleTheme} style={{ background: "var(--bg5)", border: "1px solid var(--border3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--fg4)", fontFamily: "inherit" }}>{theme === "dark" ? "☀" : "☾"}</button>
        </div>
        <p style={{ fontSize: 13, color: "var(--fg4)", marginBottom: 20 }}>{isSignup ? "Create an account" : "Sign in"}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={labelSt}>Email</label><input value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} style={inputSt} autoFocus /></div>
          <div><label style={labelSt}>Password</label><input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} style={inputSt} /></div>
          {err && <p style={{ fontSize: 11, color: "var(--danger)" }}>{err}</p>}
          <button onClick={submit} disabled={loading} style={{ ...btnPrimSt, opacity: loading ? 0.6 : 1 }}>{loading ? "..." : isSignup ? "Sign Up" : "Sign In"}</button>
          <button onClick={() => { setIsSignup(!isSignup); setErr(""); }} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "6px 0" }}>{isSignup ? "Have an account? Sign in" : "Need an account? Sign up"}</button>
        </div>
      </div>
    </div>
  );
}
