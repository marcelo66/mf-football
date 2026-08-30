import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const REFRESH_MS = Number(process.env.REFRESH_MS || 60000);
const LEAGUE_URL = process.env.LEAGUE_URL ||
  "https://www.promiedos.com.ar/league/primera-c/ffjb";

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_FILE = path.join(DATA_DIR, "primera-c.json");
const RAW_FILE = path.join(DATA_DIR, "promiedos-raw.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

let state = {
  ok: false,
  updatedAt: null,
  source: LEAGUE_URL,
  error: null,
  data: null
};

const OVERLAY_STATE_FILE = path.join(DATA_DIR, "overlay-state.json");

let overlayState = {
  mode: "zona-a",
  rotate: false,
  rotateMs: 8000,
  transparent: true,
  bg: "",
  video: "",
  updatedAt: nowISO()
};

function loadOverlayState() {
  try {
    const saved = JSON.parse(
      fs.readFileSync(OVERLAY_STATE_FILE, "utf8")
    );

    overlayState = {
      ...overlayState,
      ...saved
    };

    console.log("[OVERLAY] Estado anterior cargado.");
  } catch {}
}

function saveOverlayState() {
  fs.writeFileSync(
    OVERLAY_STATE_FILE,
    JSON.stringify(overlayState, null, 2),
    "utf8"
  );
}

function nowISO() {
  return new Date().toISOString();
}

function saveJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

function loadCache() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    state = {
      ok: Boolean(data?.meta?.ok),
      updatedAt: data?.meta?.updatedAt || null,
      source: LEAGUE_URL,
      error: null,
      data
    };
    console.log("[CACHE] Datos anteriores cargados.");
  } catch {}
}

function valueMap(row) {
  const out = {};
  for (const v of (row?.values || [])) {
    if (v?.key != null) out[String(v.key)] = v.value;
  }
  return out;
}

function number(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseTable(table) {
  const columns = (table?.table?.columns || []).map(c => c?.title ?? c?.key ?? "");
  const rows = (table?.table?.rows || []).map((row, index) => {
    const values = valueMap(row);
    const entity = row?.entity?.object || {};
    return {
      pos: Number(row?.num ?? index + 1),
      team: entity.name || entity.short_name || "Equipo",
      shortName: entity.short_name || entity.name || "",
      teamId: entity.id ?? null,
      values,
      columns
    };
  });

  return {
    name: table?.name || "Tabla",
    rows
  };
}

function parseTables(pageData) {
  const groups = pageData?.tables_groups || [];
  const tables = [];

  for (const group of groups) {
    for (const table of (group?.tables || [])) {
      tables.push({
        group: group?.name || "",
        ...parseTable(table)
      });
    }
  }
  return tables;
}

function parseNextData(html) {
  // Promiedos is a Next.js app. The league data is embedded in __NEXT_DATA__.
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) throw new Error("No se encontró __NEXT_DATA__ en Promiedos.");
  return JSON.parse(match[1]);
}

function normalizeGame(game) {
  const teams = game?.teams || [];
  const a = teams[0] || {};
  const b = teams[1] || {};
  const scores = game?.scores;

  return {
    id: game?.id ?? null,
    home: a?.name || a?.short_name || "",
    away: b?.name || b?.short_name || "",
    homeId: a?.id ?? null,
    awayId: b?.id ?? null,
    score: Array.isArray(scores) ? `${scores[0] ?? 0}-${scores[1] ?? 0}` : null,
    played: Array.isArray(scores),
    winner: game?.winner ?? null,
    raw: game
  };
}

