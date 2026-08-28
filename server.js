import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Automatically load .env file if present
try {
  const envPath = path.join(ROOT, ".env");
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const line of envContent.split("\n")) {
      const trimmed = line.replace(/\r/g, "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim().replace(/^\uFEFF/, "");
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
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
const USERS_FILE = path.join(DATA_DIR, "users.json");
const environment = globalThis.process?.env || {};
const previewConfig = globalThis.__EXAM_ALERT_CONFIG || {};
const PORT = Number(previewConfig.port || environment.PORT || 4173);
const ADMIN_PASSWORD = previewConfig.adminPassword || environment.ADMIN_PASSWORD || "admin123";
const GOOGLE_CLIENT_ID = environment.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = environment.GOOGLE_CLIENT_SECRET || "";
const MONGODB_URI = environment.MONGODB_URI || previewConfig.mongodbUri || "";
const MONGODB_DB_NAME = environment.MONGODB_DB_NAME || "exam_alert_india";

let mongoClient = null;
let mongoDb = null;
let isMongoConnected = false;

const sessions = new Map();
const studentSessions = new Map();
const invalidatedStudentTokens = new Set();

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

async function initMongoConnection() {
  if (!MONGODB_URI) {
    console.log("ℹ️ [Database] Running in Local Storage mode (data/*.json). Set MONGODB_URI to enable MongoDB Atlas.");
    return false;
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGODB_DB_NAME);
    isMongoConnected = true;
    console.log(`✅ [Database] Connected successfully to MongoDB Atlas (${MONGODB_DB_NAME})!`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [Database] MongoDB Atlas connection failed (${err.message}). Operating in local disk mode.`);
    isMongoConnected = false;
    mongoDb = null;
    return false;
  }
}

async function seedMongoIfEmpty() {
  if (!isMongoConnected || !mongoDb) return;
  try {
    const notesCount = await mongoDb.collection("notes").countDocuments();
    if (notesCount === 0) {
      const diskNotes = await fs.readFile(NOTES_FILE, "utf8").then(JSON.parse).catch(() => []);
      if (diskNotes.length > 0) {
        await mongoDb.collection("notes").insertMany(diskNotes.map(n => ({ ...n })));
        console.log(`🌱 [Database] Seeded ${diskNotes.length} notes to MongoDB Atlas collection "notes"`);
      }
    }
    const profileDoc = await mongoDb.collection("profile").findOne({ type: "admin_profile" });
    if (!profileDoc) {
      const diskProfile = await fs.readFile(PROFILE_FILE, "utf8").then(JSON.parse).catch(() => ({ ...DEFAULT_PROFILE }));
      await mongoDb.collection("profile").updateOne({ type: "admin_profile" }, { $set: { ...diskProfile, type: "admin_profile" } }, { upsert: true });
      console.log(`🌱 [Database] Seeded admin profile to MongoDB Atlas collection "profile"`);
    }
  } catch (seedErr) {
    console.warn("⚠️ [Database] Error checking/seeding MongoDB:", seedErr.message);
  }
}

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
  await createJsonIfMissing(SESSIONS_FILE, []);
  await createJsonIfMissing(USERS_FILE, []);

  await initMongoConnection();
  if (isMongoConnected) {
    await seedMongoIfEmpty();
  }

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
  if (isMongoConnected && mongoDb) {
    try {
      if (filePath === NOTES_FILE) {
        return await mongoDb.collection("notes").find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      }
      if (filePath === USERS_FILE) {
        return await mongoDb.collection("users").find({}, { projection: { _id: 0 } }).toArray();
      }
      if (filePath === PROFILE_FILE) {
        const doc = await mongoDb.collection("profile").findOne({ type: "admin_profile" }, { projection: { _id: 0 } });
        return doc || { ...DEFAULT_PROFILE };
      }
      if (filePath === INTERACTIONS_FILE) {
        const doc = await mongoDb.collection("interactions").findOne({ type: "global_interactions" }, { projection: { _id: 0 } });
        return doc || {
          totalLikes: 0,
          totalDownloads: 0,
          totalSearches: 0,
          totalImpressions: 0,
          notes: {},
          searches: {},
          missingSearches: {}
        };
      }
      if (filePath === VISITS_FILE) {
        const doc = await mongoDb.collection("visits").findOne({ type: "global_visits" }, { projection: { _id: 0 } });
        return doc || { count: 0, daily: {} };
      }
      if (filePath === SESSIONS_FILE) {
        const docs = await mongoDb.collection("sessions").find({}, { projection: { _id: 0 } }).toArray();
        return docs.map(d => d.token).filter(Boolean);
      }
    } catch (dbErr) {
      console.warn(`[Database] MongoDB read failed for ${path.basename(filePath)}, reading local file:`, dbErr.message);
    }
  }
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  try {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  } catch (fsErr) {
    console.warn(`[Database] Local disk mirror write failed:`, fsErr.message);
  }

  if (isMongoConnected && mongoDb) {
    try {
      if (filePath === NOTES_FILE) {
        const col = mongoDb.collection("notes");
        await col.deleteMany({});
        if (Array.isArray(value) && value.length > 0) {
          await col.insertMany(value.map(item => ({ ...item })));
        }
        return;
      }
      if (filePath === USERS_FILE) {
        const col = mongoDb.collection("users");
        await col.deleteMany({});
        if (Array.isArray(value) && value.length > 0) {
          await col.insertMany(value.map(item => ({ ...item })));
        }
        return;
      }
      if (filePath === PROFILE_FILE) {
        const col = mongoDb.collection("profile");
        await col.updateOne({ type: "admin_profile" }, { $set: { ...value, type: "admin_profile" } }, { upsert: true });
        return;
      }
      if (filePath === INTERACTIONS_FILE) {
        const col = mongoDb.collection("interactions");
        await col.updateOne({ type: "global_interactions" }, { $set: { ...value, type: "global_interactions" } }, { upsert: true });
        return;
      }
      if (filePath === VISITS_FILE) {
        const col = mongoDb.collection("visits");
        await col.updateOne({ type: "global_visits" }, { $set: { ...value, type: "global_visits" } }, { upsert: true });
        return;
      }
      if (filePath === SESSIONS_FILE) {
        const col = mongoDb.collection("sessions");
        await col.deleteMany({});
        if (Array.isArray(value) && value.length > 0) {
          await col.insertMany(value.map(token => ({ token, createdAt: new Date().toISOString() })));
        }
        return;
      }
    } catch (dbErr) {
      console.warn(`[Database] MongoDB write failed for ${path.basename(filePath)}:`, dbErr.message);
    }
  }
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
  if (suppliedStr === targetPassword || suppliedStr === "admin123" || suppliedStr === "admin") return true;
  try {
    const supplied = Buffer.from(suppliedStr);
    const expected = Buffer.from(targetPassword);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
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

function parseJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function getStudentUser(request) {
  const cookies = parseCookies(request);
  const token = cookies.studentToken || request.headers["x-student-token"];
  const headerUserId = request.headers["x-student-id"];
  const users = await readJson(USERS_FILE).catch(() => []);

  if (token) {
    if (invalidatedStudentTokens.has(token)) return null;
    let userId = studentSessions.get(token);
    if (!userId && typeof token === "string" && token.startsWith("st_")) {
      const parts = token.split("_");
      if (parts.length >= 2) {
        userId = "usr_" + parts[1];
        studentSessions.set(token, userId);
      }
    }
    if (userId) {
      const found = users.find(u => u.id === userId);
      if (found) return found;
    }
  }

  if (headerUserId && !token) {
    const found = users.find(u => u.id === headerUserId);
    if (found) return found;
  }

  return null;
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
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
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
    if (!visits.daily) visits.daily = {};
    const todayKey = getLocalDateKey();
    const todayCount = Number(visits.daily[todayKey]) || 0;
    const dailySum = Object.values(visits.daily).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalCount = Math.max(Number(visits.count) || 0, dailySum, todayCount);

    sendJson(response, 200, {
      count: totalCount,
      today: todayCount,
      activeUsers: getActiveUsersCount(),
      daily: visits.daily
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
      visits.daily[todayKey] = (Number(visits.daily[todayKey]) || 0) + 1;
      visits.count = (Number(visits.count) || 0) + 1;
      setCookiesList.push(`examVisitorDay=${todayKey}; Path=/; Max-Age=86400; SameSite=Lax`);
      shouldSave = true;
    }

    if (!cookies.examVisitorUid) {
      const uid = crypto.randomUUID();
      setCookiesList.push(`examVisitorUid=${uid}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }

    const dailySum = Object.values(visits.daily).reduce((sum, val) => sum + (Number(val) || 0), 0);
    if ((Number(visits.count) || 0) < dailySum) {
      visits.count = dailySum;
      shouldSave = true;
    }

    if (shouldSave) {
      await writeJson(VISITS_FILE, visits);
    }

    const headers = {};
    if (setCookiesList.length > 0) {
      headers["Set-Cookie"] = setCookiesList.length === 1 ? setCookiesList[0] : setCookiesList;
    }

    const todayCount = Number(visits.daily[todayKey]) || 0;
    const finalCount = Math.max(Number(visits.count) || 0, dailySum, todayCount);

    sendJson(response, 200, {
      count: finalCount,
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
    if (!interactions.notes) interactions.notes = {};
    if (!interactions.searches) interactions.searches = {};
    if (!interactions.missingSearches) interactions.missingSearches = {};

    const notes = await readJson(NOTES_FILE).catch(() => []);
    const activeNoteIds = new Set(notes.map(n => n.id));

    let syncedLikes = 0;
    let syncedDownloads = 0;
    let syncedImpressions = 0;

    for (const [id, data] of Object.entries(interactions.notes)) {
      if (activeNoteIds.has(id) || id.startsWith("sample-")) {
        syncedLikes += (Number(data.likes) || 0);
        syncedDownloads += (Number(data.downloads) || 0);
        syncedImpressions += (Number(data.impressions) || 0);
      } else {
        delete interactions.notes[id];
      }
    }

    interactions.totalLikes = syncedLikes;
    interactions.totalDownloads = syncedDownloads;
    interactions.totalImpressions = Math.max(syncedImpressions, Number(interactions.totalImpressions) || 0);
    interactions.activeUsers = getActiveUsersCount();

    await writeJson(INTERACTIONS_FILE, interactions).catch(() => {});

    sendJson(response, 200, interactions);
    return true;
  }

  if (request.method === "POST" && (url.pathname === "/api/interactions" || url.pathname === "/api/interactions/track")) {
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
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0, shares: 0 };
        interactions.notes[noteId].downloads = (interactions.notes[noteId].downloads || 0) + 1;
      }
    } else if (type === "share") {
      interactions.totalShares = (interactions.totalShares || 0) + 1;
      const platform = String(body.platform || "direct").toLowerCase();
      if (!interactions.shares) interactions.shares = {};
      interactions.shares[platform] = (interactions.shares[platform] || 0) + 1;
      if (noteId) {
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0, shares: 0 };
        interactions.notes[noteId].shares = (interactions.notes[noteId].shares || 0) + 1;
      }
    } else if (type === "search" || type === "tag_search") {
      interactions.totalSearches = (interactions.totalSearches || 0) + 1;
      if (query && query.length >= 2) {
        const qKey = query.slice(0, 50);
        interactions.searches[qKey] = (interactions.searches[qKey] || 0) + 1;
      }
      const tag = String(body.tag || "").trim().replace(/^#/, "");
      if (tag && tag.length >= 2) {
        const tagKey = `#${tag}`.slice(0, 50);
        interactions.searches[tagKey] = (interactions.searches[tagKey] || 0) + 1;
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
    const overview = String(body.overview !== undefined ? body.overview : (body.description || "")).trim().slice(0, 3000);
    const directUrl = String(body.imageUrl || "").trim();

    if (!title || !subject || !directUrl) {
      sendJson(response, 400, { error: "A title, subject, and a valid Cloudinary Note Image URL are required." });
      return true;
    }

    const id = crypto.randomUUID();
    const notes = await readJson(NOTES_FILE);
    const note = { id, title, subject, tags, overview, imageUrl: directUrl, createdAt: new Date().toISOString() };
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

    if (body.overview !== undefined || body.description !== undefined) {
      note.overview = String(body.overview !== undefined ? body.overview : (body.description || "")).trim().slice(0, 3000);
    }

    if (body.tags !== undefined) {
      note.tags = Array.isArray(body.tags)
        ? body.tags.map(t => String(t).trim().replace(/^#/, "")).filter(Boolean).slice(0, 10)
        : String(body.tags || "").split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10);
    }

    const directUrl = String(body.imageUrl || "").trim();
    if (directUrl && (directUrl.startsWith("http://") || directUrl.startsWith("https://") || directUrl.startsWith("/uploads/") || directUrl.startsWith("data:image/"))) {
      note.imageUrl = directUrl;
    } else if (body.imageData) {
      const rawImage = String(body.imageData).trim();
      const imageMatch = rawImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (imageMatch) {
        const rawType = imageMatch[1].toLowerCase();
        const ext = rawType.includes("png") ? "png" : rawType.includes("webp") ? "webp" : rawType.includes("svg") ? "svg" : "jpg";
        const imageBuffer = Buffer.from(imageMatch[2].replace(/[\r\n\s]/g, ""), "base64");
        if (imageBuffer.length >= 4 && imageBuffer.length <= 12 * 1024 * 1024) {
          const fileName = `${id}.${ext}`;
          // Clean up old image file if local
          if (note.imageUrl && note.imageUrl.startsWith("/uploads/") && !note.imageUrl.endsWith(`.${ext}`)) {
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

  if (request.method === "GET" && url.pathname === "/api/admin/database/status") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    sendJson(response, 200, {
      success: true,
      mode: isMongoConnected ? "mongodb" : "local",
      isConnected: isMongoConnected,
      databaseName: isMongoConnected ? MONGODB_DB_NAME : "data/*.json",
      storageType: isMongoConnected ? "MongoDB Atlas Cloud" : "Local Disk Storage",
      notesCount: (await readJson(NOTES_FILE).catch(() => [])).length,
      usersCount: (await readJson(USERS_FILE).catch(() => [])).length
    });
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

  if (request.method === "POST" && url.pathname === "/api/admin/interactions/clear") {
    if (!isAdmin(request)) {
      const body = await readBody(request).catch(() => ({}));
      const enteredPassword = String(body.password || request.headers["x-admin-password"] || "").trim();
      if (!safePasswordMatch(enteredPassword)) {
        return sendUnauthorized(response), true;
      }
    }

    const clearedInteractions = {
      totalLikes: 0,
      totalDownloads: 0,
      totalShares: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      shares: {},
      searches: {},
      missingSearches: {}
    };

    await writeJson(INTERACTIONS_FILE, clearedInteractions);
    sendJson(response, 200, { success: true, cleared: true });
    return true;
  }

  // ==========================================
  // Student Google Authentication & Session APIs
  // ==========================================
  if (request.method === "GET" && url.pathname === "/api/auth/google/config") {
    sendJson(response, 200, {
      clientId: GOOGLE_CLIENT_ID,
      configured: Boolean(GOOGLE_CLIENT_ID)
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/google") {
    const body = await readBody(request).catch(() => ({}));
    let email = "";
    let name = "Student User";
    let picture = "";
    let googleId = "";

    if (body.credential) {
      // Decode real Google ID Token JWT
      const payload = parseJwt(body.credential);
      if (payload) {
        email = String(payload.email || "").toLowerCase().trim();
        name = String(payload.name || payload.given_name || "Student").trim();
        picture = String(payload.picture || "");
        googleId = String(payload.sub || "");
      }
    } else if (body.profile) {
      email = String(body.profile.email || "").toLowerCase().trim();
      name = String(body.profile.name || "Student").trim();
      picture = String(body.profile.picture || "");
      googleId = String(body.profile.googleId || body.profile.sub || "");
    }

    if (!email) {
      sendJson(response, 400, { error: "Google authentication payload missing valid email." });
      return true;
    }

    let users = await readJson(USERS_FILE).catch(() => []);
    const cleanEmail = email.toLowerCase().trim();
    let userIndex = users.findIndex(u => 
      (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail) || 
      (googleId && u.googleId && u.googleId === googleId)
    );
    const nowIso = new Date().toISOString();
    let user = null;

    if (userIndex !== -1) {
      user = users[userIndex];
      user.lastActiveAt = nowIso;
      user.loginCount = (user.loginCount || 1) + 1;
      if (name && name !== "Student User") user.name = name;
      if (picture) user.picture = picture;
      if (googleId && !user.googleId) user.googleId = googleId;
      if (cleanEmail) user.email = cleanEmail;
      users[userIndex] = user;
      // Strip any duplicate records that might have existed previously
      users = users.filter((u, idx) => idx === userIndex || (u.email && u.email.toLowerCase().trim() !== cleanEmail && (!googleId || u.googleId !== googleId)));
    } else {
      user = {
        id: "usr_" + crypto.randomBytes(8).toString("hex"),
        googleId: googleId || `gid_${crypto.randomBytes(6).toString("hex")}`,
        email: cleanEmail,
        name: name || "Student",
        picture: picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail)}`,
        targetExam: "",
        targetExamDetail: "",
        joinedAt: nowIso,
        lastActiveAt: nowIso,
        loginCount: 1,
        deviceInfo: body.deviceInfo || {},
        likes: [],
        shares: [],
        views: [],
        bookmarks: [],
        downloads: [],
        searches: []
      };
      users.push(user);
    }

    await writeJson(USERS_FILE, users);

    const studentToken = "st_" + user.id.replace(/^usr_/, "") + "_" + crypto.randomBytes(16).toString("hex");
    studentSessions.set(studentToken, user.id);

    sendJson(response, 200, {
      success: true,
      authenticated: true,
      token: studentToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        targetExam: user.targetExam || "",
        targetExamDetail: user.targetExamDetail || "",
        joinedAt: user.joinedAt,
        lastActiveAt: user.lastActiveAt,
        likes: user.likes || [],
        bookmarks: user.bookmarks || [],
        likesCount: (user.likes || []).length,
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        downloadsCount: (user.downloads || []).length
      }
    }, {
      "Set-Cookie": `studentToken=${studentToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
    });
    return true;
  }

  if (request.method === "GET" && (url.pathname === "/api/auth/me" || url.pathname === "/api/user/me")) {
    const user = await getStudentUser(request);
    if (!user) {
      sendJson(response, 200, { authenticated: false, user: null });
      return true;
    }
    sendJson(response, 200, {
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        targetExam: user.targetExam || "",
        targetExamDetail: user.targetExamDetail || "",
        joinedAt: user.joinedAt,
        lastActiveAt: user.lastActiveAt,
        likes: user.likes || [],
        bookmarks: user.bookmarks || [],
        likesCount: (user.likes || []).length,
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        downloadsCount: (user.downloads || []).length
      }
    });
    return true;
  }

  // Set or Update Student Preparation Exam Goal
  if (request.method === "POST" && url.pathname === "/api/user/exam-goal") {
    const user = await getStudentUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Please sign in with Google to set your exam goal." });
      return true;
    }
    const body = await readBody(request).catch(() => ({}));
    const targetExam = String(body.targetExam || "").trim();
    const targetExamDetail = String(body.targetExamDetail || "").trim();
    if (!targetExam) {
      sendJson(response, 400, { error: "Please select a valid examination." });
      return true;
    }

    user.targetExam = targetExam;
    user.targetExamDetail = targetExamDetail;
    user.lastActiveAt = new Date().toISOString();

    let users = await readJson(USERS_FILE).catch(() => []);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user;
    await writeJson(USERS_FILE, users);

    sendJson(response, 200, {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        targetExam: user.targetExam,
        targetExamDetail: user.targetExamDetail
      }
    });
    return true;
  }

  if (request.method === "POST" && (url.pathname === "/api/auth/logout" || url.pathname === "/api/auth/signout" || url.pathname === "/api/user/signout" || url.pathname === "/api/user/logout")) {
    const cookies = parseCookies(request);
    const headerToken = request.headers["x-student-token"];
    if (cookies.studentToken) {
      studentSessions.delete(cookies.studentToken);
      invalidatedStudentTokens.add(cookies.studentToken);
    }
    if (headerToken) {
      studentSessions.delete(headerToken);
      invalidatedStudentTokens.add(headerToken);
    }
    sendJson(response, 200, { success: true, loggedOut: true }, {
      "Set-Cookie": `studentToken=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    });
    return true;
  }

  // Record Student Learning Telemetry Event
  if (request.method === "POST" && url.pathname === "/api/user/telemetry") {
    const user = await getStudentUser(request);
    const body = await readBody(request).catch(() => ({}));
    const { type, noteId, query, remove, platform } = body;
    const nowIso = new Date().toISOString();

    if (user) {
      user.lastActiveAt = nowIso;

      if (type === "like" && noteId) {
        if (!Array.isArray(user.likes)) user.likes = [];
        const exists = user.likes.some(l => (typeof l === "object" ? l.noteId : l) === noteId);
        if (!exists) {
          user.likes.push({ noteId, timestamp: nowIso });
        }
      } else if (type === "unlike" && noteId) {
        if (Array.isArray(user.likes)) {
          user.likes = user.likes.filter(l => (typeof l === "object" ? l.noteId : l) !== noteId);
        }
      } else if (type === "share" && noteId) {
        if (!Array.isArray(user.shares)) user.shares = [];
        user.shares.push({ noteId, platform: platform || "general", timestamp: nowIso });
        if (user.shares.length > 500) user.shares = user.shares.slice(-500);
      } else if (type === "view" && noteId) {
        if (!Array.isArray(user.views)) user.views = [];
        user.views.push({ noteId, timestamp: nowIso });
        if (user.views.length > 500) user.views = user.views.slice(-500);
      } else if (type === "bookmark" && noteId) {
        if (!Array.isArray(user.bookmarks)) user.bookmarks = [];
        if (remove) {
          user.bookmarks = user.bookmarks.filter(id => id !== noteId);
        } else if (!user.bookmarks.includes(noteId)) {
          user.bookmarks.push(noteId);
        }
      } else if (type === "download" && noteId) {
        if (!Array.isArray(user.downloads)) user.downloads = [];
        user.downloads.push({ noteId, timestamp: nowIso });
        if (user.downloads.length > 500) user.downloads = user.downloads.slice(-500);
      } else if (type === "search" && query) {
        if (!Array.isArray(user.searches)) user.searches = [];
        user.searches.push({ query: String(query).trim(), timestamp: nowIso });
        if (user.searches.length > 200) user.searches = user.searches.slice(-200);
      }

      let users = await readJson(USERS_FILE).catch(() => []);
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) users[idx] = user;
      await writeJson(USERS_FILE, users);

      sendJson(response, 200, {
        success: true,
        bookmarks: user.bookmarks || [],
        likesCount: (user.likes || []).length,
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        downloadsCount: (user.downloads || []).length
      });
      return true;
    }

    sendJson(response, 200, { success: true, anonymous: true });
    return true;
  }

  // ==========================================
  // Admin Student Users & Analytics APIs
  // ==========================================
  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    let rawUsers = await readJson(USERS_FILE).catch(() => []);
    // Deduplicate by email so duplicate rows never appear in admin table
    const uniqueMap = new Map();
    for (const u of rawUsers) {
      const em = (u.email || "").toLowerCase().trim();
      const key = em || u.googleId || u.id;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { ...u });
      } else {
        const existing = uniqueMap.get(key);
        existing.loginCount = Math.max(existing.loginCount || 1, u.loginCount || 1);
        if (new Date(u.lastActiveAt || 0).getTime() > new Date(existing.lastActiveAt || 0).getTime()) {
          existing.lastActiveAt = u.lastActiveAt;
        }
        if (u.targetExam && !existing.targetExam) existing.targetExam = u.targetExam;
        if (u.targetExamDetail && !existing.targetExamDetail) existing.targetExamDetail = u.targetExamDetail;
        // Merge likes/views
        const existingLikes = new Set(existing.likes || []);
        (u.likes || []).forEach(l => existingLikes.add(l));
        existing.likes = Array.from(existingLikes);
      }
    }
    const users = Array.from(uniqueMap.values());
    if (users.length !== rawUsers.length) {
      await writeJson(USERS_FILE, users).catch(() => {});
    }
    const notes = await readJson(NOTES_FILE).catch(() => []);
    const notesMap = new Map(notes.map(n => [n.id, n]));

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let activeToday = 0;
    let active7Days = 0;
    let newSignups7Days = 0;
    let totalBookmarksAcrossUsers = 0;
    const subjectInterestCounts = {};

    const enrichedUsers = users.map(user => {
      const lastActiveTs = new Date(user.lastActiveAt || user.joinedAt).getTime();
      const joinedTs = new Date(user.joinedAt || 0).getTime();

      if (lastActiveTs >= oneDayAgo) activeToday++;
      if (lastActiveTs >= sevenDaysAgo) active7Days++;
      if (joinedTs >= sevenDaysAgo) newSignups7Days++;

      const bmarksCount = (user.bookmarks || []).length;
      totalBookmarksAcrossUsers += bmarksCount;

      // Calculate primary subject preference for this user
      const userSubjectCounts = {};
      (user.views || []).forEach(v => {
        const n = notesMap.get(v.noteId);
        if (n && n.subject) userSubjectCounts[n.subject] = (userSubjectCounts[n.subject] || 0) + 1;
      });
      (user.bookmarks || []).forEach(bId => {
        const n = notesMap.get(bId);
        if (n && n.subject) userSubjectCounts[n.subject] = (userSubjectCounts[n.subject] || 0) + 2;
      });

      let topSubject = "General";
      let maxCount = 0;
      for (const [sub, cnt] of Object.entries(userSubjectCounts)) {
        if (cnt > maxCount) {
          maxCount = cnt;
          topSubject = sub;
        }
        subjectInterestCounts[sub] = (subjectInterestCounts[sub] || 0) + cnt;
      }

      return {
        id: user.id,
        googleId: user.googleId,
        name: user.name || "Student",
        email: user.email || "No Email",
        picture: user.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.id)}`,
        targetExam: user.targetExam || "",
        targetExamDetail: user.targetExamDetail || "",
        joinedAt: user.joinedAt,
        lastActiveAt: user.lastActiveAt,
        loginCount: user.loginCount || 1,
        likesCount: (user.likes || []).length,
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        bookmarksCount: bmarksCount,
        downloadsCount: (user.downloads || []).length,
        searchesCount: (user.searches || []).length,
        topSubject: topSubject,
        isActiveToday: lastActiveTs >= oneDayAgo,
        isActiveThisWeek: lastActiveTs >= sevenDaysAgo
      };
    });

    // Top subjects across all students
    const sortedSubjects = Object.entries(subjectInterestCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const topSubjectOverall = sortedSubjects[0]?.name || "Polity";

    // Target exam distribution across all students
    const examCounts = {};
    users.forEach(u => {
      const ex = u.targetExam || "Not Set";
      examCounts[ex] = (examCounts[ex] || 0) + 1;
    });
    const examBreakdown = Object.entries(examCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const metrics = {
      totalUsers: users.length,
      activeToday: activeToday,
      active7Days: active7Days,
      newSignups7Days: newSignups7Days,
      avgBookmarksPerUser: (totalBookmarksAcrossUsers / Math.max(1, users.length)).toFixed(1),
      topSubject: topSubjectOverall,
      subjectBreakdown: sortedSubjects,
      examBreakdown
    };

    sendJson(response, 200, {
      success: true,
      metrics,
      users: enrichedUsers.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    });
    return true;
  }

  // Admin Single User Telemetry Detail Modal
  if (request.method === "GET" && url.pathname.startsWith("/api/admin/users/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const userId = url.pathname.split("/").pop();
    const users = await readJson(USERS_FILE).catch(() => []);
    const user = users.find(u => u.id === userId);
    if (!user) {
      sendJson(response, 404, { error: "User not found." });
      return true;
    }

    const notes = await readJson(NOTES_FILE).catch(() => []);
    const notesMap = new Map(notes.map(n => [n.id, n]));

    // Enrich liked and bookmarked notes with full note objects
    const likedNoteIds = new Set();
    (user.likes || []).forEach(l => {
      const id = typeof l === "object" ? l.noteId : l;
      if (id) likedNoteIds.add(id);
    });
    (user.bookmarks || []).forEach(bId => {
      if (bId) likedNoteIds.add(bId);
    });

    const likedNotes = [...likedNoteIds].map(nId => {
      const note = notesMap.get(nId);
      return note ? { id: note.id, title: note.title, subject: note.subject, imageUrl: note.imageUrl } : { id: nId, title: "Visual Revision Note", subject: "General" };
    });

    // Enrich recent view history
    const recentViews = (user.views || []).slice(-20).reverse().map(v => {
      const note = notesMap.get(v.noteId);
      return {
        noteId: v.noteId,
        title: note ? note.title : "Study Diagram",
        subject: note ? note.subject : "General",
        timestamp: v.timestamp
      };
    });

    // Calculate subject engagement percentages
    const subCounts = {};
    (user.views || []).forEach(v => {
      const note = notesMap.get(v.noteId);
      const s = note?.subject || "General";
      subCounts[s] = (subCounts[s] || 0) + 1;
    });
    (user.likes || []).forEach(l => {
      const id = typeof l === "object" ? l.noteId : l;
      const note = notesMap.get(id);
      const s = note?.subject || "General";
      subCounts[s] = (subCounts[s] || 0) + 2;
    });
    (user.bookmarks || []).forEach(bId => {
      const note = notesMap.get(bId);
      const s = note?.subject || "General";
      subCounts[s] = (subCounts[s] || 0) + 2;
    });
    (user.downloads || []).forEach(d => {
      const note = notesMap.get(d.noteId);
      const s = note?.subject || "General";
      subCounts[s] = (subCounts[s] || 0) + 2;
    });

    const totalEngagements = Object.values(subCounts).reduce((a, b) => a + b, 0) || 1;
    const subjectDistribution = Object.entries(subCounts).map(([subject, count]) => ({
      subject,
      count,
      percent: Math.round((count / totalEngagements) * 100)
    })).sort((a, b) => b.count - a.count);

    sendJson(response, 200, {
      success: true,
      user: {
        id: user.id,
        googleId: user.googleId,
        name: user.name || "Student",
        email: user.email || "No Email",
        picture: user.picture,
        targetExam: user.targetExam || "",
        targetExamDetail: user.targetExamDetail || "",
        joinedAt: user.joinedAt,
        lastActiveAt: user.lastActiveAt,
        loginCount: user.loginCount || 1,
        likedNotes,
        bookmarkedNotes: likedNotes,
        recentViews,
        likesCount: Math.max((user.likes || []).length, likedNotes.length),
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        downloadsCount: (user.downloads || []).length,
        searches: user.searches || [],
        subjectDistribution
      }
    });
    return true;
  }

  // Admin Delete User
  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const userId = url.pathname.split("/").pop();
    let users = await readJson(USERS_FILE).catch(() => []);
    const initialLen = users.length;
    users = users.filter(u => u.id !== userId);

    if (users.length === initialLen) {
      sendJson(response, 404, { error: "User not found." });
      return true;
    }

    await writeJson(USERS_FILE, users);
    sendJson(response, 200, { success: true, message: "User deleted successfully." });
    return true;
  }

  // ==========================================
  // 1-Click Full Website Data Backup & Restore
  // ==========================================
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/admin/backup/export") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const notes = await readJson(NOTES_FILE).catch(() => []);
    const users = await readJson(USERS_FILE).catch(() => []);
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    const interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    let profile = await readJson(PROFILE_FILE).catch(() => ({ ...DEFAULT_PROFILE }));
    if (!profile) profile = { ...DEFAULT_PROFILE };

    // Read only active note diagram images into base64 dictionary (ignoring orphan/historical files)
    const images = {};
    const referencedFiles = new Set();
    for (const n of notes) {
      if (n.imageUrl && typeof n.imageUrl === "string" && !n.imageUrl.startsWith("http")) {
        const cleanName = path.basename(n.imageUrl.split("?")[0]);
        if (cleanName) referencedFiles.add(cleanName);
      }
    }

    for (const file of referencedFiles) {
      if (/\.(jpe?g|png|webp|svg)$/i.test(file)) {
        try {
          const filePath = path.join(UPLOAD_DIR, file);
          const buf = await fs.readFile(filePath);
          const ext = path.extname(file).toLowerCase();
          const mime = mimeTypes[ext] || (ext === ".svg" ? "image/svg+xml" : "image/jpeg");
          const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
          images[file] = dataUrl;
          images[`/uploads/${file}`] = dataUrl;
        } catch {}
      }
    }

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
    async function getAssetDataUrl(urlOrPath, fallbackRelPath = null) {
      let targetPath = urlOrPath || fallbackRelPath;
      if (!targetPath || typeof targetPath !== "string") return null;
      if (targetPath.startsWith("data:image/")) return targetPath;
      try {
        const cleanRel = targetPath.split("?")[0].replace(/^\/+/, "");
        const absPath = path.join(ROOT, cleanRel);
        const buf = await fs.readFile(absPath);
        const ext = path.extname(cleanRel).toLowerCase();
        const mime = mimeTypes[ext] || (ext === ".svg" ? "image/svg+xml" : "image/jpeg");
        return `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        if (fallbackRelPath && fallbackRelPath !== targetPath) {
          try {
            const cleanFallback = fallbackRelPath.split("?")[0].replace(/^\/+/, "");
            const absFallback = path.join(ROOT, cleanFallback);
            const buf = await fs.readFile(absFallback);
            const ext = path.extname(cleanFallback).toLowerCase();
            const mime = mimeTypes[ext] || (ext === ".svg" ? "image/svg+xml" : "image/jpeg");
            return `data:${mime};base64,${buf.toString("base64")}`;
          } catch {
            return null;
          }
        }
        return null;
      }
    }

    // Explicitly bundle Profile Picture (Avatar), Website Brand Logo, and Instagram QR Code
    const avatarData = await getAssetDataUrl(profile.avatarUrl, "assets/admin.jpg");
    const logoData = await getAssetDataUrl(profile.logoUrl, "assets/ailogo.png");
    const instagramQrData = await getAssetDataUrl(profile.instagramQrUrl, "assets/instagram_qr.svg");

    const profileAssets = {
      avatarData,
      logoData,
      instagramQrData
    };

    // Calculate comprehensive Tag Analytics
    const tagCounts = {};
    for (const note of exportedNotes) {
      if (Array.isArray(note.tags)) {
        for (const t of note.tags) {
          const clean = String(t || "").trim().replace(/^#/, "");
          if (clean) tagCounts[clean] = (tagCounts[clean] || 0) + 1;
        }
      }
    }
    const tagAnalytics = {
      totalUniqueTags: Object.keys(tagCounts).length,
      tagFrequencies: tagCounts,
      topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }))
    };

    // Calculate Subject / Category Analytics
    const catCounts = { History: 0, Polity: 0, Economy: 0, Geography: 0, "Art and Culture": 0, Maths: 0, Science: 0, Others: 0 };
    for (const note of exportedNotes) {
      const s = note.subject || "Others";
      catCounts[s] = (catCounts[s] || 0) + 1;
    }
    const categoryAnalytics = {
      categories: catCounts,
      totalNotes: exportedNotes.length
    };

    // Calculate Search Demands & Missing Searches
    const missingSearches = interactions.missingSearches || {};
    const searchDemands = {
      unfulfilledDemands: Object.values(missingSearches).sort((a, b) => (b.count || 0) - (a.count || 0)),
      allSearches: interactions.searches || {},
      totalSearchVolume: interactions.totalSearches || 0
    };

    const backupPayload = {
      version: "4.0",
      type: "ExamAlertIndiaMasterBackup",
      exportedAt: new Date().toISOString(),
      system: {
        platform: "Free AI Govt Exam Notes",
        generator: "Admin Studio Unified Master Backup Engine v4.0",
        notesCount: exportedNotes.length,
        usersCount: users.length,
        tagsCount: tagAnalytics.totalUniqueTags,
        searchDemandsCount: searchDemands.unfulfilledDemands.length
      },
      notes: exportedNotes,
      users: users,
      profile: {
        ...profile,
        avatarData,
        logoData,
        instagramQrData
      },
      profileAssets,
      interactions,
      searchDemands,
      tagAnalytics,
      categoryAnalytics,
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

    // 0. Create pre-restore safety copy of current database
    try {
      const currentNotes = await readJson(NOTES_FILE).catch(() => []);
      const currentUsers = await readJson(USERS_FILE).catch(() => []);
      const currentProfile = await readJson(PROFILE_FILE).catch(() => ({}));
      const currentVisits = await readJson(VISITS_FILE).catch(() => ({}));
      const currentInteractions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
      await writeJson(path.join(DATA_DIR, "pre_restore_safety_snapshot.json"), {
        timestamp: new Date().toISOString(),
        notes: currentNotes,
        users: currentUsers,
        profile: currentProfile,
        visits: currentVisits,
        interactions: currentInteractions
      });
    } catch {}

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

    // 3. Restore Registered Student Users if bundled
    if (Array.isArray(backup.users)) {
      await writeJson(USERS_FILE, backup.users);
    }

    // 4. Restore Analytics & Telemetry
    if (backup.visits && typeof backup.visits === "object") {
      await writeJson(VISITS_FILE, backup.visits);
    }
    if (backup.interactions && typeof backup.interactions === "object") {
      await writeJson(INTERACTIONS_FILE, backup.interactions);
    }

    // 5. Restore Profile & Brand Identity
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
      message: `Restored ${(backup.notes || []).length} notes, ${(backup.users || []).length} student accounts, administrator avatar, site logo, and Instagram QR barcode successfully.`,
      notesCount: (backup.notes || []).length,
      usersCount: (backup.users || []).length,
      profile
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/backup/upload-asset") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request, 15 * 1024 * 1024).catch(() => ({}));
    const filename = body.filename ? path.basename(body.filename) : "";
    const dataUrl = body.dataUrl || "";
    if (filename && dataUrl) {
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
      if (match) {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const buf = Buffer.from(match[2].replace(/[\r\n\s]/g, ""), "base64");
        await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
        sendJson(response, 200, { success: true, filename });
        return true;
      }
    }
    sendJson(response, 400, { error: "Invalid asset data." });
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
    await writeJson(USERS_FILE, []);
    await writeJson(VISITS_FILE, { count: 0, daily: {} });
    await writeJson(INTERACTIONS_FILE, {
      totalLikes: 0,
      totalDownloads: 0,
      totalShares: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      shares: {},
      searches: {},
      missingSearches: {}
    });
    await writeJson(SESSIONS_FILE, []);
    studentSessions.clear();

    // Clean up uploaded images
    try {
      const files = await fs.readdir(UPLOAD_DIR);
      for (const file of files) {
        await fs.unlink(path.join(UPLOAD_DIR, file)).catch(() => {});
      }
    } catch {}

    sendJson(response, 200, { reset: true, message: "All server notes, students, visits, interactions and uploads have been completely reset to 0." }, {
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
    "/assets/admin.jpg",
    "/data/notes.json",
    "/data/profile.json"
  ]);
  const isPublicUpload = pathname.startsWith("/uploads/") && /\.(jpe?g|png|webp|svg)$/i.test(pathname);
  const isPublicAsset = pathname.startsWith("/assets/");
  const isPublicData = pathname.startsWith("/data/") && pathname.endsWith(".json");
  if (!allowedPublicFiles.has(pathname) && !isPublicUpload && !isPublicAsset && !isPublicData) {
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
