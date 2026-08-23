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
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const environment = globalThis.process?.env || {};
const previewConfig = globalThis.__EXAM_ALERT_CONFIG || {};
const PORT = Number(previewConfig.port || environment.PORT || 4173);
const ADMIN_PASSWORD = previewConfig.adminPassword || environment.ADMIN_PASSWORD || "admin123";
const sessions = new Map();

const DEFAULT_PROFILE = {
  name: "Stephanraj",
  email: "admin@examalertindia.com",
  phone: "+91 98765 43210",
  role: "Master Admin & Platform Creator",
  instagram: "smart_ai_notes",
  bio: "Every student preparing for competitive examinations deserves access to clean, high-retention study resources without financial barriers. Free AI Govt Exam Notes was founded on the philosophy that visual synthesis, structured mind maps, and concept clarity can transform preparation outcomes. Our commitment is to keep this knowledge base 100% free, updated, and accessible to every aspirant in India.",
  avatarUrl: "assets/admin.jpg",
  logoUrl: "assets/ailogo.png",
  instagramQrUrl: "assets/instagram_qr.svg?v=3.1",
  updatedAt: new Date().toISOString()
};

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
  await createJsonIfMissing(PROFILE_FILE, DEFAULT_PROFILE);
  await createJsonIfMissing(SESSIONS_FILE, {});

  try {
    const savedSessions = await readJson(SESSIONS_FILE);
    if (Array.isArray(savedSessions)) {
      for (const t of savedSessions) {
        if (typeof t === "string" && t.length >= 16) sessions.set(t, true);
      }
    } else if (savedSessions && typeof savedSessions === "object") {
      for (const t of Object.keys(savedSessions)) {
        if (typeof t === "string" && t.length >= 16) sessions.set(t, true);
      }
    }
  } catch {}
}

