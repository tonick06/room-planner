# Room Planner

A full-stack interactive room planning application built with React, Node.js, and PostgreSQL.

**Live demo:** https://room-planner-tau.vercel.app

## Features

- **Draw rooms** — click to place corners, snap to grid, close to form a polygon
- **Multi-room support** — plan an entire floor with multiple rooms on one canvas
- **Furniture placement** — add, drag, rotate, and resize items with collision detection
- **Doors & windows** — click any wall to place with arc visualisation
- **AI floor plan import** — upload an image and Gemini AI automatically traces the room outline and reads real-world dimensions
- **Save & load** — floor plans saved per user to PostgreSQL
- **Export** — download your floor plan as a PNG
- **Dark/light theme** — persistent theme preference

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, SVG canvas |
| Backend | Node.js, Express |
| Database | PostgreSQL (Neon) |
| Auth | JWT + bcrypt |
| AI | Google Gemini 2.5 Flash |
| Deployment | Vercel (frontend) + Render (backend) |

## Running Locally

**Prerequisites:** Node.js, PostgreSQL

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in GEMINI_API_KEY, DATABASE_URL, JWT_SECRET, VITE_API_URL

# Start backend
node server.js

# Start frontend (separate terminal)
npm run dev
```

**Database setup** — run `setup.sql` against your PostgreSQL instance:
```bash
psql -U postgres -f setup.sql
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for signing JWTs |
| `VITE_API_URL` | Backend URL (e.g. `http://localhost:3001`) |
