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

function readBody(request, limit = 7 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request is too large."));
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

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/visits") {
    const visits = await readJson(VISITS_FILE);
    const cookies = parseCookies(request);
    const headers = {};
    if (!cookies.examVisitor) {
      visits.count += 1;
      await writeJson(VISITS_FILE, visits);
      headers["Set-Cookie"] = `examVisitor=${crypto.randomUUID()}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
    sendJson(response, 200, visits, headers);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/notes") {
    sendJson(response, 200, { notes: await readJson(NOTES_FILE) });
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
    const imageMatch = String(body.imageData || "").match(/^data:image\/jpeg;base64,([a-zA-Z0-9+/=]+)$/);
    if (!title || !subject || !imageMatch) {
      sendJson(response, 400, { error: "A title, subject, and JPG image are required." });
      return true;
    }
    const image = Buffer.from(imageMatch[1], "base64");
    if (image.length > 5 * 1024 * 1024 || image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
      sendJson(response, 400, { error: "The uploaded file must be a JPG image under 5 MB." });
      return true;
    }
    const id = crypto.randomUUID();
    const fileName = `${id}.jpg`;
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), image);
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
      const imageMatch = String(body.imageData).match(/^data:image\/jpeg;base64,([a-zA-Z0-9+/=]+)$/);
      if (imageMatch) {
        const image = Buffer.from(imageMatch[1], "base64");
        if (image.length <= 5 * 1024 * 1024 && image.length >= 4 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
          const fileName = note.imageUrl ? path.basename(note.imageUrl) : `${id}.jpg`;
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), image);
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

  return false;
}

async function serveStatic(response, pathname) {
  const allowedPublicFiles = new Set([
    "/",
    "/index.html",
    "/admin.html",
    "/styles.css",
    "/app.js",
    "/admin.js",
    "/assets/ailogo.png",
    "/assets/admin.jpg"
  ]);
  const isPublicUpload = /^\/uploads\/[0-9a-f-]+\.jpg$/i.test(pathname);
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
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
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
      await serveStatic(response, url.pathname);
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