async function fetchGames(leagueId, filters) {
  if (!leagueId || !Array.isArray(filters)) return [];

  // Prefer the selected date. If none is marked selected, use a filter
  // whose name looks like "Fecha N".
  const selected =
    filters.find(f => f?.selected) ||
    filters.find(f => /fecha/i.test(String(f?.name || "")));

  if (!selected?.key) return [];

  const url = `https://api.promiedos.com.ar/league/games/${leagueId}/${selected.key}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "MF-Football/1.0",
        "Accept": "application/json"
      }
    });
    if (!r.ok) throw new Error(`Games API HTTP ${r.status}`);
    const json = await r.json();

    return {
      date: selected.name || "",
      key: selected.key,
      games: (json?.games || []).map(normalizeGame)
    };
  } catch (err) {
    console.warn("[GAMES]", err.message);
    return {
      date: selected.name || "",
      key: selected.key,
      games: []
    };
  }
}

function makeOutput(pageData, gamesResult) {
  const league = pageData?.league || {};
  const tables = parseTables(pageData);

  const results = [];
  const next = [];

  for (const g of (gamesResult?.games || [])) {
    if (g.played) results.push(g);
    else next.push(g);
  }

  return {
    meta: {
      ok: true,
      updatedAt: nowISO(),
      leagueId: league.id ?? null,
      leagueName: league.name || "Primera C Metropolitana",
      source: LEAGUE_URL
    },
    tables,
    results,
    next,
    gameDate: gamesResult?.date || "",
    gameKey: gamesResult?.key || ""
  };
}

async function refresh() {
  try {
    console.log(`[SYNC] Consultando ${LEAGUE_URL}`);

    const response = await fetch(LEAGUE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MF-Football/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`Promiedos HTTP ${response.status}`);
    }

    const html = await response.text();
    const nextData = parseNextData(html);
    const pageData = nextData?.props?.pageProps?.data;

    if (!pageData) {
      throw new Error("La estructura de datos de Promiedos cambió.");
    }

    saveJSON(RAW_FILE, pageData);

    const games = await fetchGames(
      pageData?.league?.id,
      pageData?.games?.filters
    );

    const output = makeOutput(pageData, games);

    saveJSON(CACHE_FILE, output);

    state = {
      ok: true,
      updatedAt: output.meta.updatedAt,
      source: LEAGUE_URL,
      error: null,
      data: output
    };

    console.log(
      `[SYNC] OK — ${output.tables.length} tablas / ${output.results.length} resultados / ${output.next.length} próximos`
    );
  } catch (err) {
    state.ok = Boolean(state.data);
    state.error = err.message;
    console.error("[SYNC ERROR]", err.message);
  }
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(clean).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(PUBLIC_DIR, normalized === "/" ? "index.html" : normalized);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return send(res, 200, JSON.stringify({
      status: "ok",
      app: "mf-football",
      synced: state.ok,
      updatedAt: state.updatedAt,
      error: state.error
    }));
  }

  if (url.pathname === "/api/primera-c") {
    if (!state.data) {
      return send(res, 503, JSON.stringify({
        ok: false,
        error: state.error || "Todavía no hay datos."
      }));
    }
    return send(res, 200, JSON.stringify(state.data));
  }

  if (url.pathname === "/api/status") {
    return send(res, 200, JSON.stringify({
      ok: state.ok,
      updatedAt: state.updatedAt,
      source: state.source,
      error: state.error,
      tables: state.data?.tables?.length || 0,
      results: state.data?.results?.length || 0,
      next: state.data?.next?.length || 0
    }));
  }
if (url.pathname === "/api/overlay-control") {

  if (req.method === "GET") {
    return send(res, 200, JSON.stringify({
      ok: true,
      state: overlayState
    }));
  }

  if (req.method === "POST") {

    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 10000) {
        req.destroy();
      }
    });

    req.on("end", () => {

      try {

        const incoming = JSON.parse(body || "{}");

        const validModes = [
          "zona-a",
          "zona-b",
          "resultados",
          "proximos"
        ];

        if (
          incoming.mode &&
          validModes.includes(incoming.mode)
        ) {
          overlayState.mode = incoming.mode;
        }

        if (typeof incoming.rotate === "boolean") {
          overlayState.rotate = incoming.rotate;
        }

        if (
          incoming.rotateMs !== undefined &&
          Number.isFinite(Number(incoming.rotateMs))
        ) {
          overlayState.rotateMs =
            Math.max(3000, Math.min(60000, Number(incoming.rotateMs)));
        }

        if (typeof incoming.transparent === "boolean") {
          overlayState.transparent = incoming.transparent;
        }

        if (typeof incoming.bg === "string") {
          overlayState.bg = incoming.bg.slice(0, 1000);
        }

        if (typeof incoming.video === "string") {
          overlayState.video = incoming.video.slice(0, 1000);
        }

        overlayState.updatedAt = nowISO();

        saveOverlayState();

        return send(res, 200, JSON.stringify({
          ok: true,
          state: overlayState
        }));

      } catch (err) {

        return send(res, 400, JSON.stringify({
          ok: false,
          error: "JSON inválido"
        }));

      }

    });

    return;
  }

  return send(res, 405, JSON.stringify({
    ok: false,
    error: "Método no permitido"
  }));
}
  const file = safePath(url.pathname);
  if (!file.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      return send(res, 404, "Not found", "text/plain; charset=utf-8");
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

loadCache();
loadOverlayState();
refresh();
setInterval(refresh, REFRESH_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MF Football escuchando en ${PORT}`);
});
