# Jelly Battle server (online matches + friends rooms)

Authoritative rooms that run the same game simulation as the client. Public queue: 4 players, empty seats
fill with bots after 4 s. Friends rooms: 2-12 players by code, host starts when everyone is ready, host can
kick, everyone returns to the room after each match, larger lobbies play on a larger arena.

## Deploy in ~5 minutes (pick one)
**Render (free):** push this folder to a GitHub repo -> render.com -> New -> Blueprint -> pick the repo.
`render.yaml` sets everything up. Your URL will look like `https://jelly-battle-server.onrender.com`.
(Free Render instances sleep when idle; the first connection after a sleep takes ~30 s. A paid
instance or Fly.io avoids that.)

**Fly.io (always on):** `fly launch --copy-config --now` inside this folder.

**Any VPS / Docker:** `docker build -t jelly . && docker run -p 8787:8787 jelly`

## Point the game at it
In the game's `index.html` find `window.JB_SERVER = window.JB_SERVER || "";` and put your address with
`wss://`, e.g. `"wss://jelly-battle-server.onrender.com"`. Re-zip and upload. Without a URL the game
plays offline against bots (everything else still works).

## Settings (environment variables)
- `PORT` (default 8787)
- `ADMIN_CODE` admin API key (default 1695, change it!) - the in-game admin panel uses it via the `x-admin` header
- `DB_FILE` where the player list is stored (default `server/players.json`)

Health check: `GET /health`. Admin: `GET /api/players`, `POST /api/ban {name}`, `POST /api/unban {name}`.