async function persistSessions() {
  const arr = [...sessions.keys()];
  await writeJson(SESSIONS_FILE, arr).catch(() => {});
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

const ADMIN_COOKIE_MAX_AGE = 315360000; // 10 years (Permanent Admin Session)

function getAdminSession(request) {
  const token = parseCookies(request).examAdminSession;
  if (!token || typeof token !== "string" || token.length < 16) {
    return null;
  }
  if (sessions.has(token)) {
    return { token, permanent: true };
  }
  return null;
}

function isAdmin(request) {
  return getAdminSession(request) !== null;
}

function safePasswordMatch(value) {
  const suppliedStr = String(value || "").trim();
  if (!suppliedStr) return false;
  const targetPassword = String(ADMIN_PASSWORD || "admin123").trim();
  const supplied = Buffer.from(suppliedStr);
  const expected = Buffer.from(targetPassword);
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
  sendJson(response, 401, { error: "Admin login session expired or required for this action." });
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
    const session = getAdminSession(request);
    sendJson(response, 200, {
      admin: session !== null,
      permanent: true
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/profile") {
    let profile = await readJson(PROFILE_FILE).catch(() => DEFAULT_PROFILE);
    if (!profile || !profile.name) {
      profile = { ...DEFAULT_PROFILE };
    }
    sendJson(response, 200, { profile });
    return true;
  }

  if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/api/admin/profile") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request).catch(() => ({}));
    
    // Strict Admin Password Confirmation Required to Edit Profile & Branding
    const enteredPassword = String(body.password || "").trim();
    if (!safePasswordMatch(enteredPassword)) {
      sendJson(response, 403, { error: "Incorrect admin password. Profile and branding changes were rejected." });
      return true;
    }

    let profile = await readJson(PROFILE_FILE).catch(() => ({ ...DEFAULT_PROFILE }));
    if (!profile) profile = { ...DEFAULT_PROFILE };

    if (body.name) profile.name = String(body.name).trim().slice(0, 60);
    
    // Validate Email ID format
    if (body.email !== undefined) {
      const emailVal = String(body.email).trim();
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailVal || !emailRegex.test(emailVal)) {
        sendJson(response, 400, { error: "Please enter a valid email address (e.g. name@example.com)." });
        return true;
      }
      profile.email = emailVal.slice(0, 100);
    }

    // Validate 10-digit Mobile Number format
    if (body.phone !== undefined) {
      const phoneVal = String(body.phone).trim();
      const digitsOnly = phoneVal.replace(/\D/g, "");
      const isTenDigits = digitsOnly.length === 10 || (digitsOnly.length === 12 && digitsOnly.startsWith("91")) || (digitsOnly.length === 11 && digitsOnly.startsWith("0"));
      if (!phoneVal || !isTenDigits) {
        sendJson(response, 400, { error: "Mobile number must be a valid 10-digit number." });
        return true;
      }
      const core10 = digitsOnly.slice(-10);
      profile.phone = `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
    }

    if (body.role) profile.role = String(body.role).trim().slice(0, 80);
    if (body.instagram !== undefined) profile.instagram = String(body.instagram).trim().replace(/^@/, "").slice(0, 50);
    if (body.bio !== undefined) profile.bio = String(body.bio).trim().slice(0, 800);

    if (body.avatarData) {
      const rawImage = String(body.avatarData).trim();
      const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (imageMatch) {
        const rawType = imageMatch[1].toLowerCase();
        const ext = rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : "jpg";
        const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");
        if (imageBuffer.length >= 4 && imageBuffer.length <= 12 * 1024 * 1024) {
          const fileName = `admin_avatar_${Date.now()}.${ext}`;
          try {
            const files = await fs.readdir(UPLOAD_DIR);
            for (const f of files) {
              if (f.startsWith("admin_avatar_")) {
                await fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {});
              }
            }
          } catch {}
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), imageBuffer);
          profile.avatarUrl = `/uploads/${fileName}?t=${Date.now()}`;
        }
      }
    }

    if (body.logoData) {
      const rawImage = String(body.logoData).trim();
      const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (imageMatch) {
        const rawType = imageMatch[1].toLowerCase();
        const ext = rawType.includes("svg") ? "svg" : rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : "png";
        const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");
        if (imageBuffer.length >= 4 && imageBuffer.length <= 12 * 1024 * 1024) {
          const fileName = `site_logo_${Date.now()}.${ext}`;
          try {
            const files = await fs.readdir(UPLOAD_DIR);
            for (const f of files) {
              if (f.startsWith("site_logo_")) {
                await fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {});
              }
            }
          } catch {}
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), imageBuffer);
          profile.logoUrl = `/uploads/${fileName}?t=${Date.now()}`;
        }
      }
    }

    if (body.instagramQrData) {
      const rawImage = String(body.instagramQrData).trim();
      const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (imageMatch) {
        const rawType = imageMatch[1].toLowerCase();
        const ext = rawType.includes("svg") ? "svg" : rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : "jpg";
        const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");
        if (imageBuffer.length >= 4 && imageBuffer.length <= 12 * 1024 * 1024) {
          const fileName = `instagram_qr_${Date.now()}.${ext}`;
          try {
            const files = await fs.readdir(UPLOAD_DIR);
            for (const f of files) {
              if (f.startsWith("instagram_qr_")) {
                await fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {});
              }
            }
          } catch {}
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), imageBuffer);
          profile.instagramQrUrl = `/uploads/${fileName}?t=${Date.now()}`;
        }
      }
    }

    profile.updatedAt = new Date().toISOString();
    await writeJson(PROFILE_FILE, profile);
    sendJson(response, 200, { success: true, profile });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(request).catch(() => ({}));
    const enteredPassword = String(body.password || "").trim();
    if (!safePasswordMatch(enteredPassword)) {
      sendJson(response, 401, { error: "The admin password is incorrect." });
      return true;
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, true);
    await persistSessions();
    sendJson(
      response,
      200,
      { admin: true, permanent: true },
      { "Set-Cookie": `examAdminSession=${token}; HttpOnly; Path=/; Max-Age=${ADMIN_COOKIE_MAX_AGE}; SameSite=Lax` }
    );
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = parseCookies(request).examAdminSession;
    if (token) {
      sessions.delete(token);
      await persistSessions();
    }
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

  if (request.method === "POST" && url.pathname === "/api/admin/notes/delete") {
    const body = await readBody(request).catch(() => ({}));
    const enteredPassword = String(body.password || "").trim();
    const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);

    const isPasswordValid = safePasswordMatch(enteredPassword);
    if (!isPasswordValid) {
      sendJson(response, 403, { error: "Incorrect admin password. Deletion was rejected." });
      return true;
    }

    if (ids.length === 0) {
      sendJson(response, 400, { error: "No note IDs specified for deletion." });
      return true;
    }

    // Refresh admin session cookie
    const token = parseCookies(request).examAdminSession || crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now());

    const idsSet = new Set(ids);
    const notes = await readJson(NOTES_FILE);
    const remainingNotes = [];

    for (const note of notes) {
      if (idsSet.has(note.id)) {
        if (note.imageUrl) {
          await fs.unlink(path.join(ROOT, note.imageUrl)).catch(() => undefined);
        }
      } else {
        remainingNotes.push(note);
      }
    }

    await writeJson(NOTES_FILE, remainingNotes);
    sendJson(response, 200, { deleted: true, count: ids.length }, {
      "Set-Cookie": `examAdminSession=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
    });
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/notes/")) {
    const enteredPassword = String(request.headers["x-admin-password"] || "").trim();
    const isPasswordValid = safePasswordMatch(enteredPassword) || isAdmin(request);

    if (!isPasswordValid) {
      sendJson(response, 403, { error: "Incorrect admin password. Deletion was rejected." });
      return true;
    }

    const id = url.pathname.split("/").pop();
    const notes = await readJson(NOTES_FILE);
    const note = notes.find((item) => item.id === id);
    if (!note) {
      sendJson(response, 404, { error: "Note not found." });
      return true;
    }
    if (note.imageUrl) {
      await fs.unlink(path.join(ROOT, note.imageUrl)).catch(() => undefined);
    }
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

  // ==========================================
  // 1-Click Full Website Data Backup & Restore
  // ==========================================
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/admin/backup/export") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const notes = await readJson(NOTES_FILE).catch(() => []);
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    const interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    let profile = await readJson(PROFILE_FILE).catch(() => ({ ...DEFAULT_PROFILE }));
    if (!profile) profile = { ...DEFAULT_PROFILE };

    // Read all uploaded images into a base64 dictionary for complete portable backup
    const images = {};
    try {
      const files = await fs.readdir(UPLOAD_DIR);
      for (const file of files) {
        if (/\.(jpe?g|png|webp|svg)$/i.test(file)) {
          const filePath = path.join(UPLOAD_DIR, file);
          const buf = await fs.readFile(filePath);
          const ext = path.extname(file).toLowerCase();
          const mime = mimeTypes[ext] || (ext === ".svg" ? "image/svg+xml" : "image/jpeg");
          const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
          images[file] = dataUrl;
          images[`/uploads/${file}`] = dataUrl;
        }
      }
    } catch {}

    // Embed image data directly into notes array for bulletproof portability
    const exportedNotes = notes.map(n => {
      const noteCopy = { ...n };
      if (noteCopy.imageUrl) {
        const cleanName = path.basename(noteCopy.imageUrl.split("?")[0]);
        if (images[cleanName]) {
          noteCopy.imageData = images[cleanName];
        }
      }
      return noteCopy;
    });

    // Helper to convert any asset or upload path to Base64 Data URL
    async function getAssetDataUrl(urlOrPath) {
      if (!urlOrPath || typeof urlOrPath !== "string") return null;
      if (urlOrPath.startsWith("data:image/")) return urlOrPath;
      try {
        const cleanRel = urlOrPath.split("?")[0].replace(/^\/+/, "");
        const absPath = path.join(ROOT, cleanRel);
        const buf = await fs.readFile(absPath);
        const ext = path.extname(cleanRel).toLowerCase();
        const mime = mimeTypes[ext] || (ext === ".svg" ? "image/svg+xml" : "image/jpeg");
        return `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        return null;
      }
    }

    // Explicitly bundle Profile Picture (Avatar), Website Brand Logo, and Instagram QR Code
    const avatarData = await getAssetDataUrl(profile.avatarUrl || "assets/admin.jpg");
    const logoData = await getAssetDataUrl(profile.logoUrl || "assets/ailogo.png");
    const instagramQrData = await getAssetDataUrl(profile.instagramQrUrl || "assets/instagram_qr.svg");

    const profileAssets = {
      avatarData,
      logoData,
      instagramQrData
    };

    const backupPayload = {
      version: "3.0",
      type: "ExamAlertIndiaMasterBackup",
      exportedAt: new Date().toISOString(),
      system: {
        platform: "Exam Alert India",
        generator: "Admin Studio Unified Backup Engine v3.0",
        notesCount: exportedNotes.length
      },
      notes: exportedNotes,
      profile: {
        ...profile,
        avatarData,
        logoData,
        instagramQrData
      },
      profileAssets,
      interactions,
      visits,
      images
    };

    sendJson(response, 200, { success: true, backup: backupPayload });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/backup/restore") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const body = await readBody(request, 100 * 1024 * 1024).catch(() => ({}));
    const backup = body.backup || body;

    if (!backup || typeof backup !== "object") {
      sendJson(response, 400, { error: "Invalid backup file format." });
      return true;
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // 1. Restore all images from images dictionary into /uploads/
    const restoredImagesMap = {};
    if (backup.images && typeof backup.images === "object") {
      for (const [filename, dataUrl] of Object.entries(backup.images)) {
        if (!filename || !dataUrl || typeof dataUrl !== "string") continue;
        const cleanName = path.basename(filename.split("?")[0]);
        const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
        if (match) {
          try {
            const buf = Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64");
            await fs.writeFile(path.join(UPLOAD_DIR, cleanName), buf);
            restoredImagesMap[cleanName] = `/uploads/${cleanName}`;
            restoredImagesMap[`/uploads/${cleanName}`] = `/uploads/${cleanName}`;
          } catch {}
        }
      }
    }

    // 2. Process and restore notes, extracting any embedded imageData
    if (Array.isArray(backup.notes)) {
      const finalNotes = [];
      for (const note of backup.notes) {
        const cleanNote = { ...note };
        const rawData = cleanNote.imageData || cleanNote.image || "";
        
        if (typeof rawData === "string" && rawData.startsWith("data:image/")) {
          const match = rawData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
          if (match) {
            const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
            const filename = `${cleanNote.id || crypto.randomUUID()}.${ext}`;
            try {
              const buf = Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64");
              await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
              cleanNote.imageUrl = `/uploads/${filename}`;
            } catch {}
          }
        } else if (cleanNote.imageUrl) {
          const cleanName = path.basename(cleanNote.imageUrl.split("?")[0]);
          const dataUrl = (backup.images && (backup.images[cleanName] || backup.images[cleanNote.imageUrl])) || restoredImagesMap[cleanName];
          if (dataUrl && typeof dataUrl === "string") {
            const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
            if (match) {
              try {
                const buf = Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64");
                await fs.writeFile(path.join(UPLOAD_DIR, cleanName), buf);
                cleanNote.imageUrl = `/uploads/${cleanName}`;
              } catch {}
            }
          }
        }
        delete cleanNote.imageData; // Keep notes.json clean & lightweight
        finalNotes.push(cleanNote);
      }
      await writeJson(NOTES_FILE, finalNotes);
    }

    if (backup.visits && typeof backup.visits === "object") {
      await writeJson(VISITS_FILE, backup.visits);
    }
    if (backup.interactions && typeof backup.interactions === "object") {
      await writeJson(INTERACTIONS_FILE, backup.interactions);
    }

    let profile = backup.profile && typeof backup.profile === "object" ? { ...backup.profile } : null;
    if (!profile) profile = await readJson(PROFILE_FILE).catch(() => ({ ...DEFAULT_PROFILE }));

    // Restore Profile Assets (Avatar, Logo, QR) if bundled in profileAssets or profile
    const assetsSource = backup.profileAssets || backup.profile || {};
    if (assetsSource.avatarData) {
      const match = String(assetsSource.avatarData).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (match) {
        const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
        const fileName = `admin_avatar_${Date.now()}.${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64"));
        profile.avatarUrl = `/uploads/${fileName}?t=${Date.now()}`;
      }
    }
    if (assetsSource.logoData) {
      const match = String(assetsSource.logoData).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (match) {
        const ext = match[1].includes("svg") ? "svg" : match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "png";
        const fileName = `site_logo_${Date.now()}.${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64"));
        profile.logoUrl = `/uploads/${fileName}?t=${Date.now()}`;
      }
    }
    if (assetsSource.instagramQrData) {
      const match = String(assetsSource.instagramQrData).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (match) {
        const ext = match[1].includes("svg") ? "svg" : match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
        const fileName = `instagram_qr_${Date.now()}.${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64"));
        profile.instagramQrUrl = `/uploads/${fileName}?t=${Date.now()}`;
      }
    }

    if (profile) {
      delete profile.avatarData;
      delete profile.logoData;
      delete profile.instagramQrData;
      profile.updatedAt = new Date().toISOString();
      await writeJson(PROFILE_FILE, profile);
    }

    sendJson(response, 200, {
      success: true,
      message: `Restored ${(backup.notes || []).length} notes, administrator avatar, site logo, and Instagram QR barcode successfully.`,
      notesCount: (backup.notes || []).length,
      profile
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reset-data") {
    const body = await readBody(request).catch(() => ({}));
    const enteredPassword = String(body.password || "").trim();

    const isPasswordValid = safePasswordMatch(enteredPassword);
    if (!isPasswordValid) {
      sendJson(response, 403, { error: "Incorrect admin password. Data wipe was rejected." });
      return true;
    }

    const token = parseCookies(request).examAdminSession || crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now());

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

    // Clean up uploaded images
    try {
      const files = await fs.readdir(UPLOAD_DIR);
      for (const file of files) {
        await fs.unlink(path.join(UPLOAD_DIR, file)).catch(() => {});
      }
    } catch {}

    sendJson(response, 200, { reset: true, message: "All server notes, visits, interactions and uploads cleared." }, {
      "Set-Cookie": `examAdminSession=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
    });
    return true;
  }

  return false;
}

async function serveStatic(request, response, pathname) {
  if (pathname === "/favicon.ico") {
    pathname = "/assets/ailogo.png";
  }

  const allowedPublicFiles = new Set([
    "/",
    "/index.html",
    "/about.html",
    "/admin.html",
    "/styles.css",
    "/app.js",
    "/admin.js",
    "/favicon.ico",
    "/favicon.png",
    "/assets/ailogo.png",
    "/assets/admin.jpg"
  ]);
  const isPublicUpload = pathname.startsWith("/uploads/") && /\.(jpe?g|png|webp|svg)$/i.test(pathname);
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
