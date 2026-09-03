import http from "node:http";
import zlib from "node:zlib";
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
const SECURITY_FILE = path.join(DATA_DIR, "admin_security.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const environment = globalThis.process?.env || {};
const previewConfig = globalThis.__EXAM_ALERT_CONFIG || {};
const PORT = Number(previewConfig.port || environment.PORT || 4173);
const ADMIN_PASSWORD = previewConfig.adminPassword || environment.ADMIN_PASSWORD || "admin123";
let currentAdminPassword = ADMIN_PASSWORD;
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
    const usersCount = await mongoDb.collection("users").countDocuments();
    if (usersCount === 0) {
      const diskUsers = await fs.readFile(USERS_FILE, "utf8").then(JSON.parse).catch(() => []);
      if (diskUsers.length > 0) {
        await mongoDb.collection("users").insertMany(diskUsers.map(u => ({ ...u })));
        console.log(`🌱 [Database] Seeded ${diskUsers.length} student users to MongoDB Atlas collection "users"`);
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
  await createJsonIfMissing(SECURITY_FILE, { adminPassword: ADMIN_PASSWORD || "admin123" });

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

  try {
    const sec = await readJson(SECURITY_FILE);
    if (sec && typeof sec.adminPassword === "string" && sec.adminPassword.trim()) {
      currentAdminPassword = sec.adminPassword.trim();
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
        const dbNotes = await mongoDb.collection("notes").find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
        if (Array.isArray(dbNotes) && dbNotes.length > 0) {
          return dbNotes;
        }
        // Auto-heal fallback to local disk
        const diskNotes = await fs.readFile(NOTES_FILE, "utf8").then(JSON.parse).catch(() => []);
        if (Array.isArray(diskNotes) && diskNotes.length > 0) {
          await mongoDb.collection("notes").insertMany(diskNotes.map(n => ({ ...n }))).catch(() => {});
          return diskNotes;
        }
        return [];
      }
      if (filePath === USERS_FILE) {
        const dbUsers = await mongoDb.collection("users").find({}, { projection: { _id: 0 } }).toArray();
        if (Array.isArray(dbUsers) && dbUsers.length > 0) {
          return dbUsers;
        }
        // Auto-heal fallback to local disk if MongoDB collection is temporarily empty
        const diskUsers = await fs.readFile(USERS_FILE, "utf8").then(JSON.parse).catch(() => []);
        if (Array.isArray(diskUsers) && diskUsers.length > 0) {
          await mongoDb.collection("users").insertMany(diskUsers.map(u => ({ ...u }))).catch(() => {});
          return diskUsers;
        }
        return [];
      }
      if (filePath === FEEDBACK_FILE) {
        const dbFeedback = await mongoDb.collection("feedback").find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
        if (Array.isArray(dbFeedback) && dbFeedback.length > 0) {
          return dbFeedback;
        }
        const diskFeedback = await fs.readFile(FEEDBACK_FILE, "utf8").then(JSON.parse).catch(() => []);
        if (Array.isArray(diskFeedback) && diskFeedback.length > 0) {
          await mongoDb.collection("feedback").insertMany(diskFeedback.map(f => ({ ...f }))).catch(() => {});
          return diskFeedback;
        }
        return [];
      }
      if (filePath === PROFILE_FILE) {
        const doc = await mongoDb.collection("profile").findOne({ type: "admin_profile" }, { projection: { _id: 0 } });
        return doc || { ...DEFAULT_PROFILE };
      }
      if (filePath === SECURITY_FILE) {
        const doc = await mongoDb.collection("security").findOne({ type: "admin_security" }, { projection: { _id: 0 } });
        return doc || { adminPassword: currentAdminPassword };
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

function cleanseForMongo(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    if (data.startsWith("data:image/") || (data.length > 5000 && /^[a-zA-Z0-9+/=\r\n\s]+$/.test(data.slice(0, 100)))) {
      return ""; // Never store base64 binary payload in MongoDB
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanseForMongo(item));
  }
  if (typeof data === "object") {
    const clean = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === "avatarData" || key === "logoData" || key === "instagramQrData" || key === "imageData" || key === "imageBuffer") {
        continue; // Skip raw base64 buffer fields
      }
      clean[key] = cleanseForMongo(val);
    }
    return clean;
  }
  return data;
}

async function writeJson(filePath, value) {
  try {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  } catch (fsErr) {
    console.warn(`[Database] Local disk mirror write failed:`, fsErr.message);
  }

  if (isMongoConnected && mongoDb) {
    try {
      const sanitizedValue = cleanseForMongo(value);
      if (filePath === NOTES_FILE) {
        const col = mongoDb.collection("notes");
        if (Array.isArray(sanitizedValue)) {
          if (sanitizedValue.length === 0) {
            await col.deleteMany({});
          } else {
            const ops = sanitizedValue.map(n => ({
              updateOne: {
                filter: { id: n.id },
                update: { $set: { ...n } },
                upsert: true
              }
            }));
            await col.bulkWrite(ops, { ordered: false });
            const validIds = sanitizedValue.map(n => n.id).filter(Boolean);
            if (validIds.length > 0) {
              await col.deleteMany({ id: { $nin: validIds } });
            }
          }
        }
        return;
      }
      if (filePath === USERS_FILE) {
        const col = mongoDb.collection("users");
        if (Array.isArray(sanitizedValue)) {
          if (sanitizedValue.length === 0) {
            await col.deleteMany({});
          } else {
            const ops = sanitizedValue.map(u => ({
              updateOne: {
                filter: { id: u.id },
                update: { $set: { ...u } },
                upsert: true
              }
            }));
            await col.bulkWrite(ops, { ordered: false });
            const validIds = sanitizedValue.map(u => u.id).filter(Boolean);
            if (validIds.length > 0) {
              await col.deleteMany({ id: { $nin: validIds } });
            }
          }
        }
        return;
      }
      if (filePath === FEEDBACK_FILE) {
        const col = mongoDb.collection("feedback");
        if (Array.isArray(sanitizedValue)) {
          if (sanitizedValue.length === 0) {
            await col.deleteMany({});
          } else {
            const ops = sanitizedValue.map(f => ({
              updateOne: {
                filter: { id: f.id },
                update: { $set: { ...f } },
                upsert: true
              }
            }));
            await col.bulkWrite(ops, { ordered: false });
            const validIds = sanitizedValue.map(f => f.id).filter(Boolean);
            if (validIds.length > 0) {
              await col.deleteMany({ id: { $nin: validIds } });
            }
          }
        }
        return;
      }
      if (filePath === PROFILE_FILE) {
        const col = mongoDb.collection("profile");
        await col.updateOne({ type: "admin_profile" }, { $set: { ...sanitizedValue, type: "admin_profile" } }, { upsert: true });
        return;
      }
      if (filePath === SECURITY_FILE) {
        const col = mongoDb.collection("security");
        await col.updateOne({ type: "admin_security" }, { $set: { ...sanitizedValue, type: "admin_security" } }, { upsert: true });
        return;
      }
      if (filePath === INTERACTIONS_FILE) {
        const col = mongoDb.collection("interactions");
        await col.updateOne({ type: "global_interactions" }, { $set: { ...sanitizedValue, type: "global_interactions" } }, { upsert: true });
        return;
      }
      if (filePath === VISITS_FILE) {
        const col = mongoDb.collection("visits");
        await col.updateOne({ type: "global_visits" }, { $set: { ...sanitizedValue, type: "global_visits" } }, { upsert: true });
        return;
      }
      if (filePath === SESSIONS_FILE) {
        const col = mongoDb.collection("sessions");
        await col.deleteMany({});
        if (Array.isArray(sanitizedValue) && sanitizedValue.length > 0) {
          await col.insertMany(sanitizedValue.map(token => ({ token, createdAt: new Date().toISOString() })));
        }
        return;
      }
    } catch (dbErr) {
      console.warn(`[Database] MongoDB write failed for ${path.basename(filePath)}:`, dbErr.message);
    }
  }
}

function sendJson(response, status, payload, headers = {}, request = null) {
  const req = request || response.req;
  const jsonStr = JSON.stringify(payload);
  const acceptEncoding = (req && req.headers && req.headers["accept-encoding"]) || "";
  const finalHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  };

  if (jsonStr.length > 1024 && /\bgzip\b/i.test(acceptEncoding)) {
    finalHeaders["Content-Encoding"] = "gzip";
    finalHeaders["Vary"] = "Accept-Encoding";
    try {
      const gzipped = zlib.gzipSync(Buffer.from(jsonStr, "utf8"), { level: 6 });
      response.writeHead(status, finalHeaders);
      response.end(gzipped);
      return;
    } catch {}
  }

  response.writeHead(status, finalHeaders);
  response.end(jsonStr);
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
  const targetPassword = String(currentAdminPassword || ADMIN_PASSWORD || "admin123").trim();
  if (suppliedStr === targetPassword) return true;
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
    const activeUsersNow = getActiveUsersCount();
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    if (!visits.daily) visits.daily = {};
    const todayKey = getLocalDateKey();
    let todayCount = Number(visits.daily[todayKey]) || 0;

    // Logical Consistency: If active readers are currently online, today's visits cannot be 0
    if (todayCount < activeUsersNow) {
      todayCount = activeUsersNow;
      visits.daily[todayKey] = todayCount;
      visits.count = Math.max(Number(visits.count) || 0, todayCount);
      await writeJson(VISITS_FILE, visits).catch(() => {});
    }

    const dailySum = Object.values(visits.daily).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalCount = Math.max(Number(visits.count) || 0, dailySum, todayCount, activeUsersNow);

    sendJson(response, 200, {
      count: totalCount,
      today: todayCount,
      activeUsers: activeUsersNow,
      daily: visits.daily
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/visits/track") {
    const body = await readBody(request).catch(() => ({}));
    registerSessionHeartbeat(request, body);
    const activeUsersNow = getActiveUsersCount();
    const visits = await readJson(VISITS_FILE).catch(() => ({ count: 0, daily: {} }));
    if (!visits.daily) visits.daily = {};
    const cookies = parseCookies(request);
    const todayKey = getLocalDateKey();
    const setCookiesList = [];
    let shouldSave = false;

    // Track Today's Unique Visitor (if client hasn't visited today yet or after a data reset)
    if (cookies.examVisitorDay !== todayKey || (Number(visits.daily[todayKey]) || 0) < activeUsersNow) {
      visits.daily[todayKey] = Math.max((Number(visits.daily[todayKey]) || 0) + 1, activeUsersNow);
      visits.count = Math.max((Number(visits.count) || 0) + 1, Number(visits.daily[todayKey]));
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

    const todayCount = Math.max(Number(visits.daily[todayKey]) || 0, activeUsersNow);
    const finalCount = Math.max(Number(visits.count) || 0, dailySum, todayCount, activeUsersNow);

    sendJson(response, 200, {
      count: finalCount,
      today: todayCount,
      activeUsers: activeUsersNow,
      daily: visits.daily
    }, headers);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/notes") {
    registerSessionHeartbeat(request);
    sendJson(response, 200, { notes: await readJson(NOTES_FILE) }, {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=60"
    });
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
      const studentUser = await getStudentUser(request);
      if (!studentUser) {
        sendJson(response, 401, { error: "Authentication required to like or save notes.", requiresAuth: true });
        return true;
      }
      interactions.totalLikes = Math.max(0, (interactions.totalLikes || 0) + 1);
      if (noteId) {
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0 };
        interactions.notes[noteId].likes = Math.max(0, (interactions.notes[noteId].likes || 0) + 1);
      }
    } else if (type === "unlike") {
      const studentUser = await getStudentUser(request);
      if (!studentUser) {
        sendJson(response, 401, { error: "Authentication required to like or save notes.", requiresAuth: true });
        return true;
      }
      interactions.totalLikes = Math.max(0, (interactions.totalLikes || 0) - 1);
      if (noteId && interactions.notes[noteId]) {
        interactions.notes[noteId].likes = Math.max(0, (interactions.notes[noteId].likes || 0) - 1);
      }
    } else if (type === "download") {
      const studentUser = await getStudentUser(request);
      if (!studentUser) {
        sendJson(response, 401, { error: "Authentication required to download notes.", requiresAuth: true });
        return true;
      }
      interactions.totalDownloads = (interactions.totalDownloads || 0) + 1;
      if (noteId) {
        if (!interactions.notes[noteId]) interactions.notes[noteId] = { likes: 0, downloads: 0, impressions: 0, shares: 0 };
        interactions.notes[noteId].downloads = (interactions.notes[noteId].downloads || 0) + 1;
      }
      if (studentUser && noteId) {
        if (!Array.isArray(studentUser.downloads)) studentUser.downloads = [];
        const exists = studentUser.downloads.some(d => (typeof d === "object" && d ? d.noteId : d) === noteId);
        if (!exists) {
          studentUser.downloads.push({ noteId, timestamp: new Date().toISOString() });
        }
        let users = await readJson(USERS_FILE).catch(() => []);
        const idx = users.findIndex(u => u.id === studentUser.id);
        if (idx >= 0) {
          users[idx] = studentUser;
          await writeJson(USERS_FILE, users);
        }
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

  if (request.method === "POST" && url.pathname === "/api/admin/change-password") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request).catch(() => ({}));
    const currentPass = String(body.currentPassword || "").trim();
    const newPass = String(body.newPassword || "").trim();

    if (!safePasswordMatch(currentPass)) {
      sendJson(response, 400, { error: "Current admin password is incorrect." });
      return true;
    }

    if (!newPass || newPass.length < 4) {
      sendJson(response, 400, { error: "New password must be at least 4 characters long." });
      return true;
    }

    currentAdminPassword = newPass;
    await writeJson(SECURITY_FILE, { adminPassword: newPass, updatedAt: new Date().toISOString() });
    
    sendJson(response, 200, { success: true, message: "Admin password changed successfully!" });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout-all-sessions") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request).catch(() => ({}));
    const enteredPassword = String(body.password || "").trim();

    if (enteredPassword && !safePasswordMatch(enteredPassword)) {
      sendJson(response, 400, { error: "Incorrect admin password. Cannot terminate sessions." });
      return true;
    }

    // Terminate all active admin sessions across all devices
    sessions.clear();
    await persistSessions();

    sendJson(
      response,
      200,
      { success: true, loggedOutAll: true, message: "All admin sessions terminated across all devices." },
      { "Set-Cookie": "examAdminSession=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" }
    );
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

  // ==========================================
  // Helper: Synchronize Interactions & Users when Notes are Deleted
  // As requested by user: views, share, and downloads are IRREVERSIBLE historical metrics
  // and are preserved. Active bookmarks and likes are removed immediately!
  // ==========================================
  async function cleanupDeletedNotesFromInteractionsAndUsers(deletedNoteIds) {
    if (!deletedNoteIds || deletedNoteIds.length === 0) return;
    const deletedSet = new Set(deletedNoteIds.map(String));

    // 1. Get current remaining active note IDs
    const allNotes = await readJson(NOTES_FILE).catch(() => []);
    const activeNoteIds = new Set(allNotes.map(n => n.id));

    // 2. Clean up INTERACTIONS_FILE
    let interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    if (!interactions.notes) interactions.notes = {};

    deletedNoteIds.forEach(id => {
      delete interactions.notes[id];
    });

    let syncedLikes = 0;
    let syncedDownloads = 0;
    let syncedImpressions = 0;
    for (const [nId, nData] of Object.entries(interactions.notes)) {
      if (activeNoteIds.has(nId) || nId.startsWith("sample-")) {
        syncedLikes += (Number(nData.likes) || 0);
        syncedDownloads += (Number(nData.downloads) || 0);
        syncedImpressions += (Number(nData.impressions) || 0);
      } else {
        delete interactions.notes[nId];
      }
    }
    interactions.totalLikes = syncedLikes;
    interactions.totalDownloads = syncedDownloads;
    interactions.totalImpressions = Math.max(syncedImpressions, Number(interactions.totalImpressions) || 0);
    await writeJson(INTERACTIONS_FILE, interactions).catch(() => {});

    // 3. Clean up USERS_FILE & MongoDB users collection
    let users = await readJson(USERS_FILE).catch(() => []);
    let anyUserUpdated = false;

    for (const user of users) {
      let userChanged = false;

      // A. Clean user.bookmarks
      if (Array.isArray(user.bookmarks)) {
        const originalLen = user.bookmarks.length;
        user.bookmarks = user.bookmarks.filter(b => {
          const bId = typeof b === "object" && b ? (b.noteId || b.id) : b;
          return bId && !deletedSet.has(String(bId)) && activeNoteIds.has(String(bId));
        });
        if (user.bookmarks.length !== originalLen) userChanged = true;
      }

      // B. Clean user.likes
      if (Array.isArray(user.likes)) {
        const originalLen = user.likes.length;
        user.likes = user.likes.filter(l => {
          const lId = typeof l === "object" && l ? (l.noteId || l.id) : l;
          return lId && !deletedSet.has(String(lId)) && activeNoteIds.has(String(lId));
        });
        if (user.likes.length !== originalLen) userChanged = true;
      }

      // C. Recalculate likesCount & bookmarksCount strictly based on remaining active liked notes
      const activeLikedIds = getUniqueLikedNoteIds(user).filter(id => activeNoteIds.has(id));
      user.likesCount = activeLikedIds.length;
      user.bookmarksCount = activeLikedIds.length;

      if (userChanged) {
        anyUserUpdated = true;
      }
    }

    if (anyUserUpdated || users.length > 0) {
      await writeJson(USERS_FILE, users).catch(() => {});
    }

    // If MongoDB is connected, also pull deleted notes from users collection
    if (isMongoConnected && mongoDb) {
      try {
        const usersCol = mongoDb.collection("users");
        for (const delId of deletedNoteIds) {
          await usersCol.updateMany(
            {},
            {
              $pull: {
                bookmarks: delId,
                likes: { $in: [delId, { noteId: delId }] }
              }
            }
          );
        }
      } catch (mErr) {
        console.warn("[MongoDB] Error purging deleted notes from users collection:", mErr.message);
      }
    }
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
    await cleanupDeletedNotesFromInteractionsAndUsers(ids);

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
    await cleanupDeletedNotesFromInteractionsAndUsers([id]);

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
    const notes = await readJson(NOTES_FILE).catch(() => []);
    const activeNoteIds = new Set(notes.map(n => n.id));
    const activeLikedIds = getUniqueLikedNoteIds(user).filter(id => activeNoteIds.has(id));

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
        likes: activeLikedIds,
        bookmarks: activeLikedIds,
        likesCount: activeLikedIds.length,
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

// ==========================================
// Student Likes & Telemetry Helper
// ==========================================
function getUniqueLikedNoteIds(user) {
  if (!user) return [];
  const set = new Set();
  (user.likes || []).forEach(l => {
    const id = typeof l === "object" && l ? l.noteId : l;
    if (id && typeof id === "string" && id.trim()) set.add(id.trim());
  });
  (user.bookmarks || []).forEach(b => {
    const id = typeof b === "object" && b ? b.noteId : b;
    if (id && typeof id === "string" && id.trim()) set.add(id.trim());
  });
  return Array.from(set);
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
        if (!Array.isArray(user.bookmarks)) user.bookmarks = [];
        const exists = user.likes.some(l => (typeof l === "object" && l ? l.noteId : l) === noteId);
        if (!exists) {
          user.likes.push({ noteId, timestamp: nowIso });
        }
        if (!user.bookmarks.includes(noteId)) {
          user.bookmarks.push(noteId);
        }
      } else if (type === "unlike" && noteId) {
        if (Array.isArray(user.likes)) {
          user.likes = user.likes.filter(l => (typeof l === "object" && l ? l.noteId : l) !== noteId);
        }
        if (Array.isArray(user.bookmarks)) {
          user.bookmarks = user.bookmarks.filter(id => id !== noteId);
        }
      } else if (type === "bookmark" && noteId) {
        if (!Array.isArray(user.bookmarks)) user.bookmarks = [];
        if (!Array.isArray(user.likes)) user.likes = [];
        if (remove) {
          user.bookmarks = user.bookmarks.filter(id => id !== noteId);
          user.likes = user.likes.filter(l => (typeof l === "object" && l ? l.noteId : l) !== noteId);
        } else {
          if (!user.bookmarks.includes(noteId)) user.bookmarks.push(noteId);
          const exists = user.likes.some(l => (typeof l === "object" && l ? l.noteId : l) === noteId);
          if (!exists) user.likes.push({ noteId, timestamp: nowIso });
        }
      } else if (type === "share" && noteId) {
        if (!Array.isArray(user.shares)) user.shares = [];
        user.shares.push({ noteId, platform: platform || "general", timestamp: nowIso });
        if (user.shares.length > 500) user.shares = user.shares.slice(-500);
      } else if (type === "view" && noteId) {
        if (!Array.isArray(user.views)) user.views = [];
        user.views.push({ noteId, timestamp: nowIso });
        if (user.views.length > 500) user.views = user.views.slice(-500);
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

      const uniqueLikes = getUniqueLikedNoteIds(user);

      sendJson(response, 200, {
        success: true,
        bookmarks: uniqueLikes,
        likesCount: uniqueLikes.length,
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
// Indian Regional Language Academic Translation Engine
// Supports Hindi (hi), Tamil (ta), Telugu (te), Malayalam (ml), Kannada (kn)
// Combines Gemini 3.6 Flash (state-of-the-art context-aware academic translation)
// with Tag-Safe DOM Tokenizer fallback (100% tag-preserving, zero ZTAG corruptions)
// ==========================================

const INDIAN_LANG_NAMES = {
  hi: "Hindi (हिन्दी)",
  ta: "Tamil (தமிழ்)",
  bn: "Bengali (বাংলা)",
  mr: "Marathi (मराठी)",
  te: "Telugu (తెలుగు)",
  ml: "Malayalam (മലയാളം)",
  kn: "Kannada (ಕನ್ನಡ)"
};

async function translateChunkWithGoogle(chunk, targetLang) {
  const trimmed = chunk.trim();
  if (!trimmed) return chunk;

  // Try clients5 endpoint
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0] && typeof data[0][0] === "string") {
        return data[0][0];
      }
    }
  } catch {}

  // Fallback to gtx endpoint
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        return data[0].map(item => item?.[0] || "").join("");
      }
    }
  } catch {}

  return chunk;
}

// Tag-Safe DOM Tokenizer: Splits HTML strictly by tags and translates ONLY the text nodes!
// HTML tags, classes, and styles (<mark>, <strong>, <ul>, <li>, style="...")
// are NEVER sent to the translation API and are 100% preserved without any ZTAG placeholder tokens.
async function tagSafeDomTranslate(rawHtml, targetLang) {
  if (!rawHtml || targetLang === "en") return rawHtml;

  const tokens = rawHtml.split(/(<[^>]+>)/);
  const translatedTokens = await Promise.all(
    tokens.map(async (tok) => {
      if (!tok) return "";
      if (tok.startsWith("<") && tok.endsWith(">")) {
        return tok; // Tag preserved 100% untouched
      }
      const trimmed = tok.trim();
      if (!trimmed) return tok;
      const translated = await translateChunkWithGoogle(trimmed, targetLang);
      const leadSpace = tok.match(/^\s*/)[0];
      const trailSpace = tok.match(/\s*$/)[0];
      return leadSpace + translated + trailSpace;
    })
  );

  return translatedTokens.join("");
}

// Gemini 3.6 Flash Context-Aware Translation for flawless academic translation
async function translateWithGemini(rawHtml, targetLang, apiKey) {
  const langLabel = INDIAN_LANG_NAMES[targetLang] || targetLang;
  const prompt = `You are an expert academic translator for Indian competitive exam revision notes (UPSC, SSC, State PSC).
Translate the following study overview note into ${langLabel}.
CRITICAL RULES:
1. Preserve ALL HTML structure, tags (like <div>, <p>, <ul>, <li>, <mark>, <span>, <strong>, <br>, etc.), inline styles (style="..."), and bullet points EXACTLY as they are.
2. Translate the human readable sentences into natural, high-yield, grammatically flawless, academically precise ${langLabel}.
3. Keep standard dates, numbers, years, and universally recognized proper nouns clear.
4. Output ONLY the translated HTML content without markdown code blocks, backticks, or extra conversational remarks.

HTML to translate:
${rawHtml}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15 }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini translation error (status ${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) {
    throw new Error("Gemini returned empty translation response");
  }

  let clean = candidate.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  return clean;
}

  // ==========================================
  // Public Instant Indian Language Translation API
  // Supports Hindi (hi), Tamil (ta), Telugu (te), Malayalam (ml), Kannada (kn)
  // ==========================================
  if (request.method === "POST" && url.pathname === "/api/translate") {
    const body = await readBody(request).catch(() => ({}));
    const text = String(body.text || "").trim();
    const targetLang = String(body.targetLang || "en").trim().toLowerCase();

    if (!text || targetLang === "en") {
      sendJson(response, 200, { translatedText: text, targetLang: "en" });
      return true;
    }

    const cacheKey = `${targetLang}:${text}`;
    if (!globalThis.__TRANSLATION_CACHE) globalThis.__TRANSLATION_CACHE = new Map();
    if (globalThis.__TRANSLATION_CACHE.has(cacheKey)) {
      sendJson(response, 200, {
        translatedText: globalThis.__TRANSLATION_CACHE.get(cacheKey),
        targetLang,
        cached: true
      });
      return true;
    }

    let translatedText = text;
    let usedMethod = "gemini";

    try {
      const apiKey = await getGeminiApiKey();
      if (apiKey) {
        try {
          translatedText = await translateWithGemini(text, targetLang, apiKey);
        } catch (geminiErr) {
          console.warn("[Translation] Gemini fallback to TagSafe:", geminiErr.message);
          usedMethod = "tag-safe-google";
          translatedText = await tagSafeDomTranslate(text, targetLang);
        }
      } else {
        usedMethod = "tag-safe-google";
        translatedText = await tagSafeDomTranslate(text, targetLang);
      }

      if (globalThis.__TRANSLATION_CACHE.size > 500) {
        const firstKey = globalThis.__TRANSLATION_CACHE.keys().next().value;
        globalThis.__TRANSLATION_CACHE.delete(firstKey);
      }
      globalThis.__TRANSLATION_CACHE.set(cacheKey, translatedText);

      sendJson(response, 200, { translatedText, targetLang, method: usedMethod });
    } catch (err) {
      console.error("[Translation Error]:", err);
      sendJson(response, 200, { translatedText: text, targetLang, fallback: true, error: err.message });
    }
    return true;
  }

  // ==========================================
  // Public Regional Indian Language Audio Speech API (/api/tts)
  // High-fidelity speech for Tamil (ta), Telugu (te), Malayalam (ml), Kannada (kn), Hindi (hi), English (en)
  // ==========================================
  if ((request.method === "POST" || request.method === "GET") && url.pathname === "/api/tts") {
    let text = "";
    let lang = "en";

    if (request.method === "GET") {
      text = String(url.searchParams.get("text") || "").trim();
      lang = String(url.searchParams.get("lang") || "en").trim().toLowerCase();
    } else {
      const body = await readBody(request).catch(() => ({}));
      text = String(body.text || "").trim();
      lang = String(body.lang || body.targetLang || "en").trim().toLowerCase();
    }

    if (!text) {
      sendJson(response, 400, { error: "text parameter is required" });
      return true;
    }

    const cleanText = text.slice(0, 2000);
    const validLang = ["en", "hi", "ta", "bn", "mr", "te", "ml", "kn"].includes(lang) ? lang : "en";
    const cacheKey = `${validLang}:${cleanText}`;

    if (globalThis.__TTS_CACHE && globalThis.__TTS_CACHE.has(cacheKey)) {
      const cached = globalThis.__TTS_CACHE.get(cacheKey);
      response.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.length,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(cached);
      return true;
    }

    try {
      // Chunk text cleanly at punctuation into ~140 char pieces for TTS
      const chunks = [];
      const rawSentences = cleanText.split(/([.!?;,\n।]+)/).filter(Boolean);
      let currentChunk = "";

      for (let i = 0; i < rawSentences.length; i++) {
        const piece = rawSentences[i].trim();
        if (!piece) continue;
        if ((currentChunk + " " + piece).length > 140) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = piece;
        } else {
          currentChunk = currentChunk ? (currentChunk + " " + piece) : piece;
        }
      }
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      if (chunks.length === 0) chunks.push(cleanText.slice(0, 140));

      const buffers = [];
      for (const chunk of chunks) {
        if (!chunk) continue;
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(validLang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        const ttsRes = await fetch(ttsUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (ttsRes.ok) {
          const ab = await ttsRes.arrayBuffer();
          buffers.push(Buffer.from(ab));
        }
      }

      if (buffers.length === 0) {
        sendJson(response, 502, { error: "Failed to synthesize speech audio stream." });
        return true;
      }

      const combinedAudio = Buffer.concat(buffers);
      if (!globalThis.__TTS_CACHE) globalThis.__TTS_CACHE = new Map();
      if (globalThis.__TTS_CACHE.size > 200) {
        const firstKey = globalThis.__TTS_CACHE.keys().next().value;
        globalThis.__TTS_CACHE.delete(firstKey);
      }
      globalThis.__TTS_CACHE.set(cacheKey, combinedAudio);

      response.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": combinedAudio.length,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(combinedAudio);
      return true;
    } catch (err) {
      console.error("[TTS Generation Error]:", err);
      sendJson(response, 500, { error: "TTS generation failed: " + err.message });
      return true;
    }
  }

  // ==========================================
  // Google Gemini AI Services & Auto-Fill APIs
  // ==========================================
  const ALLOWED_EXAM_SUBJECTS = ["History", "Polity", "Economy", "Geography", "Art and Culture", "Maths", "Science", "Others"];

  async function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return process.env.GEMINI_API_KEY.trim();
    }
    const profile = await readJson(PROFILE_FILE).catch(() => ({}));
    return (profile.geminiApiKey || "").trim();
  }

  function normalizeExamSubject(raw) {
    if (!raw) return "Others";
    const clean = String(raw).trim().toLowerCase();
    for (const s of ALLOWED_EXAM_SUBJECTS) {
      if (s.toLowerCase() === clean) return s;
    }
    if (clean.includes("hist")) return "History";
    if (clean.includes("polit") || clean.includes("constitut")) return "Polity";
    if (clean.includes("econ")) return "Economy";
    if (clean.includes("geog")) return "Geography";
    if (clean.includes("art") || clean.includes("cultur")) return "Art and Culture";
    if (clean.includes("math") || clean.includes("quant") || clean.includes("aptitud")) return "Maths";
    if (clean.includes("scien") || clean.includes("phys") || clean.includes("chem") || clean.includes("bio")) return "Science";
    return "Others";
  }

  // GET /api/admin/ai/status - check if Gemini API key is configured
  if (request.method === "GET" && url.pathname === "/api/admin/ai/status") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const apiKey = await getGeminiApiKey();
    const isConfigured = Boolean(apiKey && apiKey.length > 5);
    const maskedKey = isConfigured ? `${apiKey.slice(0, 4)}••••••••${apiKey.slice(-4)}` : "";
    sendJson(response, 200, { configured: isConfigured, maskedKey });
    return true;
  }

  // POST /api/admin/ai/config - Save or update Gemini API key
  if (request.method === "POST" && url.pathname === "/api/admin/ai/config") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request).catch(() => ({}));
    const newKey = String(body.apiKey || "").trim();
    if (!newKey) {
      sendJson(response, 400, { error: "API key cannot be empty." });
      return true;
    }
    let profile = await readJson(PROFILE_FILE).catch(() => ({ ...DEFAULT_PROFILE }));
    if (!profile) profile = { ...DEFAULT_PROFILE };
    profile.geminiApiKey = newKey;
    profile.updatedAt = new Date().toISOString();
    await writeJson(PROFILE_FILE, profile);
    const maskedKey = `${newKey.slice(0, 4)}••••••••${newKey.slice(-4)}`;
    sendJson(response, 200, { success: true, maskedKey, message: "Google Gemini API key saved successfully!" });
    return true;
  }

  const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash"];

  async function callGeminiGenerateContent(apiKey, payload) {
    let lastError = null;
    let lastStatus = 500;
    for (const model of GEMINI_MODELS) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          return { ok: true, data, model };
        }
        const msg = data.error?.message || `Status ${res.status}`;
        lastStatus = res.status;
        lastError = msg;
        // If error is model availability / deprecation / not found, fall back to next model
        if (msg.includes("not found") || msg.includes("no longer available") || msg.includes("deprecated") || res.status === 404) {
          continue;
        }
        // If it's invalid key or auth error, return immediately
        return { ok: false, error: msg, status: res.status };
      } catch (err) {
        lastError = err.message;
      }
    }
    return { ok: false, error: lastError || "Failed to reach Gemini API.", status: lastStatus };
  }

  // POST /api/admin/ai/test-key - Test a Gemini API key
  if (request.method === "POST" && url.pathname === "/api/admin/ai/test-key") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request).catch(() => ({}));
    const testKey = String(body.apiKey || "").trim() || (await getGeminiApiKey());
    if (!testKey) {
      sendJson(response, 400, { error: "No Gemini API key provided to test." });
      return true;
    }
    const result = await callGeminiGenerateContent(testKey, {
      contents: [{ parts: [{ text: "Respond with the single word: OK" }] }]
    });
    if (!result.ok) {
      sendJson(response, 400, { success: false, error: result.error });
      return true;
    }
    sendJson(response, 200, {
      success: true,
      message: `Connected successfully with Google Gemini (${result.model})! ✨`
    });
    return true;
  }

  // POST /api/admin/ai/auto-fill - Analyze diagram and auto-generate Title, Subject, Tags, and Overview
  if (request.method === "POST" && url.pathname === "/api/admin/ai/auto-fill") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;
    const body = await readBody(request, 15 * 1024 * 1024).catch(() => ({}));
    const imageUrl = String(body.imageUrl || "").trim();
    const currentTitle = String(body.currentTitle || "").trim();

    if (!imageUrl && !currentTitle) {
      sendJson(response, 400, { error: "Please provide an image URL or a topic title to analyze." });
      return true;
    }

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      sendJson(response, 400, {
        error: "Google Gemini API key is not configured yet. Please configure your free Gemini key in Admin Settings.",
        needsKey: true
      });
      return true;
    }

    try {
      let inlineData = null;
      if (imageUrl) {
        if (imageUrl.startsWith("data:")) {
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            inlineData = {
              mime_type: match[1],
              data: match[2].replace(/[\r\n\s]/g, "")
            };
          }
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          const imgFetch = await fetch(imageUrl);
          if (imgFetch.ok) {
            const mimeType = (imgFetch.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
            const arrayBuf = await imgFetch.arrayBuffer();
            inlineData = {
              mime_type: mimeType,
              data: Buffer.from(arrayBuf).toString("base64")
            };
          }
        }
      }

      const promptText = `You are an expert educator and curriculum specialist for Indian Government Examinations (UPSC Civil Services, SSC CGL, State PSCs, Banking, Railways, Defense).
Analyze the provided study note diagram / topic.
${currentTitle ? `Draft topic context: "${currentTitle}".` : ""}

Generate an accurate, structured JSON object tailored for Indian government exam aspirants:
1. "title": A crisp, high-impact topic title (maximum 75 characters) that accurately summarizes this revision note.
2. "subject": Choose exactly ONE subject that best matches from this list: ["History", "Polity", "Economy", "Geography", "Art and Culture", "Maths", "Science", "Others"].
3. "tags": An array of 4 to 7 high-yield search tags (e.g. ["UPSC", "Prelims", "Fundamental Rights", "Article 19", "Polity"]). Do not include hash (#) in the tag strings.
4. "overview": A comprehensive, well-structured revision overview formatted with clean HTML or bullet points (•). Include:
   • Core concept / historical background
   • Key articles, dates, formulas, or constitutional provisions shown in the diagram
   • High-yield exam memory points & tips
   Keep the overview thorough, clear, and under 1600 characters.

Return ONLY a valid JSON object matching this schema:
{
  "title": string,
  "subject": string,
  "tags": string[],
  "overview": string
}`;

      const contentsParts = [{ text: promptText }];
      if (inlineData) {
        contentsParts.push({ inline_data: inlineData });
      }

      const geminiResult = await callGeminiGenerateContent(apiKey, {
        contents: [{ parts: contentsParts }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      });

      if (!geminiResult.ok) {
        sendJson(response, 400, { error: geminiResult.error });
        return true;
      }

      const geminiData = geminiResult.data;

      const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      let parsed = {};
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      const finalSubject = normalizeExamSubject(parsed.subject);
      const finalTitle = String(parsed.title || currentTitle || "Revision Note").slice(0, 80);
      const finalTags = Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).replace(/^#/, "").trim()).filter(Boolean) : [];
      const finalOverview = String(parsed.overview || "").slice(0, 2000);

      sendJson(response, 200, {
        success: true,
        data: {
          title: finalTitle,
          subject: finalSubject,
          category: finalSubject,
          tags: finalTags,
          overview: finalOverview
        }
      });
    } catch (err) {
      sendJson(response, 500, { error: err.message || "Failed to analyze diagram with Gemini AI." });
    }
    return true;
  }

  // ==========================================
  // Public Secure Image Download Proxy (/api/proxy-image)
  // Conceals Cloudinary URLs and guarantees same-origin canvas watermarking
  // ==========================================
  if (request.method === "GET" && url.pathname === "/api/proxy-image") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      sendJson(response, 400, { error: "Invalid or missing url parameter" });
      return true;
    }
    try {
      const imgRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!imgRes.ok) {
        sendJson(response, imgRes.status, { error: "Failed to fetch image upstream" });
        return true;
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const buffer = await imgRes.arrayBuffer();

      response.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable"
      });
      response.end(Buffer.from(buffer));
      return true;
    } catch (err) {
      sendJson(response, 500, { error: err.message || "Proxy image failed" });
      return true;
    }
  }

  // ==========================================
  // Public AI Study Assistant API (/api/ai/chat)
  // 100% Free & Unlimited Study Q&A, Mnemonics & Exam Insights
  // ==========================================
  function generateSmartFallbackAnswer(title, subject, overviewHtml, action, query) {
    const cleanText = (overviewHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const sentences = cleanText.split(/([.!?;:\n।]+)/).filter(s => s.trim().length > 15);
    const topSentences = sentences.slice(0, 5).map(s => s.trim());

    if (action === "explain_simple") {
      return `### 💡 Simple Explanation: ${title || "Core Concepts"}\n\n` +
        `**Key Idea:** This topic belongs to **${subject || "General Studies"}** and is frequently tested in competitive government exams.\n\n` +
        (topSentences.length > 0 
          ? `In essence:\n` + topSentences.slice(0, 3).map(s => `• ${s}`).join("\n") 
          : `• Focus on the timeline, major stakeholders, and constitutional/economic implications.`);
    }

    if (action === "mnemonic") {
      const words = (title || "EXAM").split(/\s+/).filter(w => w.length > 2);
      const acronym = words.map(w => w[0].toUpperCase()).join("");
      return `### 🧠 Memory Mnemonic Trick\n\n` +
        `**Acronym:** \`${acronym || "CORE"}\`\n\n` +
        (topSentences.slice(0, 4).map((s, i) => `• **${(acronym[i] || "•")}** — ${s.slice(0, 80)}...`).join("\n") ||
        `• Associate key events with their chronological dates and cause-effect triggers.`);
    }

    if (action === "exam_questions") {
      return `### 🎯 Probable Exam MCQs (${subject || "General Studies"})\n\n` +
        `**Q1. Which of the following is most centrally associated with "${title}"?**\n` +
        `• (A) ${topSentences[0]?.slice(0, 60) || "Primary historical cause"}\n` +
        `• (B) Secondary economic shift\n` +
        `• (C) Administrative reorganization\n` +
        `• (D) None of the above\n` +
        `*Answer:* **(A)** — ${topSentences[0]?.slice(0, 90) || "Directly confirmed in study notes."}\n\n` +
        `**Q2. In which exam paper does this topic carry maximum weightage?**\n` +
        `• GS Paper 1 / General Awareness & Revision Syllabus.`;
    }

    if (action === "key_takeaways") {
      return `### 📝 Key Exam Takeaways\n\n` +
        (topSentences.length > 0 
          ? topSentences.map(s => `• **High-Yield:** ${s}`).join("\n") 
          : `• Review the visual diagram for rapid chronological memorization.`);
    }

    return `### 🤖 Study Assistant Answer\n\n` +
      `Regarding **"${query}"** in the context of **${title}**:\n\n` +
      (topSentences.slice(0, 2).map(s => `• ${s}`).join("\n") ||
      `• Refer to the high-yield diagram above for exact exam terminology and concept flow.`);
  }

  if (request.method === "POST" && url.pathname === "/api/ai/chat") {
    const body = await readBody(request).catch(() => ({}));
    const noteTitle = String(body.noteTitle || "").trim();
    const noteSubject = String(body.noteSubject || "").trim();
    const noteOverview = String(body.noteOverview || "").trim();
    const userQuery = String(body.userQuery || body.prompt || "").trim();
    const quickAction = String(body.quickAction || "").trim();

    if (!userQuery && !quickAction) {
      sendJson(response, 400, { error: "userQuery or quickAction is required" });
      return true;
    }

    const cacheKey = `${noteTitle}:${noteSubject}:${quickAction}:${userQuery}`.toLowerCase().slice(0, 300);
    if (globalThis.__AI_CHAT_CACHE && globalThis.__AI_CHAT_CACHE.has(cacheKey)) {
      const cachedAnswer = globalThis.__AI_CHAT_CACHE.get(cacheKey);
      sendJson(response, 200, {
        answer: cachedAnswer,
        provider: "cloud-cache",
        cached: true
      });
      return true;
    }

    const apiKey = await getGeminiApiKey();

    let taskInstruction = "";
    if (quickAction === "explain_simple") {
      taskInstruction = "Explain this topic in very simple, easy-to-understand terms suitable for a beginner preparing for competitive exams (UPSC, SSC CGL, State PSC). Use an analogy if helpful and keep it under 3 short paragraphs.";
    } else if (quickAction === "mnemonic") {
      taskInstruction = "Provide 1-2 clever, memorable mnemonics / memory tricks (acronym or catchy phrase) to easily remember the core facts, dates, or points of this topic during exams.";
    } else if (quickAction === "exam_questions") {
      taskInstruction = "Formulate 2-3 high-probability Multiple Choice Questions (MCQs) or exam questions directly based on this note for exams like UPSC, SSC, or State PSC. Include the correct answer and a 1-line explanation for each.";
    } else if (quickAction === "key_takeaways") {
      taskInstruction = "Summarize the 4-5 most critical exam takeaways, key dates, articles, or formulas in concise bullet points with bold keywords.";
    } else {
      taskInstruction = `Answer the student's question accurately and helpfully in the context of this study topic: "${userQuery}"`;
    }

    const prompt = `You are an expert AI Study Assistant for competitive government exam aspirants (UPSC, SSC CGL, State PSC, Banking, Railways).
Current Study Note:
- Title: ${noteTitle || "General Study Topic"}
- Subject: ${noteSubject || "General Studies"}
- Note Content / Overview:
${(noteOverview || "").replace(/<[^>]+>/g, " ").slice(0, 3000)}

Task:
${taskInstruction}

Guidelines:
- Keep the response structured, clear, and easy to read on mobile screens.
- Use markdown formatting: bold key terms, bullet points, and clean section headers.
- Keep tone encouraging, educational, and exam-focused.`;

    try {
      if (apiKey) {
        const geminiResult = await callGeminiGenerateContent(apiKey, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000
          }
        });

        if (geminiResult.ok) {
          const answer = geminiResult.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (answer) {
            if (!globalThis.__AI_CHAT_CACHE) globalThis.__AI_CHAT_CACHE = new Map();
            if (globalThis.__AI_CHAT_CACHE.size > 200) {
              const firstKey = globalThis.__AI_CHAT_CACHE.keys().next().value;
              globalThis.__AI_CHAT_CACHE.delete(firstKey);
            }
            globalThis.__AI_CHAT_CACHE.set(cacheKey, answer);

            sendJson(response, 200, {
              answer,
              provider: "gemini-cloud",
              model: geminiResult.model
            });
            return true;
          }
        }
      }

      const fallbackAnswer = generateSmartFallbackAnswer(noteTitle, noteSubject, noteOverview, quickAction, userQuery);
      if (!globalThis.__AI_CHAT_CACHE) globalThis.__AI_CHAT_CACHE = new Map();
      if (globalThis.__AI_CHAT_CACHE.size > 200) {
        const firstKey = globalThis.__AI_CHAT_CACHE.keys().next().value;
        globalThis.__AI_CHAT_CACHE.delete(firstKey);
      }
      globalThis.__AI_CHAT_CACHE.set(cacheKey, fallbackAnswer);

      sendJson(response, 200, {
        answer: fallbackAnswer,
        provider: "smart-fallback"
      });
      return true;
    } catch (err) {
      const fallbackAnswer = generateSmartFallbackAnswer(noteTitle, noteSubject, noteOverview, quickAction, userQuery);
      if (!globalThis.__AI_CHAT_CACHE) globalThis.__AI_CHAT_CACHE = new Map();
      globalThis.__AI_CHAT_CACHE.set(cacheKey, fallbackAnswer);
      sendJson(response, 200, {
        answer: fallbackAnswer,
        provider: "smart-fallback"
      });
      return true;
    }
  }

  // ==========================================
  // Admin Student Users & Analytics APIs
  // ==========================================
  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    let rawUsers = await readJson(USERS_FILE).catch(() => []);
    // Deduplicate by email/googleId/id so duplicate rows never appear in admin table
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
        
        // Merge likes & bookmarks accurately
        const existingLikedIds = new Set(getUniqueLikedNoteIds(existing));
        const mergedLikes = Array.isArray(existing.likes) ? [...existing.likes] : [];
        (u.likes || []).forEach(l => {
          const id = typeof l === "object" && l ? l.noteId : l;
          if (id && !existingLikedIds.has(id)) {
            existingLikedIds.add(id);
            mergedLikes.push(typeof l === "object" ? l : { noteId: id, timestamp: u.lastActiveAt || new Date().toISOString() });
          }
        });
        (u.bookmarks || []).forEach(bId => {
          if (bId && !existingLikedIds.has(bId)) {
            existingLikedIds.add(bId);
            mergedLikes.push({ noteId: bId, timestamp: u.lastActiveAt || new Date().toISOString() });
          }
        });
        existing.likes = mergedLikes;
        existing.bookmarks = Array.from(existingLikedIds);
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

      const uniqueLikedIds = getUniqueLikedNoteIds(user).filter(id => notesMap.has(id));
      const likesCount = uniqueLikedIds.length;
      totalBookmarksAcrossUsers += likesCount;

      // Calculate primary subject preference for this user
      const userSubjectCounts = {};
      (user.views || []).forEach(v => {
        const n = notesMap.get(v.noteId);
        if (n && n.subject) userSubjectCounts[n.subject] = (userSubjectCounts[n.subject] || 0) + 1;
      });
      uniqueLikedIds.forEach(bId => {
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
        likesCount: likesCount,
        sharesCount: (user.shares || []).length,
        viewsCount: (user.views || []).length,
        bookmarksCount: likesCount,
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

    const uniqueLikedIds = getUniqueLikedNoteIds(user).filter(nId => notesMap.has(nId));
    const likedNotes = uniqueLikedIds.map(nId => {
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
    uniqueLikedIds.forEach(id => {
      const note = notesMap.get(id);
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

    // Enrich downloaded notes history
    const downloadedNotes = (user.downloads || []).map(d => {
      const nId = typeof d === "object" && d ? d.noteId : d;
      const note = notesMap.get(nId);
      const ts = typeof d === "object" && d ? d.timestamp : null;
      return {
        id: nId,
        noteId: nId,
        title: note ? note.title : "Visual Revision Note",
        subject: note ? note.subject : "General",
        imageUrl: note ? note.imageUrl : null,
        timestamp: ts
      };
    }).reverse();

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
        downloadedNotes,
        recentViews,
        likesCount: uniqueLikedIds.length,
        bookmarksCount: uniqueLikedIds.length,
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
  // Public Quick Study Experience Rating (No auth required, 1 rating per session)
  // ==========================================
  if (request.method === "POST" && url.pathname === "/api/experience-rating") {
    const body = await readBody(request).catch(() => ({}));
    const rating = Math.min(5, Math.max(1, parseInt(body.rating) || 5));

    const emojiLabels = {
      1: "😞 Poor (1/5)",
      2: "😐 Fair (2/5)",
      3: "🙂 Good (3/5)",
      4: "😊 Satisfied (4/5)",
      5: "🤩 Very Satisfied (5/5)"
    };

    const studentUser = await getStudentUser(request).catch(() => null);
    const name = studentUser ? (studentUser.name || "Aspirant") : "Study Aspirant";
    const email = studentUser ? (studentUser.email || "") : "";
    const userId = studentUser ? (studentUser.id || "") : "";
    const targetExam = studentUser ? (studentUser.targetExam || "") : "";

    const newRatingItem = {
      id: "fb_exp_" + crypto.randomBytes(6).toString("hex"),
      userId,
      name,
      email,
      rating,
      category: "general",
      targetExam,
      message: `Quick Study Experience Rating: ${emojiLabels[rating] || (rating + "/5")}`,
      quickTags: ["ExperienceRating"],
      createdAt: new Date().toISOString(),
      status: "reviewed",
      starred: false,
      source: "study_experience_pulse"
    };

    let feedbackList = await readJson(FEEDBACK_FILE).catch(() => []);
    if (!Array.isArray(feedbackList)) feedbackList = [];
    feedbackList.unshift(newRatingItem);
    await writeJson(FEEDBACK_FILE, feedbackList);

    // Also update interactions telemetry
    let interactions = await readJson(INTERACTIONS_FILE).catch(() => ({}));
    if (!interactions.experienceRatings) {
      interactions.experienceRatings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 };
    }
    interactions.experienceRatings[rating] = (interactions.experienceRatings[rating] || 0) + 1;
    interactions.experienceRatings.total = (interactions.experienceRatings.total || 0) + 1;
    await writeJson(INTERACTIONS_FILE, interactions).catch(() => {});

    sendJson(response, 200, {
      success: true,
      message: "Thank you for your rating!",
      rating
    });
    return true;
  }

  // ==========================================
  // Student Feedback & Suggestions API
  // ==========================================
  if (request.method === "POST" && url.pathname === "/api/feedback") {
    const studentUser = await getStudentUser(request);
    if (!studentUser) {
      sendJson(response, 401, {
        error: "Google authentication required to submit feedback. Please sign in with your Google account.",
        requiresAuth: true
      });
      return true;
    }

    const body = await readBody(request).catch(() => ({}));
    const message = String(body.message || "").trim();
    const targetExam = String(body.targetExam || studentUser.targetExam || "").trim().slice(0, 80);
    const category = String(body.category || "").trim();

    // Mandatory Category Validation
    const validCategories = ["topic_request", "ui_design", "bug_report", "general"];
    if (!category || !validCategories.includes(category)) {
      sendJson(response, 400, { error: "Please select a suggestion category (mandatory field)." });
      return true;
    }

    // Mandatory Target Exam Validation
    if (!targetExam) {
      sendJson(response, 400, { error: "Target Exam is mandatory. Please select your target examination." });
      return true;
    }

    // Mandatory Suggestion Message Validation
    if (!message || message.length < 5) {
      sendJson(response, 400, { error: "Suggestion or feedback message is mandatory (at least 5 characters)." });
      return true;
    }

    const rating = Math.min(5, Math.max(1, parseInt(body.rating) || 5));
    const name = String(studentUser.name || "Aspirant").trim().slice(0, 80);
    const email = String(studentUser.email || "").trim().slice(0, 100);
    const userId = studentUser.id || "";
    const quickTags = Array.isArray(body.quickTags)
      ? body.quickTags.map(t => String(t).trim()).filter(Boolean).slice(0, 10)
      : [];

    const newFeedback = {
      id: "fb_" + crypto.randomBytes(6).toString("hex"),
      userId,
      name,
      email,
      rating,
      category,
      targetExam,
      message: message.slice(0, 2500),
      quickTags,
      createdAt: new Date().toISOString(),
      status: "unread",
      starred: false
    };

    let feedbackList = await readJson(FEEDBACK_FILE).catch(() => []);
    if (!Array.isArray(feedbackList)) feedbackList = [];
    feedbackList.unshift(newFeedback);
    await writeJson(FEEDBACK_FILE, feedbackList);

    sendJson(response, 201, {
      success: true,
      message: "Thank you for your valuable suggestion! We will review it shortly.",
      feedback: newFeedback
    });
    return true;
  }

  // Admin Get Feedback & Analytics Hub
  if (request.method === "GET" && url.pathname === "/api/admin/feedback") {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    let feedbackList = await readJson(FEEDBACK_FILE).catch(() => []);
    if (!Array.isArray(feedbackList)) feedbackList = [];

    // Calculate Analytics
    const totalCount = feedbackList.length;
    let unreadCount = 0;
    let starredCount = 0;
    let totalRatingSum = 0;

    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const categoryCounts = {
      topic_request: 0,
      feature_idea: 0,
      ui_design: 0,
      bug_report: 0,
      general: 0
    };
    const examCounts = {};

    feedbackList.forEach(fb => {
      if (fb.status === "unread") unreadCount++;
      if (fb.starred) starredCount++;

      const r = Math.min(5, Math.max(1, parseInt(fb.rating) || 5));
      ratingCounts[r] = (ratingCounts[r] || 0) + 1;
      totalRatingSum += r;

      const cat = fb.category || "general";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      if (fb.targetExam) {
        examCounts[fb.targetExam] = (examCounts[fb.targetExam] || 0) + 1;
      }
    });

    // Compute Top Content Demand Name
    const topicRequests = feedbackList.filter(f => f.category === "topic_request");
    const demandMap = {};
    topicRequests.forEach(f => {
      const key = (f.targetExam || f.message || "").trim();
      if (key) demandMap[key] = (demandMap[key] || 0) + 1;
    });

    let topContentDemand = "None Yet";
    let topDemandCount = 0;

    for (const [key, count] of Object.entries(demandMap)) {
      if (count > topDemandCount) {
        topDemandCount = count;
        topContentDemand = key;
      }
    }

    if (topContentDemand === "None Yet" && Object.keys(examCounts).length > 0) {
      for (const [exam, count] of Object.entries(examCounts)) {
        if (count > topDemandCount) {
          topDemandCount = count;
          topContentDemand = exam;
        }
      }
    }

    const avgRating = totalCount > 0 ? (totalRatingSum / totalCount).toFixed(1) : "0.0";

    sendJson(response, 200, {
      success: true,
      feedback: feedbackList,
      metrics: {
        totalCount,
        unreadCount,
        starredCount,
        avgRating,
        ratingCounts,
        categoryCounts,
        examCounts,
        topContentDemand,
        topDemandCount,
        topicDemandsCount: categoryCounts.topic_request || 0,
        uiDesignCount: categoryCounts.ui_design || 0,
        bugReportsCount: categoryCounts.bug_report || 0,
        featureIdeasCount: categoryCounts.feature_idea || 0
      }
    });
    return true;
  }

  // Admin Update Feedback Status (Mark Read/Unread, Star/Unstar)
  if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/feedback/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const feedbackId = url.pathname.split("/").pop();
    const body = await readBody(request).catch(() => ({}));

    let feedbackList = await readJson(FEEDBACK_FILE).catch(() => []);
    const item = feedbackList.find(f => f.id === feedbackId);

    if (!item) {
      sendJson(response, 404, { error: "Feedback item not found." });
      return true;
    }

    if (body.status !== undefined) {
      item.status = body.status === "read" || body.status === "reviewed" ? "reviewed" : "unread";
    }
    if (body.starred !== undefined) {
      item.starred = Boolean(body.starred);
    }

    await writeJson(FEEDBACK_FILE, feedbackList);
    sendJson(response, 200, { success: true, feedback: item });
    return true;
  }

  // Admin Delete Feedback Item
  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/feedback/")) {
    if (!isAdmin(request)) return sendUnauthorized(response), true;

    const feedbackId = url.pathname.split("/").pop();
    let feedbackList = await readJson(FEEDBACK_FILE).catch(() => []);
    const initialLen = feedbackList.length;
    feedbackList = feedbackList.filter(f => f.id !== feedbackId);

    if (feedbackList.length === initialLen) {
      sendJson(response, 404, { error: "Feedback item not found." });
      return true;
    }

    await writeJson(FEEDBACK_FILE, feedbackList);
    sendJson(response, 200, { success: true, deleted: true });
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
      feedback: await readJson(FEEDBACK_FILE).catch(() => []),
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

    // 5. Restore Student Feedback & Suggestions
    if (Array.isArray(backup.feedback)) {
      await writeJson(FEEDBACK_FILE, backup.feedback);
    }

    // 6. Restore Profile & Brand Identity
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

    // 1. Wipe global visits & traffic logs
    await writeJson(VISITS_FILE, { count: 0, daily: {} });

    // 2. Wipe global interactions, search query telemetry & study experience ratings
    await writeJson(INTERACTIONS_FILE, {
      totalLikes: 0,
      totalDownloads: 0,
      totalShares: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      shares: {},
      searches: {},
      missingSearches: {},
      experienceRatings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 }
    });

    // 3. Clear each registered student's interactions (likes, bookmarks, history, telemetry),
    // while STRICTLY PRESERVING student accounts, profiles, emails, and exam targets
    let users = await readJson(USERS_FILE).catch(() => []);
    if (Array.isArray(users)) {
      const sanitizedUsers = users.map(u => ({
        ...u,
        likes: [],
        bookmarks: [],
        shares: [],
        views: [],
        downloads: [],
        searches: [],
        history: [],
        activity: []
      }));
      await writeJson(USERS_FILE, sanitizedUsers);
    }

    // 4. Wipe active temporary student sessions
    await writeJson(SESSIONS_FILE, []);
    studentSessions.clear();

    // 5. Completely wipe entire Feedback and Ideas & Study Experience Ratings
    await writeJson(FEEDBACK_FILE, []);
    if (mongoDb) {
      await mongoDb.collection("feedback").deleteMany({}).catch(() => {});
    }

    sendJson(response, 200, {
      reset: true,
      message: "Visitor traffic logs, search queries, interaction telemetry, entire feedback & ideas, and user interaction histories cleared successfully. Admin profile, published notes, and registered student accounts are safely preserved."
    }, {
      "Set-Cookie": `examAdminSession=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
    });
    return true;
  }

  return false;
}

const staticMemoryCache = new Map();

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
    const isVersioned = Boolean(request.url && request.url.includes("?v="));
    
    let cacheControl = "no-cache, must-revalidate";
    if (isPublicUpload || isPublicAsset || isVersioned) {
      cacheControl = "public, max-age=31536000, immutable";
    } else if (!requestedPath.endsWith(".html")) {
      cacheControl = "public, max-age=3600, stale-while-revalidate=86400";
    }

    // Check conditional ETag for instant 304 Not Modified
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, {
        "ETag": etag,
        "Cache-Control": cacheControl,
        "Vary": "Accept-Encoding"
      });
      response.end();
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const isCompressible = /^(text\/|application\/javascript|application\/json|image\/svg\+xml)/.test(contentType);
    const acceptEncoding = request.headers["accept-encoding"] || "";
    const canGzip = isCompressible && /\bgzip\b/i.test(acceptEncoding);

    const cacheKey = `${filePath}:${canGzip ? "gzip" : "raw"}`;
    let cached = staticMemoryCache.get(cacheKey);

    if (!cached || cached.mtimeMs !== stats.mtimeMs) {
      const rawContent = await fs.readFile(filePath);
      let contentToSend = rawContent;
      let isGzipped = false;

      if (canGzip && rawContent.length > 512) {
        try {
          contentToSend = zlib.gzipSync(rawContent, { level: 6 });
          isGzipped = true;
        } catch {
          contentToSend = rawContent;
          isGzipped = false;
        }
      }

      cached = {
        mtimeMs: stats.mtimeMs,
        etag,
        content: contentToSend,
        isGzipped
      };
      staticMemoryCache.set(cacheKey, cached);
    }

    const headers = {
      "Content-Type": contentType,
      "ETag": etag,
      "Cache-Control": cacheControl,
      "Vary": "Accept-Encoding"
    };

    if (cached.isGzipped) {
      headers["Content-Encoding"] = "gzip";
    }

    response.writeHead(200, headers);
    response.end(cached.content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function start() {
  await ensureStorage();
  const server = http.createServer(async (request, response) => {
    response.req = request;
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
