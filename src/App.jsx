import { useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import Planner from "./components/Planner.jsx";
import { THEME_CSS } from "./constants.js";

export default function RoomPlanner() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem("rp_token") || null; } catch { return null; } });
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("rp_email") || null; } catch { return null; } });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("rp_theme") || "dark"; } catch { return "dark"; } });
  const toggleTheme = () => setTheme(t => { const n = t === "dark" ? "light" : "dark"; try { localStorage.setItem("rp_theme", n); } catch {} return n; });
  const login = (tok, em) => { setToken(tok); setEmail(em); try { localStorage.setItem("rp_token", tok); localStorage.setItem("rp_email", em); } catch {} };
  const logout = () => { setToken(null); setEmail(null); try { localStorage.removeItem("rp_token"); localStorage.removeItem("rp_email"); } catch {} };
  return (<>
    <style>{THEME_CSS}</style>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
    {!token
      ? <AuthScreen onLogin={login} theme={theme} toggleTheme={toggleTheme} />
      : <Planner username={email} token={token} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />}
  </>);
}
