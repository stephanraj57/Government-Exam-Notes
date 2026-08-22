import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Automatically load .env file if present
try {
  const envPath = path.join(ROOT, ".env");
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const VISITS_FILE = path.join(DATA_DIR, "visits.json");
const INTERACTIONS_FILE = path.join(DATA_DIR, "interactions.json");
const environment = globalThis.process?.env || {};
const previewConfig = globalThis.__EXAM_ALERT_CONFIG || {};
const PORT = Number(previewConfig.port || environment.PORT || 4173);
const ADMIN_PASSWORD = previewConfig.adminPassword || environment.ADMIN_PASSWORD || "";
const sessions = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await createJsonIfMissing(NOTES_FILE, []);
  await createJsonIfMissing(VISITS_FILE, { count: 0 });
  await createJsonIfMissing(INTERACTIONS_FILE, {
    totalLikes: 0,
    totalDownloads: 0,
    totalSearches: 0,
    totalImpressions: 0,
    notes: {},
    searches: {},
    missingSearches: {}
  });
}

async function createJsonIfMissing(filePath, value) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  return (request.headers.cookie || "").split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index > -1) cookies[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
    return cookies;
  }, {});
}

function isAdmin(request) {
  const token = parseCookies(request).examAdminSession;
  return Boolean(token && sessions.has(token));
}

function safePasswordMatch(value) {
  if (!ADMIN_PASSWORD) return false;
  const supplied = Buffer.from(String(value || ""));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function readBody(request, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Upload payload is too large. Limit is 15 MB."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid request data."));
      }
    });
    request.on("error", reject);
  });
}

function sendUnauthorized(response) {
  sendJson(response, 401, { error: "Admin sign-in is required for this action." });
}

const activeSessions = new Map();

function getActiveUsersCount() {
  const now = Date.now();
  const threshold = now - 90000; // 90 seconds active window
  for (const [id, ts] of activeSessions.entries()) {
    if (ts < threshold) {
      activeSessions.delete(id);
    }
  }
  return Math.max(1, activeSessions.size);
}

