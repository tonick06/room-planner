import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(express.json({ limit: "10mb" }));

// ── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── Auth endpoints ───────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, hash]
    );
    const token = jwt.sign({ id: result.rows[0].id, email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: "Invalid email or password" });
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rooms CRUD ───────────────────────────────────────────────────────────────
app.get("/api/rooms", authMiddleware, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, data, updated_at FROM rooms WHERE user_id = $1 ORDER BY updated_at DESC",
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/api/rooms", authMiddleware, async (req, res) => {
  const { name, data } = req.body;
  const result = await pool.query(
    "INSERT INTO rooms (user_id, name, data) VALUES ($1, $2, $3) RETURNING id, name, data, updated_at",
    [req.user.id, name, JSON.stringify(data)]
  );
  res.json(result.rows[0]);
});

app.put("/api/rooms/:id", authMiddleware, async (req, res) => {
  const { name, data } = req.body;
  const result = await pool.query(
    "UPDATE rooms SET name = $1, data = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id, name, data, updated_at",
    [name, JSON.stringify(data), req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Room not found" });
  res.json(result.rows[0]);
});

app.delete("/api/rooms/:id", authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM rooms WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ── Gemini proxy ─────────────────────────────────────────────────────────────
app.post("/api/analyze-floorplan", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || "image/png",
                  data: imageBase64,
                }
              },
              {
                text: `You are a floor plan parser. Analyze this floor plan image and do two things:

1. Trace the outer boundary of the overall floor plan (all rooms combined as one outline).
2. Read any dimension labels visible in the image to find the real-world size.

Output a single JSON object — no markdown, no backticks, no explanation, no extra text.

Format: {"points": [{"x": 0.12, "y": 0.08}, ...], "widthM": 9.0, "heightM": 7.5}

Rules for points:
- x and y are decimal fractions of image width/height (0.0 to 1.0)
- Points go clockwise from top-left corner
- Include every corner — L-shapes, notches, alcoves
- 4 to 20 points total

Rules for dimensions:
- widthM = total width of the traced outline in metres
- heightM = total height of the traced outline in metres
- Convert from cm or feet if needed (1 ft = 0.3048 m)
- If the image has a scale bar, use it to calculate real dimensions
- If you cannot determine real dimensions, omit widthM and heightM entirely

Your entire response must be only the JSON object, nothing else.`
              }
            ]
          }]
        })
      }
    );

    const rawText = await response.text();
    fs.writeFileSync("C:/Users/nickt/AppData/Local/Temp/gemini-debug.txt", rawText);
    const data = JSON.parse(rawText);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in Gemini response");
    const parsed = JSON.parse(match[0]);

    res.json(parsed);
  } catch (err) {
    console.error("Gemini error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Proxy running on http://localhost:3001"));