function registerSessionHeartbeat(request, body = null, isLeave = false) {
  const cookies = parseCookies(request);
  let sessionId = (body && body.sessionId) || cookies.examVisitorUid || cookies.examVisitorDay;
  if (!sessionId) {
    sessionId = `client-${request.socket.remoteAddress || "local"}`;
  }
  if (isLeave) {
    activeSessions.delete(sessionId);
  } else {
    activeSessions.set(sessionId, Date.now());
  }
  return getActiveUsersCount();
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/heartbeat") {
    let body = null;
    if (request.method === "POST") {
      body = await readBody(request).catch(() => null);
    }
    const isLeave = url.searchParams.get("leave") === "true";
    const activeCount = registerSessionHeartbeat(request, body, isLeave);
    sendJson(response, 200, { online: true, activeUsers: activeCount, port: PORT });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/visits") {
    registerSessionHeartbeat(request);
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    const todayKey = getLocalDateKey();
    const todayCount = (visits.daily && visits.daily[todayKey]) || 0;
    sendJson(response, 200, {
      count: visits.count || 0,
      today: todayCount,
      activeUsers: getActiveUsersCount(),
      daily: visits.daily || {}
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/visits/track") {
    const body = await readBody(request).catch(() => ({}));
    registerSessionHeartbeat(request, body);
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    if (!visits.daily) visits.daily = {};
    const cookies = parseCookies(request);
    const todayKey = getLocalDateKey();
    const setCookiesList = [];
    let shouldSave = false;

    // Track Today's Unique Visitor (if client hasn't visited today yet)
    if (cookies.examVisitorDay !== todayKey) {
      visits.daily[todayKey] = (visits.daily[todayKey] || 0) + 1;
      setCookiesList.push(`examVisitorDay=${todayKey}; Path=/; Max-Age=86400; SameSite=Lax`);
      shouldSave = true;
    }

    // Track Lifetime Unique Visitor (if first time ever visiting website)
    if (!cookies.examVisitorUid) {
      visits.count = (visits.count || 0) + 1;
      const uid = crypto.randomUUID();
      setCookiesList.push(`examVisitorUid=${uid}; Path=/; Max-Age=31536000; SameSite=Lax`);
      shouldSave = true;
    }

    if (shouldSave) {
      await writeJson(VISITS_FILE, visits);
    }

    const headers = {};
    if (setCookiesList.length > 0) {
      headers["Set-Cookie"] = setCookiesList.length === 1 ? setCookiesList[0] : setCookiesList;
    }

    const todayCount = visits.daily[todayKey] || 0;
    sendJson(response, 200, {
      count: visits.count || 0,
      today: todayCount,
      activeUsers: getActiveUsersCount(),
      daily: visits.daily
    }, headers);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/notes") {
    registerSessionHeartbeat(request);
    sendJson(response, 200, { notes: await readJson(NOTES_FILE) });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/interactions") {
    registerSessionHeartbeat(request);
    const interactions = await readJson(INTERACTIONS_FILE).catch(() => ({
      totalLikes: 0,
      totalDownloads: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      searches: {},
      missingSearches: {}
    }));
    interactions.activeUsers = getActiveUsersCount();
    sendJson(response, 200, interactions);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/interactions/track") {
    const body = await readBody(request).catch(() => ({}));
    let interactions = await readJson(INTERACTIONS_FILE).catch(() => ({
      totalLikes: 0,
      totalDownloads: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      searches: {}
    }));

    if (!interactions.notes) interactions.notes = {};
    if (!interactions.searches) interactions.searches = {};
    if (!interactions.missingSearches) interactions.missingSearches = {};

    const type = String(body.type || "");
    const noteId = String(body.noteId || "");
    const noteIds = Array.isArray(body.noteIds) ? body.noteIds : (noteId ? [noteId] : []);
    const query = String(body.query || "").trim();

    if (type === "like") {
      interactions.totalLikes = Math.max(0, (interactions.totalLikes || 0) + 1);
      if (noteId) {
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0 };
        interactions.notes[noteId].likes = Math.max(0, (interactions.notes[noteId].likes || 0) + 1);
      }
    } else if (type === "unlike") {
      interactions.totalLikes = Math.max(0, (interactions.totalLikes || 0) - 1);
      if (noteId && interactions.notes[noteId]) {
        interactions.notes[noteId].likes = Math.max(0, (interactions.notes[noteId].likes || 0) - 1);
      }
    } else if (type === "download") {
      interactions.totalDownloads = (interactions.totalDownloads || 0) + 1;
      if (noteId) {
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0 };
        interactions.notes[noteId].downloads = (interactions.notes[noteId].downloads || 0) + 1;
      }
    } else if (type === "search") {
      interactions.totalSearches = (interactions.totalSearches || 0) + 1;
      if (query && query.length >= 2) {
        const qKey = query.slice(0, 40);
        interactions.searches[qKey] = (interactions.searches[qKey] || 0) + 1;
      }
    } else if (type === "missing_search" || type === "unfulfilled_search") {
      if (query && query.length >= 2) {
        const qKey = query.slice(0, 60);
        if (!interactions.missingSearches[qKey]) {
          interactions.missingSearches[qKey] = {
            query: qKey,
            count: 0,
            firstSearched: new Date().toISOString(),
            lastSearched: new Date().toISOString()
          };
        }
        interactions.missingSearches[qKey].count = (interactions.missingSearches[qKey].count || 0) + 1;
        interactions.missingSearches[qKey].lastSearched = new Date().toISOString();
      }
    } else if (type === "impression" || type === "view") {
      const increment = noteIds.length > 0 ? noteIds.length : 1;
      interactions.totalImpressions = (interactions.totalImpressions || 0) + increment;
      noteIds.forEach(id => {
        if (!interactions.notes[id]) interactions.notes[id] = { likes: 0, downloads: 0, impressions: 0 };
        interactions.notes[id].impressions = (interactions.notes[id].impressions || 0) + 1;
      });
    }

    await writeJson(INTERACTIONS_FILE, interactions);
    sendJson(response, 200, { success: true, interactions });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/me") {
    sendJson(response, 200, { admin: isAdmin(request) });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    if (!ADMIN_PASSWORD) {
      sendJson(response, 503, { error: "Set ADMIN_PASSWORD on the server before enabling admin uploads." });
      return true;
    }
    const body = await readBody(request);
    if (!safePasswordMatch(body.password)) {
      sendJson(response, 401, { error: "The admin password is incorrect." });
      return true;
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now());
    sendJson(response, 200, { admin: true }, { "Set-Cookie": `examAdminSession=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax` });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = parseCookies(request).examAdminSession;
    if (token) sessions.delete(token);
    sendJson(response, 200, { admin: false }, { "Set-Cookie": "examAdminSession=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/notes") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request);
    const title = String(body.title || "").trim().slice(0, 80);
    const subject = String(body.subject || "").trim().slice(0, 50);
    const tags = Array.isArray(body.tags)
      ? body.tags.map(t => String(t).trim().replace(/^#/, "")).filter(Boolean).slice(0, 10)
      : String(body.tags || "").split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10);
    
    const rawImage = String(body.imageData || "").trim();
    const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
    if (!title || !subject || !imageMatch) {
      sendJson(response, 400, { error: "A title, subject, and valid note image diagram are required." });
      return true;
    }

    const rawType = imageMatch[1].toLowerCase();
    const ext = rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : rawType.includes("svg") ? "svg" : "jpg";
    const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");

    if (imageBuffer.length < 4 || imageBuffer.length > 12 * 1024 * 1024) {
      sendJson(response, 400, { error: "Image file is too large or corrupted. Please upload an image under 10 MB." });
      return true;
    }

    const id = crypto.randomUUID();
    const fileName = `${id}.${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), imageBuffer);
    const notes = await readJson(NOTES_FILE);
    const note = { id, title, subject, tags, imageUrl: `/uploads/${fileName}`, createdAt: new Date().toISOString() };
    notes.unshift(note);
    await writeJson(NOTES_FILE, notes);
    sendJson(response, 201, { note });
    return true;
  }

  if (request.method === "PUT" && url.pathname.startsWith("/api/admin/notes/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const id = url.pathname.split("/").pop();
    const body = await readBody(request);
    const title = String(body.title || "").trim().slice(0, 80);
    const subject = String(body.subject || "").trim().slice(0, 50);
    if (!title || !subject) {
      sendJson(response, 400, { error: "A title and subject are required." });
      return true;
    }

    const notes = await readJson(NOTES_FILE);
    const noteIndex = notes.findIndex((item) => item.id === id);
    if (noteIndex === -1) {
      sendJson(response, 404, { error: "Note not found." });
      return true;
    }

    const note = notes[noteIndex];
    note.title = title;
    note.subject = subject;

    if (body.tags !== undefined) {
      note.tags = Array.isArray(body.tags)
        ? body.tags.map(t => String(t).trim().replace(/^#/, "")).filter(Boolean).slice(0, 10)
        : String(body.tags || "").split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10);
    }

    if (body.imageData) {
      const rawImage = String(body.imageData).trim();
      const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (imageMatch) {
        const rawType = imageMatch[1].toLowerCase();
        const ext = rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : rawType.includes("svg") ? "svg" : "jpg";
        const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");
        if (imageBuffer.length >= 4 && imageBuffer.length <= 12 * 1024 * 1024) {
          const fileName = `${id}.${ext}`;
          // Clean up old image file if extension changed
          if (note.imageUrl && !note.imageUrl.endsWith(`.${ext}`)) {
            await fs.unlink(path.join(ROOT, note.imageUrl)).catch(() => undefined);
          }
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), imageBuffer);
          note.imageUrl = `/uploads/${fileName}`;
        }
      }
    }

    note.updatedAt = new Date().toISOString();
    notes[noteIndex] = note;
    await writeJson(NOTES_FILE, notes);
    sendJson(response, 200, { note });
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/notes/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const id = url.pathname.split("/").pop();
    const notes = await readJson(NOTES_FILE);
    const note = notes.find((item) => item.id === id);
    if (!note) {
      sendJson(response, 404, { error: "Note not found." });
      return true;
    }
    await fs.unlink(path.join(ROOT, note.imageUrl)).catch(() => undefined);
    await writeJson(NOTES_FILE, notes.filter((item) => item.id !== id));
    sendJson(response, 200, { deleted: true });
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/missing-searches/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const queryKey = decodeURIComponent(url.pathname.replace("/api/admin/missing-searches/", ""));
    let interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    if (interactions.missingSearches) {
      delete interactions.missingSearches[queryKey];
      await writeJson(INTERACTIONS_FILE, interactions);
    }
    sendJson(response, 200, { success: true, missingSearches: interactions.missingSearches || {} });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/missing-searches/clear") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    let interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    interactions.missingSearches = {};
    await writeJson(INTERACTIONS_FILE, interactions);
    sendJson(response, 200, { success: true, missingSearches: {} });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reset-data") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    await writeJson(NOTES_FILE, []);
    await writeJson(VISITS_FILE, { count: 0, daily: {} });
    await writeJson(INTERACTIONS_FILE, {
      totalLikes: 0,
      totalDownloads: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      searches: {},
      missingSearches: {}
    });
    sendJson(response, 200, { reset: true, message: "All server notes, visits, and interactions cleared." });
    return true;
  }

  return false;
}

async function serveStatic(request, response, pathname) {
  const allowedPublicFiles = new Set([
    "/",
    "/index.html",
    "/about.html",
    "/admin.html",
    "/styles.css",
    "/app.js",
    "/admin.js",
    "/assets/ailogo.png",
    "/assets/admin.jpg"
  ]);
  const isPublicUpload = /^\/uploads\/[0-9a-f-]+\.(jpg|jpeg|png|webp|svg)$/i.test(pathname);
  const isPublicAsset = pathname.startsWith("/assets/");
  if (!allowedPublicFiles.has(pathname) && !isPublicUpload && !isPublicAsset) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const stats = await fs.stat(filePath);
    const etag = `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
    
    // Check conditional ETag for 304 Not Modified
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, {
        "ETag": etag,
        "Cache-Control": (isPublicUpload || isPublicAsset) ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate"
      });
      response.end();
      return;
    }

    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    
    const headers = {
      "Content-Type": contentType,
      "ETag": etag,
      "Cache-Control": (isPublicUpload || isPublicAsset)
        ? "public, max-age=31536000, immutable"
        : "no-cache, must-revalidate"
    };

    response.writeHead(200, headers);
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function start() {
  await ensureStorage();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(request, response, url);
        if (!handled) sendJson(response, 404, { error: "API route not found." });
        return;
      }
      await serveStatic(request, response, url.pathname);
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Server error." });
    }
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Exam Alert India is running at http://127.0.0.1:${PORT}`);
    if (!ADMIN_PASSWORD) console.log("Set ADMIN_PASSWORD before enabling admin uploads.");
  });
}

start();
