/**
 * Admin Portal JavaScript Logic
 * Supports: Authentication, Drag-and-Drop Live Preview, Note Uploads with Multiple Tags (#Tags),
 * Note Editing (Title, Category, Tags & Image Replacement), Notes Management Table with Delete for All Notes,
 * Real-time Metrics, and Toast Alerts.
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let sampleNotes = [];
let allNotes = [];

let selectedImageData = null;
let selectedImageUrl = null;
let editImageData = null;
let isLocalClientMode = false;

// ==========================================
// 1. Helpers & Toast Notifications
// ==========================================
const escapeHtml = v => {
  const e = document.createElement("div");
  e.textContent = v || "";
  return e.innerHTML;
};

function safeSetLocalStorage(key, val) {
  try {
    const stringified = typeof val === "string" ? val : JSON.stringify(val);
    localStorage.setItem(key, stringified);
  } catch (err) {
    console.warn(`[Storage] Quota exceeded on key "${key}", applying quota recovery...`);
    try {
      if (key !== "exam_notes_custom_uploads") localStorage.removeItem("exam_notes_custom_uploads");
      const stringified = typeof val === "string" ? val : JSON.stringify(val);
      localStorage.setItem(key, stringified);
    } catch {}
  }
}

// ==========================================
// IndexedDB Universal Portable Image Store (Unlimited Capacity)
// ==========================================
const ImageStore = {
  dbName: "ExamAlertIndia_ImagesDB",
  storeName: "note_images",
  dbPromise: null,

  getDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
    return this.dbPromise;
  },

  async set(key, dataUrl) {
    if (!key || !dataUrl) return;
    const db = await this.getDB();
    if (!db) return;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put(dataUrl, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  async get(key) {
    if (!key) return null;
    const db = await this.getDB();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(this.storeName, "readonly");
        const req = tx.objectStore(this.storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  async getAll() {
    const db = await this.getDB();
    if (!db) return {};
    return new Promise(resolve => {
      try {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.openCursor();
        const results = {};
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            results[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve({});
      } catch {
        resolve({});
      }
    });
  },

  async clear() {
    const db = await this.getDB();
    if (!db) return;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
};

window.handleAdminNoteImageError = async function(imgEl, noteId, imgUrl) {
  imgEl.onerror = null;
  if (imgUrl && imgUrl.startsWith("/")) {
    const relUrl = imgUrl.replace(/^\/+/, "");
    const testImg = new Image();
    testImg.onload = () => { imgEl.src = relUrl; };
    testImg.onerror = async () => {
      try {
        const cleanName = (imgUrl || "").split("?")[0].replace(/^\/uploads\//, "");
        const stored = await ImageStore.get(imgUrl) || await ImageStore.get(cleanName) || await ImageStore.get(noteId);
        if (stored) {
          imgEl.src = stored;
          return;
        }
      } catch {}
      if (imgEl.parentElement) {
        imgEl.parentElement.innerHTML = `<div class="grid-card-img placeholder" data-preview-id="${noteId}">📖</div>`;
      }
    };
    testImg.src = relUrl;
    return;
  }
  try {
    const cleanName = (imgUrl || "").split("?")[0].replace(/^\/uploads\//, "");
    const stored = await ImageStore.get(imgUrl) || await ImageStore.get(cleanName) || await ImageStore.get(noteId);
    if (stored) {
      imgEl.src = stored;
      return;
    }
  } catch {}
  if (imgEl.parentElement) {
    imgEl.parentElement.innerHTML = `<div class="grid-card-img placeholder" data-preview-id="${noteId}">📖</div>`;
  }
};

function normalizeSubject(subject = "") {
  const s = (subject || "").toLowerCase().trim();
  if (s.includes("art") || s.includes("culture")) return "Art and Culture";
  if (s.includes("math")) return "Maths";
  if (s.includes("science") || s.includes("physics") || s.includes("chem") || s.includes("bio")) return "Science";
  if (s.includes("other") || s.includes("english") || s.includes("grammar") || s.includes("vocab")) return "Others";
  if (s.includes("history")) return "History";
  if (s.includes("polity") || s.includes("constitution")) return "Polity";
  if (s.includes("geography") || s.includes("geo")) return "Geography";
  if (s.includes("econ")) return "Economy";
  return "Others";
}

function animateNumberCounter(el, target, duration = 1200) {
  if (!el) return;
  const targetNum = Number(target) || 0;
  const startNum = 0;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startNum + (targetNum - startNum) * easeOut);
    el.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = targetNum;
    }
  };
  requestAnimationFrame(step);
}

function getSubjectKey(subject = "") {
  const s = (subject || "").toLowerCase();
  if (s.includes("art") || s.includes("culture")) return "art-culture";
  if (s.includes("math")) return "maths";
  if (s.includes("science")) return "science";
  if (s.includes("other") || s.includes("english")) return "others";
  if (s.includes("history")) return "history";
  if (s.includes("polity")) return "polity";
  if (s.includes("geography")) return "geography";
  if (s.includes("economy")) return "economy";
  return "others";
}

function showToast(message, type = "info") {
  const container = $("#toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
  toast.innerHTML = `<span>${icon}</span> <div>${escapeHtml(message)}</div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.25s forwards";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

async function api(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { ...options, signal: options.signal || controller.signal });
    clearTimeout(timeoutId);
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error || "Something went wrong.");
    return v;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ==========================================
// 2. Theme Management
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("exam_notes_theme");
  const theme = savedTheme || "light";
  setTheme(theme, false);

  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    let next = "dark";
    if (current === "light") next = "dark";
    else if (current === "dark") next = "eye-care";
    else next = "light";

    setTheme(next, true);

    if (next === "eye-care") {
      showToast("Eye Protection Enabled", "info");
    } else if (next === "dark") {
      showToast("🌙 Dark Mode Enabled", "info");
    } else {
      showToast("☀️ Light Mode Enabled", "info");
    }
  });
}

function setTheme(theme, save = true) {
  document.documentElement.setAttribute("data-theme", theme);
  if (save) localStorage.setItem("exam_notes_theme", theme);

  const themeIcon = $(".theme-icon");
  const themeToggle = $("#theme-toggle");

  if (theme === "dark") {
    if (themeIcon) themeIcon.textContent = "🌙";
    if (themeToggle) themeToggle.title = "Current: Dark Mode (Click for Eye Protection Mode 👓)";
  } else if (theme === "eye-care") {
    if (themeIcon) themeIcon.textContent = "👓";
    if (themeToggle) themeToggle.title = "Current: Eye Protection Mode (Click for Light Mode ☀️)";
  } else {
    if (themeIcon) themeIcon.textContent = "☀️";
    if (themeToggle) themeToggle.title = "Current: Light Mode (Click for Dark Mode 🌙)";
  }
}

// ==========================================
// 3. Real-Time Cross-Tab Authentication (Permanent Session Mode)
// ==========================================
let authBroadcastChannel = null;

try {
  if (typeof BroadcastChannel !== "undefined") {
    authBroadcastChannel = new BroadcastChannel("exam_admin_auth_sync_channel");
    authBroadcastChannel.onmessage = (event) => {
      if (event.data?.type === "LOGOUT") {
        executeLogout(false);
        showToast("🔒 Logged out from another tab.", "info");
      } else if (event.data?.type === "LOGIN") {
        checkAuth();
        showToast("✓ Authenticated in another tab. Session synced.", "success");
      }
    };
  }
} catch {}

// Cross-tab storage event listener for broad browser compatibility
window.addEventListener("storage", (e) => {
  if (e.key === "exam_admin_auth_sync_event") {
    try {
      const data = JSON.parse(e.newValue || "{}");
      if (data.action === "logout") {
        executeLogout(false);
        showToast("🔒 Logged out from another tab.", "info");
      } else if (data.action === "login") {
        checkAuth();
        showToast("✓ Authenticated in another tab. Session synced.", "success");
      }
    } catch {}
  }
});

// Auto re-verify session with server whenever tab gains focus or becomes visible
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    verifySessionWithServer();
  }
});

window.addEventListener("focus", () => {
  verifySessionWithServer();
});

async function verifySessionWithServer() {
  const dashSec = $("#admin-dashboard-section");
  if (!dashSec || dashSec.hidden) return; // already in logged-out state

  try {
    const res = await api("/api/admin/me");
    if (!res || !res.admin) {
      executeLogout(false);
      showToast("🔒 Admin session required. Please login.", "info");
    }
  } catch (err) {
    if (!err.message?.includes("Failed to fetch") && window.location.protocol !== "file:") {
      executeLogout(false);
    }
  }
}

async function checkAuth() {
  try {
    const res = await api("/api/admin/me");
    if (res && res.admin) {
      sessionStorage.setItem("exam_admin_local_session", "true");
      showDashboard();
    } else {
      executeLogout(false);
    }
  } catch (err) {
    if (window.location.protocol === "file:" || err.message?.includes("Failed to fetch")) {
      if (sessionStorage.getItem("exam_admin_local_session") === "true") {
        showDashboard();
      } else {
        showLogin();
      }
    } else {
      executeLogout(false);
    }
  }
}

function executeLogout(notifyServer = true) {
  if (notifyServer) {
    api("/api/admin/logout", { method: "POST" }).catch(() => {});
    try {
      localStorage.setItem("exam_admin_auth_sync_event", JSON.stringify({ action: "logout", time: Date.now() }));
      if (authBroadcastChannel) {
        authBroadcastChannel.postMessage({ type: "LOGOUT", time: Date.now() });
      }
    } catch {}
  }
  sessionStorage.removeItem("exam_admin_local_session");
  showLogin();
}

function showLogin() {
  // Close ALL open dialogs first (edit modal, etc.)
  document.querySelectorAll("dialog[open]").forEach(d => {
    try { d.close(); } catch(e) {}
  });

  // Hide sidebar backdrop if open
  const backdrop = $("#admin-sidebar-backdrop");
  if (backdrop) backdrop.classList.remove("active");

  const authContainer = $("#admin-auth-container");
  const authSec = $("#admin-auth-section");
  const dashSec = $("#admin-dashboard-section");
  const logoutBtn = $("#admin-logout-btn");
  const brandLink = $("#admin-brand-link");
  const brandText = $("#admin-brand-text");

  if (brandLink) {
    brandLink.href = "index.html";
    brandLink.title = "Go to Free AI Govt Exam Notes Home";
  }
  if (brandText) {
    brandText.innerHTML = `<strong>Free AI</strong> Govt Exam Notes<small>Smart Notes · Clear Concepts · Better Revision</small>`;
  }

  if (authContainer) {
    authContainer.hidden = false;
    authContainer.removeAttribute("hidden");
    authContainer.style.setProperty("display", "flex", "important");
  }
  if (authSec) {
    authSec.hidden = false;
    authSec.removeAttribute("hidden");
    authSec.style.setProperty("display", "flex", "important");
  }
  if (dashSec) {
    dashSec.hidden = true;
    dashSec.setAttribute("hidden", "");
    dashSec.style.setProperty("display", "none", "important");
  }
  if (logoutBtn) {
    logoutBtn.hidden = true;
    logoutBtn.setAttribute("hidden", "");
    logoutBtn.style.setProperty("display", "none", "important");
  }
  const pwdInput = $("#admin-page-password");
  if (pwdInput) {
    pwdInput.value = "";
  }
  const loginMsg = $("#admin-page-login-msg");
  if (loginMsg) {
    loginMsg.textContent = "";
    loginMsg.className = "form-message";
  }
}


function showDashboard() {
  const pwdInput = $("#admin-page-password");
  if (pwdInput) pwdInput.value = "";
  const authContainer = $("#admin-auth-container");
  const authSec = $("#admin-auth-section");
  const dashSec = $("#admin-dashboard-section");
  const logoutBtn = $("#admin-logout-btn");
  const brandLink = $("#admin-brand-link");
  const brandText = $("#admin-brand-text");

  if (brandLink) {
    brandLink.href = "#dashboard";
    brandLink.title = "Admin Studio Dashboard";
  }
  if (brandText) {
    brandText.innerHTML = `<strong>Admin</strong> Studio<small>Portal · Dashboard & Publishing</small>`;
  }

  // Fully hide login section
  if (authContainer) {
    authContainer.hidden = true;
    authContainer.setAttribute("hidden", "");
    authContainer.style.setProperty("display", "none", "important");
  }
  if (authSec) {
    authSec.hidden = true;
    authSec.setAttribute("hidden", "");
    authSec.style.setProperty("display", "none", "important");
  }

  // Show dashboard — remove inline style so CSS media queries control layout
  // (desktop: display:grid, mobile: display:flex — both defined in styles.css)
  if (dashSec) {
    dashSec.removeAttribute("hidden");
    dashSec.hidden = false;
    dashSec.style.removeProperty("display");
    // Force a reflow so the browser recalculates layout
    void dashSec.offsetHeight;
  }
  if (logoutBtn) {
    logoutBtn.hidden = false;
    logoutBtn.removeAttribute("hidden");
    logoutBtn.style.removeProperty("display");
  }

  // Restore user's current view from URL hash, sessionStorage or localStorage
  const validViews = ["dashboard", "interactions", "users", "feedback", "missing-searches", "publish", "modify", "profile"];
  const hash = window.location.hash.replace(/^#/, "");
  const savedView = sessionStorage.getItem("exam_admin_active_view") || localStorage.getItem("exam_admin_active_view") || "dashboard";
  const targetView = (hash === "analysis" || hash === "tags" ? "dashboard" : (validViews.includes(hash) ? hash : (validViews.includes(savedView) ? savedView : "dashboard")));

  // Switch immediately so page reload renders the exact active view with zero delay
  switchAdminView(targetView, true);

  loadDashboardData().then(() => {
    switchAdminView(targetView, false);
  });
}

// ==========================================
// 4. Data Loading & Metrics
// ==========================================
let liveInteractions = {
  totalLikes: 0,
  totalDownloads: 0,
  totalSearches: 0,
  totalImpressions: 0,
  notes: {},
  searches: {}
};

let adminProfileState = {
  name: "Stephanraj",
  email: "admin@examalertindia.com",
  phone: "+91 98765 43210",
  role: "Super Administrator",
  avatarUrl: "assets/admin.jpg"
};

async function loadAdminProfile() {
  try {
    const res = await api("/api/admin/profile");
    if (res && res.profile) {
      adminProfileState = { ...adminProfileState, ...res.profile };
      localStorage.setItem("exam_admin_profile_data", JSON.stringify(adminProfileState));
    }
  } catch {
    const saved = localStorage.getItem("exam_admin_profile_data");
    if (saved) {
      try {
        adminProfileState = { ...adminProfileState, ...JSON.parse(saved) };
      } catch {}
    }
  }
  applyAdminProfileUI(adminProfileState);
}

function applyAdminProfileUI(profile) {
  if (!profile) return;
  const name = profile.name || "Stephanraj";
  const email = profile.email || "admin@examalertindia.com";
  const phone = profile.phone || "+91 98765 43210";
  const role = profile.role || "Super Administrator";
  const avatar = profile.avatarUrl || "assets/admin.jpg";
  const logo = profile.logoUrl || "assets/ailogo.png";
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "SR";

  // Update Brand Logos & Browser Tab Favicon
  $$(".brand-logo").forEach(el => { el.src = logo; });
  $$(".edit-modal-brand-logo").forEach(el => { el.src = logo; });
  document.querySelectorAll("link[rel*='icon']").forEach(link => {
    link.href = logo;
  });

  // Sidebar profile card
  $$(".portal-user-name").forEach(el => el.textContent = name);
  $$(".portal-user-role").forEach(el => el.textContent = role);
  $$(".portal-avatar-img").forEach(el => {
    el.style.display = "block";
    el.src = avatar;
    if (el.nextElementSibling) el.nextElementSibling.style.display = "none";
  });
  $$(".portal-avatar-fallback").forEach(el => el.textContent = initials);

  // Profile View
  const pName = $(".profile-full-name");
  if (pName) pName.textContent = name;
  const pBadge = $(".profile-master-badge");
  if (pBadge) pBadge.innerHTML = `<span class="sparkle-icon">✦</span> ${escapeHtml(role)} <span class="sparkle-icon">✦</span>`;
  const pBio = $(".profile-bio-text");
  if (pBio && profile.bio) pBio.textContent = profile.bio;
  const dName = $("#profile-display-name");
  if (dName) dName.textContent = name;
  const dEmail = $("#profile-display-email");
  if (dEmail) dEmail.textContent = email;
  const dPhone = $("#profile-display-phone");
  if (dPhone) dPhone.textContent = phone;
  const dRole = $("#profile-display-role");
  if (dRole) dRole.textContent = role;
  
  $$(".profile-avatar-large-img").forEach(el => {
    el.style.display = "block";
    el.src = avatar;
    if (el.nextElementSibling) el.nextElementSibling.style.display = "none";
  });
  $$(".profile-avatar-large-fallback").forEach(el => el.textContent = initials);

  // Login Screen identity card
  $$(".admin-name-text").forEach(el => el.textContent = name);
  $$(".identity-avatar-photo").forEach(el => {
    el.style.display = "block";
    el.src = avatar;
    if (el.nextElementSibling) el.nextElementSibling.style.display = "none";
  });
  $$(".identity-avatar-fallback").forEach(el => el.textContent = initials);
}

async function loadDashboardData() {
  loadAdminProfile();
  let uploaded = [];
  let visitsCount = 0;
  let todayVisits = 0;
  let activeUsers = 1;

  try {
    const [notesData, visitsData, interData] = await Promise.all([
      api(`/api/notes?_t=${Date.now()}`).catch(() => fetch(`data/notes.json?_t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []).then(d => ({ notes: Array.isArray(d) ? d : (d.notes || []) })).catch(() => ({ notes: [] }))),
      api("/api/visits").catch(() => ({ count: 0, today: 0 })),
      api("/api/interactions").catch(() => null)
    ]);

    uploaded = notesData?.notes || (Array.isArray(notesData) ? notesData : []) || [];
    activeUsers = (visitsData && visitsData.activeUsers) || (interData && interData.activeUsers) || 1;
    todayVisits = Math.max(Number(visitsData.today) || 0, activeUsers);
    visitsCount = Math.max(Number(visitsData.count) || 0, todayVisits, activeUsers);
    if (interData && interData.totalLikes !== undefined) {
      liveInteractions = interData;
    } else {
      liveInteractions = JSON.parse(localStorage.getItem("exam_notes_interactions_data") || '{"totalLikes":0,"totalDownloads":0,"totalShares":0,"totalSearches":0,"totalImpressions":0,"notes":{},"shares":{},"searches":{}}');
    }
  } catch {
    isLocalClientMode = true;
    uploaded = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
    todayVisits = Number(localStorage.getItem("exam_notes_local_visits_today") || "0");
    visitsCount = Math.max(Number(localStorage.getItem("exam_notes_local_visits") || "0"), todayVisits);
    liveInteractions = JSON.parse(localStorage.getItem("exam_notes_interactions_data") || '{"totalLikes":0,"totalDownloads":0,"totalShares":0,"totalSearches":0,"totalImpressions":0,"notes":{},"shares":{},"searches":{}}');
  }

  const localUploads = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
  const mergedUploaded = [...localUploads.filter(l => !uploaded.some(u => u.id === l.id)), ...uploaded];

  const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
  const activeSamples = sampleNotes.filter(s => !deletedSamples.includes(s.id));

  allNotes = [...mergedUploaded, ...activeSamples].sort((a, b) => getNoteDateValue(b) - getNoteDateValue(a));

  // Update Metrics with smooth Counter Animation & Sidebar Badges
  animateNumberCounter($("#metric-total-notes"), allNotes.length, 1400);
  animateNumberCounter($("#metric-visitors-today"), todayVisits, 1400);
  animateNumberCounter($("#metric-visitors-count"), visitsCount, 1400);
  const dashBadge = $("#dash-notes-badge");
  if (dashBadge) dashBadge.textContent = allNotes.length;
  const analysisBadge = $("#analysis-notes-badge");
  if (analysisBadge) analysisBadge.textContent = allNotes.length > 0 ? "8" : "0";
  
  // Count unique tags for sidebar badge
  const uniqueTagsSet = new Set();
  allNotes.forEach(n => (n.tags || []).forEach(t => {
    const cleaned = (t || "").trim().replace(/^#/, "");
    if (cleaned) uniqueTagsSet.add(cleaned.toLowerCase());
  }));
  const tagsBadge = $("#tags-count-badge");
  if (tagsBadge) tagsBadge.textContent = uniqueTagsSet.size;

  const modBadge = $("#modify-notes-badge");
  if (modBadge) modBadge.textContent = allNotes.length;

  fetchAdminUsersData().then(() => {
    const uBadge = $("#users-nav-badge");
    if (uBadge) uBadge.textContent = (adminUsersData.length || 0).toString();
  });

  fetchAdminFeedback();

  // Calculate Top Category
  const catCountMap = {};
  allNotes.forEach(n => {
    const s = n.subject || "General";
    catCountMap[s] = (catCountMap[s] || 0) + 1;
  });
  let topCat = allNotes.length > 0 ? "Polity" : "None";
  let maxCatCount = 0;
  for (const [k, v] of Object.entries(catCountMap)) {
    if (v > maxCatCount) {
      maxCatCount = v;
      topCat = k;
    }
  }
  const topCatEl = $("#metric-top-category");
  if (topCatEl) topCatEl.textContent = topCat;
  const topCountEl = $("#metric-top-count");
  if (topCountEl) topCountEl.textContent = allNotes.length > 0 ? `${maxCatCount} Notes Published` : "0 Notes Published";

  const missingCount = Object.keys(liveInteractions.missingSearches || {}).length;
  const missingBadge = $("#missing-searches-badge");
  if (missingBadge) {
    missingBadge.textContent = missingCount;
  }

  updateActiveUsersDisplay(activeUsers);

  renderCategoryChart();
  renderAnalysisView();
  renderInteractionsView();
  renderTagsView();
  renderMissingSearchesView();
  renderPublishTagSuggestions("");
  renderRecentNotes();
  renderTable();
}

function updateActiveUsersDisplay(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  const statusText = $("#admin-server-status-text");
  if (statusText) {
    const userLabel = safeCount === 1 ? "1 Active User" : `${safeCount} Active Users`;
    statusText.textContent = `Online · ${userLabel}`;
  }
  const liveEl = $("#metric-live-online-users");
  if (liveEl) {
    liveEl.textContent = `🟢 ${safeCount} Online Now`;
  }
}

function renderRecentNotes() {
  const container = $("#dashboard-recent-notes");
  if (!container) return;
  const recents = allNotes.slice(0, 4);
  if (recents.length === 0) {
    container.innerHTML = `<p class="empty-hint" style="padding: 16px; color: var(--ink-muted); text-align: center;">No notes published yet.</p>`;
    return;
  }
  container.innerHTML = recents.map(n => {
    const subjKey = getSubjectKey(n.subject);
    let dateFormatted = "Recent";
    if (n.createdAt) {
      const d = new Date(n.createdAt);
      if (!isNaN(d.getTime())) {
        dateFormatted = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      }
    } else if (n.date) {
      const d = new Date(n.date);
      if (!isNaN(d.getTime())) {
        dateFormatted = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      } else {
        dateFormatted = n.date;
      }
    }
    const thumb = n.imageUrl 
      ? `<img src="${n.imageUrl}" alt="${escapeHtml(n.title)}" class="recent-note-thumb">`
      : `<div class="recent-note-thumb placeholder">📖</div>`;
    return `
      <div class="recent-note-item" data-preview-id="${n.id}" style="cursor: pointer;" title="Click to preview note">
        <div class="recent-note-left">
          ${thumb}
          <div class="recent-note-info">
            <strong class="recent-note-title">${escapeHtml(n.title)}</strong>
            <div class="recent-note-meta">
              <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
              <span class="recent-note-date">${dateFormatted}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCategoryChart() {
  const chartGraph = $("#category-bar-chart");
  const chartBars = $("#category-chart-bars");
  const chartGrid = $("#category-chart-grid");
  if (!chartGraph && !chartBars && !chartGrid) return;

  const categories = [
    { name: "History", icon: "📜", color: "#d97706", key: "history" },
    { name: "Polity", icon: "⚖️", color: "#2563eb", key: "polity" },
    { name: "Economy", icon: "📈", color: "#059669", key: "economy" },
    { name: "Geography", icon: "🌍", color: "#0891b2", key: "geography" },
    { name: "Art and Culture", icon: "🎨", color: "#7c3aed", key: "art-and-culture" },
    { name: "Maths", icon: "📐", color: "#ea580c", key: "maths" },
    { name: "Science", icon: "🔬", color: "#e11d48", key: "science" },
    { name: "Others", icon: "📁", color: "#0284c7", key: "others" }
  ];

  const total = allNotes.length || 1;
  const counts = {};
  categories.forEach(c => { counts[c.name] = 0; });

  allNotes.forEach(n => {
    if (counts[n.subject] !== undefined) {
      counts[n.subject]++;
    } else {
      const match = categories.find(c => c.name.toLowerCase() === (n.subject || "").toLowerCase());
      if (match) counts[match.name]++;
    }
  });

  const maxCount = Math.max(...Object.values(counts), 1);

  // 1. Visual Vertical Bar Graph with dynamic heights and count labels
  if (chartGraph) {
    chartGraph.innerHTML = categories.map(c => {
      const count = counts[c.name] || 0;
      const heightPct = count === 0 ? 6 : Math.max(14, Math.round((count / maxCount) * 100));
      return `
        <div class="chart-col-item" data-cat-filter="${c.name}" title="${c.name}: ${count} notes (${Math.round((count / total) * 100)}%)">
          <span class="chart-col-val" style="color: ${c.color};">${count}</span>
          <div class="chart-col-bar" style="height: ${heightPct}%; background-color: ${c.color};"></div>
          <span class="chart-col-label">${c.icon} ${c.name}</span>
        </div>
      `;
    }).join("");
  }

  // 2. Proportional Segmented Progress Strip
  if (chartBars) {
    chartBars.innerHTML = categories.map(c => {
      const count = counts[c.name] || 0;
      if (count === 0) return "";
      const pct = ((count / total) * 100).toFixed(1);
      return `<div class="chart-segment" style="width: ${pct}%; background-color: ${c.color};" title="${c.name}: ${count} notes (${pct}%)"></div>`;
    }).join("");
  }

  // 3. Category Cards with counts and progress bars
  if (chartGrid) {
    chartGrid.innerHTML = categories.map(c => {
      const count = counts[c.name] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div class="cat-stat-card" data-cat-filter="${c.name}" title="Click to filter table by ${c.name}">
          <div class="cat-stat-top">
            <span class="cat-stat-icon">${c.icon}</span>
            <span class="cat-stat-name">${c.name}</span>
            <strong class="cat-stat-count" style="color: ${c.color};">${count}</strong>
          </div>
          <div class="cat-stat-bar-track">
            <div class="cat-stat-bar-fill" style="width: ${Math.max(pct, count > 0 ? 8 : 0)}%; background-color: ${c.color};"></div>
          </div>
          <div class="cat-stat-sub">
            <span>${count} ${count === 1 ? 'note' : 'notes'}</span>
            <span>${pct}%</span>
          </div>
        </div>
      `;
    }).join("");
  }
}

// ==========================================
// 4.0 Analysis: Categories Pie Chart & Deep Dive
// ==========================================
function renderAnalysisView() {
  const pieSvg = $("#categories-pie-chart-svg");
  const legendContainer = $("#pie-chart-legend");
  const tableBody = $("#analysis-table-body");
  const totalNotesNum = $("#pie-center-total-num");
  const analysisTotalNotes = $("#analysis-total-notes");
  const analysisTotalCategories = $("#analysis-total-categories");
  const dominantCatEl = $("#analysis-dominant-category");
  const dominantPctEl = $("#analysis-dominant-pct");
  const subjectsBadge = $("#analysis-subjects-badge");

  const categories = [
    { name: "History", icon: "📜", color: "#f59e0b", key: "history" },
    { name: "Polity", icon: "⚖️", color: "#3b82f6", key: "polity" },
    { name: "Economy", icon: "📈", color: "#10b981", key: "economy" },
    { name: "Geography", icon: "🌍", color: "#06b6d4", key: "geography" },
    { name: "Art and Culture", icon: "🎨", color: "#8b5cf6", key: "art-and-culture" },
    { name: "Maths", icon: "📐", color: "#f97316", key: "maths" },
    { name: "Science", icon: "🔬", color: "#ec4899", key: "science" },
    { name: "Others", icon: "📁", color: "#6366f1", key: "others" }
  ];

  const total = allNotes.length || 0;
  const counts = {};
  categories.forEach(c => { counts[c.name] = 0; });

  allNotes.forEach(n => {
    const norm = normalizeSubject(n.subject);
    if (counts[norm] !== undefined) {
      counts[norm]++;
    } else {
      counts["History"]++;
    }
  });

  // Smooth animated counter for center total notes
  if (totalNotesNum) {
    animateNumberCounter(totalNotesNum, total, 1000);
  }
  if (subjectsBadge) subjectsBadge.textContent = total > 0 ? `${categories.length} Categories Active` : "0 Categories Active";

  // Helper functions for bidirectional hover highlighting
  const visualWrap = $(".pie-chart-visual-wrap");
  const highlightCategory = (catName) => {
    if (!catName) return;
    if (visualWrap) visualWrap.classList.add("has-active-hover");
    const slice = pieSvg?.querySelector(`path.pie-slice[data-cat-name="${catName}"]`);
    if (slice) slice.classList.add("highlighted");
    const tableRow = tableBody?.querySelector(`tr[data-subject-row="${catName}"]`);
    if (tableRow) tableRow.classList.add("highlighted");
  };

  const clearHighlight = () => {
    if (visualWrap) visualWrap.classList.remove("has-active-hover");
    pieSvg?.querySelectorAll(".pie-slice.highlighted").forEach(el => el.classList.remove("highlighted"));
    tableBody?.querySelectorAll("tr.highlighted").forEach(el => el.classList.remove("highlighted"));
  };

  // 1. Render Pie / Donut Chart SVG
  if (pieSvg) {
    if (total === 0) {
      pieSvg.innerHTML = `<circle cx="0" cy="0" r="77" fill="none" stroke="var(--border)" stroke-width="26" stroke-dasharray="6 6" opacity="0.6" />`;
    } else {
      const radius = 90;
      const innerRadius = 64; // Donut hole
      let startAngle = -Math.PI / 2; // Start from top 12 o'clock

      let svgHtml = "";
      categories.forEach(c => {
        const count = counts[c.name] || 0;
        if (count === 0) return;

        const sliceAngle = (count / total) * (Math.PI * 2);
        const effectiveAngle = Math.min(sliceAngle, Math.PI * 2 - 0.001);
        const endAngle = startAngle + effectiveAngle;
        const pct = ((count / total) * 100).toFixed(1);

        // Calculate Donut Arc Coordinates
        const x1Outer = (radius * Math.cos(startAngle)).toFixed(3);
        const y1Outer = (radius * Math.sin(startAngle)).toFixed(3);
        const x2Outer = (radius * Math.cos(endAngle)).toFixed(3);
        const y2Outer = (radius * Math.sin(endAngle)).toFixed(3);

        const x1Inner = (innerRadius * Math.cos(startAngle)).toFixed(3);
        const y1Inner = (innerRadius * Math.sin(startAngle)).toFixed(3);
        const x2Inner = (innerRadius * Math.cos(endAngle)).toFixed(3);
        const y2Inner = (innerRadius * Math.sin(endAngle)).toFixed(3);

        const largeArc = effectiveAngle > Math.PI ? 1 : 0;

        // Path for Donut Segment
        const pathData = `
          M ${x1Inner} ${y1Inner}
          L ${x1Outer} ${y1Outer}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
          L ${x2Inner} ${y2Inner}
          A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}
          Z
        `;

        svgHtml += `
          <path class="pie-slice"
                d="${pathData}"
                fill="${c.color}"
                stroke="var(--surface)"
                stroke-width="2.5"
                data-cat-name="${c.name}"
                data-cat-count="${count}"
                data-cat-pct="${pct}"
                tabindex="0"
                role="button"
                aria-label="${c.name}: ${count} notes (${pct}%)"
          >
            <title>${c.icon} ${c.name}: ${count} notes (${pct}%)</title>
          </path>
        `;

        startAngle = endAngle;
      });

      pieSvg.innerHTML = svgHtml;

      // Attach hover & click listeners to slices
      pieSvg.querySelectorAll(".pie-slice").forEach(slice => {
        const cat = slice.dataset.catName;
        slice.addEventListener("mouseenter", () => highlightCategory(cat));
        slice.addEventListener("mouseleave", clearHighlight);
        slice.addEventListener("click", () => {
          const filterSelect = $("#admin-table-filter-subject");
          if (filterSelect) {
            filterSelect.value = cat;
            switchAdminView("modify");
            renderTable();
          }
        });
      });
    }
  }

  // 2. Render Breakdown Table
  if (tableBody) {
    // Sort categories by count descending
    let maxCount = 0;
    categories.forEach(c => {
      const cnt = counts[c.name] || 0;
      if (cnt > maxCount) maxCount = cnt;
    });
    const sortedCategories = [...categories].sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));

    tableBody.innerHTML = sortedCategories.map(c => {
      const count = counts[c.name] || 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
      const isTop = count === maxCount && count > 0;
      const statusBadge = isTop
        ? `<span class="analysis-status-pill dominant">Dominant Top</span>`
        : (count > 0 ? `<span class="analysis-status-pill active">Active (${count})</span>` : `<span class="analysis-status-pill empty">Empty</span>`);

      return `
        <tr data-subject-row="${c.name}" style="cursor: pointer;" title="Click to view ${c.name} notes in Content Library">
          <td>
            <div class="analysis-subject-cell">
              <span class="analysis-cat-icon">${c.icon}</span>
              <strong>${c.name}</strong>
            </div>
          </td>
          <td>
            <span class="analysis-count-val" style="color: ${c.color}; font-weight: 700;">${count}</span> notes
          </td>
          <td>
            <div class="analysis-share-cell">
              <div class="analysis-bar-bg">
                <div class="analysis-bar-fill" style="width: ${Math.max(Number(pct), count > 0 ? 6 : 0)}%; background-color: ${c.color};"></div>
              </div>
              <span class="analysis-pct-text">${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Attach drilldown & hover listeners to table rows
    tableBody.querySelectorAll("tr[data-subject-row]").forEach(row => {
      const subj = row.dataset.subjectRow;
      row.addEventListener("mouseenter", () => highlightCategory(subj));
      row.addEventListener("mouseleave", clearHighlight);
      row.addEventListener("click", () => {
        const filterSelect = $("#admin-table-filter-subject");
        if (filterSelect) {
          filterSelect.value = subj;
          switchAdminView("modify");
          renderTable();
        }
      });
    });
  }
}

// ==========================================
// 4.02 User Interactions: Telemetry, Likes, Downloads & Searches
// ==========================================
let interSortKey = "likes";
let interSortDir = "desc";

function renderTopNotesTable() {
  const topNotesTbody = $("#interactions-top-notes-tbody");
  if (!topNotesTbody) return;

  if (allNotes.length === 0) {
    topNotesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--ink-muted);">No revision notes published yet. Use Publish Studio to publish your first note.</td></tr>`;
    return;
  }

  // Use ACTUAL real-time likes and saves recorded from student interactions
  const notesWithInteractions = allNotes.map((n) => {
    const noteData = liveInteractions.notes?.[n.id] || {};
    const likes = Number(noteData.likes) || 0;
    const saves = Number(noteData.downloads) || 0;
    return {
      note: n,
      likes,
      saves
    };
  });

  // Sort notes according to current interSortKey & interSortDir
  notesWithInteractions.sort((a, b) => {
    const valA = interSortKey === "likes" ? a.likes : a.saves;
    const valB = interSortKey === "likes" ? b.likes : b.saves;
    if (valA === valB) {
      return (b.note.createdAt || "").localeCompare(a.note.createdAt || "");
    }
    return interSortDir === "desc" ? (valB - valA) : (valA - valB);
  });

  // Render top 5 notes
  const topSlice = notesWithInteractions.slice(0, 5);
  topNotesTbody.innerHTML = topSlice.map((item, idx) => {
    const rank = idx + 1;
    const rankClass = rank === 1 ? "top-1" : (rank === 2 ? "top-2" : (rank === 3 ? "top-3" : ""));
    const n = item.note;
    const subjKey = getSubjectKey(n.subject);

    return `
      <tr>
        <td>
          <div class="inter-rank-cell">
            <span class="inter-rank-badge ${rankClass}">#${rank}</span>
            <span class="inter-note-name" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</span>
          </div>
        </td>
        <td>
          <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
        </td>
        <td><strong style="color: #ef4444;">${item.likes.toLocaleString()}</strong></td>
        <td><strong style="color: #10b981;">${item.saves.toLocaleString()}</strong></td>
        <td>
          <button type="button" class="inter-action-btn" data-preview-id="${n.id}" title="Inspect Note Preview">
            👁️ View
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Attach preview click handlers
  topNotesTbody.querySelectorAll("[data-preview-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      openLightbox(btn.dataset.previewId);
    });
  });

  // Update table header UI classes and arrows
  const thLikes = $("#th-sort-likes");
  const thSaves = $("#th-sort-saves");
  const indLikes = $("#sort-ind-likes");
  const indSaves = $("#sort-ind-saves");

  if (thLikes && thSaves) {
    thLikes.classList.toggle("active", interSortKey === "likes");
    thLikes.classList.toggle("asc", interSortKey === "likes" && interSortDir === "asc");
    thSaves.classList.toggle("active", interSortKey === "saves");
    thSaves.classList.toggle("asc", interSortKey === "saves" && interSortDir === "asc");
  }
  if (indLikes) indLikes.textContent = (interSortKey === "likes" && interSortDir === "asc") ? "▲" : "▼";
  if (indSaves) indSaves.textContent = (interSortKey === "saves" && interSortDir === "asc") ? "▲" : "▼";
}

function renderInteractionsView() {
  const likesEl = $("#interaction-total-likes");
  const downloadsEl = $("#interaction-total-downloads");
  const sharesEl = $("#interaction-total-shares");
  const viewsEl = $("#interaction-total-views");
  const interBadge = $("#interactions-badge");

  // Read ACTUAL telemetry values (Active engagements exclude passive views)
  const realLikes = Number(liveInteractions.totalLikes) || 0;
  const realDownloads = Number(liveInteractions.totalDownloads) || 0;
  const realShares = Number(liveInteractions.totalShares) || 0;
  const realViews = Number(liveInteractions.totalImpressions) || 0;

  animateNumberCounter(likesEl, realLikes, 800);
  animateNumberCounter(downloadsEl, realDownloads, 800);
  animateNumberCounter(sharesEl, realShares, 800);
  animateNumberCounter(viewsEl, realViews, 800);

  const totalActiveEngagements = realLikes + realDownloads + realShares;

  if (interBadge) {
    interBadge.textContent = totalActiveEngagements > 999 ? `${(totalActiveEngagements / 1000).toFixed(1)}k` : String(totalActiveEngagements);
  }

  // Update Summary Metrics (Calculated strictly across active engagements, excluding total views)
  const convRateEl = $("#summary-conversion-rate");
  const engRateEl = $("#summary-engagement-rate");
  const sharesAvgEl = $("#summary-avg-shares");
  
  const downloadShare = totalActiveEngagements > 0 ? ((realDownloads / totalActiveEngagements) * 100).toFixed(1) + "%" : "0.0%";
  const likeShare = totalActiveEngagements > 0 ? ((realLikes / totalActiveEngagements) * 100).toFixed(1) + "%" : "0.0%";
  const shareRate = totalActiveEngagements > 0 ? ((realShares / totalActiveEngagements) * 100).toFixed(1) + "%" : "0.0%";

  if (convRateEl) convRateEl.textContent = downloadShare;
  if (engRateEl) engRateEl.textContent = likeShare;
  if (sharesAvgEl) sharesAvgEl.textContent = shareRate;

  // Update Progress Bars & Values (Calculated relative to total active engagements)
  const pctDownloads = $("#pct-val-downloads");
  const pctShares = $("#pct-val-shares");
  const pctLikes = $("#pct-val-likes");

  const barDownloads = $("#bar-fill-downloads");
  const barShares = $("#bar-fill-shares");
  const barLikes = $("#bar-fill-likes");

  const barDownloadsPct = totalActiveEngagements > 0 ? Math.min(100, Math.round((realDownloads / totalActiveEngagements) * 100)) : 0;
  const barSharesPct = totalActiveEngagements > 0 ? Math.min(100, Math.round((realShares / totalActiveEngagements) * 100)) : 0;
  const barLikesPct = totalActiveEngagements > 0 ? Math.min(100, Math.round((realLikes / totalActiveEngagements) * 100)) : 0;

  if (barDownloads) barDownloads.style.width = "0%";
  if (barShares) barShares.style.width = "0%";
  if (barLikes) barLikes.style.width = "0%";

  setTimeout(() => {
    if (barDownloads) barDownloads.style.width = `${barDownloadsPct}%`;
    if (barShares) barShares.style.width = `${barSharesPct}%`;
    if (barLikes) barLikes.style.width = `${barLikesPct}%`;
  }, 50);

  if (pctDownloads) pctDownloads.textContent = `${realDownloads.toLocaleString()} (${barDownloadsPct}%)`;
  if (pctShares) pctShares.textContent = `${realShares.toLocaleString()} (${barSharesPct}%)`;
  if (pctLikes) pctLikes.textContent = `${realLikes.toLocaleString()} (${barLikesPct}%)`;

  // Render Top Notes Table with Sort
  renderTopNotesTable();

  // Wire Sort Column Click Handlers
  const thLikes = $("#th-sort-likes");
  const thSaves = $("#th-sort-saves");

  thLikes?.replaceWith(thLikes.cloneNode(true));
  thSaves?.replaceWith(thSaves.cloneNode(true));

  $("#th-sort-likes")?.addEventListener("click", () => {
    if (interSortKey === "likes") {
      interSortDir = interSortDir === "desc" ? "asc" : "desc";
    } else {
      interSortKey = "likes";
      interSortDir = "desc";
    }
    renderTopNotesTable();
  });

  $("#th-sort-saves")?.addEventListener("click", () => {
    if (interSortKey === "saves") {
      interSortDir = interSortDir === "desc" ? "asc" : "desc";
    } else {
      interSortKey = "saves";
      interSortDir = "desc";
    }
    renderTopNotesTable();
  });

  // Render Top Searches Cloud from actual search telemetry
  const searchCloudContainer = $("#searched-tags-cloud-container");
  if (searchCloudContainer) {
    const rawSearches = liveInteractions.searches || {};
    const searchEntries = Object.entries(rawSearches)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count);

    if (searchEntries.length === 0) {
      searchCloudContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--ink-muted); font-size: 0.82rem; width: 100%;">No student searches executed yet. Searches performed on the Public Portal will appear here.</div>`;
    } else {
      searchCloudContainer.innerHTML = searchEntries.map(item => `
        <button type="button" class="search-tag-bubble" data-search-term="${escapeHtml(item.query)}" title="Filter library by '${escapeHtml(item.query)}' (${item.count} search${item.count > 1 ? 'es' : ''})">
          <span>🔍 ${escapeHtml(item.query)}</span>
          <span class="search-tag-count">${item.count}</span>
        </button>
      `).join("");

      searchCloudContainer.querySelectorAll("[data-search-term]").forEach(btn => {
        btn.addEventListener("click", () => {
          const query = btn.dataset.searchTerm;
          const searchInput = $("#admin-table-search");
          if (searchInput) {
            searchInput.value = query;
          }
          switchAdminView("modify");
          renderTable();
        });
      });
    }
  }
}

// ==========================================
// Generic Helper: Bind Modal Table Sorting, Live Search, and Pagination (10, 20, 50, 100, all)
// ==========================================
function bindModalTableSortingAndSearch({
  dialog,
  searchInputId,
  sortSelectId,
  countBadgeId,
  tableBodyId,
  notesCountBadgeId,
  rowsPerPageSelectId,
  paginationSummaryId,
  paginationPagesId,
  items,
  defaultSortKey = "likes",
  defaultSortDir = "desc",
  metricBadgeLabel = "Notes",
  renderRowHtml
}) {
  let currentSortKey = defaultSortKey;
  let currentSortDir = defaultSortDir;
  let pageSize = 10;
  let currentPage = 1;

  const notesCountBadge = dialog.querySelector(`#${notesCountBadgeId}`);
  if (notesCountBadge) {
    notesCountBadge.textContent = `${items.length} ${metricBadgeLabel}`;
  }

  // Pre-calculate natural ranks based on default primary metric
  const naturalRankingMap = new Map();
  const naturalSorted = [...items].sort((a, b) => {
    const valA = Number(a[defaultSortKey]) || 0;
    const valB = Number(b[defaultSortKey]) || 0;
    return valB - valA;
  });
  naturalSorted.forEach((item, idx) => {
    naturalRankingMap.set(item.note?.id || item.id, idx + 1);
  });

  const getLiveSearchInput = () => dialog.querySelector(`#${searchInputId}`);
  const getLiveSortSelect = () => sortSelectId ? dialog.querySelector(`#${sortSelectId}`) : null;
  const getLiveCountBadge = () => dialog.querySelector(`#${countBadgeId}`);
  const getLiveTableBody = () => dialog.querySelector(`#${tableBodyId}`);
  const getLiveRowsPerPageSelect = () => rowsPerPageSelectId ? dialog.querySelector(`#${rowsPerPageSelectId}`) : null;
  const getLivePaginationSummary = () => paginationSummaryId ? dialog.querySelector(`#${paginationSummaryId}`) : null;
  const getLivePaginationPages = () => paginationPagesId ? dialog.querySelector(`#${paginationPagesId}`) : null;

  const renderTableRows = (list) => {
    const tableBody = getLiveTableBody();
    if (!tableBody) return;
    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="likes-table-empty-row">
            <div class="likes-table-empty">
              <span>🔍</span>
              <p>No study notes matching your query.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list.map((item, idx) => {
      const naturalRank = naturalRankingMap.get(item.note?.id || item.id) || (idx + 1);
      return renderRowHtml(item, naturalRank);
    }).join("");

    tableBody.querySelectorAll("[data-view-note-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        dialog.close();
        openLightbox(btn.dataset.viewNoteId);
      });
    });
  };

  const updatePaginationUI = (totalFiltered) => {
    const summaryEl = getLivePaginationSummary();
    const pagesEl = getLivePaginationPages();
    const isAll = pageSize === "all" || pageSize >= totalFiltered;
    const effectivePageSize = isAll ? totalFiltered : Number(pageSize);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalFiltered / effectivePageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    if (summaryEl) {
      if (totalFiltered === 0) {
        summaryEl.textContent = "Showing 0 notes";
      } else if (isAll) {
        summaryEl.textContent = `Showing all ${totalFiltered} notes`;
      } else {
        const start = (currentPage - 1) * effectivePageSize + 1;
        const end = Math.min(currentPage * effectivePageSize, totalFiltered);
        summaryEl.textContent = `Showing ${start}–${end} of ${totalFiltered} notes`;
      }
    }

    if (!pagesEl) return;

    if (totalPages <= 1) {
      pagesEl.innerHTML = "";
      return;
    }

    let html = `<button type="button" class="page-nav-btn modal-prev-btn" ${currentPage === 1 ? "disabled" : ""} title="Previous Page">‹ Prev</button>`;

    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      html += `<button type="button" class="page-num-btn ${currentPage === 1 ? "active" : ""}" data-modal-page="1">1</button>`;
      if (startPage > 2) html += `<span class="page-dots">…</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      html += `<button type="button" class="page-num-btn ${p === currentPage ? "active" : ""}" data-modal-page="${p}">${p}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="page-dots">…</span>`;
      html += `<button type="button" class="page-num-btn ${currentPage === totalPages ? "active" : ""}" data-modal-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button type="button" class="page-nav-btn modal-next-btn" ${currentPage === totalPages ? "disabled" : ""} title="Next Page">Next ›</button>`;

    pagesEl.innerHTML = html;

    pagesEl.querySelector(".modal-prev-btn")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        applySortAndFilter(false);
      }
    });

    pagesEl.querySelector(".modal-next-btn")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        applySortAndFilter(false);
      }
    });

    pagesEl.querySelectorAll("[data-modal-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = Number(btn.dataset.modalPage);
        if (p && p !== currentPage) {
          currentPage = p;
          applySortAndFilter(false);
        }
      });
    });
  };

  const applySortAndFilter = (resetPage = true) => {
    if (resetPage) currentPage = 1;

    const searchInput = getLiveSearchInput();
    const q = (searchInput?.value || "").trim().toLowerCase();
    let filtered = items;
    if (q) {
      filtered = items.filter(item => {
        const titleMatch = (item.note?.title || "").toLowerCase().includes(q);
        const subjMatch = (item.note?.subject || "").toLowerCase().includes(q);
        const tagMatch = (item.note?.tags || []).some(t => (t || "").toLowerCase().includes(q));
        return titleMatch || subjMatch || tagMatch;
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      let diff = 0;
      if (currentSortKey === "rank") {
        const rankA = naturalRankingMap.get(a.note?.id || a.id) || 0;
        const rankB = naturalRankingMap.get(b.note?.id || b.id) || 0;
        diff = rankA - rankB;
      } else if (currentSortKey === "title") {
        diff = (a.note?.title || "").localeCompare(b.note?.title || "");
      } else if (currentSortKey === "subject") {
        diff = (a.note?.subject || "").localeCompare(b.note?.subject || "");
      } else {
        const numA = Number(a[currentSortKey]) || 0;
        const numB = Number(b[currentSortKey]) || 0;
        diff = numA - numB;
      }
      return currentSortDir === "asc" ? diff : -diff;
    });

    // Update pagination calculations
    const isAll = pageSize === "all";
    const effectivePageSize = isAll ? sorted.length : Number(pageSize);
    const startIdx = isAll ? 0 : (currentPage - 1) * effectivePageSize;
    const endIdx = isAll ? sorted.length : startIdx + effectivePageSize;
    const pageSlice = sorted.slice(startIdx, endIdx);

    renderTableRows(pageSlice);
    updatePaginationUI(sorted.length);

    const countBadge = getLiveCountBadge();
    if (countBadge) {
      if (q) {
        countBadge.textContent = `Showing ${sorted.length} of ${items.length} notes`;
      } else {
        countBadge.textContent = `Showing all ${items.length} notes`;
      }
    }

    // Update Header Sort Arrows & active class
    dialog.querySelectorAll(".likes-th-sortable").forEach(th => {
      const key = th.dataset.sortKey;
      const arrow = th.querySelector(".likes-th-arrow");
      if (key === currentSortKey) {
        th.classList.add("active");
        if (arrow) arrow.textContent = currentSortDir === "asc" ? "↑" : "↓";
      } else {
        th.classList.remove("active");
        if (arrow) arrow.textContent = "↕";
      }
    });

    // Sync Dropdown Select value
    const sortSelect = getLiveSortSelect();
    if (sortSelect) {
      const compositeVal = `${currentSortKey}-${currentSortDir}`;
      if (sortSelect.querySelector(`option[value="${compositeVal}"]`)) {
        sortSelect.value = compositeVal;
      }
    }
  };

  // Wire search input with clone replacement
  const searchInput = getLiveSearchInput();
  if (searchInput) {
    searchInput.value = "";
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.addEventListener("input", () => applySortAndFilter(true));
  }

  // Wire sort dropdown
  const sortSelect = getLiveSortSelect();
  if (sortSelect) {
    const compositeVal = `${defaultSortKey}-${defaultSortDir}`;
    if (sortSelect.querySelector(`option[value="${compositeVal}"]`)) {
      sortSelect.value = compositeVal;
    }
    const newSortSelect = sortSelect.cloneNode(true);
    sortSelect.parentNode.replaceChild(newSortSelect, sortSelect);
    newSortSelect.addEventListener("change", (e) => {
      const parts = (e.target.value || "").split("-");
      if (parts.length === 2) {
        currentSortKey = parts[0];
        currentSortDir = parts[1];
        applySortAndFilter(true);
      }
    });
  }

  // Wire rows per page dropdown
  const rowsSelect = getLiveRowsPerPageSelect();
  if (rowsSelect) {
    rowsSelect.value = "10";
    const newRowsSelect = rowsSelect.cloneNode(true);
    rowsSelect.parentNode.replaceChild(newRowsSelect, rowsSelect);
    newRowsSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      pageSize = val === "all" ? "all" : (Number(val) || 10);
      currentPage = 1;
      applySortAndFilter(true);
    });
  }

  // Wire sortable table header clicks
  dialog.querySelectorAll(".likes-th-sortable").forEach(th => {
    const newTh = th.cloneNode(true);
    th.parentNode.replaceChild(newTh, th);
    newTh.addEventListener("click", () => {
      const key = newTh.dataset.sortKey;
      if (!key) return;
      if (currentSortKey === key) {
        currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
      } else {
        currentSortKey = key;
        currentSortDir = (key === "title" || key === "subject" || key === "rank") ? "asc" : "desc";
      }
      applySortAndFilter(true);
    });
  });

  // Initial render
  applySortAndFilter(true);
}

// ==========================================
// 4.025 Likes & Student Favorites In-Depth Analysis Modal
// ==========================================
function openLikesAnalysisModal() {
  const dialog = $("#likes-analysis-dialog");
  if (!dialog) return;

  const categories = [
    { name: "History", icon: "📜", color: "#d97706", key: "history" },
    { name: "Polity", icon: "⚖️", color: "#2563eb", key: "polity" },
    { name: "Economy", icon: "📈", color: "#059669", key: "economy" },
    { name: "Geography", icon: "🌍", color: "#0891b2", key: "geography" },
    { name: "Art and Culture", icon: "🎨", color: "#7c3aed", key: "art-and-culture" },
    { name: "Maths", icon: "📐", color: "#ea580c", key: "maths" },
    { name: "Science", icon: "🔬", color: "#e11d48", key: "science" },
    { name: "Others", icon: "📁", color: "#0284c7", key: "others" }
  ];

  const totalLikesRaw = Number(liveInteractions.totalLikes) || 0;
  const likesObj = liveInteractions.likes || {};
  const notesObj = liveInteractions.notes || {};

  // Calculate note-by-note likes & category aggregation
  const catLikesMap = {};
  categories.forEach(c => { catLikesMap[c.name] = 0; });
  let uniqueLikedCount = 0;

  const notesWithLikes = allNotes.map(n => {
    const noteData = notesObj[n.id] || {};
    const noteLikes = Number(noteData.likes) || Number(likesObj[n.id]) || 0;
    const noteDownloads = Number(noteData.downloads) || Number((liveInteractions.downloads || {})[n.id]) || 0;
    
    if (noteLikes > 0) uniqueLikedCount++;

    const normSubj = normalizeSubject(n.subject);
    if (catLikesMap[normSubj] !== undefined) {
      catLikesMap[normSubj] += noteLikes;
    } else {
      catLikesMap["History"] += noteLikes;
    }

    return {
      note: n,
      likes: noteLikes,
      downloads: noteDownloads
    };
  });

  const totalLikes = notesWithLikes.reduce((sum, item) => sum + item.likes, 0);

  const totalNotesCount = allNotes.length || 0;
  const adoptionPct = totalNotesCount > 0 ? ((uniqueLikedCount / totalNotesCount) * 100).toFixed(1) : "0.0";
  const avgLikesPerNote = totalNotesCount > 0 ? (totalLikes / totalNotesCount).toFixed(1) : "0.0";

  // Aggregate categories sorted by likes
  const sortedCategories = [...categories]
    .map(c => {
      const count = catLikesMap[c.name] || 0;
      return {
        ...c,
        count,
        pct: totalLikes > 0 ? (((count) / totalLikes) * 100).toFixed(1) : "0.0"
      };
    })
    .sort((a, b) => b.count - a.count);

  const topSubject = sortedCategories[0]?.count > 0 ? sortedCategories[0].name : "None Yet";
  const topSubjectShare = sortedCategories[0]?.count > 0 ? sortedCategories[0].pct : "0.0";

  // 1. Populate Top 4 Key Metric Tiles
  const kpiTotal = $("#likes-kpi-total");
  const kpiUnique = $("#likes-kpi-unique-count");
  const kpiAdoption = $("#likes-kpi-adoption-rate");
  const kpiTopSubj = $("#likes-kpi-top-subject");
  const kpiTopSubjShare = $("#likes-kpi-top-subject-share");
  const kpiAvg = $("#likes-kpi-avg");

  if (kpiTotal) kpiTotal.textContent = totalLikes.toLocaleString();
  if (kpiUnique) kpiUnique.textContent = uniqueLikedCount.toLocaleString();
  if (kpiAdoption) kpiAdoption.textContent = `${adoptionPct}%`;
  if (kpiTopSubj) kpiTopSubj.textContent = topSubject;
  if (kpiTopSubjShare) {
    kpiTopSubjShare.textContent = totalLikes > 0 
      ? `${topSubjectShare}% of total bookmarks` 
      : "No student likes recorded yet";
  }
  if (kpiAvg) kpiAvg.textContent = avgLikesPerNote;

  // 2. Populate Full-Width Subject Preference Breakdown Chart (Dashboard Style)
  const chartGraph = $("#likes-category-bar-chart");
  const chartStrip = $("#likes-segmented-strip");
  const chartGrid = $("#likes-category-stats-grid");
  const subjBadge = $("#likes-subject-count-badge");

  if (subjBadge) {
    subjBadge.textContent = totalLikes > 0 
      ? `8 Subjects Active · ${totalLikes.toLocaleString()} Likes` 
      : `8 Subjects Active · 0 Likes`;
  }

  const maxLikeCount = Math.max(...categories.map(c => catLikesMap[c.name] || 0), 1);

  // A. Vertical Column Bar Chart
  if (chartGraph) {
    chartGraph.innerHTML = categories.map(c => {
      const count = catLikesMap[c.name] || 0;
      const heightPct = count === 0 ? 6 : Math.max(14, Math.round((count / maxLikeCount) * 100));
      const pct = totalLikes > 0 ? Math.round((count / totalLikes) * 100) : 0;
      return `
        <div class="chart-col-item" title="${c.name}: ${count} likes (${pct}%)">
          <span class="chart-col-val" style="color: ${c.color};">${count}</span>
          <div class="chart-col-bar" style="height: ${heightPct}%; background-color: ${c.color};"></div>
          <span class="chart-col-label">${c.icon} ${c.name}</span>
        </div>
      `;
    }).join("");
  }

  // B. Proportional Multi-Segment Progress Strip
  if (chartStrip) {
    if (totalLikes === 0) {
      chartStrip.innerHTML = `<div class="chart-segment" style="width: 100%; background-color: var(--border);" title="No student likes recorded yet"></div>`;
    } else {
      chartStrip.innerHTML = categories.map(c => {
        const count = catLikesMap[c.name] || 0;
        if (count === 0) return "";
        const pct = ((count / totalLikes) * 100).toFixed(1);
        return `<div class="chart-segment" style="width: ${pct}%; background-color: ${c.color};" title="${c.name}: ${count} likes (${pct}%)"></div>`;
      }).join("");
    }
  }

  // C. 8 Category Stats Grid with Click-to-Filter
  if (chartGrid) {
    chartGrid.innerHTML = categories.map(c => {
      const count = catLikesMap[c.name] || 0;
      const pct = totalLikes > 0 ? Math.round((count / totalLikes) * 100) : 0;
      return `
        <div class="cat-stat-card" data-cat-filter="${c.name}" title="Click to filter by ${c.name}" style="cursor: pointer;">
          <div class="cat-stat-top">
            <span class="cat-stat-icon">${c.icon}</span>
            <span class="cat-stat-name">${c.name}</span>
            <strong class="cat-stat-count" style="color: ${c.color};">${count}</strong>
          </div>
          <div class="cat-stat-bar-track">
            <div class="cat-stat-bar-fill" style="width: ${Math.max(pct, count > 0 ? 8 : 0)}%; background-color: ${c.color};"></div>
          </div>
          <div class="cat-stat-sub">
            <span>${count} ${count === 1 ? 'like' : 'likes'}</span>
            <span>${pct}%</span>
          </div>
        </div>
      `;
    }).join("");

    chartGrid.querySelectorAll(".cat-stat-card").forEach(card => {
      card.addEventListener("click", () => {
        const catName = card.dataset.catFilter;
        const searchInput = $("#likes-notes-search");
        if (searchInput && catName) {
          searchInput.value = catName;
          searchInput.dispatchEvent(new Event("input"));
        }
      });
    });
  }

  // 3. Ranked Top Liked Notes Table with Live Search & Pagination
  bindModalTableSortingAndSearch({
    dialog,
    searchInputId: "likes-notes-search",
    countBadgeId: "likes-search-count-badge",
    tableBodyId: "likes-table-body",
    notesCountBadgeId: "likes-notes-count-badge",
    rowsPerPageSelectId: "likes-rows-per-page",
    paginationSummaryId: "likes-pagination-summary",
    paginationPagesId: "likes-pagination-pages",
    items: notesWithLikes,
    defaultSortKey: "likes",
    defaultSortDir: "desc",
    metricBadgeLabel: "Notes Ranked by Likes",
    renderRowHtml: (item, originalRank) => {
      const rankClass = originalRank === 1 ? "top-1" : (originalRank === 2 ? "top-2" : (originalRank === 3 ? "top-3" : ""));
      const n = item.note;
      const subKey = getSubjectKey(n.subject);
      return `
        <tr class="likes-table-row">
          <td style="text-align: center;">
            <div class="likes-rank-badge ${rankClass}">#${originalRank}</div>
          </td>
          <td>
            <div class="likes-table-title-cell">
              <strong class="likes-table-title" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</strong>
              ${n.tags && n.tags.length ? `<span class="likes-table-tags">${escapeHtml(n.tags.slice(0, 2).join(" "))}</span>` : ""}
            </div>
          </td>
          <td>
            <span class="subject-chip ${subKey}">${escapeHtml(n.subject)}</span>
          </td>
          <td style="text-align: center;">
            <strong class="likes-table-num-likes">❤️ ${item.likes.toLocaleString()}</strong>
          </td>
          <td style="text-align: center;">
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id}" title="Inspect Note in Viewer">
              👁️ View
            </button>
          </td>
        </tr>
      `;
    }
  });

  // 4. Dynamic Insight Text
  const insightText = $("#likes-insight-text");
  if (insightText) {
    if (totalLikes > 0 && sortedCategories[0]?.count > 0) {
      insightText.innerHTML = `<strong>${escapeHtml(topSubject)}</strong> is currently your highest-rated student subject (${topSubjectShare}% of total bookmarks). Keep publishing visual flowchart diagrams in <strong>${escapeHtml(topSubject)}</strong> to drive maximum student engagement!`;
    } else {
      insightText.innerHTML = `Encourage students to bookmark high-yield exam diagrams using the heart icon on the public portal. As students interact, personalized subject-level revision recommendations will appear here.`;
    }
  }

  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
}

// ==========================================
// 4.026 Downloads & Export In-Depth Analysis Modal
// ==========================================
function openDownloadsAnalysisModal() {
  const dialog = $("#downloads-analysis-dialog");
  if (!dialog) return;

  const categories = [
    { name: "History", icon: "📜", color: "#d97706", key: "history" },
    { name: "Polity", icon: "⚖️", color: "#2563eb", key: "polity" },
    { name: "Economy", icon: "📈", color: "#059669", key: "economy" },
    { name: "Geography", icon: "🌍", color: "#0891b2", key: "geography" },
    { name: "Art and Culture", icon: "🎨", color: "#7c3aed", key: "art-and-culture" },
    { name: "Maths", icon: "📐", color: "#ea580c", key: "maths" },
    { name: "Science", icon: "🔬", color: "#e11d48", key: "science" },
    { name: "Others", icon: "📁", color: "#0284c7", key: "others" }
  ];

  const totalImpressions = Number(liveInteractions.totalImpressions) || 0;
  const downloadsObj = liveInteractions.downloads || {};
  const notesObj = liveInteractions.notes || {};

  const catDownloadsMap = {};
  categories.forEach(c => { catDownloadsMap[c.name] = 0; });
  let uniqueDownloadedCount = 0;

  const notesWithDownloads = allNotes.map(n => {
    const noteData = notesObj[n.id] || {};
    const noteDownloads = Number(noteData.downloads) || Number(downloadsObj[n.id]) || 0;
    const noteLikes = Number(noteData.likes) || Number((liveInteractions.likes || {})[n.id]) || 0;

    if (noteDownloads > 0) uniqueDownloadedCount++;

    const normSubj = normalizeSubject(n.subject);
    if (catDownloadsMap[normSubj] !== undefined) {
      catDownloadsMap[normSubj] += noteDownloads;
    } else {
      catDownloadsMap["History"] += noteDownloads;
    }

    return {
      note: n,
      downloads: noteDownloads,
      likes: noteLikes
    };
  });

  const totalDownloads = notesWithDownloads.reduce((sum, item) => sum + item.downloads, 0);
  const totalNotesCount = allNotes.length || 0;
  const adoptionPct = totalNotesCount > 0 ? ((uniqueDownloadedCount / totalNotesCount) * 100).toFixed(1) : "0.0";
  const conversionRate = totalImpressions > 0 ? ((totalDownloads / totalImpressions) * 100).toFixed(1) + "%" : "0.0%";

  const sortedCategories = [...categories]
    .map(c => ({
      ...c,
      count: catDownloadsMap[c.name] || 0,
      pct: totalDownloads > 0 ? (((catDownloadsMap[c.name] || 0) / totalDownloads) * 100).toFixed(1) : "0.0"
    }))
    .sort((a, b) => b.count - a.count);

  const topSubject = sortedCategories[0]?.count > 0 ? sortedCategories[0].name : "None Yet";
  const topSubjectShare = sortedCategories[0]?.count > 0 ? sortedCategories[0].pct : "0.0";

  // 1. Populate Top 4 KPI Tiles
  const kpiTotal = $("#downloads-kpi-total");
  const kpiUnique = $("#downloads-kpi-unique-count");
  const kpiAdoption = $("#downloads-kpi-adoption-rate");
  const kpiTopSubj = $("#downloads-kpi-top-subject");
  const kpiTopSubjShare = $("#downloads-kpi-top-subject-share");
  const kpiConversion = $("#downloads-kpi-conversion");

  if (kpiTotal) kpiTotal.textContent = totalDownloads.toLocaleString();
  if (kpiUnique) kpiUnique.textContent = `${uniqueDownloadedCount} / ${totalNotesCount}`;
  if (kpiAdoption) kpiAdoption.textContent = `${adoptionPct}% Library`;
  if (kpiTopSubj) kpiTopSubj.textContent = topSubject;
  if (kpiTopSubjShare) kpiTopSubjShare.textContent = totalDownloads > 0 ? `${topSubjectShare}% of total exports` : "No downloads yet";
  if (kpiConversion) kpiConversion.textContent = conversionRate;

  // 2. Populate Full-Width Subject Export Breakdown Chart (Dashboard Style)
  const chartGraph = $("#downloads-category-bar-chart");
  const chartStrip = $("#downloads-segmented-strip");
  const chartGrid = $("#downloads-category-stats-grid");
  const subjBadge = $("#downloads-subject-count-badge");

  if (subjBadge) subjBadge.textContent = totalDownloads > 0 ? `8 Subjects Active · ${totalDownloads.toLocaleString()} Downloads` : `8 Subjects Active`;

  const maxDownloadCount = Math.max(...categories.map(c => catDownloadsMap[c.name] || 0), 1);

  // A. Vertical Column Bar Chart
  if (chartGraph) {
    chartGraph.innerHTML = categories.map(c => {
      const count = catDownloadsMap[c.name] || 0;
      const heightPct = count === 0 ? 6 : Math.max(14, Math.round((count / maxDownloadCount) * 100));
      const pct = totalDownloads > 0 ? Math.round((count / totalDownloads) * 100) : 0;
      return `
        <div class="chart-col-item" title="${c.name}: ${count} downloads (${pct}%)">
          <span class="chart-col-val" style="color: ${c.color};">${count}</span>
          <div class="chart-col-bar" style="height: ${heightPct}%; background-color: ${c.color};"></div>
          <span class="chart-col-label">${c.icon} ${c.name}</span>
        </div>
      `;
    }).join("");
  }

  // B. Proportional Multi-Segment Progress Strip
  if (chartStrip) {
    if (totalDownloads === 0) {
      chartStrip.innerHTML = `<div class="chart-segment" style="width: 100%; background-color: var(--border);" title="No downloads recorded yet"></div>`;
    } else {
      chartStrip.innerHTML = categories.map(c => {
        const count = catDownloadsMap[c.name] || 0;
        if (count === 0) return "";
        const pct = ((count / totalDownloads) * 100).toFixed(1);
        return `<div class="chart-segment" style="width: ${pct}%; background-color: ${c.color};" title="${c.name}: ${count} downloads (${pct}%)"></div>`;
      }).join("");
    }
  }

  // C. 8 Category Stats Grid
  if (chartGrid) {
    chartGrid.innerHTML = categories.map(c => {
      const count = catDownloadsMap[c.name] || 0;
      const pct = totalDownloads > 0 ? Math.round((count / totalDownloads) * 100) : 0;
      return `
        <div class="cat-stat-card">
          <div class="cat-stat-top">
            <span class="cat-stat-icon">${c.icon}</span>
            <span class="cat-stat-name">${c.name}</span>
            <strong class="cat-stat-count" style="color: ${c.color};">${count}</strong>
          </div>
          <div class="cat-stat-bar-track">
            <div class="cat-stat-bar-fill" style="width: ${Math.max(pct, count > 0 ? 8 : 0)}%; background-color: ${c.color};"></div>
          </div>
          <div class="cat-stat-sub">
            <span>${count} ${count === 1 ? 'download' : 'downloads'}</span>
            <span>${pct}%</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 3. Ranked Top Downloaded Notes Table with Live Search & Sort & Pagination
  bindModalTableSortingAndSearch({
    dialog,
    searchInputId: "downloads-notes-search",
    countBadgeId: "downloads-search-count-badge",
    tableBodyId: "downloads-table-body",
    notesCountBadgeId: "downloads-notes-count-badge",
    rowsPerPageSelectId: "downloads-rows-per-page",
    paginationSummaryId: "downloads-pagination-summary",
    paginationPagesId: "downloads-pagination-pages",
    items: notesWithDownloads,
    defaultSortKey: "downloads",
    defaultSortDir: "desc",
    metricBadgeLabel: "Notes Ranked by Downloads",
    renderRowHtml: (item, originalRank) => {
      const rankClass = originalRank === 1 ? "top-1" : (originalRank === 2 ? "top-2" : (originalRank === 3 ? "top-3" : ""));
      const n = item.note;
      const subKey = getSubjectKey(n.subject);
      return `
        <tr class="likes-table-row">
          <td style="text-align: center;">
            <div class="likes-rank-badge ${rankClass}">#${originalRank}</div>
          </td>
          <td>
            <div class="likes-table-title-cell">
              <strong class="likes-table-title" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</strong>
              ${n.tags && n.tags.length ? `<span class="likes-table-tags">${escapeHtml(n.tags.slice(0, 2).join(" "))}</span>` : ""}
            </div>
          </td>
          <td>
            <span class="subject-chip ${subKey}">${escapeHtml(n.subject)}</span>
          </td>
          <td style="text-align: center;">
            <strong class="downloads-val-tag" style="color: #2563eb; font-weight: 800; font-size: 0.84rem;">⬇️ ${item.downloads.toLocaleString()}</strong>
          </td>
          <td style="text-align: center;">
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id}" title="Inspect Note in Viewer">
              👁️ View
            </button>
          </td>
        </tr>
      `;
    }
  });

  // Dynamic Insight Text
  const insightText = $("#downloads-insight-text");
  if (insightText) {
    if (totalDownloads > 0 && sortedCategories[0]?.count > 0) {
      insightText.innerHTML = `Students have downloaded <strong>${escapeHtml(topSubject)}</strong> materials the most (${topSubjectShare}% of total exports). Ensure your diagrams in <strong>${escapeHtml(topSubject)}</strong> maintain sharp typography for offline printing and quick exam-hall review!`;
    } else {
      insightText.innerHTML = `High-yield summary charts and mind maps see the highest download rates as students prepare for offline revisions.`;
    }
  }

  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
}

// ==========================================
// 4.027 Social Sharing & Virality In-Depth Analysis Modal
// ==========================================
function openSharesAnalysisModal() {
  const dialog = $("#shares-analysis-dialog");
  if (!dialog) return;

  const totalShares = Number(liveInteractions.totalShares) || 0;
  const rawShares = liveInteractions.shares || {};
  const notesObj = liveInteractions.notes || {};

  const platforms = [
    { name: "WhatsApp", icon: "💬", color: "#25d366", count: Number(rawShares.whatsapp) || 0 },
    { name: "Telegram", icon: "✈️", color: "#229ed9", count: Number(rawShares.telegram) || 0 },
    { name: "Twitter / X", icon: "𝕏", color: "#0f172a", count: Number(rawShares.twitter) || 0 },
    { name: "Direct Link Copy", icon: "🔗", color: "#2563eb", count: Number(rawShares.direct) || 0 },
    { name: "Native Share", icon: "📱", color: "#8b5cf6", count: Number(rawShares.native) || 0 }
  ];

  const totalPlatformSum = platforms.reduce((acc, p) => acc + p.count, 0) || totalShares || 1;
  platforms.forEach(p => {
    p.pct = totalPlatformSum > 0 ? ((p.count / totalPlatformSum) * 100).toFixed(1) : "0.0";
  });

  const sortedPlatforms = [...platforms].sort((a, b) => b.count - a.count);
  const topPlatform = sortedPlatforms[0]?.count > 0 ? sortedPlatforms[0].name : "WhatsApp";
  const topPlatformShare = sortedPlatforms[0]?.count > 0 ? sortedPlatforms[0].pct : "0.0";

  let uniqueSharedCount = 0;
  const notesWithShares = allNotes.map(n => {
    const noteData = notesObj[n.id] || {};
    const noteShares = Number(noteData.shares) || 0;
    if (noteShares > 0) uniqueSharedCount++;
    return {
      note: n,
      shares: noteShares,
      likes: Number(noteData.likes) || Number((liveInteractions.likes || {})[n.id]) || 0
    };
  });

  const totalNotesCount = allNotes.length || 0;
  const adoptionPct = totalNotesCount > 0 ? ((uniqueSharedCount / totalNotesCount) * 100).toFixed(1) : "0.0";
  const spreadVelocity = uniqueSharedCount > 0 ? (totalShares / uniqueSharedCount).toFixed(1) : (totalShares > 0 ? totalShares.toFixed(1) : "0.0");

  // 1. Populate Top 4 KPI Tiles
  const kpiTotal = $("#shares-kpi-total");
  const kpiTopPlat = $("#shares-kpi-top-platform");
  const kpiPlatShare = $("#shares-kpi-platform-share");
  const kpiUnique = $("#shares-kpi-unique-count");
  const kpiAdoption = $("#shares-kpi-adoption-rate");
  const kpiVelocity = $("#shares-kpi-velocity");

  if (kpiTotal) kpiTotal.textContent = totalShares.toLocaleString();
  if (kpiTopPlat) kpiTopPlat.textContent = topPlatform;
  if (kpiPlatShare) kpiPlatShare.textContent = totalShares > 0 ? `${topPlatformShare}% of all shares` : "No shares yet";
  if (kpiUnique) kpiUnique.textContent = `${uniqueSharedCount} / ${totalNotesCount}`;
  if (kpiAdoption) kpiAdoption.textContent = `${adoptionPct}% Library`;
  if (kpiVelocity) kpiVelocity.textContent = spreadVelocity;

  // 2. Populate Full-Width Platform Distribution Breakdown Chart (Dashboard Style)
  const chartGraph = $("#shares-platform-bar-chart");
  const chartStrip = $("#shares-segmented-strip");
  const chartGrid = $("#shares-platform-stats-grid");
  const platBadge = $("#shares-platform-count-badge");

  if (platBadge) platBadge.textContent = totalShares > 0 ? `5 Channels Active · ${totalShares.toLocaleString()} Shares` : `5 Channels Active`;

  const maxPlatformCount = Math.max(...platforms.map(p => p.count), 1);

  // A. Vertical Column Bar Chart
  if (chartGraph) {
    chartGraph.innerHTML = platforms.map(p => {
      const heightPct = p.count === 0 ? 6 : Math.max(14, Math.round((p.count / maxPlatformCount) * 100));
      return `
        <div class="chart-col-item" title="${p.name}: ${p.count} shares (${p.pct}%)">
          <span class="chart-col-val" style="color: ${p.color};">${p.count}</span>
          <div class="chart-col-bar" style="height: ${heightPct}%; background-color: ${p.color};"></div>
          <span class="chart-col-label">${p.icon} ${p.name}</span>
        </div>
      `;
    }).join("");
  }

  // B. Proportional Multi-Segment Progress Strip
  if (chartStrip) {
    if (totalShares === 0) {
      chartStrip.innerHTML = `<div class="chart-segment" style="width: 100%; background-color: var(--border);" title="No shares recorded yet"></div>`;
    } else {
      chartStrip.innerHTML = platforms.map(p => {
        if (p.count === 0) return "";
        return `<div class="chart-segment" style="width: ${p.pct}%; background-color: ${p.color};" title="${p.name}: ${p.count} shares (${p.pct}%)"></div>`;
      }).join("");
    }
  }

  // C. 5 Platform Stats Grid
  if (chartGrid) {
    chartGrid.innerHTML = platforms.map(p => `
      <div class="cat-stat-card">
        <div class="cat-stat-top">
          <span class="cat-stat-icon">${p.icon}</span>
          <span class="cat-stat-name">${p.name}</span>
          <strong class="cat-stat-count" style="color: ${p.color};">${p.count}</strong>
        </div>
        <div class="cat-stat-bar-track">
          <div class="cat-stat-bar-fill" style="width: ${Math.max(Number(p.pct), p.count > 0 ? 8 : 0)}%; background-color: ${p.color};"></div>
        </div>
        <div class="cat-stat-sub">
          <span>${p.count} ${p.count === 1 ? 'share' : 'shares'}</span>
          <span>${p.pct}%</span>
        </div>
      </div>
    `).join("");
  }

  // 3. Ranked Most Shared Notes Table with Live Search & Sort & Pagination
  bindModalTableSortingAndSearch({
    dialog,
    searchInputId: "shares-notes-search",
    countBadgeId: "shares-search-count-badge",
    tableBodyId: "shares-table-body",
    notesCountBadgeId: "shares-notes-count-badge",
    rowsPerPageSelectId: "shares-rows-per-page",
    paginationSummaryId: "shares-pagination-summary",
    paginationPagesId: "shares-pagination-pages",
    items: notesWithShares,
    defaultSortKey: "shares",
    defaultSortDir: "desc",
    metricBadgeLabel: "Notes Ranked by Shares",
    renderRowHtml: (item, originalRank) => {
      const rankClass = originalRank === 1 ? "top-1" : (originalRank === 2 ? "top-2" : (originalRank === 3 ? "top-3" : ""));
      const n = item.note;
      const subKey = getSubjectKey(n.subject);
      return `
        <tr class="likes-table-row">
          <td style="text-align: center;">
            <div class="likes-rank-badge ${rankClass}">#${originalRank}</div>
          </td>
          <td>
            <div class="likes-table-title-cell">
              <strong class="likes-table-title" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</strong>
              ${n.tags && n.tags.length ? `<span class="likes-table-tags">${escapeHtml(n.tags.slice(0, 2).join(" "))}</span>` : ""}
            </div>
          </td>
          <td>
            <span class="subject-chip ${subKey}">${escapeHtml(n.subject)}</span>
          </td>
          <td style="text-align: center;">
            <strong class="likes-val-tag" style="color: #8b5cf6; font-weight: 800; font-size: 0.84rem;">📤 ${item.shares.toLocaleString()}</strong>
          </td>
          <td style="text-align: center;">
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id}" title="Inspect Note in Viewer">
              👁️ View
            </button>
          </td>
        </tr>
      `;
    }
  });

  // Dynamic Insight Text
  const insightText = $("#shares-insight-text");
  if (insightText) {
    if (totalShares > 0) {
      insightText.innerHTML = `<strong>${escapeHtml(topPlatform)}</strong> is your primary viral engine (${topPlatformShare}% of shares). Students actively distribute study links through study groups; ensure your shared note previews contain crisp subject chips!`;
    } else {
      insightText.innerHTML = `Study group referrals on WhatsApp & Telegram drive instant peer engagement. Each shared note link opens directly in the viewer.`;
    }
  }

  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
}

// ==========================================
// 4.028 Note Impressions & Viewer Traffic In-Depth Analysis Modal
// ==========================================
function openViewsAnalysisModal() {
  const dialog = $("#views-analysis-dialog");
  if (!dialog) return;

  const categories = [
    { name: "History", icon: "📜", color: "#d97706", key: "history" },
    { name: "Polity", icon: "⚖️", color: "#2563eb", key: "polity" },
    { name: "Economy", icon: "📈", color: "#059669", key: "economy" },
    { name: "Geography", icon: "🌍", color: "#0891b2", key: "geography" },
    { name: "Art and Culture", icon: "🎨", color: "#7c3aed", key: "art-and-culture" },
    { name: "Maths", icon: "📐", color: "#ea580c", key: "maths" },
    { name: "Science", icon: "🔬", color: "#e11d48", key: "science" },
    { name: "Others", icon: "📁", color: "#0284c7", key: "others" }
  ];

  const totalViews = Number(liveInteractions.totalImpressions) || 0;
  const totalLikes = Number(liveInteractions.totalLikes) || 0;
  const totalDownloads = Number(liveInteractions.totalDownloads) || 0;
  const totalShares = Number(liveInteractions.totalShares) || 0;
  const impressionsObj = liveInteractions.impressions || {};
  const notesObj = liveInteractions.notes || {};

  const catViewsMap = {};
  categories.forEach(c => { catViewsMap[c.name] = 0; });

  const notesWithViews = allNotes.map(n => {
    const noteData = notesObj[n.id] || {};
    const noteViews = Number(noteData.impressions) || Number(impressionsObj[n.id]) || 0;
    const noteLikes = Number(noteData.likes) || Number((liveInteractions.likes || {})[n.id]) || 0;
    const noteDownloads = Number(noteData.downloads) || Number((liveInteractions.downloads || {})[n.id]) || 0;

    const normSubj = normalizeSubject(n.subject);
    if (catViewsMap[normSubj] !== undefined) {
      catViewsMap[normSubj] += noteViews;
    } else {
      catViewsMap["History"] += noteViews;
    }

    return {
      note: n,
      views: noteViews,
      likes: noteLikes,
      downloads: noteDownloads
    };
  });

  const totalNotesCount = allNotes.length || 0;
  const avgViewsPerNote = totalNotesCount > 0 ? (totalViews / totalNotesCount).toFixed(1) : "0.0";
  const totalConversions = totalLikes + totalDownloads + totalShares;
  const conversionRate = totalViews > 0 ? ((totalConversions / totalViews) * 100).toFixed(1) + "%" : "0.0%";

  const sortedCategories = [...categories]
    .map(c => ({
      ...c,
      count: catViewsMap[c.name] || 0,
      pct: totalViews > 0 ? (((catViewsMap[c.name] || 0) / totalViews) * 100).toFixed(1) : "0.0"
    }))
    .sort((a, b) => b.count - a.count);

  const topSubject = sortedCategories[0]?.count > 0 ? sortedCategories[0].name : "None Yet";
  const topSubjectShare = sortedCategories[0]?.count > 0 ? sortedCategories[0].pct : "0.0";

  // 1. Populate Top 4 KPI Tiles
  const kpiTotal = $("#views-kpi-total");
  const kpiTopSubj = $("#views-kpi-top-subject");
  const kpiTopSubjShare = $("#views-kpi-top-subject-share");
  const kpiAvg = $("#views-kpi-avg");
  const kpiConversion = $("#views-kpi-conversion");

  if (kpiTotal) kpiTotal.textContent = totalViews.toLocaleString();
  if (kpiTopSubj) kpiTopSubj.textContent = topSubject;
  if (kpiTopSubjShare) kpiTopSubjShare.textContent = totalViews > 0 ? `${topSubjectShare}% of viewer attention` : "No impressions yet";
  if (kpiAvg) kpiAvg.textContent = avgViewsPerNote;
  if (kpiConversion) kpiConversion.textContent = conversionRate;

  // 2. Populate Full-Width Subject Traffic Breakdown Chart (Dashboard Style)
  const chartGraph = $("#views-category-bar-chart");
  const chartStrip = $("#views-segmented-strip");
  const chartGrid = $("#views-category-stats-grid");
  const subjBadge = $("#views-subject-count-badge");

  if (subjBadge) subjBadge.textContent = totalViews > 0 ? `8 Subjects Active · ${totalViews.toLocaleString()} Impressions` : `8 Subjects Active`;

  const maxViewCount = Math.max(...categories.map(c => catViewsMap[c.name] || 0), 1);

  // A. Vertical Column Bar Chart
  if (chartGraph) {
    chartGraph.innerHTML = categories.map(c => {
      const count = catViewsMap[c.name] || 0;
      const heightPct = count === 0 ? 6 : Math.max(14, Math.round((count / maxViewCount) * 100));
      const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
      return `
        <div class="chart-col-item" title="${c.name}: ${count} views (${pct}%)">
          <span class="chart-col-val" style="color: ${c.color};">${count}</span>
          <div class="chart-col-bar" style="height: ${heightPct}%; background-color: ${c.color};"></div>
          <span class="chart-col-label">${c.icon} ${c.name}</span>
        </div>
      `;
    }).join("");
  }

  // B. Proportional Multi-Segment Progress Strip
  if (chartStrip) {
    if (totalViews === 0) {
      chartStrip.innerHTML = `<div class="chart-segment" style="width: 100%; background-color: var(--border);" title="No impressions recorded yet"></div>`;
    } else {
      chartStrip.innerHTML = categories.map(c => {
        const count = catViewsMap[c.name] || 0;
        if (count === 0) return "";
        const pct = ((count / totalViews) * 100).toFixed(1);
        return `<div class="chart-segment" style="width: ${pct}%; background-color: ${c.color};" title="${c.name}: ${count} views (${pct}%)"></div>`;
      }).join("");
    }
  }

  // C. 8 Category Stats Grid
  if (chartGrid) {
    chartGrid.innerHTML = categories.map(c => {
      const count = catViewsMap[c.name] || 0;
      const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
      return `
        <div class="cat-stat-card">
          <div class="cat-stat-top">
            <span class="cat-stat-icon">${c.icon}</span>
            <span class="cat-stat-name">${c.name}</span>
            <strong class="cat-stat-count" style="color: ${c.color};">${count}</strong>
          </div>
          <div class="cat-stat-bar-track">
            <div class="cat-stat-bar-fill" style="width: ${Math.max(pct, count > 0 ? 8 : 0)}%; background-color: ${c.color};"></div>
          </div>
          <div class="cat-stat-sub">
            <span>${count} ${count === 1 ? 'view' : 'views'}</span>
            <span>${pct}%</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 3. Ranked Most Explored Notes Table with Live Search & Pagination
  bindModalTableSortingAndSearch({
    dialog,
    searchInputId: "views-notes-search",
    countBadgeId: "views-search-count-badge",
    tableBodyId: "views-table-body",
    notesCountBadgeId: "views-notes-count-badge",
    rowsPerPageSelectId: "views-rows-per-page",
    paginationSummaryId: "views-pagination-summary",
    paginationPagesId: "views-pagination-pages",
    items: notesWithViews,
    defaultSortKey: "views",
    defaultSortDir: "desc",
    metricBadgeLabel: "Notes Ranked by Views",
    renderRowHtml: (item, originalRank) => {
      const rankClass = originalRank === 1 ? "top-1" : (originalRank === 2 ? "top-2" : (originalRank === 3 ? "top-3" : ""));
      const n = item.note;
      const subKey = getSubjectKey(n.subject);
      return `
        <tr class="likes-table-row">
          <td style="text-align: center;">
            <div class="likes-rank-badge ${rankClass}">#${originalRank}</div>
          </td>
          <td>
            <div class="likes-table-title-cell">
              <strong class="likes-table-title" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</strong>
              ${n.tags && n.tags.length ? `<span class="likes-table-tags">${escapeHtml(n.tags.slice(0, 2).join(" "))}</span>` : ""}
            </div>
          </td>
          <td>
            <span class="subject-chip ${subKey}">${escapeHtml(n.subject)}</span>
          </td>
          <td style="text-align: center;">
            <strong style="color: #f59e0b; font-weight: 800; font-size: 0.84rem;">👁️ ${item.views.toLocaleString()}</strong>
          </td>
          <td style="text-align: center;">
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id}" title="Inspect Note in Viewer">
              👁️ View
            </button>
          </td>
        </tr>
      `;
    }
  });

  // Dynamic Insight Text
  const insightText = $("#views-insight-text");
  if (insightText) {
    if (totalViews > 0 && sortedCategories[0]?.count > 0) {
      insightText.innerHTML = `<strong>${escapeHtml(topSubject)}</strong> commands the highest student viewing attention (${topSubjectShare}% of total viewer traffic). Notes in this category have high click-through engagement!`;
    } else {
      insightText.innerHTML = `Total Views measure every time a student opens a diagram in full resolution to study.`;
    }
  }

  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
}

// ==========================================
// 4.01 Tags: Interactive Tag Cloud & Analytics
// ==========================================
function renderTagsView() {
  const cloudContainer = $("#admin-tag-cloud-container");
  const tableBody = $("#tags-leaderboard-tbody");
  const uniqueBadge = $("#tags-unique-badge");
  const tagsBadge = $("#tags-count-badge");
  const searchInput = $("#admin-tags-search-input");

  // Collect and aggregate tags
  const tagCounts = {};
  const totalNotes = allNotes.length || 0;

  allNotes.forEach(note => {
    const tags = note.tags || [];
    tags.forEach(rawTag => {
      const tag = rawTag.trim().replace(/^#/, "");
      if (!tag) return;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const tagList = Object.keys(tagCounts).map(name => ({
    name,
    count: tagCounts[name],
    pct: totalNotes > 0 ? ((tagCounts[name] / totalNotes) * 100).toFixed(1) : "0.0"
  })).sort((a, b) => b.count - a.count);

  const uniqueCount = tagList.length;
  if (uniqueBadge) uniqueBadge.textContent = `${uniqueCount} Unique Tags`;
  if (tagsBadge) tagsBadge.textContent = uniqueCount;

  // Max tag count for relative sizing
  const maxCount = tagList.length > 0 ? tagList[0].count : 1;

  // Render Tag Cloud function
  const renderCloud = (filter = "") => {
    if (!cloudContainer) return;
    const filterLower = filter.toLowerCase().trim();
    const filtered = tagList.filter(t => t.name.toLowerCase().includes(filterLower));

    if (filtered.length === 0) {
      cloudContainer.innerHTML = `<div style="color: var(--ink-muted); font-size: 0.82rem; padding: 24px 8px; width: 100%; text-align: center;">No tags found matching "${escapeHtml(filter)}".</div>`;
      return;
    }

    cloudContainer.innerHTML = filtered.map((t, idx) => {
      const ratio = t.count / maxCount;
      const sizeClass = ratio >= 0.75 ? "size-lg" : (ratio >= 0.4 ? "size-md" : "size-sm");
      return `
        <button type="button" class="interactive-tag-chip ${sizeClass}" data-filter-tag="${escapeHtml(t.name)}" style="animation-delay: ${(idx * 0.03).toFixed(2)}s;" title="Filter by #${escapeHtml(t.name)} (${t.count} notes)">
          <span>#${escapeHtml(t.name)}</span>
          <span class="tag-chip-count">${t.count}</span>
        </button>
      `;
    }).join("");

    // Attach click listener to tag chips
    cloudContainer.querySelectorAll("[data-filter-tag]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tag = btn.dataset.filterTag;
        const searchInput = $("#admin-table-search");
        if (searchInput) {
          searchInput.value = tag;
        }
        switchAdminView("modify");
        renderTable();
      });
    });
  };

  renderCloud(searchInput ? searchInput.value : "");

  // Search input live filtering
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", e => {
      renderCloud(e.target.value);
    });
  }

  // Render Leaderboard Table
  if (tableBody) {
    const topTags = tagList.slice(0, 10);
    if (topTags.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--ink-muted); padding: 20px;">No tags in library yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = topTags.map((t, idx) => {
      const rank = idx + 1;
      const rankClass = rank === 1 ? "top-1" : (rank === 2 ? "top-2" : (rank === 3 ? "top-3" : ""));
      return `
        <tr>
          <td>
            <div class="tag-rank-cell">
              <span class="tag-rank-badge ${rankClass}">#${rank}</span>
              <span class="tag-name-text">#${escapeHtml(t.name)}</span>
            </div>
          </td>
          <td>
            <strong style="color: #ea580c;">${t.count}</strong> notes
          </td>
          <td>
            <div class="analysis-share-cell">
              <div class="tag-bar-bg">
                <div class="tag-bar-fill" style="width: ${Math.max(Number(t.pct), 6)}%;"></div>
              </div>
              <span class="analysis-pct-text">${t.pct}%</span>
            </div>
          </td>
          <td>
            <button type="button" class="tags-filter-btn" data-drill-tag="${escapeHtml(t.name)}" title="View notes with #${escapeHtml(t.name)}">
              <span>View Notes</span> →
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Attach drilldown button click listeners
    tableBody.querySelectorAll("[data-drill-tag]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tag = btn.dataset.drillTag;
        const searchInput = $("#admin-table-search");
        if (searchInput) {
          searchInput.value = tag;
        }
        switchAdminView("modify");
        renderTable();
      });
    });
  }
}

// ==========================================
// 4.029 Student Users & Google Auth Intelligence Engine
// ==========================================
let adminUsersData = [];
let usersMetricsData = {};
let userSortKey = "active";
let userSortDir = "desc";
let userPageSize = 10;
let userCurrentPage = 1;
let currentUserDetailId = null;

async function fetchAdminUsersData() {
  try {
    const res = await api("/api/admin/users");
    if (res && res.success) {
      adminUsersData = res.users || [];
      usersMetricsData = res.metrics || {};
    }
  } catch (err) {
    adminUsersData = [];
    usersMetricsData = {};
  }
}

function renderUsersView() {
  fetchAdminUsersData().then(() => {
    // 1. Update Top KPI Cards
    const totalEl = $("#user-kpi-total");
    const newSignupsEl = $("#user-kpi-new-signups");
    const activeTodayEl = $("#user-kpi-active-today");
    const active7dEl = $("#user-kpi-active-7d");
    const avgSavedEl = $("#user-kpi-avg-saved");
    const topSubEl = $("#user-kpi-top-subject");
    const navBadge = $("#users-nav-badge");

    if (totalEl) totalEl.textContent = (usersMetricsData.totalUsers || 0).toLocaleString("en-IN");
    if (newSignupsEl) newSignupsEl.textContent = `↑ ${usersMetricsData.newSignups7Days || 0} New This Week`;
    if (activeTodayEl) activeTodayEl.textContent = (usersMetricsData.activeToday || 0).toLocaleString("en-IN");
    if (active7dEl) active7dEl.textContent = `${usersMetricsData.active7Days || 0} Active Past 7 Days`;
    if (avgSavedEl) avgSavedEl.textContent = usersMetricsData.avgBookmarksPerUser || "0.0";
    if (topSubEl) topSubEl.textContent = usersMetricsData.topSubject || "General";
    if (navBadge) navBadge.textContent = (adminUsersData.length || 0).toString();

    // 2. Render Users Table
    renderUsersTable(true);
  });
}

function renderUsersTable(resetPage = true) {
  if (resetPage) userCurrentPage = 1;
  const tableBody = $("#users-table-body");
  const searchInput = $("#users-search-input");
  const activityFilter = $("#users-filter-activity")?.value || "all";
  const examFilter = $("#users-filter-exam")?.value || "all";
  const countBadge = $("#users-table-count-badge");
  const query = (searchInput?.value || "").trim().toLowerCase();

  let filtered = adminUsersData.filter(user => {
    // Search query matching
    if (query) {
      const nameMatch = (user.name || "").toLowerCase().includes(query);
      const emailMatch = (user.email || "").toLowerCase().includes(query);
      const examMatch = (user.targetExam || "").toLowerCase().includes(query) || (user.targetExamDetail || "").toLowerCase().includes(query);
      const subMatch = (user.topSubject || "").toLowerCase().includes(query);
      if (!nameMatch && !emailMatch && !examMatch && !subMatch) return false;
    }

    // Activity filtering
    if (activityFilter === "today" && !user.isActiveToday) return false;
    if (activityFilter === "week" && !user.isActiveThisWeek) return false;

    // Exam Goal filtering
    if (examFilter !== "all") {
      const uExam = (user.targetExam || "").toLowerCase();
      if (examFilter === "Others") {
        if (uExam === "upsc" || uExam === "ssc" || uExam === "rrb" || uExam === "ibps" || uExam === "state psc") return false;
      } else if (uExam !== examFilter.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    let diff = 0;
    if (userSortKey === "name") {
      diff = (a.name || "").localeCompare(b.name || "");
    } else if (userSortKey === "exam") {
      diff = (a.targetExam || "").localeCompare(b.targetExam || "");
    } else if (userSortKey === "joined") {
      diff = new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime();
    } else if (userSortKey === "active") {
      diff = new Date(a.lastActiveAt || 0).getTime() - new Date(b.lastActiveAt || 0).getTime();
    } else if (userSortKey === "views") {
      diff = (a.viewsCount || 0) - (b.viewsCount || 0);
    } else if (userSortKey === "likes") {
      diff = (a.likesCount || 0) - (b.likesCount || 0);
    } else if (userSortKey === "downloads") {
      diff = (a.downloadsCount || 0) - (b.downloadsCount || 0);
    } else if (userSortKey === "shares") {
      diff = (a.sharesCount || 0) - (b.sharesCount || 0);
    }
    return userSortDir === "asc" ? diff : -diff;
  });

  if (countBadge) {
    countBadge.textContent = query || activityFilter !== "all" || examFilter !== "all"
      ? `Showing ${filtered.length} of ${adminUsersData.length} students`
      : `Showing all ${adminUsersData.length} registered students`;
  }

  // Update Header Sort Arrows
  document.querySelectorAll("[data-user-sort]").forEach(th => {
    const key = th.dataset.userSort;
    const arrow = th.querySelector(".likes-th-arrow");
    if (key === userSortKey) {
      th.classList.add("active");
      if (arrow) arrow.textContent = userSortDir === "asc" ? "↑" : "↓";
    } else {
      th.classList.remove("active");
      if (arrow) arrow.textContent = "↕";
    }
  });

  // Pagination Slice
  const isAll = userPageSize === "all";
  const effectivePageSize = isAll ? filtered.length : Number(userPageSize);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  userCurrentPage = Math.min(Math.max(1, userCurrentPage), totalPages);

  const startIdx = isAll ? 0 : (userCurrentPage - 1) * effectivePageSize;
  const endIdx = isAll ? filtered.length : startIdx + effectivePageSize;
  const paginatedUsers = filtered.slice(startIdx, endIdx);

  // Update Users Pagination UI
  const summaryEl = $("#users-pagination-summary");
  const pagesEl = $("#users-pagination-pages");
  if (summaryEl) {
    if (filtered.length === 0) {
      summaryEl.textContent = "Showing 0 students";
    } else if (isAll) {
      summaryEl.textContent = `Showing all ${filtered.length} students`;
    } else {
      const displayStart = startIdx + 1;
      const displayEnd = Math.min(endIdx, filtered.length);
      summaryEl.textContent = `Showing ${displayStart}–${displayEnd} of ${filtered.length} students`;
    }
  }

  if (pagesEl) {
    if (totalPages <= 1) {
      pagesEl.innerHTML = "";
    } else {
      let html = `<button type="button" class="page-nav-btn users-prev-btn" ${userCurrentPage === 1 ? "disabled" : ""} title="Previous Page">‹ Prev</button>`;

      const maxButtons = 5;
      let startPage = Math.max(1, userCurrentPage - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      if (startPage > 1) {
        html += `<button type="button" class="page-num-btn ${userCurrentPage === 1 ? "active" : ""}" data-user-page="1">1</button>`;
        if (startPage > 2) html += `<span class="page-dots">…</span>`;
      }

      for (let p = startPage; p <= endPage; p++) {
        html += `<button type="button" class="page-num-btn ${p === userCurrentPage ? "active" : ""}" data-user-page="${p}">${p}</button>`;
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-dots">…</span>`;
        html += `<button type="button" class="page-num-btn ${userCurrentPage === totalPages ? "active" : ""}" data-user-page="${totalPages}">${totalPages}</button>`;
      }

      html += `<button type="button" class="page-nav-btn users-next-btn" ${userCurrentPage === totalPages ? "disabled" : ""} title="Next Page">Next ›</button>`;

      pagesEl.innerHTML = html;

      pagesEl.querySelector(".users-prev-btn")?.addEventListener("click", () => {
        if (userCurrentPage > 1) {
          userCurrentPage--;
          renderUsersTable(false);
        }
      });

      pagesEl.querySelector(".users-next-btn")?.addEventListener("click", () => {
        if (userCurrentPage < totalPages) {
          userCurrentPage++;
          renderUsersTable(false);
        }
      });

      pagesEl.querySelectorAll("[data-user-page]").forEach(btn => {
        btn.addEventListener("click", () => {
          const p = Number(btn.dataset.userPage);
          if (p && p !== userCurrentPage) {
            userCurrentPage = p;
            renderUsersTable(false);
          }
        });
      });
    }
  }

  if (!tableBody) return;

  if (paginatedUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="likes-table-empty-row">
          <div class="likes-table-empty">
            <span>👥</span>
            <p>No registered students found matching your filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = paginatedUsers.map(user => {
    const activeStr = formatRelativeOrExactTime(user.lastActiveAt);
    const statusDotClass = user.isActiveToday ? "active-today" : (user.isActiveThisWeek ? "active-week" : "active-idle");
    const targetExamLabel = user.targetExam ? escapeHtml(user.targetExam) : "Not Set";
    const examClass = (user.targetExam || "none").toLowerCase().replace(/\s+/g, "-");

    return `
      <tr class="likes-table-row user-table-row">
        <td>
          <div class="user-cell-wrap">
            <img class="user-table-avatar" src="${escapeHtml(user.picture)}" alt="${escapeHtml(user.name)}" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=student'">
            <div class="user-cell-meta">
              <strong class="user-table-name">${escapeHtml(user.name)}</strong>
              <small class="user-table-email">${escapeHtml(user.email)}</small>
            </div>
          </div>
        </td>
        <td>
          <span class="user-exam-badge exam-badge-${examClass}">
            🎯 <strong>${targetExamLabel}</strong>
            ${user.targetExamDetail ? `<small class="exam-detail-sub">(${escapeHtml(user.targetExamDetail)})</small>` : ''}
          </span>
        </td>
        <td>
          <div class="user-status-cell">
            <span class="user-status-indicator ${statusDotClass}">●</span>
            <span class="user-time-text">${activeStr}</span>
          </div>
        </td>
        <td style="text-align: center;">
          <strong class="user-metric-val views-val">👁️ ${(user.viewsCount || 0).toLocaleString()}</strong>
        </td>
        <td style="text-align: center;">
          <strong class="user-metric-val likes-val" style="color: #ec4899;">❤️ ${(user.likesCount || 0).toLocaleString()}</strong>
        </td>
        <td style="text-align: center;">
          <strong class="user-metric-val downloads-val">⬇️ ${(user.downloadsCount || 0).toLocaleString()}</strong>
        </td>
        <td style="text-align: center;">
          <strong class="user-metric-val shares-val" style="color: #8b5cf6;">📤 ${(user.sharesCount || 0).toLocaleString()}</strong>
        </td>
        <td style="text-align: center;">
          <button type="button" class="likes-table-view-btn inspect-user-btn" data-inspect-user-id="${user.id}" title="Inspect Student Learning Profile & Likes">
            📊 Profile
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tableBody.querySelectorAll("[data-inspect-user-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      openUserDetailsModal(btn.dataset.inspectUserId);
    });
  });
}

function formatRelativeOrExactTime(isoStr) {
  if (!isoStr) return "Never";
  try {
    const ts = new Date(isoStr).getTime();
    if (isNaN(ts)) return "Recently";
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "Recently";
  }
}

async function openUserDetailsModal(userId) {
  const dialog = $("#user-details-dialog");
  if (!dialog) return;
  currentUserDetailId = userId;

  try {
    const res = await api(`/api/admin/users/${userId}`);
    if (!res || !res.success || !res.user) {
      showToast("Unable to fetch user details.", "error");
      return;
    }
    const u = res.user;

    const avatarEl = $("#user-detail-avatar");
    const nameEl = $("#user-detail-name") || document.querySelector(".user-detail-name") || $("#user-details-modal-title");
    const emailEl = $("#user-detail-email");
    const targetExamEl = $("#user-detail-target-exam");
    const joinedEl = $("#user-detail-joined");
    const activeEl = $("#user-detail-last-active");
    const sessionEl = $("#user-detail-login-count");
    const viewsStat = $("#user-detail-views-stat");
    const likesStat = $("#user-detail-likes-stat");
    const downloadsStat = $("#user-detail-downloads-stat");
    const sharesStat = $("#user-detail-shares-stat");
    const bookmarksPill = $("#user-bookmarks-count-pill");
    const bookmarksList = $("#user-bookmarks-list");
    const downloadsPill = $("#user-downloads-count-pill");
    const downloadsList = $("#user-downloads-list");
    const subjectBars = $("#user-subject-bars-container");
    const activityTimeline = $("#user-activity-timeline");

    if (avatarEl) avatarEl.src = u.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.email)}`;
    if (nameEl) nameEl.textContent = u.name || "Student";
    if (emailEl) emailEl.textContent = u.email || "No Email";
    if (targetExamEl) {
      targetExamEl.textContent = u.targetExam
        ? `${u.targetExam}${u.targetExamDetail ? ` (${u.targetExamDetail})` : ''}`
        : "Not Selected Yet";
    }
    if (joinedEl) joinedEl.textContent = `Joined: ${new Date(u.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    if (activeEl) activeEl.textContent = `Last Active: ${formatRelativeOrExactTime(u.lastActiveAt)}`;
    if (sessionEl) sessionEl.textContent = `${u.loginCount || 1} Session${u.loginCount === 1 ? '' : 's'}`;

    const activeNoteIds = new Set(allNotes.map(n => n.id));
    const rawLiked = u.likedNotes || u.bookmarkedNotes || [];
    const likedNotesList = rawLiked.filter(n => activeNoteIds.has(n.id || n.noteId));
    const downloadedNotesList = u.downloadedNotes || [];
    if (viewsStat) viewsStat.textContent = (u.viewsCount || (u.views || []).length).toLocaleString();
    if (likesStat) likesStat.textContent = (likedNotesList.length).toLocaleString();
    if (downloadsStat) downloadsStat.textContent = (u.downloadsCount || downloadedNotesList.length).toLocaleString();
    if (sharesStat) sharesStat.textContent = (u.sharesCount || (u.shares || []).length).toLocaleString();
    if (bookmarksPill) bookmarksPill.textContent = `${likedNotesList.length} Note${likedNotesList.length === 1 ? '' : 's'}`;
    if (downloadsPill) downloadsPill.textContent = `${downloadedNotesList.length} Note${downloadedNotesList.length === 1 ? '' : 's'}`;

    // Render Subject Distribution Bars
    if (subjectBars) {
      const dist = u.subjectDistribution || [];
      if (dist.length === 0) {
        subjectBars.innerHTML = `<p class="user-empty-subtext">No subject activity recorded yet.</p>`;
      } else {
        subjectBars.innerHTML = dist.map(item => {
          const subKey = getSubjectKey(item.subject);
          return `
            <div class="user-subject-bar-row">
              <div class="user-bar-label-col">
                <span class="subject-chip ${subKey}">${escapeHtml(item.subject)}</span>
                <span class="user-bar-count-text">${item.count} interactions</span>
              </div>
              <div class="user-bar-track">
                <div class="user-bar-fill" style="width: ${Math.max(item.percent, 8)}%;"></div>
              </div>
              <span class="user-bar-pct-text">${item.percent}%</span>
            </div>
          `;
        }).join("");
      }
    }

    // Render Liked Notes
    if (bookmarksList) {
      if (likedNotesList.length === 0) {
        bookmarksList.innerHTML = `<p class="user-empty-subtext">Student has not liked any notes yet.</p>`;
      } else {
        bookmarksList.innerHTML = likedNotesList.map(n => `
          <div class="user-note-item">
            <div class="user-note-info">
              <strong class="user-note-title">${escapeHtml(n.title)}</strong>
              <span class="subject-chip ${getSubjectKey(n.subject)}">${escapeHtml(n.subject || "General")}</span>
            </div>
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id || n.noteId}">
              👁️ View
            </button>
          </div>
        `).join("");

        bookmarksList.querySelectorAll("[data-view-note-id]").forEach(btn => {
          btn.addEventListener("click", () => {
            dialog.close();
            openLightbox(btn.dataset.viewNoteId);
          });
        });
      }
    }

    // Render Downloaded Notes
    if (downloadsList) {
      if (downloadedNotesList.length === 0) {
        downloadsList.innerHTML = `<p class="user-empty-subtext">Student has not downloaded any notes yet.</p>`;
      } else {
        downloadsList.innerHTML = downloadedNotesList.map(n => `
          <div class="user-note-item">
            <div class="user-note-info">
              <strong class="user-note-title">${escapeHtml(n.title)}</strong>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                <span class="subject-chip ${getSubjectKey(n.subject)}">${escapeHtml(n.subject || "General")}</span>
                ${n.timestamp ? `<span style="font-size: 0.72rem; color: var(--ink-sub);">Downloaded ${formatRelativeOrExactTime(n.timestamp)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="likes-table-view-btn" data-view-note-id="${n.id || n.noteId}">
              👁️ View
            </button>
          </div>
        `).join("");

        downloadsList.querySelectorAll("[data-view-note-id]").forEach(btn => {
          btn.addEventListener("click", () => {
            dialog.close();
            openLightbox(btn.dataset.viewNoteId);
          });
        });
      }
    }

    // Render Activity History Timeline
    if (activityTimeline) {
      const history = u.recentViews || [];
      if (history.length === 0) {
        activityTimeline.innerHTML = `<p class="user-empty-subtext">No recent study history available.</p>`;
      } else {
        activityTimeline.innerHTML = history.slice(0, 10).map(item => `
          <div class="user-timeline-item">
            <div class="user-timeline-dot"></div>
            <div class="user-timeline-content">
              <span class="user-timeline-action">Studied <strong>${escapeHtml(item.title)}</strong> (${escapeHtml(item.subject)})</span>
              <span class="user-timeline-time">${formatRelativeOrExactTime(item.timestamp)}</span>
            </div>
          </div>
        `).join("");
      }
    }

    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
  } catch (e) {
    showToast("Failed to open user profile.", "error");
  }
}

function exportUsersCsv() {
  if (!adminUsersData || adminUsersData.length === 0) {
    showToast("No student user data available to export.", "info");
    return;
  }

  const headers = ["User ID", "Google ID", "Name", "Email", "Target Exam", "Target Exam Detail", "Joined Date", "Last Active", "Login Count", "Views", "Likes", "Downloads", "Shares"];
  const rows = adminUsersData.map(u => [
    `"${u.id}"`,
    `"${u.googleId || ''}"`,
    `"${(u.name || '').replace(/"/g, '""')}"`,
    `"${(u.email || '').replace(/"/g, '""')}"`,
    `"${(u.targetExam || '').replace(/"/g, '""')}"`,
    `"${(u.targetExamDetail || '').replace(/"/g, '""')}"`,
    `"${u.joinedAt || ''}"`,
    `"${u.lastActiveAt || ''}"`,
    u.loginCount || 1,
    u.viewsCount || 0,
    u.likesCount || 0,
    u.downloadsCount || 0,
    u.sharesCount || 0
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exam_alert_students_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Student telemetry CSV exported successfully! 📥", "success");
}

function exportUsersExcel() {
  if (!adminUsersData || adminUsersData.length === 0) {
    showToast("No student user data available to export.", "info");
    return;
  }

  const escapeXml = (str) => {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const headers = ["Student Name", "Email Address", "Target Exam", "View Count", "Like Count", "Share Count"];
  
  // Microsoft Excel 2003 XML Spreadsheet Format (Supported natively in all MS Excel versions, Office 365, Google Sheets, LibreOffice)
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Student Intelligence &amp; Telemetry</Title>
  <Author>Free AI Govt Exam Notes</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#059669"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#059669"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#059669"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#059669"/>
   </Borders>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#10B981" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataText">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="DataNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Color="#1E293B"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Students Telemetry">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="160"/>
   <Column ss:Width="200"/>
   <Column ss:Width="140"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Row ss:Height="24">
`;

  headers.forEach(h => {
    xml += `    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
  });
  xml += `   </Row>\n`;

  adminUsersData.forEach(u => {
    xml += `   <Row>\n`;
    xml += `    <Cell ss:StyleID="DataText"><Data ss:Type="String">${escapeXml(u.name || "Anonymous")}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="DataText"><Data ss:Type="String">${escapeXml(u.email || "N/A")}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="DataText"><Data ss:Type="String">${escapeXml(u.targetExam || "Not Specified")}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${Number(u.viewsCount) || 0}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${Number(u.likesCount) || 0}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${Number(u.sharesCount) || 0}</Data></Cell>\n`;
    xml += `   </Row>\n`;
  });

  xml += `  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
   <DisplayGridlines/>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exam_alert_students_telemetry_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Student Excel spreadsheet exported successfully! 📊", "success");
}

// ==========================================
// 4.032 Student Feedback & Suggestions Analytics Hub
// ==========================================
let adminFeedbackData = [];
let adminFeedbackMetrics = {};
let currentFeedbackTab = "all";

const FEEDBACK_EMOJI_MAP = {
  5: { emoji: "🤩", label: "Very Satisfied (5/5)", fillClass: "fill-very-satisfied" },
  4: { emoji: "😊", label: "Satisfied (4/5)", fillClass: "fill-satisfied" },
  3: { emoji: "🙂", label: "Good (3/5)", fillClass: "fill-good" },
  2: { emoji: "😐", label: "Fair (2/5)", fillClass: "fill-fair" },
  1: { emoji: "😞", label: "Poor (1/5)", fillClass: "fill-poor" }
};

async function fetchAdminFeedback() {
  try {
    const res = await api("/api/admin/feedback");
    if (res && res.success) {
      adminFeedbackData = res.feedback || [];
      adminFeedbackMetrics = res.metrics || {};
    }
  } catch (err) {
    adminFeedbackData = [];
    adminFeedbackMetrics = {};
  }
  renderFeedbackView();
}

function renderFeedbackView() {
  // 1. Update Top KPI Cards
  const totalEl = $("#feedback-kpi-total");
  const unreadCountEl = $("#feedback-kpi-unread-count");
  const unreadEl = $("#feedback-kpi-unread");
  const topDemandEl = $("#feedback-kpi-top-demand");
  const topDemandSub = $("#feedback-kpi-top-demand-sub");
  const avgRatingEl = $("#feedback-kpi-avg-rating");
  const starsVisualEl = $("#feedback-kpi-stars-visual");
  const navBadge = $("#feedback-nav-badge");
  const ratingsBadge = $("#feedback-ratings-count-badge");

  const total = adminFeedbackMetrics.totalCount || 0;
  const unread = adminFeedbackMetrics.unreadCount || 0;
  const avg = parseFloat(adminFeedbackMetrics.avgRating) || 5.0;

  // Box 1: Total Suggestions Count Alone
  if (totalEl) totalEl.textContent = total.toLocaleString("en-IN");

  // Box 2: Unread Count
  if (unreadCountEl) unreadCountEl.textContent = unread.toLocaleString("en-IN");
  if (unreadEl) {
    unreadEl.textContent = unread > 0 ? `${unread} New / Unread` : "All Reviewed ✓";
    unreadEl.className = unread > 0 ? "metric-trend positive" : "metric-trend neutral";
  }

  // Box 3: Top Content Demand Name
  const topDemandName = adminFeedbackMetrics.topContentDemand || "None Yet";
  const topDemandCount = adminFeedbackMetrics.topDemandCount || 0;
  if (topDemandEl) {
    topDemandEl.textContent = topDemandName;
    topDemandEl.title = topDemandName;
  }
  if (topDemandSub) {
    topDemandSub.textContent = topDemandCount > 0 ? `${topDemandCount} Demand${topDemandCount === 1 ? '' : 's'}` : "Most Requested Content";
  }

  // Box 4: Average Rating
  if (avgRatingEl) avgRatingEl.textContent = avg.toFixed(1);
  if (starsVisualEl) {
    const rounded = Math.min(5, Math.max(1, Math.round(avg)));
    starsVisualEl.textContent = `${FEEDBACK_EMOJI_MAP[rounded]?.emoji || "🤩"} ${FEEDBACK_EMOJI_MAP[rounded]?.label || "Satisfied"}`;
  }

  if (navBadge) {
    navBadge.textContent = unread.toString();
    navBadge.className = unread > 0 ? "cat-count badge-warning" : "cat-count badge-live";
  }
  if (ratingsBadge) ratingsBadge.textContent = `${total} Rating${total === 1 ? '' : 's'}`;

  // 2. Render Emoji Ratings Breakdown (5 down to 1 - Engagement Ratio Style)
  const ratingBarsList = $("#feedback-rating-bars-list");
  const ratingCounts = adminFeedbackMetrics.ratingCounts || {};

  if (ratingBarsList) {
    let html = "";
    for (let r = 5; r >= 1; r--) {
      const count = ratingCounts[r] || 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
      const item = FEEDBACK_EMOJI_MAP[r];
      html += `
        <div class="interaction-bar-row">
          <div class="interaction-row-label">
            <span class="interaction-icon">${item.emoji}</span>
            <strong>${item.label}</strong>
          </div>
          <div class="interaction-bar-track">
            <div class="interaction-bar-fill ${item.fillClass}" style="width: ${pct}%;"></div>
          </div>
          <span class="interaction-count-badge">${pct}% (${count})</span>
        </div>
      `;
    }
    ratingBarsList.innerHTML = html;
  }

  // Summary Metrics for Satisfaction Ratio
  const satHighCount = (ratingCounts[5] || 0) + (ratingCounts[4] || 0);
  const satNeutralCount = ratingCounts[3] || 0;
  const satCritiqueCount = (ratingCounts[2] || 0) + (ratingCounts[1] || 0);

  const satEl = $("#summary-satisfaction-rate");
  const neutralEl = $("#summary-neutral-rate");
  const critiqueEl = $("#summary-critique-rate");
  if (satEl) satEl.textContent = total > 0 ? `${((satHighCount / total) * 100).toFixed(1)}%` : "0.0%";
  if (neutralEl) neutralEl.textContent = total > 0 ? `${((satNeutralCount / total) * 100).toFixed(1)}%` : "0.0%";
  if (critiqueEl) critiqueEl.textContent = total > 0 ? `${((satCritiqueCount / total) * 100).toFixed(1)}%` : "0.0%";

  // 3. Render Feedback Categories Distribution (4 Focus Areas - Engagement Ratio Style)
  const catBarsList = $("#feedback-category-bars-list");
  const catCounts = adminFeedbackMetrics.categoryCounts || {};
  const focusAreas = [
    { key: "topic_request", icon: "📚", label: "Topic / Note Demand", fillClass: "fill-topic-demand" },
    { key: "ui_design", icon: "🎨", label: "Website & Design", fillClass: "fill-ui-design" },
    { key: "bug_report", icon: "🐛", label: "Report an Issue", fillClass: "fill-bug-report" },
    { key: "general", icon: "💬", label: "General Thought", fillClass: "fill-general" }
  ];

  if (catBarsList) {
    let html = "";
    focusAreas.forEach(area => {
      const count = catCounts[area.key] || 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
      html += `
        <div class="interaction-bar-row">
          <div class="interaction-row-label">
            <span class="interaction-icon">${area.icon}</span>
            <strong>${area.label}</strong>
          </div>
          <div class="interaction-bar-track">
            <div class="interaction-bar-fill ${area.fillClass}" style="width: ${pct}%;"></div>
          </div>
          <span class="interaction-count-badge">${pct}% (${count})</span>
        </div>
      `;
    });
    catBarsList.innerHTML = html;
  }

  // Summary Metrics for Focus Areas
  const summaryTopicEl = $("#summary-topic-demand-rate");
  const summaryDesignEl = $("#summary-design-rate");
  const summaryIssueEl = $("#summary-issue-rate");
  if (summaryTopicEl) summaryTopicEl.textContent = total > 0 ? `${(((catCounts.topic_request || 0) / total) * 100).toFixed(1)}%` : "0.0%";
  if (summaryDesignEl) summaryDesignEl.textContent = total > 0 ? `${(((catCounts.ui_design || 0) / total) * 100).toFixed(1)}%` : "0.0%";
  if (summaryIssueEl) summaryIssueEl.textContent = total > 0 ? `${(((catCounts.bug_report || 0) / total) * 100).toFixed(1)}%` : "0.0%";

  // 4. Update Filter Dropdown Options with Live Counts
  const filterSelect = $("#feedback-filter-select");
  if (filterSelect) {
    const unreadCount = unread;
    const topicCount = catCounts.topic_request || 0;
    const uiCount = catCounts.ui_design || 0;
    const bugCount = catCounts.bug_report || 0;
    const generalCount = catCounts.general || 0;
    const starredCount = adminFeedbackMetrics.starredCount || 0;

    const optAll = filterSelect.querySelector('option[value="all"]');
    const optUnread = filterSelect.querySelector('option[value="unread"]');
    const optTopics = filterSelect.querySelector('option[value="topic_request"]');
    const optUi = filterSelect.querySelector('option[value="ui_design"]');
    const optBugs = filterSelect.querySelector('option[value="bug_report"]');
    const optGeneral = filterSelect.querySelector('option[value="general"]');
    const optStarred = filterSelect.querySelector('option[value="starred"]');

    if (optAll) optAll.textContent = `All Feedback (${total})`;
    if (optUnread) optUnread.textContent = `Unread 🔴 (${unreadCount})`;
    if (optTopics) optTopics.textContent = `📚 Topic Demands (${topicCount})`;
    if (optUi) optUi.textContent = `🎨 UI & Design (${uiCount})`;
    if (optBugs) optBugs.textContent = `🐛 Issues (${bugCount})`;
    if (optGeneral) optGeneral.textContent = `💬 General Thought (${generalCount})`;
    if (optStarred) optStarred.textContent = `⭐ Starred (${starredCount})`;

    filterSelect.value = currentFeedbackTab || "all";
  }

  // 5. Render Feedback List
  renderFeedbackList();
}

function renderFeedbackList() {
  const container = $("#feedback-list-container");
  if (!container) return;

  const searchInput = $("#feedback-search-input");
  const query = (searchInput?.value || "").trim().toLowerCase();

  let filtered = adminFeedbackData.filter(item => {
    // Dropdown / Tab filter
    if (currentFeedbackTab === "unread" && item.status !== "unread") return false;
    if (currentFeedbackTab === "topic_request" && item.category !== "topic_request") return false;
    if (currentFeedbackTab === "ui_design" && item.category !== "ui_design") return false;
    if (currentFeedbackTab === "bug_report" && item.category !== "bug_report") return false;
    if (currentFeedbackTab === "general" && item.category !== "general") return false;
    if (currentFeedbackTab === "starred" && !item.starred) return false;

    // Search query
    if (query) {
      const textMatch = (item.message || "").toLowerCase().includes(query);
      const nameMatch = (item.name || "").toLowerCase().includes(query);
      const emailMatch = (item.email || "").toLowerCase().includes(query);
      const examMatch = (item.targetExam || "").toLowerCase().includes(query);
      if (!textMatch && !nameMatch && !emailMatch && !examMatch) return false;
    }
    return true;
  });

  const countBadge = $("#feedback-results-count");
  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${adminFeedbackData.length} suggestion${adminFeedbackData.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="feedback-empty-state">
        <div class="feedback-empty-icon">📭</div>
        <h4>No feedback found</h4>
        <p>No suggestions match the selected filter or search query.</p>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    topic_request: "📚 Topic / Note Demand",
    ui_design: "🎨 Website & Design",
    bug_report: "🐛 Report an Issue",
    general: "💬 General Thought"
  };

  container.innerHTML = filtered.map(item => {
    const initial = (item.name || "A").trim().charAt(0).toUpperCase();
    const avatarUrl = item.picture ? item.picture : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(item.name || 'student')}`;
    const fallbackUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(item.name || 'student')}`;
    const r = Math.min(5, Math.max(1, parseInt(item.rating) || 5));
    const emojiInfo = FEEDBACK_EMOJI_MAP[r] || { emoji: "⭐", label: "Rating" };
    const catLabel = categoryLabels[item.category] || (item.category === "feature_idea" ? "💡 Feature Idea" : "💬 Suggestion");
    const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }) : "Recent";
    const isUnread = item.status === "unread";
    const isStarred = Boolean(item.starred);

    const tagsHtml = Array.isArray(item.quickTags) && item.quickTags.length > 0
      ? item.quickTags.map(t => `<span class="feedback-tag-pill">#${escapeHtml(t)}</span>`).join(" ")
      : "";

    const emailReplyBtn = item.email ? `
      <a href="mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent('Re: Your Suggestion on Exam Alert India')}" class="fb-action-btn" title="Reply via Email">
        ✉️ Reply
      </a>
    ` : "";

    return `
      <div class="feedback-item-card ${isUnread ? 'is-unread' : ''} ${isStarred ? 'is-starred' : ''}" data-id="${item.id}">
        <div class="feedback-item-head">
          <div class="feedback-user-info">
            <img class="feedback-user-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(item.name || 'Student')}" onerror="this.onerror=null; this.src='${fallbackUrl}';" loading="lazy">
            <div class="feedback-user-meta">
              <span class="feedback-user-name">${escapeHtml(item.name || "Aspirant")}</span>
              <span class="feedback-user-email">Google Verified Student • ${item.email ? escapeHtml(item.email) : "Authenticated"}</span>
            </div>
          </div>
          <div class="feedback-item-badges">
            ${item.targetExam ? `<span class="cat-pill" style="font-size: 0.72rem; padding: 3px 8px;">${escapeHtml(item.targetExam)}</span>` : ''}
            <span class="feedback-tag-pill">${catLabel}</span>
            <span class="feedback-rating-badge" title="${r}/5 - ${emojiInfo.label}">${emojiInfo.emoji} ${emojiInfo.label} (${r}/5)</span>
          </div>
        </div>

        <div class="feedback-item-body">${escapeHtml(item.message || "")}</div>

        ${tagsHtml ? `<div class="feedback-tags-row">${tagsHtml}</div>` : ''}

        <div class="feedback-item-meta">
          <span>🕒 ${dateStr} • Status: <strong>${isUnread ? '🔴 New' : '✓ Reviewed'}</strong></span>
          <div class="feedback-actions-row">
            ${emailReplyBtn}
            <button type="button" class="fb-action-btn ${isStarred ? 'star-active' : ''}" onclick="toggleFeedbackStarred('${item.id}', ${!isStarred})">
              ${isStarred ? '⭐ Starred' : '☆ Star'}
            </button>
            <button type="button" class="fb-action-btn" onclick="toggleFeedbackStatus('${item.id}', '${isUnread ? 'reviewed' : 'unread'}')">
              ${isUnread ? '✓ Mark Read' : '↺ Mark Unread'}
            </button>
            <button type="button" class="fb-action-btn delete-btn" onclick="deleteFeedbackItem('${item.id}')" title="Delete Suggestion">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function toggleFeedbackStatus(id, newStatus) {
  try {
    const res = await api(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (res && res.success) {
      showToast(`Feedback marked as ${newStatus === "reviewed" ? "reviewed" : "unread"}.`, "info");
      await fetchAdminFeedback();
    }
  } catch (err) {
    showToast(`✕ ${err.message || "Could not update feedback status"}`, "error");
  }
}

async function toggleFeedbackStarred(id, starred) {
  try {
    const res = await api(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred })
    });
    if (res && res.success) {
      showToast(starred ? "⭐ Feedback starred as favorite!" : "Feedback unstarred.", "info");
      await fetchAdminFeedback();
    }
  } catch (err) {
    showToast(`✕ ${err.message || "Could not update feedback"}`, "error");
  }
}

async function deleteFeedbackItem(id) {
  if (!confirm("Are you sure you want to delete this student feedback?")) return;
  try {
    const res = await api(`/api/admin/feedback/${id}`, {
      method: "DELETE"
    });
    if (res && res.success) {
      showToast("✓ Feedback item deleted.", "success");
      await fetchAdminFeedback();
    }
  } catch (err) {
    showToast(`✕ ${err.message || "Could not delete feedback"}`, "error");
  }
}

function downloadFeedbackCSV() {
  if (!adminFeedbackData || adminFeedbackData.length === 0) {
    showToast("No feedback records available to export.", "warning");
    return;
  }

  const headers = ["ID", "Created At", "Name", "Email", "Target Exam", "Rating", "Category", "Status", "Starred", "Message"];
  const rows = adminFeedbackData.map(item => [
    item.id || "",
    item.createdAt || "",
    `"${(item.name || "").replace(/"/g, '""')}"`,
    `"${(item.email || "").replace(/"/g, '""')}"`,
    `"${(item.targetExam || "").replace(/"/g, '""')}"`,
    item.rating || 5,
    `"${(item.category || "").replace(/"/g, '""')}"`,
    item.status || "unread",
    item.starred ? "true" : "false",
    `"${(item.message || "").replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ExamAlertIndia_Feedback_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("📥 Feedback telemetry exported to CSV successfully!", "success");
}

function initAdminFeedbackListeners() {
  const filterSelect = $("#feedback-filter-select");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      currentFeedbackTab = filterSelect.value || "all";
      renderFeedbackList();
    });
  }

  const tabs = $$("#feedback-filter-tabs .fb-tab-btn");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      currentFeedbackTab = btn.dataset.tab || "all";
      if (filterSelect) filterSelect.value = currentFeedbackTab;
      renderFeedbackList();
    });
  });

  const searchInput = $("#feedback-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderFeedbackList();
    });
  }

  const exportBtn = $("#feedback-export-csv-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", downloadFeedbackCSV);
  }
}

// ==========================================
// 4.035 Search Demands (Unavailable Content Gaps)
// ==========================================
let missingSearchesState = {
  filter: "",
  sortBy: "count-desc" // "count-desc" | "recent-desc" | "alpha-asc"
};

function renderMissingSearchesView() {
  const missingObj = liveInteractions.missingSearches || {};
  let list = Object.values(missingObj);

  const totalSearches = list.reduce((acc, item) => acc + (Number(item.count) || 0), 0);
  const uniqueTopics = list.length;

  // Find Top Wanted Topic
  let topTopic = "—";
  let topCount = 0;
  if (list.length > 0) {
    const sortedByCount = [...list].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    topTopic = sortedByCount[0].query || "—";
    topCount = sortedByCount[0].count || 0;
  }

  // Update Badges & Stat Cards
  const headerBadge = $("#missing-searches-header-count");
  if (headerBadge) headerBadge.textContent = `${uniqueTopics} Missing Topic${uniqueTopics === 1 ? '' : 's'}`;

  const sidebarBadge = $("#missing-searches-badge");
  if (sidebarBadge) {
    sidebarBadge.textContent = uniqueTopics;
  }

  const statTotal = $("#stat-missing-total-searches");
  if (statTotal) statTotal.textContent = totalSearches;

  const statUnique = $("#stat-missing-unique-topics");
  if (statUnique) statUnique.textContent = uniqueTopics;

  const statTop = $("#stat-missing-top-topic");
  if (statTop) statTop.textContent = topTopic;

  const statTopCnt = $("#stat-missing-top-count");
  if (statTopCnt) statTopCnt.textContent = `${topCount} student search${topCount === 1 ? '' : 'es'}`;

  // Apply Filter & Sort
  const filterVal = (missingSearchesState.filter || "").toLowerCase().trim();
  let filtered = list.filter(item => (item.query || "").toLowerCase().includes(filterVal));

  if (missingSearchesState.sortBy === "count-desc") {
    filtered.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
  } else if (missingSearchesState.sortBy === "recent-desc") {
    filtered.sort((a, b) => new Date(b.lastSearched || 0) - new Date(a.lastSearched || 0));
  } else if (missingSearchesState.sortBy === "alpha-asc") {
    filtered.sort((a, b) => (a.query || "").localeCompare(b.query || ""));
  }

  const tbody = $("#missing-demands-tbody");
  const tableWrap = $("#missing-table-wrapper");
  const emptyState = $("#missing-demands-empty-state");

  if (filtered.length === 0) {
    if (tbody) tbody.innerHTML = "";
    if (tableWrap) tableWrap.style.display = "none";
    if (emptyState) emptyState.hidden = false;
  } else {
    if (tableWrap) tableWrap.style.display = "block";
    if (emptyState) emptyState.hidden = true;

    const maxDemand = Math.max(...filtered.map(i => Number(i.count) || 1), 1);

    if (tbody) {
      tbody.innerHTML = filtered.map((item, idx) => {
        const rank = idx + 1;
        const count = Number(item.count) || 1;
        const pct = Math.min(100, Math.max(12, (count / maxDemand) * 100));
        let lastDateText = "Recent";
        if (item.lastSearched) {
          const d = new Date(item.lastSearched);
          if (!isNaN(d.getTime())) {
            lastDateText = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
          }
        }

        return `
          <tr>
            <td>
              <span class="demand-rank-badge">#${rank}</span>
            </td>
            <td>
              <div class="demand-keyword-wrap">
                <span class="demand-keyword-pill">
                  <span>🔎</span> <strong>${escapeHtml(item.query)}</strong>
                </span>
              </div>
            </td>
            <td>
              <div class="demand-count-col">
                <div class="demand-count-header">
                  <span class="demand-count-badge">${count} search${count === 1 ? '' : 'es'}</span>
                </div>
                <div class="demand-bar-bg">
                  <div class="demand-bar-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
            </td>
            <td>
              <span class="demand-time-text">${lastDateText}</span>
            </td>
            <td style="text-align: right;">
              <button type="button" class="fulfill-action-btn" data-fulfill-topic="${escapeHtml(item.query)}" title="Create and publish note for ${escapeHtml(item.query)}">
                <span>➕</span> Create Note
              </button>
              <button type="button" class="dismiss-demand-btn" data-dismiss-topic="${escapeHtml(item.query)}" title="Dismiss this topic from demands log">
                ✕
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }
  }
}

function getNoteDateValue(n) {
  if (n.createdAt) {
    const t = Date.parse(n.createdAt);
    if (!isNaN(t)) return t;
  }
  if (n.date) {
    const t = Date.parse(n.date);
    if (!isNaN(t)) return t;
  }
  return 0;
}

// ==========================================
// 4.1 Modify Content Library Management (Smart Table & Grid)
// ==========================================
let tableState = {
  page: 1,
  rowsPerPage: 4,
  sortKey: 'date',
  sortDir: 'desc',
  viewMode: 'grid',   // 'grid' (default) or 'table'
  selectedIds: new Set()
};

function getFilteredAndSortedNotes() {
  const searchTerm = $("#admin-table-search")?.value.trim().toLowerCase() || "";
  const filterSubj = $("#admin-table-filter-subject")?.value.trim().toLowerCase() || "";

  let list = allNotes.filter(n => {
    // Subject filter
    if (filterSubj && (n.subject || "").toLowerCase() !== filterSubj) return false;
    // Search filter
    if (searchTerm) {
      const allText = `${n.title} ${n.subject} ${(n.tags || []).join(" ")}`.toLowerCase();
      if (!allText.includes(searchTerm)) return false;
    }
    return true;
  });

  // Sort
  list.sort((a, b) => {
    let comp = 0;
    if (tableState.sortKey === "date") {
      comp = getNoteDateValue(a) - getNoteDateValue(b);
    } else if (tableState.sortKey === "title") {
      comp = (a.title || "").localeCompare(b.title || "");
    } else if (tableState.sortKey === "subject") {
      comp = (a.subject || "").localeCompare(b.subject || "");
    }
    return tableState.sortDir === "asc" ? comp : -comp;
  });

  return list;
}

function updateBulkActionsUI() {
  const bulkBar = $("#admin-bulk-actions");
  const countLabel = $("#admin-selected-count");
  const count = tableState.selectedIds.size;

  if (!bulkBar) return;
  if (count > 0) {
    bulkBar.hidden = false;
    if (countLabel) countLabel.textContent = `${count} note${count > 1 ? 's' : ''} selected`;
  } else {
    bulkBar.hidden = true;
  }
}

function renderPagination(totalCount, totalPages, startIndex, endIndex) {
  const summaryEl = $("#admin-pagination-summary");
  const pagesContainer = $("#admin-pagination-pages");
  const perPageSelect = $("#admin-rows-per-page");

  if (summaryEl) {
    if (totalCount === 0) {
      summaryEl.textContent = "0 notes";
    } else {
      summaryEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalCount} notes`;
    }
  }

  if (perPageSelect) {
    perPageSelect.value = String(tableState.rowsPerPage);
  }

  if (!pagesContainer) return;

  if (totalPages <= 1) {
    pagesContainer.innerHTML = "";
    return;
  }

  let html = "";
  // Prev button
  html += `<button type="button" class="page-nav-btn prev-btn" ${tableState.page <= 1 ? 'disabled' : ''} data-page="${tableState.page - 1}">◀ Prev</button>`;

  // Numeric page buttons (smart range)
  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (tableState.page <= 4) {
      pages = [1, 2, 3, 4, 5, "...", totalPages];
    } else if (tableState.page >= totalPages - 3) {
      pages = [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pages = [1, "...", tableState.page - 1, tableState.page, tableState.page + 1, "...", totalPages];
    }
  }

  pages.forEach(p => {
    if (p === "...") {
      html += `<span class="page-dots">…</span>`;
    } else {
      const active = Number(p) === tableState.page ? "active" : "";
      html += `<button type="button" class="page-num-btn ${active}" data-page="${p}">${p}</button>`;
    }
  });

  // Next button
  html += `<button type="button" class="page-nav-btn next-btn" ${tableState.page >= totalPages ? 'disabled' : ''} data-page="${tableState.page + 1}">Next ▶</button>`;

  pagesContainer.innerHTML = html;
}

function renderTable() {
  const tbody = $("#admin-notes-tbody");
  const gridWrap = $("#admin-grid-view-wrap");
  const tableWrap = $("#admin-table-view-wrap");
  const emptyBox = $("#admin-empty-table");
  const paginationBar = $("#admin-pagination-bar");
  const selectAllCb = $("#admin-select-all");

  if (!tbody) return;

  const filtered = getFilteredAndSortedNotes();
  const totalCount = filtered.length;
  const rowsPerPage = tableState.rowsPerPage === "all" ? (totalCount || 1) : Number(tableState.rowsPerPage) || 10;
  const totalPages = rowsPerPage > 0 ? Math.max(1, Math.ceil(totalCount / rowsPerPage)) : 1;

  if (tableState.page > totalPages) tableState.page = totalPages;
  if (tableState.page < 1) tableState.page = 1;

  const startIndex = (tableState.page - 1) * rowsPerPage;
  const endIndex = tableState.rowsPerPage === "all" ? totalCount : Math.min(startIndex + rowsPerPage, totalCount);
  const displayed = filtered.slice(startIndex, endIndex);

  // Update Sort Header Icons
  ["title", "subject", "date"].forEach(key => {
    const iconEl = $(`#sort-icon-${key}`);
    if (iconEl) {
      if (tableState.sortKey === key) {
        iconEl.textContent = tableState.sortDir === "asc" ? "↑" : "↓";
        iconEl.classList.add("active");
      } else {
        iconEl.textContent = "↕";
        iconEl.classList.remove("active");
      }
    }
  });

  // Empty state handling
  if (totalCount === 0) {
    tbody.innerHTML = "";
    if (gridWrap) gridWrap.innerHTML = "";
    if (emptyBox) emptyBox.hidden = false;
    if (paginationBar) paginationBar.hidden = true;
    updateBulkActionsUI();
    if (selectAllCb) selectAllCb.checked = false;
    return;
  }

  if (emptyBox) emptyBox.hidden = true;
  if (paginationBar) paginationBar.hidden = false;

  // 1. Render Table Rows
  tbody.innerHTML = displayed.map(n => {
    const subjKey = getSubjectKey(n.subject);
    const dateFormatted = n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");
    const isUploaded = Boolean(n.imageUrl);
    const isSelected = tableState.selectedIds.has(n.id);

    const thumbHtml = n.imageUrl
      ? `<img src="${n.imageUrl}" alt="${escapeHtml(n.title)}" class="admin-table-thumb" data-preview-id="${n.id}" title="Click to view full image">`
      : `<div class="admin-table-thumb-placeholder" data-preview-id="${n.id}">📖</div>`;

    const tagsHtml = (n.tags && n.tags.length > 0)
      ? `<div class="table-tags">${n.tags.map(t => `<span class="table-tag">#${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

    return `
      <tr class="${isSelected ? 'selected-row' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" class="admin-row-cb" data-cb-id="${n.id}" ${isSelected ? 'checked' : ''} aria-label="Select note">
        </td>
        <td>${thumbHtml}</td>
        <td>
          <strong class="table-note-title" data-preview-id="${n.id}" style="cursor: pointer;" title="Preview Note">${escapeHtml(n.title)}</strong>
          ${isUploaded ? '<span class="chip-uploaded">Cloud Upload</span>' : '<span class="chip-sample">Core Library</span>'}
          ${tagsHtml}
        </td>
        <td><span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span></td>
        <td class="text-muted">${dateFormatted}</td>
        <td class="text-right">
          <div class="action-btn-group">
            <button type="button" class="table-btn preview-btn" data-preview-id="${n.id}" title="Preview Note in High-Res Popup">👁</button>
            <button type="button" class="table-btn edit-btn" data-edit-id="${n.id}" title="Edit Note Details">✏️</button>
            <button type="button" class="table-btn delete-btn" data-delete-id="${n.id}" title="Delete Note from Library">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // 2. Render Grid Cards View
  if (gridWrap) {
    gridWrap.innerHTML = displayed.map(n => {
      const subjKey = getSubjectKey(n.subject);
      const dateFormatted = n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");
      const isUploaded = Boolean(n.imageUrl);
      const isSelected = tableState.selectedIds.has(n.id);
      const thumb = n.imageUrl
        ? `<img src="${n.imageUrl}" alt="${escapeHtml(n.title)}" class="grid-card-img" data-preview-id="${n.id}" onerror="handleAdminNoteImageError(this, '${n.id}', '${n.imageUrl}')">`
        : `<div class="grid-card-img placeholder" data-preview-id="${n.id}">📖</div>`;

      const tagsHtml = (n.tags && n.tags.length > 0)
        ? `<div class="grid-card-tags">${n.tags.map(t => `<span class="grid-tag">#${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

      return `
        <div class="modify-grid-card ${isSelected ? 'selected' : ''}">
          <div class="grid-card-top">
            <label class="grid-cb-wrap">
              <input type="checkbox" class="admin-row-cb" data-cb-id="${n.id}" ${isSelected ? 'checked' : ''} aria-label="Select note">
            </label>
            <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
            ${isUploaded ? '<span class="chip-uploaded">Upload</span>' : '<span class="chip-sample">Core</span>'}
          </div>
          <div class="grid-card-media" data-preview-id="${n.id}">
            ${thumb}
          </div>
          <div class="grid-card-body">
            <strong class="grid-card-title" data-preview-id="${n.id}">${escapeHtml(n.title)}</strong>
            <small class="grid-card-date">${dateFormatted}</small>
            ${tagsHtml}
          </div>
          <div class="grid-card-footer">
            <button type="button" class="grid-act-btn preview" data-preview-id="${n.id}" title="Preview">👁</button>
            <button type="button" class="grid-act-btn edit" data-edit-id="${n.id}" title="Edit">✏️ Edit</button>
            <button type="button" class="grid-act-btn delete" data-delete-id="${n.id}" title="Delete">🗑</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Toggle View Modes
  if (tableState.viewMode === "grid") {
    if (tableWrap) tableWrap.hidden = true;
    if (gridWrap) gridWrap.hidden = false;
    $("#admin-view-btn-table")?.classList.remove("active");
    $("#admin-view-btn-grid")?.classList.add("active");
  } else {
    if (tableWrap) tableWrap.hidden = false;
    if (gridWrap) gridWrap.hidden = true;
    $("#admin-view-btn-table")?.classList.add("active");
    $("#admin-view-btn-grid")?.classList.remove("active");
  }

  // Select All Checkbox state on current page
  if (selectAllCb) {
    const allCurrentPageSelected = displayed.length > 0 && displayed.every(n => tableState.selectedIds.has(n.id));
    selectAllCb.checked = allCurrentPageSelected;
  }

  // Update Bulk Actions Toolbar
  updateBulkActionsUI();

  // Update Pagination Controls
  renderPagination(totalCount, totalPages, startIndex, endIndex);
}

let pendingDeleteNoteIds = [];

function promptDeleteNotes(ids) {
  if (!ids || ids.length === 0) return;
  pendingDeleteNoteIds = Array.isArray(ids) ? ids : [ids];
  const count = pendingDeleteNoteIds.length;

  const dialog = $("#admin-delete-note-dialog");
  const heading = $("#delete-note-modal-heading");
  const desc = $("#delete-note-modal-desc");
  const targetName = $("#delete-note-target-name");
  const pwdInput = $("#delete-note-password-input");
  const msg = $("#delete-note-error-msg");

  if (heading) {
    heading.textContent = count === 1 ? "Delete Note from Library" : `Delete ${count} Selected Notes`;
  }
  if (desc) {
    desc.textContent = count === 1 
      ? "Permanently delete this revision note and its diagram from the student library."
      : `Permanently delete ${count} selected revision notes from the student library.`;
  }
  if (targetName) {
    if (count === 1) {
      const targetNote = allNotes.find(n => n.id === pendingDeleteNoteIds[0]);
      targetName.textContent = targetNote ? targetNote.title : "1 Revision Note";
    } else {
      targetName.textContent = `${count} Selected Revision Notes`;
    }
  }

  if (pwdInput) pwdInput.value = "";
  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }

  dialog?.showModal();
  pwdInput?.focus();
}

function deleteNotesByIds(ids) {
  promptDeleteNotes(ids);
}

// ==========================================
// 5. Intelligent Image Optimizer & File Processor
// ==========================================
function optimizeImageFile(file, maxDimension = 2400, quality = 0.90) {
  return new Promise((resolve, reject) => {
    // If it's SVG, keep raw SVG base64
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => resolve(e.target.result); // Fallback to raw dataURL if decoding fails
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target.result);
          return;
        }

        // Fill clean white background for PNG transparency
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        } catch {
          resolve(e.target.result);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 5.9 Rich Text WYSIWYG Formatting Engine
// ==========================================

function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function getIntersectingBlocks(editor, range) {
  const BLOCK_TAGS = ["P", "LI", "DIV", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6"];
  const blocks = [];

  // Check if range is collapsed
  if (range.collapsed) {
    let node = range.startContainer;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes(node.tagName)) {
        blocks.push(node);
        break;
      }
      node = node.parentNode;
    }
    return blocks;
  }

  // Find all block elements within editor that intersect the range
  const allBlocks = editor.querySelectorAll("p, li, div, blockquote, h1, h2, h3, h4, h5, h6");
  allBlocks.forEach(b => {
    try {
      if (range.intersectsNode(b)) {
        blocks.push(b);
      }
    } catch {}
  });

  // If selection is inside a block that contains no sub-blocks
  if (blocks.length === 0) {
    let node = range.commonAncestorContainer;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes(node.tagName)) {
        blocks.push(node);
        break;
      }
      node = node.parentNode;
    }
  }

  return blocks;
}

function applyTextAlignment(editor, alignCmd) {
  const alignMap = {
    justifyLeft: "left",
    justifyCenter: "center",
    justifyRight: "right",
    justifyFull: "justify"
  };
  const alignVal = alignMap[alignCmd] || "left";

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  // If editor has only plain text and no block tags, wrap lines into paragraphs safely
  if (!editor.querySelector("p, ul, ol, div, blockquote, h1, h2, h3, h4, h5, h6")) {
    const raw = editor.innerHTML.trim();
    if (raw) {
      editor.innerHTML = `<p>${raw}</p>`;
    }
  }

  const blocks = getIntersectingBlocks(editor, range);
  if (blocks.length > 0) {
    blocks.forEach(b => {
      b.style.textAlign = alignVal;
    });
  } else {
    editor.style.textAlign = alignVal;
  }
}

function clearHighlightFromSelection(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  // 1. If cursor or anchor is inside a mark element, unwrap it
  let node = sel.anchorNode;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === "mark") {
      unwrapElement(node);
      editor.normalize();
      return;
    }
    node = node.parentNode;
  }

  // 2. Unwrap all mark elements intersecting selection
  const marks = editor.querySelectorAll("mark, [class*='highlight-']");
  marks.forEach(m => {
    if (sel.isCollapsed) {
      if (m.contains(sel.anchorNode)) {
        unwrapElement(m);
      }
    } else if (sel.containsNode(m, true)) {
      unwrapElement(m);
    }
  });

  // 3. Remove inline background styles on spans
  const spans = editor.querySelectorAll("span[style*='background']");
  spans.forEach(span => {
    if (sel.containsNode(span, true)) {
      span.style.backgroundColor = "";
      span.style.background = "";
      if (!span.getAttribute("style")) {
        unwrapElement(span);
      }
    }
  });

  editor.normalize();
}

function applyCustomHighlight(editor, hlType) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  if (hlType === "clear") {
    clearHighlightFromSelection(editor);
    return;
  }

  if (sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  // Clear any existing highlights inside the selection first to prevent nesting
  clearHighlightFromSelection(editor);

  // Now create the new mark element
  const mark = document.createElement("mark");
  mark.className = `highlight-${hlType}`;

  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }

  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(mark);
  sel.addRange(newRange);
  editor.normalize();
}

function applyCustomRedUnderline(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  // Toggle off if already inside red-underline
  let node = sel.anchorNode;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && (node.classList?.contains("red-underline") || (node.tagName.toLowerCase() === "u" && node.style.textDecoration?.includes("wavy")))) {
      unwrapElement(node);
      editor.normalize();
      return;
    }
    node = node.parentNode;
  }

  if (sel.isCollapsed) {
    document.execCommand("underline", false, null);
    return;
  }

  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  // Remove existing red-underlines inside selection
  const underlines = editor.querySelectorAll("u.red-underline, .red-underline");
  underlines.forEach(u => {
    if (sel.containsNode(u, true)) {
      unwrapElement(u);
    }
  });

  const uEl = document.createElement("u");
  uEl.className = "red-underline";
  uEl.style.textDecoration = "underline wavy #ef4444 2px";
  uEl.style.textUnderlineOffset = "3px";

  try {
    range.surroundContents(uEl);
  } catch {
    const fragment = range.extractContents();
    uEl.appendChild(fragment);
    range.insertNode(uEl);
  }

  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(uEl);
  sel.addRange(newRange);
  editor.normalize();
}

function clearAllFormatting(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  // 1. Native clear for bold, italic, links
  document.execCommand("removeFormat", false, null);
  document.execCommand("unlink", false, null);

  // 2. Clear all highlights in selection
  clearHighlightFromSelection(editor);

  // 3. Clear all red underlines
  const underlines = editor.querySelectorAll("u, .red-underline");
  underlines.forEach(u => {
    if (sel.isCollapsed) {
      let node = sel.anchorNode;
      while (node && node !== editor) {
        if (node === u) { unwrapElement(u); break; }
        node = node.parentNode;
      }
    } else if (sel.containsNode(u, true)) {
      unwrapElement(u);
    }
  });

  // 4. Strip inline style/color attributes from spans & fonts
  const styledEls = editor.querySelectorAll("span[style], font");
  styledEls.forEach(el => {
    if (!sel.isCollapsed && sel.containsNode(el, true)) {
      el.removeAttribute("style");
      el.removeAttribute("color");
      unwrapElement(el);
    }
  });

  // 5. Reset text alignment on selected blocks
  const range = sel.getRangeAt(0);
  const blocks = getIntersectingBlocks(editor, range);
  blocks.forEach(b => {
    b.style.textAlign = "";
  });

  editor.normalize();
}

function setupRichTextEditor(wrapperId, editorId, hiddenTextareaId, charCountId, maxChars = 2000) {
  const wrapper = $(wrapperId);
  const editor = $(editorId);
  const textarea = $(hiddenTextareaId);
  const charCount = $(charCountId);
  if (!wrapper || !editor) return;

  function updateCharCount() {
    const textLen = (editor.innerText || "").replace(/\n$/, "").length;
    if (charCount) {
      charCount.textContent = `${textLen}/${maxChars}`;
      if (textLen > maxChars) {
        charCount.style.color = "#dc2626";
        charCount.style.fontWeight = "800";
      } else {
        charCount.style.color = "";
        charCount.style.fontWeight = "";
      }
    }
    if (textarea) {
      textarea.value = editor.innerHTML;
    }
    if (editorId === "#studio-note-overview-editor" && typeof updateLivePopupPreview === "function") {
      updateLivePopupPreview();
    }
  }

  editor.addEventListener("input", updateCharCount);
  editor.addEventListener("keyup", updateCharCount);
  editor.addEventListener("paste", () => {
    setTimeout(updateCharCount, 10);
  });

  // Keyboard shortcuts (Ctrl+U for Red Underline)
  editor.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      e.preventDefault();
      applyCustomRedUnderline(editor);
      updateCharCount();
    }
  });

  // Prevent mousedown on all toolbar buttons to preserve text selection in editor
  wrapper.querySelectorAll("button.rte-btn, button.rte-color-btn, button.rte-highlight-btn").forEach(btn => {
    btn.addEventListener("mousedown", e => {
      e.preventDefault();
    });
  });

  // Handle standard toolbar formatting buttons
  wrapper.querySelectorAll(".rte-btn[data-command]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      editor.focus();
      const cmd = btn.dataset.command;

      if (cmd === "red-underline") {
        applyCustomRedUnderline(editor);
      } else if (cmd === "removeFormat") {
        clearAllFormatting(editor);
      } else if (cmd.startsWith("justify")) {
        applyTextAlignment(editor, cmd);
      } else {
        document.execCommand(cmd, false, null);
      }
      updateCharCount();
    });
  });

  // Handle Text Color Palettes
  wrapper.querySelectorAll(".rte-color-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      editor.focus();
      const color = btn.dataset.color;
      wrapper.querySelectorAll(".rte-color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (color === "default") {
        document.execCommand("foreColor", false, "inherit");
        // Also strip inline color styling on selection
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          editor.querySelectorAll("span[style*='color'], font[color]").forEach(el => {
            if (sel.containsNode(el, true)) {
              el.style.color = "";
              if (el.tagName.toLowerCase() === "font") el.removeAttribute("color");
              if (!el.getAttribute("style")) unwrapElement(el);
            }
          });
        }
      } else {
        document.execCommand("foreColor", false, color);
      }
      updateCharCount();
    });
  });

  // Handle Marker Highlighter Buttons
  wrapper.querySelectorAll(".rte-highlight-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      editor.focus();
      const hl = btn.dataset.highlight;
      applyCustomHighlight(editor, hl);
      updateCharCount();
    });
  });
}

function setupFileDrop() {
  const fileInput = $("#studio-file-input");
  const dropzone = $("#studio-dropzone");
  const promptBox = $("#dropzone-prompt");
  const previewWrap = $("#dropzone-preview-wrap");
  const imgPreview = $("#dropzone-img-preview");
  const nameLabel = $("#preview-file-name");
  const sizeLabel = $("#preview-file-size");
  const removeBtn = $("#remove-preview-btn");
  const msg = $("#studio-upload-msg");
  const urlInput = $("#studio-image-url");
  const urlClearBtn = $("#studio-url-clear-btn");
  const urlStatus = $("#studio-url-status");

  let urlDebounceTimer = null;

  function handleUrlInput() {
    const rawUrl = (urlInput?.value || "").trim();
    if (urlClearBtn) urlClearBtn.hidden = !rawUrl;

    if (!rawUrl) {
      if (urlStatus) {
        urlStatus.hidden = true;
        urlStatus.textContent = "";
      }
      clearPreview();
      return;
    }

    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      if (urlStatus) {
        urlStatus.hidden = false;
        urlStatus.className = "url-status-msg error";
        urlStatus.textContent = "⚠️ Please enter a valid Cloudinary image URL starting with https://";
      }
      return;
    }

    if (urlStatus) {
      urlStatus.hidden = false;
      urlStatus.className = "url-status-msg info";
      urlStatus.textContent = "⏳ Verifying Cloudinary image link…";
    }

    clearTimeout(urlDebounceTimer);
    urlDebounceTimer = setTimeout(() => {
      const testImg = new Image();
      testImg.onload = () => {
        selectedImageUrl = rawUrl;
        selectedImageData = null;

        if (previewWrap) previewWrap.hidden = false;
        if (imgPreview) imgPreview.src = selectedImageUrl;
        if (nameLabel) nameLabel.textContent = rawUrl.includes("cloudinary.com") ? "Cloudinary Hosted Note Image" : "Cloud Hosted Image";
        if (sizeLabel) sizeLabel.textContent = `${testImg.naturalWidth}×${testImg.naturalHeight} px (Ready)`;

        if (urlStatus) {
          urlStatus.hidden = false;
          urlStatus.className = "url-status-msg success";
          urlStatus.textContent = "✓ Image loaded successfully from Cloudinary!";
        }
        if (msg) msg.textContent = "";
        if (typeof updateLivePopupPreview === "function") updateLivePopupPreview();
      };
      testImg.onerror = () => {
        if (urlStatus) {
          urlStatus.hidden = false;
          urlStatus.className = "url-status-msg error";
          urlStatus.textContent = "⚠️ Unable to load image from this Cloudinary URL. Please verify the link.";
        }
        if (typeof updateLivePopupPreview === "function") updateLivePopupPreview();
      };
      testImg.src = rawUrl;
    }, 300);
  }

  urlInput?.addEventListener("input", handleUrlInput);
  urlInput?.addEventListener("paste", () => setTimeout(handleUrlInput, 50));

  function clearPreview() {
    selectedImageUrl = null;
    selectedImageData = null;
    if (urlInput) urlInput.value = "";
    if (urlClearBtn) urlClearBtn.hidden = true;
    if (urlStatus) {
      urlStatus.hidden = true;
      urlStatus.textContent = "";
    }
    if (imgPreview) imgPreview.src = "";
    if (previewWrap) previewWrap.hidden = true;
    if (promptBox) promptBox.hidden = false;
    if (typeof updateLivePopupPreview === "function") updateLivePopupPreview();
  }

  urlClearBtn?.addEventListener("click", clearPreview);
  removeBtn?.addEventListener("click", clearPreview);

  async function processFile(file) {
    if (msg) {
      msg.textContent = "";
      msg.className = "form-message";
    }

    if (!file || (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|svg)$/i.test(file.name))) {
      showToast("Only image files (JPG, PNG, WEBP, SVG) can be uploaded.", "error");
      if (msg) {
        msg.textContent = "Only image files (JPG, PNG, WEBP, SVG) are allowed.";
        msg.className = "form-message error";
      }
      clearPreview();
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast("Image size exceeds 15 MB limit.", "error");
      if (msg) {
        msg.textContent = "File size exceeds 15 MB. Please select a smaller image.";
        msg.className = "form-message error";
      }
      clearPreview();
      return;
    }

    try {
      if (urlInput) urlInput.value = "";
      if (urlClearBtn) urlClearBtn.hidden = true;
      if (urlStatus) {
        urlStatus.hidden = true;
        urlStatus.textContent = "";
      }
      selectedImageUrl = null;

      if (nameLabel) nameLabel.textContent = file.name;
      if (sizeLabel) sizeLabel.textContent = "Optimizing note image…";
      if (promptBox) promptBox.hidden = true;
      if (previewWrap) previewWrap.hidden = false;

      const dataUrl = await optimizeImageFile(file);
      selectedImageData = dataUrl;
      if (imgPreview) imgPreview.src = selectedImageData;
      if (sizeLabel) sizeLabel.textContent = `${(file.size / 1024).toFixed(1)} KB (High-Res)`;
      if (msg) msg.textContent = "";
      if (typeof updateLivePopupPreview === "function") updateLivePopupPreview();
    } catch (err) {
      showToast("Failed to process image file.", "error");
      clearPreview();
    }
  }

  fileInput?.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      processFile(fileInput.files[0]);
    }
  });

  dropzone?.addEventListener("dragover", e => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });

  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-over");
  });

  dropzone?.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      processFile(e.dataTransfer.files[0]);
    }
  });

  removeBtn?.addEventListener("click", e => {
    e.stopPropagation();
    clearPreview();
  });
}

// ==========================================
// 5.1 Publishing Studio Interactive Preview & Tags
// ==========================================
function getExistingTagsWithCounts() {
  const counts = new Map();
  allNotes.forEach(n => {
    (n.tags || []).forEach(t => {
      const clean = (t || "").trim().replace(/^#/, "");
      if (clean) {
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    });
  });

  if (counts.size === 0) {
    const defaults = ["UPSC", "Prelims 2025", "Constitution", "Articles 12-35", "Fundamental Rights", "Modern History", "Geography", "Economy", "SSC CGL", "Formulas"];
    defaults.forEach(d => counts.set(d, 1));
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function renderPublishTagSuggestions(filterQuery = "") {
  const container = $("#publish-quick-tags-container");
  const tagsInput = $("#studio-note-tags");
  if (!container) return;

  const allTagCounts = getExistingTagsWithCounts();
  const q = (filterQuery || "").toLowerCase().trim();

  // Get current active tags in input
  const currentTags = (tagsInput ? tagsInput.value : "")
    .split(",")
    .map(s => s.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);

  let filtered = allTagCounts;
  if (q) {
    filtered = allTagCounts.filter(item => item.tag.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<span style="font-size: 0.68rem; color: var(--ink-muted); padding: 2px;">No matching tags. Type comma to separate.</span>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 16).map(item => {
    const isAdded = currentTags.includes(item.tag.toLowerCase());
    return `
      <button type="button" class="quick-tag-btn ${isAdded ? "active-match" : ""}" data-add-tag="${escapeHtml(item.tag)}" title="Click to add #${escapeHtml(item.tag)}">
        ${isAdded ? "✓" : "+"} #${escapeHtml(item.tag)}
        <span class="tag-freq-badge">${item.count}</span>
      </button>
    `;
  }).join("");

  // Attach click handlers
  container.querySelectorAll(".quick-tag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tagToAdd = btn.dataset.addTag;
      if (!tagsInput || !tagToAdd) return;

      const raw = tagsInput.value;
      const parts = raw.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);

      if (!parts.some(p => p.toLowerCase() === tagToAdd.toLowerCase())) {
        const lastCommaIdx = raw.lastIndexOf(",");
        if (lastCommaIdx !== -1) {
          const prefix = raw.slice(0, lastCommaIdx).trim();
          tagsInput.value = prefix ? `${prefix}, ${tagToAdd}, ` : `${tagToAdd}, `;
        } else {
          tagsInput.value = `${tagToAdd}, `;
        }
      }

      // Update simulator tags
      const simTagsRow = $("#sim-tags-row");
      const updatedTags = tagsInput.value.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
      if (simTagsRow) {
        if (updatedTags.length === 0) {
          simTagsRow.innerHTML = `<span class="sim-tag">#UPSC</span><span class="sim-tag">#Constitution</span>`;
        } else {
          simTagsRow.innerHTML = updatedTags.map(t => `<span class="sim-tag">#${escapeHtml(t)}</span>`).join("");
        }
      }

      renderPublishTagSuggestions("");
      tagsInput.focus();
    });
  });
}

// ==========================================
// 5.15 Google Search-Style Real-Time Title Duplicate Detector
// ==========================================
function renderPublishTitleSuggestions(rawQuery) {
  const dropdown = $("#studio-title-suggestions-dropdown");
  const list = $("#studio-title-suggestions-list");
  const countBadge = $("#suggestions-match-count");
  const duplicateAlert = $("#studio-title-duplicate-alert");
  if (!dropdown || !list) return;

  const query = (rawQuery || "").trim().toLowerCase();
  if (query.length < 2) {
    dropdown.hidden = true;
    if (duplicateAlert) {
      duplicateAlert.hidden = true;
      duplicateAlert.innerHTML = "";
    }
    list.innerHTML = "";
    return;
  }

  // Tokenize query words
  const queryTokens = query.split(/\s+/).filter(w => w.length >= 2);
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const normalizedQuery = norm(query);

  let exactMatch = null;
  const matches = [];

  allNotes.forEach(note => {
    const noteTitleNorm = norm(note.title);
    if (!noteTitleNorm) return;

    let score = 0;
    const isExact = (noteTitleNorm === normalizedQuery);
    if (isExact) {
      score = 100;
      exactMatch = note;
    } else if (noteTitleNorm.startsWith(normalizedQuery)) {
      score = 80;
    } else if (noteTitleNorm.includes(normalizedQuery)) {
      score = 60;
    } else {
      // Check token match
      let matchedCount = 0;
      queryTokens.forEach(t => {
        if (noteTitleNorm.includes(t)) matchedCount++;
      });
      if (matchedCount > 0) {
        score = 25 * (matchedCount / queryTokens.length);
      }
    }

    if (score > 20) {
      matches.push({ note, score, isExact });
    }
  });

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  const topMatches = matches.slice(0, 6);

  // Exact duplicate alert banner
  if (duplicateAlert) {
    if (exactMatch) {
      duplicateAlert.hidden = false;
      duplicateAlert.innerHTML = `
        <div class="duplicate-alert-inner">
          <span class="dup-alert-icon">⚠️</span>
          <div class="dup-alert-text">
            <strong>Duplicate Note Title Detected:</strong>
            <span>A note titled <em>"${escapeHtml(exactMatch.title)}"</em> already exists in <strong>${escapeHtml(exactMatch.subject || "Library")}</strong>. Please make your title unique to avoid confusing students.</span>
          </div>
        </div>
      `;
    } else {
      duplicateAlert.hidden = true;
      duplicateAlert.innerHTML = "";
    }
  }

  if (topMatches.length === 0) {
    dropdown.hidden = true;
    list.innerHTML = "";
    return;
  }

  dropdown.hidden = false;
  if (countBadge) {
    countBadge.textContent = `${topMatches.length} existing match${topMatches.length > 1 ? 'es' : ''}`;
  }

  // Highlight matching query text
  function highlightQueryText(text, q) {
    if (!q) return escapeHtml(text);
    try {
      const tokens = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (tokens.length === 0) return escapeHtml(text);
      const regex = new RegExp(`(${tokens.join("|")})`, "gi");
      return escapeHtml(text).replace(regex, "<mark>$1</mark>");
    } catch {
      return escapeHtml(text);
    }
  }

  list.innerHTML = topMatches.map(({ note, isExact }) => {
    const chipKey = getSubjectKey(note.subject);
    const highlightedTitle = highlightQueryText(note.title, query);
    return `
      <li class="suggestion-item ${isExact ? 'exact-dup' : ''}" data-note-id="${escapeHtml(note.id || '')}" data-note-title="${escapeHtml(note.title)}">
        <div class="suggestion-item-left">
          <span class="suggestion-match-icon">${isExact ? '⚠️' : '🔍'}</span>
          <div class="suggestion-text-wrap">
            <span class="suggestion-title">${highlightedTitle}</span>
            <div class="suggestion-meta-row">
              <span class="subject-chip ${chipKey}" style="font-size: 0.65rem; padding: 1px 5px;">${escapeHtml(note.subject || 'Note')}</span>
              ${(note.tags || []).slice(0, 2).map(t => `<span class="table-tag" style="font-size: 0.65rem; padding: 1px 4px;">#${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="suggestion-item-right">
          ${isExact 
            ? '<span class="exact-duplicate-badge">⚠️ Exact Duplicate</span>' 
            : '<span class="similar-match-badge">Similar Note</span>'}
          <button type="button" class="suggestion-view-btn" data-preview-id="${escapeHtml(note.id || '')}" title="View note preview in popup">👁️ View</button>
        </div>
      </li>
    `;
  }).join("");

  // Attach handlers for suggestion click / view
  list.querySelectorAll(".suggestion-view-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const noteId = btn.dataset.previewId;
      if (noteId) openLightbox(noteId);
    });
  });

  list.querySelectorAll(".suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      const noteTitle = item.dataset.noteTitle;
      const titleInput = $("#studio-note-title");
      if (titleInput && noteTitle) {
        titleInput.value = noteTitle;
        const charCount = $("#studio-title-char-count");
        if (charCount) charCount.textContent = `${noteTitle.length}/80`;
        updateLivePopupPreview();
      }
      dropdown.hidden = true;
    });
  });
}

// ==========================================
// 5.1 Real-Time Live Home Page Notes Popup Window Preview
// ==========================================
function updateLivePopupPreview() {
  const titleInput = $("#studio-note-title");
  const title = (titleInput?.value || "").trim() || "Indian Constitution – Fundamental Rights & Preamble";
  const subjectSelect = $("#studio-note-subject");
  const subject = subjectSelect ? subjectSelect.value : "Polity";
  const subjectKey = getSubjectKey(subject);
  const catEmojiMap = {
    "History": "📜 History",
    "Polity": "⚖️ Polity",
    "Economy": "📈 Economy",
    "Geography": "🌍 Geography",
    "Art and Culture": "🎨 Art and Culture",
    "Maths": "📐 Maths",
    "Science": "🔬 Science",
    "English": "🔤 English",
    "Others": "📁 Others"
  };

  const simBadge = $("#sim-popup-badge") || $("#sim-subject-badge");
  if (simBadge) {
    simBadge.textContent = catEmojiMap[subject] || `⚖️ ${subject}`;
    simBadge.className = `subject-chip ${subjectKey}`;
  }

  const simTitle = $("#sim-popup-title") || $("#sim-title-text");
  if (simTitle) {
    simTitle.textContent = title;
  }

  const tagsInput = $("#studio-note-tags");
  const tagsText = $("#sim-tags-preview-text");
  const simTagsRow = $("#sim-tags-row");
  if (tagsInput) {
    const tags = tagsInput.value.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
    if (tagsText) {
      if (tags.length === 0) {
        tagsText.textContent = "#UPSC #Constitution";
      } else {
        tagsText.textContent = tags.map(t => `#${t}`).join(" ");
      }
    }
    if (simTagsRow) {
      if (tags.length === 0) {
        simTagsRow.innerHTML = `<span class="sim-tag">#UPSC</span><span class="sim-tag">#Constitution</span>`;
      } else {
        simTagsRow.innerHTML = tags.map(t => `<span class="sim-tag">#${escapeHtml(t)}</span>`).join("");
      }
    }
  }

  const simImg = $("#sim-popup-image");
  const simMediaEmpty = $("#sim-media-empty");
  const rawUrl = selectedImageUrl || selectedImageData || ($("#studio-image-url")?.value || "").trim();
  if (simImg) {
    if (rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("data:image/"))) {
      simImg.src = rawUrl;
      simImg.style.display = "block";
      if (simMediaEmpty) simMediaEmpty.style.display = "none";
    } else {
      simImg.style.display = "none";
      if (simMediaEmpty) simMediaEmpty.style.display = "flex";
    }
  }

  const simOverview = $("#sim-popup-overview-text");
  const editor = $("#studio-note-overview-editor");
  const rawHtml = editor ? editor.innerHTML.trim() : "";
  const rawText = editor ? editor.innerText.trim() : "";
  if (simOverview) {
    if (rawText.length > 0) {
      simOverview.innerHTML = formatOverviewHtml(rawHtml);
    } else {
      simOverview.innerHTML = `<p class="sim-empty-overview-placeholder">Your formatted study notes, highlighted keywords, and exam explanations will appear here in real-time as you write in the editor.</p>`;
    }
  }
}

function setupPublishStudio() {
  const titleInput = $("#studio-note-title");
  const charCount = $("#studio-title-char-count");
  const subjectSelect = $("#studio-note-subject");
  const categoryPills = $$(".pub-cat-pill");
  const tagsInput = $("#studio-note-tags");

  // 1. Live Title input, duplicate suggestion detector & character counter
  titleInput?.addEventListener("input", () => {
    const val = titleInput.value;
    if (charCount) charCount.textContent = `${val.length}/80`;
    renderPublishTitleSuggestions(val);
    updateLivePopupPreview();
  });

  titleInput?.addEventListener("focus", () => {
    renderPublishTitleSuggestions(titleInput.value);
  });

  // Close dropdown on click outside
  document.addEventListener("click", e => {
    if (!e.target.closest(".title-input-wrap-relative")) {
      const dropdown = $("#studio-title-suggestions-dropdown");
      if (dropdown) dropdown.hidden = true;
    }
  });

  // Escape key closes dropdown
  titleInput?.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const dropdown = $("#studio-title-suggestions-dropdown");
      if (dropdown) dropdown.hidden = true;
    }
  });

  // 1.5 Live Overview character counter
  const overviewInput = $("#studio-note-overview");
  const overviewCharCount = $("#studio-overview-char-count");
  overviewInput?.addEventListener("input", () => {
    if (overviewCharCount) overviewCharCount.textContent = `${overviewInput.value.length}/2000`;
    updateLivePopupPreview();
  });

  // 2. Category Pill click handler
  categoryPills.forEach(pill => {
    pill.addEventListener("click", () => {
      categoryPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const catVal = pill.dataset.catVal;
      if (subjectSelect) {
        subjectSelect.value = catVal;
      }
      updateLivePopupPreview();
    });
  });

  // 3. Live Tags Simulator & Dynamic Quick Tag Filtering
  const handleTagsInput = () => {
    if (!tagsInput) return;
    const raw = tagsInput.value;
    updateLivePopupPreview();

    // Filter existing tag suggestions based on the last token being typed
    const currentToken = raw.split(",").pop().trim().replace(/^#/, "");
    renderPublishTagSuggestions(currentToken);
  };

  tagsInput?.addEventListener("input", handleTagsInput);
  tagsInput?.addEventListener("focus", () => {
    const currentToken = (tagsInput.value || "").split(",").pop().trim().replace(/^#/, "");
    renderPublishTagSuggestions(currentToken);
  });

  // Initial tag render & preview initialization
  renderPublishTagSuggestions("");
  updateLivePopupPreview();

  // 4. Verification Modal Zoom & Close Controls
  const verifyDialog = $("#admin-publish-verify-dialog");
  $("#verify-zoom-in")?.addEventListener("click", () => {
    currentVerifyZoom = Math.min(currentVerifyZoom + 0.25, 3);
    applyVerifyZoom();
  });
  $("#verify-zoom-out")?.addEventListener("click", () => {
    currentVerifyZoom = Math.max(currentVerifyZoom - 0.25, 0.5);
    applyVerifyZoom();
  });
  $("#verify-zoom-reset")?.addEventListener("click", () => {
    currentVerifyZoom = 1;
    applyVerifyZoom();
  });

  $("#verify-close-btn")?.addEventListener("click", () => {
    verifyDialog?.close();
  });
  $("#verify-cancel-btn")?.addEventListener("click", () => {
    verifyDialog?.close();
  });

  verifyDialog?.addEventListener("click", e => {
    if (e.target === verifyDialog) {
      verifyDialog.close();
    }
  });

  // Direct Inspect Button on Card Simulator
  $("#open-verify-preview-btn")?.addEventListener("click", () => {
    openPublishVerificationModal();
  });

  // Verification Confirm Publish Button
  $("#verify-confirm-btn")?.addEventListener("click", async () => {
    await executePublishNote();
  });
}

// ==========================================
// Google Gemini AI 1-Click Auto-Fill System
// ==========================================
function formatAiOverviewHtml(raw) {
  if (!raw) return "";
  if (raw.includes("<p>") || raw.includes("<ul>") || raw.includes("<li>")) {
    return raw;
  }
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  let html = "";
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
      if (!inList) { html += "<ul>"; inList = true; }
      const bulletText = line.replace(/^[•\-\*]\s*/, "");
      html += `<li>${bulletText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

function openGeminiConfigModal(optionalMsg) {
  const dialog = $("#admin-gemini-key-dialog");
  if (!dialog) return;
  const statusText = $("#gemini-current-status");
  if (statusText) {
    statusText.textContent = optionalMsg || "Checking saved key...";
    statusText.style.color = "var(--ink-muted)";
  }
  dialog.showModal();

  fetch("/api/admin/ai/status")
    .then(r => r.ok ? r.json() : { configured: false })
    .then(data => {
      if (statusText) {
        if (data.configured) {
          statusText.textContent = `🟢 Key Connected (${data.maskedKey})`;
          statusText.style.color = "#10b981";
        } else {
          statusText.textContent = optionalMsg || "⚪ No API key configured yet. Free key from Google AI Studio works instantly.";
          statusText.style.color = "#f59e0b";
        }
      }
    })
    .catch(() => {});
}

async function triggerGeminiAutoFill() {
  const urlInput = $("#studio-image-url");
  const titleInput = $("#studio-note-title");
  const imageUrl = (urlInput?.value || "").trim();
  const currentTitle = (titleInput?.value || "").trim();

  if (!imageUrl && !currentTitle) {
    showToast("Please paste a Cloudinary Image URL or enter a draft title first.", "info");
    urlInput?.focus();
    return;
  }

  // 1. Check API Key status
  try {
    const statusRes = await fetch("/api/admin/ai/status");
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.configured) {
        openGeminiConfigModal("Please configure your free Gemini API Key first to enable 1-click Auto-Fill.");
        return;
      }
    }
  } catch {}

  // 2. Set UI loading state
  const autofillBtn = $("#studio-ai-autofill-btn");
  const urlAiBtn = $("#studio-url-ai-btn");
  const banner = $("#studio-ai-banner");

  if (autofillBtn) autofillBtn.disabled = true;
  if (urlAiBtn) urlAiBtn.disabled = true;
  if (banner) banner.hidden = false;

  try {
    const res = await fetch("/api/admin/ai/auto-fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, currentTitle })
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.needsKey) {
        openGeminiConfigModal("Please enter your free Google Gemini API Key.");
        return;
      }
      showToast(data.error || "Failed to analyze diagram with Gemini AI.", "error");
      return;
    }

    const { title, subject, tags, overview } = data.data;

    // A. Auto-populate Title
    if (title && titleInput) {
      titleInput.value = title;
      const charCount = $("#studio-title-char-count");
      if (charCount) charCount.textContent = `${title.length}/80`;
      renderPublishTitleSuggestions(title);
    }

    // B. Auto-select Subject & Category Pill
    if (subject) {
      const categoryPills = $$(".pub-cat-pill");
      const subjectSelect = $("#studio-note-subject");
      categoryPills.forEach(pill => {
        const match = pill.dataset.catVal.toLowerCase() === subject.toLowerCase();
        pill.classList.toggle("active", match);
      });
      if (subjectSelect) subjectSelect.value = subject;
    }

    // C. Auto-populate Tags
    if (Array.isArray(tags) && tags.length > 0) {
      const tagsInput = $("#studio-note-tags");
      if (tagsInput) {
        tagsInput.value = tags.join(", ");
        renderPublishTagSuggestions("");
      }
    }

    // D. Auto-populate Overview in Rich Text Editor
    if (overview) {
      const overviewEditor = $("#studio-note-overview-editor");
      const hiddenOverview = $("#studio-note-overview");
      const overviewCharCount = $("#studio-overview-char-count");
      const formattedHtml = formatAiOverviewHtml(overview);
      if (overviewEditor) {
        overviewEditor.innerHTML = formattedHtml;
        if (hiddenOverview) hiddenOverview.value = formattedHtml;
        const plainLen = overviewEditor.innerText.length;
        if (overviewCharCount) overviewCharCount.textContent = `${plainLen}/2000`;
      }
    }

    updateLivePopupPreview();
    showToast("✨ Diagram analyzed & note auto-filled by Gemini AI! Review and preview when ready.", "success");
  } catch (err) {
    showToast(err.message || "Failed to connect to Gemini AI.", "error");
  } finally {
    if (autofillBtn) autofillBtn.disabled = false;
    if (urlAiBtn) urlAiBtn.disabled = false;
    if (banner) banner.hidden = true;
  }
}

function setupGeminiAiAutofill() {
  // Triggers
  $("#studio-ai-autofill-btn")?.addEventListener("click", () => {
    triggerGeminiAutoFill();
  });
  $("#studio-url-ai-btn")?.addEventListener("click", () => {
    triggerGeminiAutoFill();
  });
  $("#studio-ai-config-btn")?.addEventListener("click", () => {
    openGeminiConfigModal();
  });

  // Modal close
  const dialog = $("#admin-gemini-key-dialog");
  $("#gemini-key-close-btn")?.addEventListener("click", () => {
    dialog?.close();
  });
  dialog?.addEventListener("click", e => {
    if (e.target === dialog) dialog.close();
  });

  // Toggle key visibility
  const toggleBtn = $("#gemini-key-toggle-vis");
  const keyInput = $("#gemini-api-key-input");
  toggleBtn?.addEventListener("click", () => {
    if (keyInput) {
      keyInput.type = keyInput.type === "password" ? "text" : "password";
      toggleBtn.textContent = keyInput.type === "password" ? "👁️" : "🙈";
    }
  });

  // Test Key
  $("#gemini-test-key-btn")?.addEventListener("click", async () => {
    const key = (keyInput?.value || "").trim();
    const statusText = $("#gemini-current-status");
    if (!key) {
      showToast("Please enter an API key to test.", "info");
      keyInput?.focus();
      return;
    }
    if (statusText) {
      statusText.textContent = "⏳ Testing connection with Google Gemini...";
      statusText.style.color = "var(--ink-muted)";
    }
    try {
      const res = await fetch("/api/admin/ai/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (statusText) {
          statusText.textContent = "🟢 Connection successful! Valid Gemini API Key.";
          statusText.style.color = "#10b981";
        }
        showToast("Gemini API key is valid and connected!", "success");
      } else {
        if (statusText) {
          statusText.textContent = `🔴 ${data.error || "Connection failed"}`;
          statusText.style.color = "#ef4444";
        }
        showToast(data.error || "Test connection failed.", "error");
      }
    } catch (err) {
      if (statusText) {
        statusText.textContent = `🔴 ${err.message}`;
        statusText.style.color = "#ef4444";
      }
    }
  });

  // Save Key Form Submit
  $("#gemini-key-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const key = (keyInput?.value || "").trim();
    const statusText = $("#gemini-current-status");
    if (!key) return;

    try {
      const res = await fetch("/api/admin/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Google Gemini API Key saved successfully! ✨", "success");
        if (statusText) {
          statusText.textContent = `🟢 Connected (${data.maskedKey})`;
          statusText.style.color = "#10b981";
        }
        setTimeout(() => {
          dialog?.close();
        }, 600);
      } else {
        showToast(data.error || "Failed to save API key.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to save API key.", "error");
    }
  });
}

// ==========================================
// 5.2 Publish Verification Modal Logic
// ==========================================
let currentVerifyZoom = 1;

function openPublishVerificationModal() {
  const titleInput = $("#studio-note-title");
  const subjectInput = $("#studio-note-subject");
  const tagsInput = $("#studio-note-tags");
  const msg = $("#studio-upload-msg");
  const dialog = $("#admin-publish-verify-dialog");

  const title = titleInput ? titleInput.value.trim() : "";
  const subject = subjectInput ? subjectInput.value : "";
  const rawTags = tagsInput ? tagsInput.value : "";
  const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);

  const activeImage = selectedImageUrl || ($("#studio-image-url")?.value || "").trim();

  // Strict Validation for all mandatory fields
  if (!activeImage) {
    showToast("Please paste a Cloudinary Image URL.", "error");
    if (msg) {
      msg.textContent = "Cloudinary Image URL is mandatory. Please paste the image link.";
      msg.className = "form-message error";
    }
    $("#studio-image-url")?.focus();
    return;
  }

  if (!title) {
    showToast("Topic Title is mandatory.", "error");
    if (msg) {
      msg.textContent = "Topic Title is mandatory. Please enter a title.";
      msg.className = "form-message error";
    }
    titleInput?.focus();
    return;
  }

  if (!subject) {
    showToast("Subject & Category is mandatory.", "error");
    if (msg) {
      msg.textContent = "Subject & Category is mandatory. Please choose a category.";
      msg.className = "form-message error";
    }
    return;
  }

  if (parsedTags.length === 0) {
    showToast("Multiple Tags is mandatory. Enter at least one tag.", "error");
    if (msg) {
      msg.textContent = "Multiple Tags is mandatory. Please enter at least one tag (e.g. UPSC, Polity).";
      msg.className = "form-message error";
    }
    tagsInput?.focus();
    return;
  }

  // Populate Verification Lightbox Modal (Exact Home Page Notes View)
  const modalImg = $("#verify-modal-img");
  const modalTitle = $("#verify-meta-title");
  const modalSubj = $("#verify-meta-subject");
  const modalTagsText = $("#verify-meta-tags-text");
  const modalOverview = $("#verify-modal-overview-text");

  if (modalImg) {
    modalImg.src = activeImage;
    modalImg.style.display = "block";
  }
  if (modalTitle) {
    modalTitle.textContent = title;
  }
  
  const catEmojiMap = {
    "History": "📜 History",
    "Polity": "⚖️ Polity",
    "Economy": "📈 Economy",
    "Geography": "🌍 Geography",
    "Art and Culture": "🎨 Art & Culture",
    "Maths": "📐 Maths",
    "Science": "🔬 Science",
    "English": "🔤 English",
    "Others": "📁 Others"
  };

  if (modalSubj) {
    modalSubj.textContent = catEmojiMap[subject] || `⚖️ ${subject}`;
    modalSubj.className = `subject-chip ${getSubjectKey(subject)}`;
  }

  if (modalTagsText) {
    modalTagsText.textContent = parsedTags.map(t => `#${t}`).join(" ");
  }

  const editor = $("#studio-note-overview-editor");
  const rawHtml = editor ? editor.innerHTML.trim() : "";
  const rawOverview = rawHtml || ($("#studio-note-overview")?.value || "").trim();
  if (modalOverview) {
    modalOverview.innerHTML = formatOverviewHtml(rawOverview);
  }

  // Reset zoom & level text
  currentVerifyZoom = 1;
  applyVerifyZoom();

  if (dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }
}

function applyVerifyZoom() {
  const modalImg = $("#verify-modal-img");
  const levelText = $("#verify-zoom-level");
  if (modalImg) {
    modalImg.style.transform = `scale(${currentVerifyZoom})`;
  }
  if (levelText) {
    levelText.textContent = `${Math.round(currentVerifyZoom * 100)}%`;
  }
}

async function executePublishNote() {
  const titleInput = $("#studio-note-title");
  const subjectInput = $("#studio-note-subject");
  const tagsInput = $("#studio-note-tags");
  const msg = $("#studio-upload-msg");
  const submitBtn = $("#studio-submit-btn");
  const confirmBtn = $("#verify-confirm-btn");
  const verifyDialog = $("#admin-publish-verify-dialog");

  const activeImage = selectedImageUrl || ($("#studio-image-url")?.value || "").trim();
  if (!activeImage) {
    showToast("Please paste a Cloudinary Image URL first.", "error");
    return;
  }

  const rawTags = tagsInput ? tagsInput.value : "";
  const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
  const overviewEditor = $("#studio-note-overview-editor");
  const overview = overviewEditor ? overviewEditor.innerHTML.trim() : ($("#studio-note-overview")?.value || "").trim();

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span>⏳</span> Publishing to Library…`;
  }
  if (submitBtn) submitBtn.disabled = true;

  try {
    const payload = {
      title: titleInput.value.trim(),
      subject: subjectInput.value,
      tags: parsedTags,
      overview: overview,
      imageUrl: activeImage
    };

    await api("/api/admin/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    showToast("✓ Revision note published! Live on Home Page.", "success");
    if (msg) {
      msg.textContent = "✓ Published! Note is now live for all students.";
      msg.className = "form-message success";
    }

    if (verifyDialog) verifyDialog.close();

    // Reset Form & Preview on successful publish
    const uploadForm = $("#admin-upload-form");
    if (uploadForm) uploadForm.reset();
    if (overviewEditor) overviewEditor.innerHTML = "";
    selectedImageData = null;
    selectedImageUrl = null;
    const urlInput = $("#studio-image-url");
    if (urlInput) urlInput.value = "";
    const urlClearBtn = $("#studio-url-clear-btn");
    if (urlClearBtn) urlClearBtn.hidden = true;
    const urlStatus = $("#studio-url-status");
    if (urlStatus) {
      urlStatus.hidden = true;
      urlStatus.textContent = "";
    }

    const dropzonePrompt = $("#dropzone-prompt");
    if (dropzonePrompt) dropzonePrompt.hidden = false;
    const dropzonePreviewWrap = $("#dropzone-preview-wrap");
    if (dropzonePreviewWrap) dropzonePreviewWrap.hidden = true;
    const dropzoneImgPreview = $("#dropzone-img-preview");
    if (dropzoneImgPreview) dropzoneImgPreview.src = "";

    const charCount = $("#studio-title-char-count");
    if (charCount) charCount.textContent = "0/80";
    const ovCount = $("#studio-overview-char-count");
    if (ovCount) ovCount.textContent = "0/2000";
    const titleDropdown = $("#studio-title-suggestions-dropdown");
    if (titleDropdown) titleDropdown.hidden = true;
    const titleDupAlert = $("#studio-title-duplicate-alert");
    if (titleDupAlert) {
      titleDupAlert.hidden = true;
      titleDupAlert.innerHTML = "";
    }
    $$(".pub-cat-pill").forEach(p => p.classList.toggle("active", p.dataset.catVal === "Polity"));
    if (typeof updateLivePopupPreview === "function") updateLivePopupPreview();

    await loadDashboardData();
  } catch (err) {
    console.error("Publish Note Error:", err);
    showToast("Upload Error: " + (err.message || "Failed to save note to server."), "error");
    if (msg) {
      msg.textContent = "Error: " + (err.message || "Failed to publish note to server.");
      msg.className = "form-message error";
    }
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<span>🚀</span> Confirm & Publish to Live Website`;
    }
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================
// 6. Edit Note Modal Operations
// ==========================================
function openEditModal(noteId) {
  const note = allNotes.find(n => n.id === noteId);
  if (!note) return;

  $("#edit-note-id").value = note.id;
  const titleInput = $("#edit-note-title");
  if (titleInput) {
    titleInput.value = note.title || "";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  $("#edit-note-subject").value = note.subject;
  
  const tagsInput = $("#edit-note-tags");
  if (tagsInput) {
    tagsInput.value = (note.tags || []).join(", ");
    tagsInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const imgUrlInput = $("#edit-note-image-url");
  const imgPreview = $("#edit-img-preview");
  const previewBox = $("#edit-image-preview-box");
  if (imgUrlInput) {
    imgUrlInput.value = note.imageUrl || "";
    if (note.imageUrl) {
      if (imgPreview) imgPreview.src = note.imageUrl;
      if (previewBox) previewBox.hidden = false;
    } else {
      if (previewBox) previewBox.hidden = true;
    }
  }

  const rawOverview = note.overview || note.description || "";
  const overviewInput = $("#edit-note-overview");
  const overviewEditor = $("#edit-note-overview-editor");
  const overviewCharCount = $("#edit-overview-char-count");

  if (overviewEditor) {
    if (rawOverview.includes("<p>") || rawOverview.includes("<ul>") || rawOverview.includes("<div>")) {
      overviewEditor.innerHTML = rawOverview;
    } else {
      overviewEditor.innerHTML = formatAiOverviewHtml(rawOverview);
    }
  }
  if (overviewInput) {
    overviewInput.value = overviewEditor ? overviewEditor.innerHTML : rawOverview;
  }
  if (overviewCharCount) {
    const textLen = overviewEditor ? (overviewEditor.innerText || "").replace(/\n$/, "").length : rawOverview.length;
    overviewCharCount.textContent = `${textLen}/2000`;
  }

  const msg = $("#edit-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }

  const dialog = $("#admin-edit-dialog");
  if (dialog && !dialog.open) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      // Fallback for browsers/webviews without the native <dialog> API.
      dialog.setAttribute("open", "");
    }
  }
}

// ==========================================
// 6.5 Live Spelling Correction & Red Wavy Underline Alert System
// ==========================================
const EXAM_VOCABULARY = [
  "title", "titles", "topic", "topics", "note", "notes", "multiple", "tag", "tags", "revision", "concept", "clear", "smart", "better",
  "publish", "modify", "library", "content", "subject", "category", "prelims", "mains", "interview",
  "history", "polity", "economy", "geography", "science", "maths", "english", "others",
  "article", "articles", "constitution", "amendment", "amendments", "preamble", "parliament",
  "judiciary", "governor", "president", "writs", "writ", "monetary", "inflation", "dynasty",
  "harappa", "harappan", "mesolithic", "neolithic", "paleolithic", "palaeolithic", "rigvedic",
  "buddhism", "buddhist", "jainism", "sultanate", "viceroy", "viceroys", "photosynthesis",
  "respiration", "circulatory", "thermodynamics", "gravitation", "trigonometry", "quadrilateral",
  "percentage", "syllogism", "archaeology", "archaeological", "municipality", "municipalities",
  "finance", "budget", "plateau", "monsoon", "pollution", "government", "environment",
  "committee", "independence", "separate", "occurrence", "definitely", "privilege",
  "legislature", "representation", "democracy", "sovereignty", "secularism", "socialism",
  "administration", "bureaucracy", "sovereign", "fraternity", "fundamental", "citizenship",
  "directive", "principles", "emergency", "provisions", "ordinance", "revolution",
  "movement", "civilization", "atmosphere", "biodiversity", "ecosystem", "sanctuary",
  "biosphere", "glacier", "glaciers", "volcano", "volcanoes", "earthquake", "tsunami",
  "temperature", "precipitation", "humidity", "agriculture", "irrigation", "microbiology",
  "heredity", "evolution", "electromagnetism", "acceleration", "mensuration", "probability",
  "permutation", "combination", "comprehension", "reasoning", "aptitude", "quantitative",
  "formula", "formulas", "structure", "system", "policy", "national", "international",
  "supreme", "court", "high", "tribunal", "tribunals", "council", "assembly", "election",
  "commission", "powers", "duties", "schedule", "schedules", "part", "parts", "rights",
  "written", "writing", "received", "because", "until", "tomorrow", "development",
  "important", "introduction", "summary", "analysis", "questions", "answers", "previous",
  "year", "years", "general", "studies", "awareness", "current", "affairs", "static",
  "upsc", "ssc", "cgl", "chsl", "rrb", "ntpc", "ibps", "sbi", "rbi", "drdo", "isro", "nda", "cds"
];

const KNOWN_TYPOS = {
  "tittle": "title",
  "tittles": "titles",
  "topc": "topic",
  "notess": "notes",
  "notse": "notes",
  "multple": "multiple",
  "taggs": "tags",
  "artical": "article",
  "articals": "articles",
  "constituion": "constitution",
  "constiution": "constitution",
  "consitution": "constitution",
  "constutution": "constitution",
  "constituon": "constitution",
  "amendmant": "amendment",
  "amendmants": "amendments",
  "amendemnt": "amendment",
  "preambel": "preamble",
  "preambale": "preamble",
  "parliment": "parliament",
  "parlament": "parliament",
  "parlimant": "parliament",
  "parleament": "parliament",
  "judicary": "judiciary",
  "judicairy": "judiciary",
  "judicuary": "judiciary",
  "governer": "governor",
  "govener": "governor",
  "presidant": "president",
  "presedent": "president",
  "writts": "writs",
  "writt": "writ",
  "monetry": "monetary",
  "monetory": "monetary",
  "inflasion": "inflation",
  "inflaton": "inflation",
  "dynesty": "dynasty",
  "geogrophy": "geography",
  "geograhy": "geography",
  "geographi": "geography",
  "histroy": "history",
  "historie": "history",
  "scienc": "science",
  "sciense": "science",
  "mathes": "maths",
  "economi": "economy",
  "harapa": "harappa",
  "harapan": "harappan",
  "harappan": "harappan",
  "mesolithic": "mesolithic",
  "neolithic": "neolithic",
  "paleolithic": "palaeolithic",
  "rigvedic": "rigvedic",
  "budhism": "buddhism",
  "budhist": "buddhist",
  "jainism": "jainism",
  "sultanate": "sultanate",
  "sultnate": "sultanate",
  "sultanet": "sultanate",
  "viceroy": "viceroy",
  "viceroys": "viceroys",
  "vicroy": "viceroy",
  "photosynthisis": "photosynthesis",
  "photosythesis": "photosynthesis",
  "photosynthesise": "photosynthesis",
  "respiration": "respiration",
  "respirasion": "respiration",
  "respiraton": "respiration",
  "circulatory": "circulatory",
  "circulatery": "circulatory",
  "circulary": "circulatory",
  "thermodynamics": "thermodynamics",
  "thermodynamcis": "thermodynamics",
  "gravitation": "gravitation",
  "gravitasion": "gravitation",
  "trigonometry": "trigonometry",
  "trigonometery": "trigonometry",
  "trignometry": "trigonometry",
  "quadrilateral": "quadrilateral",
  "quadrilatral": "quadrilateral",
  "quadrilaterl": "quadrilateral",
  "percentage": "percentage",
  "percntage": "percentage",
  "percentge": "percentage",
  "persentage": "percentage",
  "syllogism": "syllogism",
  "syllogisum": "syllogism",
  "silogism": "syllogism",
  "archaeology": "archaeology",
  "archeology": "archaeology",
  "archeological": "archaeological",
  "municipality": "municipality",
  "muncipality": "municipality",
  "muncipalities": "municipalities",
  "municipility": "municipality",
  "finance": "finance",
  "finanace": "finance",
  "finaance": "finance",
  "budget": "budget",
  "buget": "budget",
  "budjet": "budget",
  "plateau": "plateau",
  "platau": "plateau",
  "plateu": "plateau",
  "monsoon": "monsoon",
  "mansoon": "monsoon",
  "monsoom": "monsoon",
  "pollution": "pollution",
  "pollusion": "pollution",
  "polusion": "pollution",
  "government": "government",
  "goverment": "government",
  "governmnt": "government",
  "environment": "environment",
  "enviroment": "environment",
  "enviromental": "environment",
  "committee": "committee",
  "commitee": "committee",
  "comittee": "committee",
  "committe": "committee",
  "independence": "independence",
  "independance": "independence",
  "indepedence": "independence",
  "separate": "separate",
  "seperate": "separate",
  "seperation": "separation",
  "occurrence": "occurrence",
  "occurance": "occurrence",
  "occurence": "occurrence",
  "definitely": "definitely",
  "definately": "definitely",
  "definitly": "definitely",
  "privilege": "privilege",
  "privilage": "privilege",
  "priviledge": "privilege",
  "legislature": "legislature",
  "legislater": "legislature",
  "legislatur": "legislature",
  "representation": "representation",
  "represenation": "representation",
  "representaion": "representation",
  "democracy": "democracy",
  "democrasy": "democracy",
  "democarcy": "democracy",
  "sovereignty": "sovereignty",
  "sovereignity": "sovereignty",
  "soverignty": "sovereignty",
  "secularism": "secularism",
  "seculer": "secular",
  "socialism": "socialism",
  "socialisem": "socialism",
  "administration": "administration",
  "administrasion": "administration",
  "administrtion": "administration",
  "bureaucracy": "bureaucracy",
  "bureacracy": "bureaucracy",
  "bureaucrasy": "bureaucracy",
  "sovereign": "sovereign",
  "soverign": "sovereign",
  "fraternity": "fraternity",
  "fraternety": "fraternity",
  "fundamental": "fundamental",
  "fundamantal": "fundamental",
  "fundemental": "fundamental",
  "citizenship": "citizenship",
  "citiznship": "citizenship",
  "directive": "directive",
  "directiv": "directive",
  "emergency": "emergency",
  "emergensy": "emergency",
  "provisions": "provisions",
  "provisons": "provisions",
  "ordinance": "ordinance",
  "ordinence": "ordinance",
  "revolution": "revolution",
  "revolusion": "revolution",
  "movement": "movement",
  "movment": "movement",
  "civilization": "civilization",
  "civilisation": "civilization",
  "civilizaton": "civilization",
  "atmosphere": "atmosphere",
  "atmospher": "atmosphere",
  "biodiversity": "biodiversity",
  "biodiveristy": "biodiversity",
  "ecosystem": "ecosystem",
  "ecosystm": "ecosystem",
  "sanctuary": "sanctuary",
  "sanctury": "sanctuary",
  "sancturies": "sanctuaries",
  "biosphere": "biosphere",
  "biopshere": "biosphere",
  "glacier": "glacier",
  "glaciers": "glaciers",
  "glaciar": "glacier",
  "volcano": "volcano",
  "volcanoes": "volcanoes",
  "volcanos": "volcanoes",
  "valcano": "volcano",
  "earthquake": "earthquake",
  "earthquak": "earthquake",
  "tsunami": "tsunami",
  "temperature": "temperature",
  "temparature": "temperature",
  "tempreture": "temperature",
  "precipitation": "precipitation",
  "precipitasion": "precipitation",
  "humidity": "humidity",
  "humedity": "humidity",
  "agriculture": "agriculture",
  "agriculter": "agriculture",
  "irrigation": "irrigation",
  "irrigasion": "irrigation",
  "microbiology": "microbiology",
  "microbilogy": "microbiology",
  "heredity": "heredity",
  "heridity": "heredity",
  "evolution": "evolution",
  "evolusion": "evolution",
  "electromagnetism": "electromagnetism",
  "electromagntism": "electromagnetism",
  "acceleration": "acceleration",
  "accelaration": "acceleration",
  "mensuration": "mensuration",
  "mensurasion": "mensuration",
  "probability": "probability",
  "probablity": "probability",
  "permutation": "permutation",
  "permutasion": "permutation",
  "combination": "combination",
  "combinasion": "combination",
  "comprehension": "comprehension",
  "comprehention": "comprehension",
  "reasoning": "reasoning",
  "resonning": "reasoning",
  "aptitude": "aptitude",
  "aptitute": "aptitude",
  "quantitative": "quantitative",
  "quantative": "quantitative",
  "interview": "interview",
  "interveiw": "interview",
  "writting": "writing",
  "recieved": "received",
  "becuase": "because",
  "untill": "until",
  "alot": "a lot",
  "tommorow": "tomorrow"
};

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function matchCase(original, replacement) {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
}

function findSpellingSuggestion(rawWord) {
  const lower = rawWord.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
  if (!lower || lower.length < 3) return null;

  // 1. Direct typo dictionary check
  if (KNOWN_TYPOS[lower]) {
    return matchCase(rawWord, KNOWN_TYPOS[lower]);
  }

  // 2. If it's already a valid vocab word, numbers, or uppercase acronym
  if (EXAM_VOCABULARY.includes(lower) || /^\d+$/.test(lower) || (rawWord.length <= 5 && rawWord === rawWord.toUpperCase())) {
    return null;
  }

  // 3. Levenshtein fuzzy distance check
  let bestMatch = null;
  let minDistance = 999;
  const maxAllowedDist = lower.length <= 4 ? 1 : (lower.length <= 7 ? 2 : 3);

  for (const vocab of EXAM_VOCABULARY) {
    if (Math.abs(vocab.length - lower.length) > maxAllowedDist) continue;
    const dist = levenshteinDistance(lower, vocab);
    if (dist < minDistance && dist <= maxAllowedDist) {
      minDistance = dist;
      bestMatch = vocab;
    }
  }

  if (bestMatch && minDistance <= maxAllowedDist) {
    return matchCase(rawWord, bestMatch);
  }

  return null;
}

function findSpellingErrors(text) {
  if (!text || typeof text !== "string") return [];
  const words = text.match(/[A-Za-zÀ-ÿ0-9'-]+/g) || [];
  const errors = [];
  const seen = new Set();

  for (const rawWord of words) {
    const suggested = findSpellingSuggestion(rawWord);
    if (suggested && suggested.toLowerCase() !== rawWord.toLowerCase()) {
      const key = `${rawWord}->${suggested}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push({
          wrong: rawWord,
          correct: suggested
        });
      }
    }
  }
  return errors;
}

function attachSpellChecker(inputEl, alertContainerEl, onFixedCallback = null) {
  if (!inputEl || !alertContainerEl) return;

  const updateSpellCheck = () => {
    const val = inputEl.value || "";
    if (!val.trim()) {
      alertContainerEl.hidden = true;
      alertContainerEl.setAttribute("hidden", "");
      alertContainerEl.style.setProperty("display", "none", "important");
      inputEl.classList.remove("input-has-spelling-error");
      return;
    }

    const errors = findSpellingErrors(val);
    if (errors.length > 0) {
      inputEl.classList.add("input-has-spelling-error");
      alertContainerEl.hidden = false;
      alertContainerEl.removeAttribute("hidden");
      alertContainerEl.style.setProperty("display", "flex", "important");
      
      alertContainerEl.innerHTML = `
        <span class="spelling-alert-label">
          <span>🔴</span> Spelling error detected:
        </span>
        ${errors.map(err => `
          <span class="spelling-error-pill">
            <span class="misspelled-word-text" title="Misspelled word (Click to fix)">${escapeHtml(err.wrong)}</span>
            <span class="spell-arrow">➔</span>
            <button type="button" class="spell-fix-btn" data-wrong="${escapeHtml(err.wrong)}" data-correct="${escapeHtml(err.correct)}" title="Click to fix '${escapeHtml(err.wrong)}'">
              <span>✓</span> ${escapeHtml(err.correct)}
            </button>
          </span>
        `).join("")}
      `;

      // Attach click listeners to fix specific misspelled words
      alertContainerEl.querySelectorAll(".spell-fix-btn, .misspelled-word-text").forEach(el => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pill = el.closest(".spelling-error-pill");
          const btn = pill ? pill.querySelector(".spell-fix-btn") : el;
          const wrongWord = btn ? btn.dataset.wrong : null;
          const correctWord = btn ? btn.dataset.correct : null;
          if (!wrongWord || !correctWord) return;

          // Replace only the specific misspelled word
          const escapedWrong = wrongWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escapedWrong}\\b`, "g");
          inputEl.value = inputEl.value.replace(regex, correctWord);

          // Trigger input and recheck
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.focus();

          if (typeof onFixedCallback === "function") {
            onFixedCallback();
          }
          showToast(`✓ Fixed spelling: "${wrongWord}" ➔ "${correctWord}"`, "success");
        });
      });
    } else {
      inputEl.classList.remove("input-has-spelling-error");
      alertContainerEl.hidden = true;
      alertContainerEl.setAttribute("hidden", "");
      alertContainerEl.style.setProperty("display", "none", "important");
    }
  };

  inputEl.addEventListener("input", updateSpellCheck);
  inputEl.addEventListener("focus", updateSpellCheck);
  inputEl.addEventListener("keyup", updateSpellCheck);
  inputEl.addEventListener("paste", () => setTimeout(updateSpellCheck, 50));
}

// ==========================================
// 7. Event Listeners Setup
// ==========================================
let currentAdminView = "dashboard";

function switchAdminView(viewName, updateHash = true) {
  const validViews = ["dashboard", "interactions", "users", "feedback", "missing-searches", "publish", "modify", "profile"];
  if (viewName === "analysis" || viewName === "tags" || !validViews.includes(viewName)) {
    viewName = "dashboard";
  }

  currentAdminView = viewName;
  sessionStorage.setItem("exam_admin_active_view", viewName);
  localStorage.setItem("exam_admin_active_view", viewName);

  if (updateHash && window.location.hash !== `#${viewName}`) {
    try {
      window.location.hash = viewName;
    } catch {
      history.replaceState(null, "", `#${viewName}`);
    }
  }

  // Update Sidebar Navigation Active Highlight
  const navButtons = $$("[data-admin-view]");
  navButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.adminView === viewName);
  });

  const allPanes = $$(".admin-view-pane");
  allPanes.forEach(pane => {
    const isTarget = pane.id === `admin-view-${viewName}`;
    pane.hidden = !isTarget;
    pane.classList.toggle("active", isTarget);
    if (isTarget) {
      pane.removeAttribute("hidden");
      pane.style.removeProperty("display");
    } else {
      pane.setAttribute("hidden", "");
      pane.style.setProperty("display", "none", "important");
    }
  });

  const secName = viewName === "dashboard" 
    ? "Dash Board" 
    : (viewName === "analysis" 
        ? "Category Analysis" 
        : (viewName === "interactions"
            ? "User Interactions"
            : (viewName === "users"
                ? "Users & Students"
                : (viewName === "feedback"
                    ? "Feedback & Suggestions"
                    : (viewName === "missing-searches"
                        ? "Search Demands"
                        : (viewName === "publish" 
                            ? "Publish Studio" 
                            : (viewName === "modify"
                                ? "Content Library"
                                : (viewName === "backup"
                                    ? "Backup & Restore"
                                    : "Admin Profile"))))))));
            
  const secEl = $("#portal-current-section");
  if (secEl) secEl.textContent = secName;
  const greetEl = $("#portal-greeting-heading");
  if (greetEl) {
    greetEl.textContent = viewName === "dashboard" 
      ? "Welcome back, Stephanraj 👋" 
      : (viewName === "analysis" 
          ? "Categories & Subject Analytics 🥧" 
          : (viewName === "interactions"
              ? "Student Engagement & Interaction Telemetry ⚡"
              : (viewName === "users"
                  ? "Google Authenticated Students & Telemetry 👥"
                  : (viewName === "feedback"
                      ? "Student Demands, Ideas & Feedback Analytics 💬"
                      : (viewName === "missing-searches"
                          ? "Student Search Demands & Content Gaps 🔎"
                          : (viewName === "publish" 
                              ? "Publish Revision Note ☁" 
                              : (viewName === "modify"
                                  ? "Content Library Management ✏️"
                                  : (viewName === "backup"
                                      ? "1-Click Master Backup & Restore Center 💾"
                                      : "Administrator Profile & Platform Settings 👤"))))))));
  }

  if (viewName === "dashboard") {
    renderCategoryChart();
    renderRecentNotes();
    renderAnalysisView();
    renderTagsView();
  } else if (viewName === "interactions") {
    renderInteractionsView();
  } else if (viewName === "users") {
    renderUsersView();
  } else if (viewName === "feedback") {
    fetchAdminFeedback();
  } else if (viewName === "missing-searches") {
    renderMissingSearchesView();
  } else if (viewName === "modify") {
    renderTable();
  } else if (viewName === "profile") {
    renderProfileView();
  } else if (viewName === "backup") {
    refreshBackupCenterKpis();
  }
}

async function refreshBackupCenterKpis() {
  const notesCount = (allNotes || []).length;
  const usersCount = (registeredUsers || []).length;
  const interactionsCount = (liveInteractions?.totalLikes || 0) + (liveInteractions?.totalDownloads || 0) + (liveInteractions?.totalViews || 0) + (liveInteractions?.totalShares || 0);

  const notesEl = $("#backup-kpi-notes");
  const usersEl = $("#backup-kpi-users");
  const interEl = $("#backup-kpi-interactions");
  const assetsEl = $("#backup-kpi-assets");

  if (notesEl) notesEl.textContent = `${notesCount} Notes`;
  if (usersEl) usersEl.textContent = `${usersCount} Profiles`;
  if (interEl) interEl.textContent = `${interactionsCount.toLocaleString("en-IN")} Events`;
  if (assetsEl) assetsEl.textContent = "Photo, Logo & QR";

  const badge = $("#backup-status-badge");
  if (badge) badge.textContent = "Safe";
}

function renderProfileView() {
  const notesCountEl = $("#profile-stat-notes");
  const visitsEl = $("#profile-stat-visits");
  const todayEl = $("#profile-stat-today");
  const interEl = $("#profile-stat-interactions");
  const demandsEl = $("#profile-stat-demands");

  if (notesCountEl) notesCountEl.textContent = `${(allNotes || []).length} Notes`;
  
  const visitsTotal = Number($("#metric-visitors-count")?.textContent?.replace(/,/g, "")) || 0;
  if (visitsEl) visitsEl.textContent = `${visitsTotal.toLocaleString("en-IN")} Total`;

  const todayTotal = Number($("#metric-visitors-today")?.textContent?.replace(/,/g, "")) || 0;
  if (todayEl) todayEl.textContent = `${todayTotal.toLocaleString("en-IN")} Today`;

  const totalInteractions = (liveInteractions?.totalLikes || 0) + (liveInteractions?.totalDownloads || 0);
  if (interEl) interEl.textContent = `${totalInteractions.toLocaleString("en-IN")} Actions`;

  const missingKeys = Object.keys(liveInteractions?.missingSearches || {});
  if (demandsEl) demandsEl.textContent = `${missingKeys.length} Topics`;

  // Re-apply admin profile UI to guarantee all fields are populated
  if (typeof adminProfileState !== "undefined") {
    applyAdminProfileUI(adminProfileState);
  }

  // Refresh integrated Backup Center KPIs
  refreshBackupCenterKpis();
}

// ==========================================
// 4.04 Real-Time Clock & Interactive Calendar
// ==========================================
let calCurrentDate = new Date();
let calViewYear = calCurrentDate.getFullYear();
let calViewMonth = calCurrentDate.getMonth();

function updateRealtimeClock() {
  const now = new Date();
  
  // Format DD/MM/YYYY
  const dayNum = now.getDate();
  const day = String(dayNum).padStart(2, "0");
  const monthIdx = now.getMonth();
  const month = String(monthIdx + 1).padStart(2, "0");
  const year = now.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;
  
  // Format Time (12h with AM/PM & seconds)
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // '0' is 12
  const formattedHours = String(hours).padStart(2, "0");
  const timeFormatted = `${formattedHours}:${minutes}:${seconds} ${ampm}`;
  
  // Day of Week
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[now.getDay()];

  // Update Sidebar Widget Elements
  const timeEl = $("#admin-live-time");
  const dateEl = $("#admin-live-date");
  const dayEl = $("#admin-live-day");
  if (timeEl) timeEl.textContent = timeFormatted;
  if (dateEl) dateEl.textContent = dateFormatted;
  if (dayEl) dayEl.textContent = dayName;

  // Update Sidebar Today's Event / Holiday Pill
  const sidebarTodayEventWrap = $("#admin-sidebar-today-event");
  const sidebarEventIcon = $("#admin-sidebar-event-icon");
  const sidebarEventName = $("#admin-sidebar-event-name");
  
  if (sidebarTodayEventWrap && sidebarEventIcon && sidebarEventName) {
    if (typeof getIndianEventsForDate === "function") {
      const todayEvents = getIndianEventsForDate(year, monthIdx, dayNum);
      if (todayEvents && todayEvents.length > 0) {
        const topEvent = todayEvents[0];
        sidebarEventIcon.textContent = topEvent.icon;
        sidebarEventName.textContent = topEvent.name;
        sidebarTodayEventWrap.hidden = false;
        if (topEvent.type === "holiday") {
          sidebarTodayEventWrap.classList.add("is-holiday");
          sidebarTodayEventWrap.classList.remove("is-observance");
        } else {
          sidebarTodayEventWrap.classList.add("is-observance");
          sidebarTodayEventWrap.classList.remove("is-holiday");
        }
        sidebarTodayEventWrap.title = `Today's Occasion: ${topEvent.name} - ${topEvent.desc}`;
      } else {
        sidebarTodayEventWrap.hidden = true;
      }
    }
  }

  // Update Modal Clock Elements
  const modalClock = $("#cal-modal-live-clock");
  const modalDate = $("#cal-modal-live-date");
  const modalFooterStatus = $("#cal-footer-status");
  if (modalClock) modalClock.textContent = timeFormatted;
  if (modalDate) modalDate.textContent = dateFormatted;
  if (modalFooterStatus) modalFooterStatus.textContent = `Today: ${dayName}, ${dateFormatted}`;
}

function initRealtimeClock() {
  updateRealtimeClock();
  setInterval(updateRealtimeClock, 1000);
}

/* ==========================================================================
   Comprehensive Indian Holidays & Important Observance Days Dataset
   ========================================================================== */
const INDIAN_FIXED_EVENTS = [
  // January
  { month: 0, day: 1, name: "New Year's Day / Global Family Day", type: "observance", icon: "🎉", desc: "Celebration of the first day of the Gregorian year and global peace." },
  { month: 0, day: 9, name: "Pravasi Bharatiya Divas (NRI Day)", type: "observance", icon: "🌐", desc: "Commemorates the return of Mahatma Gandhi from South Africa to Mumbai in 1915." },
  { month: 0, day: 12, name: "National Youth Day (Swami Vivekananda Jayanti)", type: "observance", icon: "🇮🇳", desc: "Birth anniversary of Swami Vivekananda, celebrating youth energy and character building." },
  { month: 0, day: 15, name: "Indian Army Day", type: "observance", icon: "🎖️", desc: "Honors Field Marshal K. M. Cariappa taking command as the first Indian Commander-in-Chief in 1949." },
  { month: 0, day: 23, name: "Netaji Subhas Chandra Bose Jayanti (Parakram Diwas)", type: "observance", icon: "⚔️", desc: "Celebrates the courage, resilience, and monumental legacy of Netaji Subhas Chandra Bose." },
  { month: 0, day: 24, name: "National Girl Child Day", type: "observance", icon: "👧", desc: "Promotes awareness on gender equality, education, healthcare, and nutrition for girls." },
  { month: 0, day: 25, name: "National Voters' Day & National Tourism Day", type: "observance", icon: "🗳️", desc: "Encourages democratic voter participation and showcases India's rich cultural heritage." },
  { month: 0, day: 26, name: "Republic Day of India", type: "holiday", icon: "🇮🇳", desc: "Gazetted National Holiday honoring the enforcement of the Constitution of India in 1950." },
  { month: 0, day: 30, name: "Martyrs' Day (Shaheed Diwas)", type: "observance", icon: "🕊️", desc: "Remembrance of Mahatma Gandhi and all freedom fighters who sacrificed their lives for India." },

  // February
  { month: 1, day: 4, name: "World Cancer Day", type: "observance", icon: "🎗️", desc: "Global awareness campaign for cancer prevention, detection, and patient support." },
  { month: 1, day: 13, name: "National Women's Day (Sarojini Naidu Jayanti) & World Radio Day", type: "observance", icon: "📻", desc: "Birth anniversary of the 'Nightingale of India' Sarojini Naidu and celebration of radio." },
  { month: 1, day: 21, name: "International Mother Language Day", type: "observance", icon: "🗣️", desc: "Promotes linguistic diversity, multilingualism, and mother tongue preservation." },
  { month: 1, day: 28, name: "National Science Day", type: "observance", icon: "🔬", desc: "Marks the discovery of the Raman Effect by Sir C. V. Raman in 1928, for which he won the Nobel Prize." },

  // March
  { month: 2, day: 3, name: "World Wildlife Day & National Defence Day", type: "observance", icon: "🦁", desc: "Celebrates flora and fauna biodiversity and India's defence forces." },
  { month: 2, day: 8, name: "International Women's Day", type: "observance", icon: "👩", desc: "Global celebration of social, economic, cultural, and political empowerment of women." },
  { month: 2, day: 15, name: "World Consumer Rights Day", type: "observance", icon: "🛍️", desc: "Raises global awareness about consumer rights, protections, and market fairness." },
  { month: 2, day: 21, name: "World Forestry Day & World Poetry Day", type: "observance", icon: "🌲", desc: "Promotes conservation of forests and the linguistic beauty of poetry." },
  { month: 2, day: 22, name: "World Water Day", type: "observance", icon: "💧", desc: "Focuses on the critical importance of freshwater and sustainable water management." },
  { month: 2, day: 23, name: "Shaheed Diwas (Bhagat Singh, Sukhdev & Rajguru)", type: "observance", icon: "🇮🇳", desc: "Honors the supreme martyrdom of Bhagat Singh, Rajguru, and Sukhdev in 1931." },

  // April
  { month: 3, day: 7, name: "World Health Day", type: "observance", icon: "🩺", desc: "Marks the founding of the WHO and advocates for global health equality." },
  { month: 3, day: 14, name: "Dr. B. R. Ambedkar Jayanti", type: "holiday", icon: "⚖️", desc: "Gazetted Holiday honoring Dr. Babasaheb Ambedkar, Chief Architect of the Indian Constitution." },
  { month: 3, day: 21, name: "National Civil Services Day", type: "observance", icon: "🏛️", desc: "Celebrates civil servants dedicated to the service of citizens and governance." },
  { month: 3, day: 22, name: "Earth Day", type: "observance", icon: "🌍", desc: "International event promoting environmental protection, sustainability, and climate action." },
  { month: 3, day: 24, name: "National Panchayati Raj Day", type: "observance", icon: "🌾", desc: "Marks the institutionalization of local self-government and grassroots democracy." },

  // May
  { month: 4, day: 1, name: "International Labour Day (May Day) / Maharashtra & Gujarat Day", type: "holiday", icon: "⚒️", desc: "Honors the labor movement, workers' rights, and states' formation day." },
  { month: 4, day: 7, name: "World Athletics Day & Rabindranath Tagore Jayanti", type: "observance", icon: "🏃", desc: "Promotes youth athletics and honors Nobel laureate Rabindranath Tagore." },
  { month: 4, day: 8, name: "World Red Cross & Red Crescent Day", type: "observance", icon: "⛑️", desc: "Honors humanitarian volunteers and emergency relief workers worldwide." },
  { month: 4, day: 11, name: "National Technology Day", type: "observance", icon: "🚀", desc: "Commemorates the successful Pokhran-II nuclear tests and Indian technological achievements." },
  { month: 4, day: 21, name: "National Anti-Terrorism Day", type: "observance", icon: "🕊️", desc: "Fosters national harmony, peace, and solidarity against all forms of terrorism." },
  { month: 4, day: 31, name: "World No Tobacco Day", type: "observance", icon: "🚭", desc: "WHO initiative highlighting health risks associated with tobacco consumption." },

  // June
  { month: 5, day: 5, name: "World Environment Day", type: "observance", icon: "🌿", desc: "Global flagship platform for inspiring environmental awareness and action." },
  { month: 5, day: 7, name: "World Food Safety Day", type: "observance", icon: "🥗", desc: "Promotes awareness on preventing, detecting, and managing foodborne risks." },
  { month: 5, day: 14, name: "World Blood Donor Day", type: "observance", icon: "🩸", desc: "Celebrates voluntary, unpaid blood donors who save lives every day." },
  { month: 5, day: 21, name: "International Yoga Day & World Music Day", type: "observance", icon: "🧘", desc: "Global celebration of holistic health through Yoga and universal music harmony." },
  { month: 5, day: 23, name: "International Olympic Day & United Nations Public Service Day", type: "observance", icon: "🏅", desc: "Promotes sports participation and honors public service contributions." },
  { month: 5, day: 29, name: "National Statistics Day (Prof. P. C. Mahalanobis Jayanti)", type: "observance", icon: "📊", desc: "Commemorates the founder of the Indian Statistical Institute and economic planning." },

  // July
  { month: 6, day: 1, name: "National Doctors' Day & Chartered Accountants' Day", type: "observance", icon: "🩺", desc: "Honors Dr. B. C. Roy, healthcare professionals, and ICAI financial pillars." },
  { month: 6, day: 11, name: "World Population Day", type: "observance", icon: "👨‍👩‍👧‍👦", desc: "Focuses on global population trends, reproductive health, and sustainable development." },
  { month: 6, day: 15, name: "World Youth Skills Day", type: "observance", icon: "🛠️", desc: "Empowers youth with technical, vocational, and entrepreneurship skills." },
  { month: 6, day: 26, name: "Kargil Vijay Diwas", type: "observance", icon: "🇮🇳", desc: "Commemorates India's victory in Operation Vijay (1999) and the martyrs of Kargil." },
  { month: 6, day: 29, name: "International Tiger Day", type: "observance", icon: "🐅", desc: "Promotes the preservation of wild tigers and natural forest habitats." },

  // August
  { month: 7, day: 6, name: "Hiroshima Day & National Handloom Day (Aug 7)", type: "observance", icon: "🧵", desc: "Promotes global nuclear peace and honors India's master handloom weavers." },
  { month: 7, day: 9, name: "Quit India Movement Day & World Tribal Day", type: "observance", icon: "✊", desc: "Anniversary of the 1942 Quit India call and indigenous peoples' rights." },
  { month: 7, day: 15, name: "Independence Day of India", type: "holiday", icon: "🇮🇳", desc: "Gazetted National Holiday celebrating freedom from colonial rule on August 15, 1947." },
  { month: 7, day: 19, name: "World Photography Day & World Humanitarian Day", type: "observance", icon: "📷", desc: "Celebrates visual storytelling and courageous humanitarian aid workers." },
  { month: 7, day: 20, name: "Sadbhavana Diwas (Harmony Day)", type: "observance", icon: "🤝", desc: "Birth anniversary of Rajiv Gandhi promoting communal harmony and national goodwill." },
  { month: 7, day: 23, name: "National Space Day (Chandrayaan-3 Moon Landing)", type: "observance", icon: "🚀", desc: "Commemorates the historic touchdown of Chandrayaan-3 near the lunar south pole in 2023." },
  { month: 7, day: 29, name: "National Sports Day (Major Dhyan Chand Jayanti)", type: "observance", icon: "🏆", desc: "Honors the 'Wizard of Hockey' Major Dhyan Chand and fosters sportsmanship." },

  // September
  { month: 8, day: 5, name: "National Teachers' Day (Dr. S. Radhakrishnan Jayanti)", type: "observance", icon: "👨‍🏫", desc: "Honors the visionary philosopher-President and celebrates all educators across India." },
  { month: 8, day: 8, name: "International Literacy Day", type: "observance", icon: "📚", desc: "Highlights literacy as a fundamental human right and basis for inclusive societies." },
  { month: 8, day: 14, name: "Hindi Diwas", type: "observance", icon: "🇮🇳", desc: "Celebrates the adoption of Hindi as an official language of the Union in 1949." },
  { month: 8, day: 15, name: "National Engineers' Day & International Day of Democracy", type: "observance", icon: "⚙️", desc: "Tribute to Sir M. Visvesvaraya for engineering excellence and innovation." },
  { month: 8, day: 16, name: "World Ozone Day", type: "observance", icon: "🛡️", desc: "Promotes international efforts to protect the fragile ozone layer." },
  { month: 8, day: 21, name: "International Day of Peace & World Alzheimer's Day", type: "observance", icon: "🕊️", desc: "Promotes non-violence, global ceasefire, and mental health awareness." },
  { month: 8, day: 27, name: "World Tourism Day", type: "observance", icon: "✈️", desc: "Fosters awareness on tourism's economic, cultural, and environmental impacts." },

  // October
  { month: 9, day: 2, name: "Mahatma Gandhi Jayanti & Lal Bahadur Shastri Jayanti", type: "holiday", icon: "🕊️", desc: "Gazetted National Holiday and UN International Day of Non-Violence." },
  { month: 9, day: 5, name: "World Teachers' Day", type: "observance", icon: "📖", desc: "UNESCO observance celebrating educators worldwide and modern teaching methods." },
  { month: 9, day: 8, name: "Indian Air Force Day", type: "observance", icon: "✈️", desc: "Commemorates the official establishment and sky prowess of the IAF in 1932." },
  { month: 9, day: 9, name: "World Post Day & National Postal Day (Oct 10)", type: "observance", icon: "📮", desc: "Celebrates the historical and modern connectivity role of postal networks." },
  { month: 9, day: 11, name: "International Day of the Girl Child", type: "observance", icon: "🌟", desc: "Focuses on girl child leadership, rights, and equal opportunities worldwide." },
  { month: 9, day: 15, name: "World Students' Day (Dr. A. P. J. Abdul Kalam Jayanti)", type: "observance", icon: "🚀", desc: "Honors the 'Missile Man' & former President for his inspiring passion for students." },
  { month: 9, day: 16, name: "World Food Day", type: "observance", icon: "🌾", desc: "UN FAO day dedicated to ending global hunger and ensuring food security for all." },
  { month: 9, day: 24, name: "United Nations Day & World Polio Day", type: "observance", icon: "🌐", desc: "Marks the UN Charter entry into force in 1945 and polio eradication efforts." },
  { month: 9, day: 31, name: "National Unity Day (Rashtriya Ekta Diwas - Sardar Patel Jayanti)", type: "observance", icon: "🇮🇳", desc: "Honors the 'Iron Man of India' Sardar Vallabhbhai Patel for integrating the nation." },

  // November
  { month: 10, day: 11, name: "National Education Day (Maulana Abul Kalam Azad Jayanti)", type: "observance", icon: "🎓", desc: "Birth anniversary of India's first Education Minister, pioneering higher education." },
  { month: 10, day: 14, name: "Children's Day (Bal Diwas - Pt. Jawaharlal Nehru Jayanti) & World Diabetes Day", type: "observance", icon: "🎈", desc: "Celebrates childhood, education, and children's welfare across India." },
  { month: 10, day: 15, name: "Janjatiya Gaurav Divas (Bhagwan Birsa Munda Jayanti)", type: "observance", icon: "🏹", desc: "Honors the valor and contributions of tribal freedom fighters and indigenous heritage." },
  { month: 10, day: 19, name: "National Integration Day (Indira Gandhi Jayanti) & World Toilet Day", type: "observance", icon: "🤝", desc: "Promotes national solidarity, communal harmony, and global sanitation access." },
  { month: 10, day: 26, name: "Constitution Day (Samvidhan Divas) & National Milk Day", type: "observance", icon: "📜", desc: "Marks the historic adoption of the Indian Constitution on Nov 26, 1949, and Dr. Verghese Kurien Jayanti." },

  // December
  { month: 11, day: 1, name: "World AIDS Day", type: "observance", icon: "🎗️", desc: "Unites global communities in HIV prevention, support, and destigmatization." },
  { month: 11, day: 4, name: "Indian Navy Day", type: "observance", icon: "⚓", desc: "Celebrates Operation Trident (1971) and maritime security guardian achievements." },
  { month: 11, day: 7, name: "Armed Forces Flag Day", type: "observance", icon: "🎖️", desc: "Honors the brave soldiers, sailors, and airmen who defend our motherland." },
  { month: 11, day: 10, name: "Human Rights Day", type: "observance", icon: "🕊️", desc: "Commemorates the Universal Declaration of Human Rights adopted in 1948." },
  { month: 11, day: 16, name: "Vijay Diwas", type: "observance", icon: "🇮🇳", desc: "Marks India's decisive historic victory in the 1971 Indo-Pak war." },
  { month: 11, day: 22, name: "National Mathematics Day (Srinivasa Ramanujan Jayanti)", type: "observance", icon: "📐", desc: "Birth anniversary of mathematical genius Srinivasa Ramanujan, celebrating pure math." },
  { month: 11, day: 23, name: "National Farmers' Day (Kisan Diwas - Chaudhary Charan Singh Jayanti)", type: "observance", icon: "🚜", desc: "Honors the tireless contributions of Indian farmers feeding the nation." },
  { month: 11, day: 24, name: "National Consumer Day", type: "observance", icon: "🛡️", desc: "Marks the enactment of the Consumer Protection Act of 1986." },
  { month: 11, day: 25, name: "Christmas & Good Governance Day (Atal Bihari Vajpayee Jayanti)", type: "holiday", icon: "🎄", desc: "Gazetted Holiday for Christmas and Good Governance Day honoring former PM Vajpayee." }
];

// Dynamic Multi-Year Major Festivals and Lunar Observances (2025 - 2027)
const INDIAN_DYNAMIC_YEARLY_EVENTS = {
  2025: [
    { month: 0, day: 14, name: "Makar Sankranti / Pongal / Magh Bihu", type: "holiday", icon: "🪁", desc: "Harvest festival celebrating the sun's transition into Capricorn (Uttarayana)." },
    { month: 1, day: 26, name: "Maha Shivratri", type: "holiday", icon: "🔱", desc: "Sacred night festival celebrating Lord Shiva's divine cosmic dance (Tandava)." },
    { month: 2, day: 14, name: "Holi (Festival of Colors)", type: "holiday", icon: "🎨", desc: "Vibrant festival celebrating the triumph of good over evil and arrival of spring." },
    { month: 2, day: 31, name: "Eid-ul-Fitr (Ramzan Eid)", type: "holiday", icon: "🌙", desc: "Major Islamic festival concluding the holy month of fasting (Ramadan)." },
    { month: 3, day: 6, name: "Ram Navami", type: "holiday", icon: "🏹", desc: "Celebrates the birth anniversary of Lord Rama, the seventh avatar of Vishnu." },
    { month: 3, day: 10, name: "Mahavir Jayanti", type: "holiday", icon: "🪷", desc: "Celebrates the birth anniversary of Lord Mahavira, the 24th Tirthankara of Jainism." },
    { month: 3, day: 18, name: "Good Friday", type: "holiday", icon: "✝️", desc: "Christian holiday commemorating the crucifixion of Jesus Christ." },
    { month: 4, day: 12, name: "Buddha Purnima (Vesak)", type: "holiday", icon: "🧘", desc: "Commemorates the birth, enlightenment, and Mahaparinirvana of Gautama Buddha." },
    { month: 5, day: 7, name: "Bakrid / Eid-al-Adha (Feast of Sacrifice)", type: "holiday", icon: "🐑", desc: "Islamic holiday honoring Ibrahim's willingness to sacrifice his son in obedience." },
    { month: 6, day: 6, name: "Muharram (Ashura)", type: "holiday", icon: "🕌", desc: "First month of Islamic calendar; day of mourning remembering Imam Hussain." },
    { month: 7, day: 9, name: "Raksha Bandhan", type: "observance", icon: "🪢", desc: "Celebrates the sacred protective bond between brothers and sisters." },
    { month: 7, day: 16, name: "Janmashtami (Krishna Jayanti)", type: "holiday", icon: "🦚", desc: "Celebrates the birth anniversary of Lord Krishna with fasting and bhajans." },
    { month: 7, day: 27, name: "Ganesh Chaturthi (Vinayaka Chavithi)", type: "holiday", icon: "🐘", desc: "Grand 10-day festival celebrating the arrival of Lord Ganesha on Earth." },
    { month: 9, day: 1, name: "Maha Navami / Ayudha Puja", type: "holiday", icon: "🗡️", desc: "Ninth day of Navratri honoring Goddess Durga and sanctifying craft tools." },
    { month: 9, day: 2, name: "Vijaya Dashami (Dussehra)", type: "holiday", icon: "🏹", desc: "Celebrates the victory of Lord Rama over Ravana and Goddess Durga over Mahishasura." },
    { month: 9, day: 20, name: "Diwali (Deepavali / Lakshmi Puja)", type: "holiday", icon: "🪔", desc: "The grand Festival of Lights symbolizing victory of light over darkness." },
    { month: 9, day: 22, name: "Bhai Dooj / Govardhan Puja", type: "observance", icon: "✨", desc: "Traditional rituals honoring the bond between brothers and sisters." },
    { month: 10, day: 5, name: "Guru Nanak Jayanti (Gurpurab)", type: "holiday", icon: "🕯️", desc: "Birth anniversary of Guru Nanak Dev Ji, founder of Sikhism." }
  ],
  2026: [
    { month: 0, day: 14, name: "Makar Sankranti / Pongal / Magh Bihu", type: "holiday", icon: "🪁", desc: "Harvest festival celebrating the sun's transition into Capricorn (Uttarayana)." },
    { month: 1, day: 15, name: "Maha Shivratri", type: "holiday", icon: "🔱", desc: "Sacred night festival celebrating Lord Shiva's divine cosmic dance (Tandava)." },
    { month: 2, day: 4, name: "Holi (Festival of Colors)", type: "holiday", icon: "🎨", desc: "Vibrant festival celebrating the triumph of good over evil and arrival of spring." },
    { month: 2, day: 20, name: "Eid-ul-Fitr (Ramzan Eid)", type: "holiday", icon: "🌙", desc: "Major Islamic festival concluding the holy month of fasting (Ramadan)." },
    { month: 2, day: 26, name: "Ram Navami", type: "holiday", icon: "🏹", desc: "Celebrates the birth anniversary of Lord Rama, the seventh avatar of Vishnu." },
    { month: 2, day: 31, name: "Mahavir Jayanti", type: "holiday", icon: "🪷", desc: "Celebrates the birth anniversary of Lord Mahavira, the 24th Tirthankara of Jainism." },
    { month: 3, day: 3, name: "Good Friday", type: "holiday", icon: "✝️", desc: "Christian holiday commemorating the crucifixion of Jesus Christ." },
    { month: 4, day: 1, name: "Buddha Purnima (Vesak)", type: "holiday", icon: "🧘", desc: "Commemorates the birth, enlightenment, and Mahaparinirvana of Gautama Buddha." },
    { month: 4, day: 27, name: "Bakrid / Eid-al-Adha (Feast of Sacrifice)", type: "holiday", icon: "🐑", desc: "Islamic holiday honoring Ibrahim's devotion and faith." },
    { month: 5, day: 26, name: "Muharram (Ashura)", type: "holiday", icon: "🕌", desc: "Solemn Islamic remembrance of Imam Hussain at Karbala." },
    { month: 7, day: 28, name: "Raksha Bandhan", type: "observance", icon: "🪢", desc: "Celebrates the cherished protective bond between brothers and sisters." },
    { month: 8, day: 4, name: "Janmashtami (Krishna Jayanti)", type: "holiday", icon: "🦚", desc: "Celebrates the divine birth anniversary of Lord Krishna." },
    { month: 8, day: 14, name: "Ganesh Chaturthi (Vinayaka Chavithi)", type: "holiday", icon: "🐘", desc: "Grand 10-day celebration honoring Lord Ganesha." },
    { month: 9, day: 19, name: "Maha Navami / Ayudha Puja", type: "holiday", icon: "🗡️", desc: "Ninth day of Navratri worshipping divine knowledge and instruments of work." },
    { month: 9, day: 20, name: "Vijaya Dashami (Dussehra)", type: "holiday", icon: "🏹", desc: "Triumph of righteousness over evil (Rama defeating Ravana)." },
    { month: 10, day: 8, name: "Diwali (Deepavali / Lakshmi Puja)", type: "holiday", icon: "🪔", desc: "The grand Festival of Lights symbolizing illumination and prosperity." },
    { month: 10, day: 10, name: "Bhai Dooj / Govardhan Puja", type: "observance", icon: "✨", desc: "Festive tribute celebrating affection and protection between siblings." },
    { month: 10, day: 24, name: "Guru Nanak Jayanti (Gurpurab)", type: "holiday", icon: "🕯️", desc: "Birth anniversary of Guru Nanak Dev Ji with prabhat pheris and langar." }
  ],
  2027: [
    { month: 0, day: 14, name: "Makar Sankranti / Pongal / Magh Bihu", type: "holiday", icon: "🪁", desc: "Solar harvest festival celebrating abundance and agricultural heritage." },
    { month: 2, day: 6, name: "Maha Shivratri", type: "holiday", icon: "🔱", desc: "Night of spiritual awakening dedicated to Lord Shiva." },
    { month: 2, day: 23, name: "Holi (Festival of Colors)", type: "holiday", icon: "🎨", desc: "Joyous celebration of colors, harmony, and love." },
    { month: 2, day: 26, name: "Good Friday", type: "holiday", icon: "✝️", desc: "Commemoration of the passion and crucifixion of Jesus Christ." },
    { month: 3, day: 9, name: "Eid-ul-Fitr (Ramzan Eid)", type: "holiday", icon: "🌙", desc: "Celebration marking the conclusion of Ramzan fasting." },
    { month: 3, day: 15, name: "Ram Navami", type: "holiday", icon: "🏹", desc: "Auspicious celebration of Lord Rama's incarnation." },
    { month: 3, day: 19, name: "Mahavir Jayanti", type: "holiday", icon: "🪷", desc: "Celebration of non-violence (Ahimsa) and Lord Mahavira's teachings." },
    { month: 4, day: 20, name: "Buddha Purnima (Vesak)", type: "holiday", icon: "🧘", desc: "Celebration of Gautama Buddha's Enlightenment and Peace message." },
    { month: 5, day: 16, name: "Bakrid / Eid-al-Adha", type: "holiday", icon: "🐑", desc: "Feast of faith, sharing, and charity in Islam." },
    { month: 6, day: 15, name: "Muharram (Ashura)", type: "holiday", icon: "🕌", desc: "Islamic holy month remembrance." },
    { month: 7, day: 17, name: "Raksha Bandhan", type: "observance", icon: "🪢", desc: "Traditional sister-brother bond ceremony." },
    { month: 7, day: 25, name: "Janmashtami (Krishna Jayanti)", type: "holiday", icon: "🦚", desc: "Birth celebration of Lord Krishna." },
    { month: 8, day: 4, name: "Ganesh Chaturthi", type: "holiday", icon: "🐘", desc: "Festival welcoming Lord Ganesha." },
    { month: 9, day: 9, name: "Vijaya Dashami (Dussehra)", type: "holiday", icon: "🏹", desc: "Victory of truth and righteousness." },
    { month: 9, day: 29, name: "Diwali (Deepavali / Lakshmi Puja)", type: "holiday", icon: "🪔", desc: "Grand illumination and prosperity festival." },
    { month: 10, day: 14, name: "Guru Nanak Jayanti (Gurpurab)", type: "holiday", icon: "🕯️", desc: "Gurpurab commemorating Guru Nanak Dev Ji." }
  ]
};

// Calculate dynamic Nth Sunday events (Mother's Day: 2nd Sun of May, Father's Day: 3rd Sun of June)
function getCalculatedFloatingEvents(year, month) {
  const events = [];
  
  // Mother's Day: 2nd Sunday in May (month index 4)
  if (month === 4) {
    let sundayCount = 0;
    for (let d = 1; d <= 31; d++) {
      if (new Date(year, 4, d).getDay() === 0) {
        sundayCount++;
        if (sundayCount === 2) {
          events.push({
            month: 4,
            day: d,
            name: "Mother's Day",
            type: "observance",
            icon: "💐",
            desc: "Celebrates mothers, motherhood, maternal bonds, and their unconditional love."
          });
          break;
        }
      }
    }
  }

  // Father's Day: 3rd Sunday in June (month index 5)
  if (month === 5) {
    let sundayCount = 0;
    for (let d = 1; d <= 30; d++) {
      if (new Date(year, 5, d).getDay() === 0) {
        sundayCount++;
        if (sundayCount === 3) {
          events.push({
            month: 5,
            day: d,
            name: "Father's Day",
            type: "observance",
            icon: "👔",
            desc: "Celebrates fathers, paternal bonds, mentorship, and their dedication to families."
          });
          break;
        }
      }
    }
  }

  return events;
}

// Retrieve all Indian events for a given year & month
function getIndianEventsForMonth(year, month) {
  const fixed = INDIAN_FIXED_EVENTS.filter(e => e.month === month);
  const dynamic = (INDIAN_DYNAMIC_YEARLY_EVENTS[year] || []).filter(e => e.month === month);
  const floating = getCalculatedFloatingEvents(year, month);
  
  // Combine and de-duplicate by day + name
  const combined = [...fixed, ...dynamic, ...floating];
  const unique = [];
  const map = new Set();
  
  combined.forEach(ev => {
    const key = `${ev.day}_${ev.name}`;
    if (!map.has(key)) {
      map.add(key);
      unique.push(ev);
    }
  });

  return unique.sort((a, b) => a.day - b.day);
}

// Retrieve events for a specific date
function getIndianEventsForDate(year, month, day) {
  const monthEvents = getIndianEventsForMonth(year, month);
  return monthEvents.filter(e => e.day === day);
}

// Active Calendar Filter state
let calActiveFilter = "all"; // 'all' | 'holiday' | 'observance'
let calSelectedDate = null;

function renderSelectedDayCard(year, month, day) {
  const cardEl = $("#cal-selected-day-card");
  if (!cardEl) return;

  const dateObj = new Date(year, month, day);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const dayOfWeekStr = dayNames[dateObj.getDay()];
  const formattedDateStr = `${day} ${monthNames[month]} ${year} (${dayOfWeekStr})`;
  const events = getIndianEventsForDate(year, month, day);

  if (!events || events.length === 0) {
    cardEl.innerHTML = `
      <div class="cal-day-details-empty">
        <span class="cal-day-detail-date">📅 ${formattedDateStr}</span>
        <p class="cal-day-detail-note">No gazetted holidays or major national observance days recorded on this date.</p>
      </div>
    `;
    return;
  }

  const eventsHtml = events.map(ev => {
    const isHoliday = ev.type === "holiday";
    const badgeLabel = isHoliday ? "National / Gazetted Holiday" : "Important Observance Day";
    const badgeClass = isHoliday ? "cal-badge-holiday" : "cal-badge-observance";

    return `
      <div class="cal-occasion-item ${ev.type}">
        <div class="cal-occasion-top">
          <span class="cal-occasion-icon">${ev.icon}</span>
          <div class="cal-occasion-meta">
            <h4 class="cal-occasion-name">${ev.name}</h4>
            <span class="cal-occasion-tag ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
        <p class="cal-occasion-desc">${ev.desc}</p>
      </div>
    `;
  }).join("");

  cardEl.innerHTML = `
    <div class="cal-day-details-active">
      <div class="cal-day-detail-date-bar">
        <span class="cal-day-detail-date">📅 ${formattedDateStr}</span>
        <span class="cal-day-events-pill">${events.length} occasion${events.length > 1 ? 's' : ''}</span>
      </div>
      <div class="cal-occasions-container">
        ${eventsHtml}
      </div>
    </div>
  `;
}

function renderMonthlyEventsList(year, month) {
  const listEl = $("#cal-month-events-list");
  const countBadge = $("#cal-events-count-badge");
  const monthLabel = $("#cal-events-month-label");
  if (!listEl) return;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  if (monthLabel) monthLabel.textContent = `${monthNames[month]} ${year}`;

  let events = getIndianEventsForMonth(year, month);
  if (calActiveFilter === "holiday") {
    events = events.filter(e => e.type === "holiday");
  } else if (calActiveFilter === "observance") {
    events = events.filter(e => e.type === "observance");
  }

  if (countBadge) {
    countBadge.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
  }

  if (events.length === 0) {
    listEl.innerHTML = `<div class="cal-no-month-events">No ${calActiveFilter === "holiday" ? "holidays" : calActiveFilter === "observance" ? "observances" : "events"} in this month for selected filter.</div>`;
    return;
  }

  listEl.innerHTML = events.map(ev => {
    const isHoliday = ev.type === "holiday";
    const typeLabel = isHoliday ? "Holiday" : "Important Day";
    const tagClass = isHoliday ? "tag-holiday" : "tag-observance";

    return `
      <div class="cal-month-event-row" data-cal-jump-day="${ev.day}">
        <div class="cal-month-event-date-chip">
          <span class="chip-day">${String(ev.day).padStart(2, "0")}</span>
          <span class="chip-icon">${ev.icon}</span>
        </div>
        <div class="cal-month-event-info">
          <div class="cal-month-event-title-line">
            <span class="cal-month-event-name">${ev.name}</span>
            <span class="cal-month-event-type ${tagClass}">${typeLabel}</span>
          </div>
          <span class="cal-month-event-summary">${ev.desc}</span>
        </div>
      </div>
    `;
  }).join("");

  // Clicking an event in the list jumps to that day in the calendar
  listEl.querySelectorAll(".cal-month-event-row").forEach(row => {
    row.addEventListener("click", () => {
      const day = Number(row.dataset.calJumpDay);
      if (!day) return;
      const dayBtn = $(`#calendar-days-grid .cal-day-cell[data-cal-day="${day}"]`);
      if (dayBtn) {
        $("#calendar-days-grid").querySelectorAll(".cal-day-cell").forEach(c => c.classList.remove("selected"));
        dayBtn.classList.add("selected");
        renderSelectedDayCard(year, month, day);
        dayBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });
}

function renderFullCalendar(year, month) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const monthNameEl = $("#cal-month-name");
  const yearNumEl = $("#cal-year-num");
  const gridEl = $("#calendar-days-grid");
  
  if (monthNameEl) monthNameEl.textContent = monthNames[month];
  if (yearNumEl) yearNumEl.textContent = year;
  if (!gridEl) return;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // First day of month (0 = Sun, 1 = Mon ... 6 = Sat)
  const firstDay = new Date(year, month, 1).getDay();
  // Total days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Total days in previous month
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const monthEvents = getIndianEventsForMonth(year, month);
  const eventsByDay = {};
  monthEvents.forEach(ev => {
    if (!eventsByDay[ev.day]) eventsByDay[ev.day] = [];
    eventsByDay[ev.day].push(ev);
  });

  let daysHtml = "";

  // 1. Trailing days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    daysHtml += `<button type="button" class="cal-day-cell other-month" disabled tabindex="-1"><span class="cal-day-num">${d}</span></button>`;
  }

  // 2. Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dayOfWeek = cellDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = isCurrentMonth && d === todayDate;
    const dayEvents = eventsByDay[d] || [];
    
    const hasHoliday = dayEvents.some(e => e.type === "holiday");
    const hasObservance = dayEvents.some(e => e.type === "observance");

    let isDimmed = false;
    if (calActiveFilter === "holiday" && !hasHoliday) isDimmed = true;
    if (calActiveFilter === "observance" && !hasObservance) isDimmed = true;

    const classes = [
      "cal-day-cell",
      isToday ? "today" : "",
      isWeekend ? "weekend" : "",
      hasHoliday ? "has-holiday" : "",
      hasObservance ? "has-observance" : "",
      isDimmed ? "cal-dimmed-filter" : ""
    ].filter(Boolean).join(" ");

    // Badges / markers inside cell
    let markerHtml = "";
    if (dayEvents.length > 0) {
      const topEvent = dayEvents[0];
      const countPill = dayEvents.length > 1 ? `<span class="cal-day-badge-count">+${dayEvents.length - 1}</span>` : "";
      markerHtml = `
        <div class="cal-day-marker-row">
          <span class="cal-day-emoji-icon" title="${escapeHtml(dayEvents.map(e => e.name).join(', '))}">${topEvent.icon}</span>
          ${countPill}
        </div>
      `;
    }

    const eventSummaryTooltip = dayEvents.length > 0
      ? ` • ${dayEvents.map(e => e.name).join(' | ')}`
      : "";

    daysHtml += `
      <button type="button" class="${classes}" data-cal-day="${d}" data-cal-month="${month}" data-cal-year="${year}" title="${monthNames[month]} ${d}, ${year}${isToday ? ' (Today)' : ''}${eventSummaryTooltip}">
        <span class="cal-day-num">${d}</span>
        ${markerHtml}
      </button>
    `;
  }

  // 3. Leading days of next month to fill grid (up to 35 or 42 cells)
  const totalCellsSoFar = firstDay + daysInMonth;
  const targetTotal = totalCellsSoFar > 35 ? 42 : 35;
  const remaining = targetTotal - totalCellsSoFar;
  for (let d = 1; d <= remaining; d++) {
    daysHtml += `<button type="button" class="cal-day-cell other-month" disabled tabindex="-1"><span class="cal-day-num">${d}</span></button>`;
  }

  gridEl.innerHTML = daysHtml;

  // Render month events list
  renderMonthlyEventsList(year, month);

  // Selected Day resolution
  const defaultDayToSelect = isCurrentMonth ? todayDate : (monthEvents.length > 0 ? monthEvents[0].day : 1);
  const activeSelectedCell = gridEl.querySelector(`.cal-day-cell[data-cal-day="${defaultDayToSelect}"]`);
  if (activeSelectedCell) {
    activeSelectedCell.classList.add("selected");
  }
  renderSelectedDayCard(year, month, defaultDayToSelect);

  // Add click handler to days
  gridEl.querySelectorAll(".cal-day-cell:not(.other-month)").forEach(btn => {
    btn.addEventListener("click", () => {
      gridEl.querySelectorAll(".cal-day-cell").forEach(c => c.classList.remove("selected"));
      btn.classList.add("selected");
      const d = Number(btn.dataset.calDay);
      const m = Number(btn.dataset.calMonth);
      const y = Number(btn.dataset.calYear);
      renderSelectedDayCard(y, m, d);
      
      const dayEvents = getIndianEventsForDate(y, m, d);
      if (dayEvents && dayEvents.length > 0) {
        showToast(`Selected: ${dayEvents[0].name}`, "info");
      }
    });
  });
}

function setupCalendarEvents() {
  const clockTrigger = $("#admin-calendar-clock-trigger");
  const calDialog = $("#admin-full-calendar-dialog");
  const calCloseBtn = $("#admin-calendar-close-btn");
  const prevMonthBtn = $("#cal-prev-month-btn");
  const nextMonthBtn = $("#cal-next-month-btn");
  const jumpTodayBtn = $("#cal-jump-today-btn");

  // Filter chips handler
  const filterChips = document.querySelectorAll(".cal-filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      calActiveFilter = chip.dataset.calFilter || "all";
      renderFullCalendar(calViewYear, calViewMonth);
    });
  });

  clockTrigger?.addEventListener("click", () => {
    calViewYear = new Date().getFullYear();
    calViewMonth = new Date().getMonth();
    renderFullCalendar(calViewYear, calViewMonth);
    calDialog?.showModal();
  });

  calCloseBtn?.addEventListener("click", () => {
    calDialog?.close();
  });

  calDialog?.addEventListener("click", e => {
    if (e.target === calDialog) {
      calDialog.close();
    }
  });

  prevMonthBtn?.addEventListener("click", () => {
    calViewMonth--;
    if (calViewMonth < 0) {
      calViewMonth = 11;
      calViewYear--;
    }
    renderFullCalendar(calViewYear, calViewMonth);
  });

  nextMonthBtn?.addEventListener("click", () => {
    calViewMonth++;
    if (calViewMonth > 11) {
      calViewMonth = 0;
      calViewYear++;
    }
    renderFullCalendar(calViewYear, calViewMonth);
  });

  jumpTodayBtn?.addEventListener("click", () => {
    const today = new Date();
    calViewYear = today.getFullYear();
    calViewMonth = today.getMonth();
    renderFullCalendar(calViewYear, calViewMonth);
    showToast("Jumped to Today's date", "info");
  });
}

function setupEventListeners() {
  initTheme();
  initRealtimeClock();
  setupCalendarEvents();
  setupFileDrop();
  setupPublishStudio();
  setupGeminiAiAutofill();
  setupRichTextEditor("#studio-rte-wrapper", "#studio-note-overview-editor", "#studio-note-overview", "#studio-overview-char-count");
  setupRichTextEditor("#edit-rte-wrapper", "#edit-note-overview-editor", "#edit-note-overview", "#edit-overview-char-count");

  // Permanent & Delegated Interaction Analysis Modal Click Triggers
  document.addEventListener("click", e => {
    const likeTrigger = e.target.closest("#kpi-card-likes, #interaction-row-likes");
    if (likeTrigger) {
      e.preventDefault();
      openLikesAnalysisModal();
      return;
    }
    const dlTrigger = e.target.closest("#kpi-card-downloads, #interaction-row-downloads");
    if (dlTrigger) {
      e.preventDefault();
      openDownloadsAnalysisModal();
      return;
    }
    const shareTrigger = e.target.closest("#kpi-card-shares, #interaction-row-shares");
    if (shareTrigger) {
      e.preventDefault();
      openSharesAnalysisModal();
      return;
    }
    const viewTrigger = e.target.closest("#kpi-card-views, #interaction-row-views");
    if (viewTrigger) {
      e.preventDefault();
      openViewsAnalysisModal();
      return;
    }
  });

  // Close buttons & backdrop click to close for all 4 analysis modals
  [
    { id: "likes-analysis-dialog", btn: "likes-modal-close-btn" },
    { id: "downloads-analysis-dialog", btn: "downloads-modal-close-btn" },
    { id: "shares-analysis-dialog", btn: "shares-modal-close-btn" },
    { id: "views-analysis-dialog", btn: "views-modal-close-btn" },
    { id: "admin-edit-dialog", btn: "admin-edit-modal-close-btn" }
  ].forEach(({ id, btn }) => {
    const dialog = document.getElementById(id);
    const closeBtn = document.getElementById(btn);
    if (closeBtn && dialog) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dialog.close();
      };
    }
    if (dialog) {
      // Only close when clicking the actual backdrop (e.target is the <dialog> element itself)
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
          dialog.close();
        }
      });
    }
  });

  // Dedicated Cancel button for Edit Note Dialog
  $("#admin-edit-cancel-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("#admin-edit-dialog")?.close();
  });

  // Global [data-close] delegation for all modal dialogs
  document.addEventListener("click", (e) => {
    const closeTarget = e.target.closest("[data-close], .edit-modal-close");
    if (closeTarget) {
      e.preventDefault();
      const parentDialog = closeTarget.closest("dialog") || document.querySelector("dialog[open]");
      if (parentDialog) {
        parentDialog.close();
      }
    }
  });

  // Top Notes vs Top Searches Tab Switch Handlers in Interactions View
  $("#tab-top-notes-btn")?.addEventListener("click", () => {
    $("#tab-top-notes-btn")?.classList.add("active");
    $("#tab-top-searches-btn")?.classList.remove("active");
    const paneNotes = $("#pane-top-notes");
    const paneSearches = $("#pane-top-searches");
    if (paneNotes) paneNotes.hidden = false;
    if (paneSearches) paneSearches.hidden = true;
  });

  $("#tab-top-searches-btn")?.addEventListener("click", () => {
    $("#tab-top-searches-btn")?.classList.add("active");
    $("#tab-top-notes-btn")?.classList.remove("active");
    const paneNotes = $("#pane-top-notes");
    const paneSearches = $("#pane-top-searches");
    if (paneNotes) paneNotes.hidden = true;
    if (paneSearches) paneSearches.hidden = false;
  });

  // Users & Students View Event Listeners
  $("#users-search-input")?.addEventListener("input", () => {
    renderUsersTable(true);
  });

  $("#users-filter-activity")?.addEventListener("change", () => {
    renderUsersTable(true);
  });

  $("#users-filter-exam")?.addEventListener("change", () => {
    renderUsersTable(true);
  });

  $("#users-sort-select")?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "active-desc") { userSortKey = "active"; userSortDir = "desc"; }
    else if (val === "views-desc") { userSortKey = "views"; userSortDir = "desc"; }
    else if (val === "likes-desc") { userSortKey = "likes"; userSortDir = "desc"; }
    else if (val === "bookmarks-desc") { userSortKey = "bookmarks"; userSortDir = "desc"; }
    else if (val === "downloads-desc") { userSortKey = "downloads"; userSortDir = "desc"; }
    else if (val === "name-asc") { userSortKey = "name"; userSortDir = "asc"; }
    else if (val === "joined-desc") { userSortKey = "joined"; userSortDir = "desc"; }
    renderUsersTable(true);
  });

  $("#users-rows-per-page")?.addEventListener("change", (e) => {
    const val = e.target.value;
    userPageSize = val === "all" ? "all" : (Number(val) || 10);
    userCurrentPage = 1;
    renderUsersTable(false);
  });

  document.querySelectorAll("[data-user-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.userSort;
      if (userSortKey === key) {
        userSortDir = userSortDir === "asc" ? "desc" : "asc";
      } else {
        userSortKey = key;
        userSortDir = (key === "name") ? "asc" : "desc";
      }
      renderUsersTable(true);
    });
  });

  $("#users-export-csv-btn")?.addEventListener("click", () => {
    exportUsersCsv();
  });

  $("#users-export-excel-btn")?.addEventListener("click", () => {
    exportUsersExcel();
  });

  // Delegated click handler for Inspect User Profile Button
  document.addEventListener("click", (e) => {
    const inspectBtn = e.target.closest("[data-inspect-user-id], .inspect-user-btn");
    if (inspectBtn) {
      e.preventDefault();
      const userId = inspectBtn.dataset.inspectUserId || inspectBtn.getAttribute("data-inspect-user-id");
      if (userId) {
        openUserDetailsModal(userId);
      }
    }
  });

  // User Details Modal Close Buttons & Backdrop
  $("#user-details-close-btn")?.addEventListener("click", () => {
    $("#user-details-dialog")?.close();
  });

  $("#user-modal-done-btn")?.addEventListener("click", () => {
    $("#user-details-dialog")?.close();
  });

  const userDetailsDialog = document.getElementById("user-details-dialog");
  if (userDetailsDialog) {
    userDetailsDialog.addEventListener("click", (e) => {
      if (e.target === userDetailsDialog) {
        userDetailsDialog.close();
      }
    });
  }

  // Live Spelling Correction & Red Underline Notifications
  attachSpellChecker(
    $("#studio-note-title"),
    $("#studio-title-spell-alert"),
    () => {
      const titleInput = $("#studio-note-title");
      const charCount = $("#studio-title-char-count");
      if (charCount && titleInput) charCount.textContent = `${titleInput.value.length}/80`;
      const simTitle = $("#sim-title-text");
      if (simTitle && titleInput) simTitle.textContent = titleInput.value.trim() || "Indian Constitution – Fundamental Rights & Preamble";
    }
  );

  attachSpellChecker(
    $("#studio-note-tags"),
    $("#studio-tags-spell-alert"),
    () => {
      const tagsInput = $("#studio-note-tags");
      const raw = tagsInput ? tagsInput.value : "";
      const tags = raw.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
      const simTagsRow = $("#sim-tags-row");
      if (simTagsRow) {
        if (tags.length === 0) {
          simTagsRow.innerHTML = `<span class="sim-tag">#UPSC</span><span class="sim-tag">#Constitution</span>`;
        } else {
          simTagsRow.innerHTML = tags.map(t => `<span class="sim-tag">#${escapeHtml(t)}</span>`).join("");
        }
      }
      renderPublishTagSuggestions("");
    }
  );

  attachSpellChecker(
    $("#edit-note-title"),
    $("#edit-title-spell-alert"),
    () => {
      const titleInput = $("#edit-note-title");
      const charCount = $("#edit-title-char-count");
      if (charCount && titleInput) charCount.textContent = `${titleInput.value.length}/80`;
    }
  );

  $("#edit-note-title")?.addEventListener("input", e => {
    const charCount = $("#edit-title-char-count");
    if (charCount) charCount.textContent = `${e.target.value.length}/80`;
  });

  attachSpellChecker(
    $("#edit-note-tags"),
    $("#edit-tags-spell-alert")
  );

  // Sidebar Hide / View Toggle (Desktop Collapsible & Mobile Off-Canvas Drawer)
  const appShell = $("#admin-dashboard-section");
  const backdrop = $("#admin-sidebar-backdrop");
  const hideSidebarBtn = $("#hide-admin-sidebar-btn");
  const showSidebarBtn = $("#show-admin-sidebar-btn");

  const isMobile = () => window.innerWidth <= 768;

  const hideSidebar = () => {
    if (!appShell) return;
    if (isMobile()) {
      appShell.classList.remove("sidebar-mobile-open");
      if (backdrop) backdrop.classList.remove("active");
    } else {
      appShell.classList.add("sidebar-hidden");
      localStorage.setItem("exam_admin_sidebar_hidden", "true");
    }
  };

  const showSidebar = () => {
    if (!appShell) return;
    if (isMobile()) {
      appShell.classList.add("sidebar-mobile-open");
      if (backdrop) backdrop.classList.add("active");
    } else {
      appShell.classList.remove("sidebar-hidden");
      localStorage.setItem("exam_admin_sidebar_hidden", "false");
    }
  };

  // Restore saved desktop preference (without hiding on mobile unless toggled)
  if (!isMobile()) {
    const savedHidden = localStorage.getItem("exam_admin_sidebar_hidden");
    if (savedHidden === "true") {
      appShell?.classList.add("sidebar-hidden");
    } else {
      appShell?.classList.remove("sidebar-hidden");
    }
  }

  showSidebarBtn?.addEventListener("click", showSidebar);
  hideSidebarBtn?.addEventListener("click", hideSidebar);
  backdrop?.addEventListener("click", hideSidebar);

  // Header Brand Logo / Label click
  $("#admin-brand-link")?.addEventListener("click", e => {
    if (sessionStorage.getItem("exam_admin_local_session") === "true") {
      e.preventDefault();
      switchAdminView("dashboard");
      if (isMobile()) {
        hideSidebar();
      }
    }
  });

  // Admin View Navigation Click (switches view and auto-closes mobile drawer)
  $$("[data-admin-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchAdminView(btn.dataset.adminView);
      if (isMobile()) {
        hideSidebar();
      }
    });
  });

  // Handle browser back/forward and hash changes
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace(/^#/, "");
    const validViews = ["dashboard", "analysis", "interactions", "users", "feedback", "tags", "missing-searches", "publish", "modify", "profile", "backup"];
    if (validViews.includes(hash) && sessionStorage.getItem("exam_admin_local_session") === "true") {
      switchAdminView(hash, false);
    }
  });

  // Profile View Event Listeners
  let selectedProfileAvatarData = null;
  let selectedLogoData = null;
  let selectedIgQrData = null;

  const editProfileDialog = $("#admin-edit-profile-dialog");
  const editProfileForm = $("#admin-edit-profile-form");
  const editProfileMsg = $("#edit-admin-profile-msg");
  const editAvatarFileInput = $("#edit-avatar-file-input");
  const editAvatarPreviewImg = $("#edit-avatar-preview-img");
  const editLogoFileInput = $("#edit-logo-file-input");
  const editLogoPreviewImg = $("#edit-logo-preview-img");
  const editIgQrFileInput = $("#edit-ig-qr-file-input");
  const editIgQrImg = $("#edit-ig-qr-img");

  const openProfileEditDialog = () => {
    selectedProfileAvatarData = null;
    selectedLogoData = null;
    selectedIgQrData = null;

    if (editProfileMsg) {
      editProfileMsg.textContent = "";
      editProfileMsg.className = "form-message";
    }
    const nameInput = $("#edit-admin-name");
    const roleInput = $("#edit-admin-role");
    const igInput = $("#edit-admin-instagram");
    const bioInput = $("#edit-admin-bio");
    const emailInput = $("#edit-admin-email");
    const phoneInput = $("#edit-admin-phone");

    const currentIg = (adminProfileState.instagram || "smart_ai_notes").replace(/^@/, "");

    if (nameInput) nameInput.value = adminProfileState.name || "Stephanraj";
    if (roleInput) roleInput.value = adminProfileState.role || "Master Admin & Platform Creator";
    if (igInput) igInput.value = currentIg;
    if (bioInput) bioInput.value = adminProfileState.bio || "";
    if (emailInput) emailInput.value = adminProfileState.email || "admin@examalertindia.com";
    if (phoneInput) phoneInput.value = adminProfileState.phone || "+91 98765 43210";

    // Initial run of validation feedback
    checkAdminProfileEmail();
    checkAdminProfilePhone();

    // Update Live IG Preview in dialog
    const igHandlePreview = $("#edit-preview-ig-handle");
    const igTestLink = $("#edit-ig-test-link");
    if (igHandlePreview) igHandlePreview.textContent = `@${currentIg}`;
    if (igTestLink) igTestLink.href = `https://www.instagram.com/${currentIg}/`;

    // Avatar preview
    if (editAvatarPreviewImg) {
      editAvatarPreviewImg.style.display = "block";
      editAvatarPreviewImg.src = adminProfileState.avatarUrl || "assets/admin.jpg";
      const fb = $("#edit-avatar-preview-fallback");
      if (fb) fb.style.display = "none";
    }
    if (editAvatarFileInput) editAvatarFileInput.value = "";

    // Logo preview
    if (editLogoPreviewImg) {
      editLogoPreviewImg.src = adminProfileState.logoUrl || "assets/ailogo.png";
    }
    if (editLogoFileInput) editLogoFileInput.value = "";

    // QR Image preview
    if (editIgQrImg) {
      editIgQrImg.src = adminProfileState.instagramQrUrl || "assets/instagram_qr.svg?v=3.1";
    }
    if (editIgQrFileInput) editIgQrFileInput.value = "";

    // Password input
    const pwdInput = $("#edit-admin-password");
    if (pwdInput) {
      pwdInput.value = "";
      pwdInput.type = "password";
      const eyeSvg = $("#edit-profile-pwd-eye-icon");
      if (eyeSvg) eyeSvg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }

    editProfileDialog?.showModal();
    nameInput?.focus();
  };

  // Live Email & 10-Digit Phone Validation Helpers for Edit Profile
  function checkAdminProfileEmail() {
    const emailInput = $("#edit-admin-email");
    const feedbackEl = $("#edit-admin-email-feedback");
    if (!emailInput) return true;

    const val = emailInput.value.trim();
    if (!val) {
      emailInput.classList.remove("input-field-valid");
      emailInput.classList.add("input-field-invalid");
      if (feedbackEl) {
        feedbackEl.hidden = false;
        feedbackEl.removeAttribute("hidden");
        feedbackEl.className = "field-validation-feedback error";
        feedbackEl.innerHTML = "<span>⚠️</span> Email address is required.";
      }
      return false;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(val)) {
      emailInput.classList.remove("input-field-valid");
      emailInput.classList.add("input-field-invalid");
      if (feedbackEl) {
        feedbackEl.hidden = false;
        feedbackEl.removeAttribute("hidden");
        feedbackEl.className = "field-validation-feedback error";
        feedbackEl.innerHTML = "<span>⚠️</span> Please enter a valid email address (e.g. name@example.com).";
      }
      return false;
    }

    emailInput.classList.remove("input-field-invalid");
    emailInput.classList.add("input-field-valid");
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.removeAttribute("hidden");
      feedbackEl.className = "field-validation-feedback success";
      feedbackEl.innerHTML = "<span>✓</span> Valid email address.";
    }
    return true;
  }

  function checkAdminProfilePhone() {
    const phoneInput = $("#edit-admin-phone");
    const feedbackEl = $("#edit-admin-phone-feedback");
    const counterEl = $("#edit-admin-phone-counter");
    if (!phoneInput) return true;

    const val = phoneInput.value.trim();
    const digits = val.replace(/\D/g, "");
    let core10 = digits;
    if (digits.length === 12 && digits.startsWith("91")) {
      core10 = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith("0")) {
      core10 = digits.slice(1);
    }

    const count = Math.min(core10.length, 10);
    const isExact10 = core10.length === 10;
    const isIndianFormat = isExact10 && /^[6-9]\d{9}$/.test(core10);

    if (counterEl) {
      counterEl.textContent = `${count}/10 digits`;
      if (isExact10) {
        counterEl.className = "phone-digit-counter valid";
      } else {
        counterEl.className = "phone-digit-counter invalid";
      }
    }

    if (!val) {
      phoneInput.classList.remove("input-field-valid");
      phoneInput.classList.add("input-field-invalid");
      if (feedbackEl) {
        feedbackEl.hidden = false;
        feedbackEl.removeAttribute("hidden");
        feedbackEl.className = "field-validation-feedback error";
        feedbackEl.innerHTML = "<span>⚠️</span> Mobile number is required.";
      }
      return false;
    }

    if (!isExact10) {
      phoneInput.classList.remove("input-field-valid");
      phoneInput.classList.add("input-field-invalid");
      if (feedbackEl) {
        feedbackEl.hidden = false;
        feedbackEl.removeAttribute("hidden");
        feedbackEl.className = "field-validation-feedback error";
        feedbackEl.innerHTML = `<span>⚠️</span> Mobile number must be exactly 10 digits (${core10.length}/10 entered).`;
      }
      return false;
    }

    if (!isIndianFormat) {
      phoneInput.classList.remove("input-field-valid");
      phoneInput.classList.add("input-field-invalid");
      if (feedbackEl) {
        feedbackEl.hidden = false;
        feedbackEl.removeAttribute("hidden");
        feedbackEl.className = "field-validation-feedback error";
        feedbackEl.innerHTML = "<span>⚠️</span> Mobile number must start with 6, 7, 8, or 9.";
      }
      return false;
    }

    phoneInput.classList.remove("input-field-invalid");
    phoneInput.classList.add("input-field-valid");
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.removeAttribute("hidden");
      feedbackEl.className = "field-validation-feedback success";
      feedbackEl.innerHTML = "<span>✓</span> Valid 10-digit mobile number.";
    }
    return true;
  }

  // Attach live validation events for Profile Email and Phone
  $("#edit-admin-email")?.addEventListener("input", checkAdminProfileEmail);
  $("#edit-admin-email")?.addEventListener("blur", checkAdminProfileEmail);
  $("#edit-admin-phone")?.addEventListener("input", checkAdminProfilePhone);
  $("#edit-admin-phone")?.addEventListener("blur", checkAdminProfilePhone);

  $("#profile-open-edit-btn")?.addEventListener("click", openProfileEditDialog);

  // Change Admin Password Modal Handlers
  const changePwdDialog = $("#admin-change-password-dialog");
  const changePwdOpenBtn = $("#profile-open-pwd-btn");
  const changePwdForm = $("#admin-change-password-form");
  const changePwdMsg = $("#admin-change-pwd-msg");
  const changePwdSubmitBtn = $("#admin-change-pwd-submit");

  changePwdOpenBtn?.addEventListener("click", () => {
    if (changePwdForm) changePwdForm.reset();
    if (changePwdMsg) {
      changePwdMsg.textContent = "";
      changePwdMsg.className = "form-message";
    }
    if (changePwdDialog) changePwdDialog.showModal();
    $("#change-pwd-current")?.focus();
  });

  function setupChangePwdToggle(btnId, inputId) {
    $(`#${btnId}`)?.addEventListener("click", () => {
      const input = $(`#${inputId}`);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      const svg = $(`#${btnId} svg`);
      if (svg) {
        svg.innerHTML = isPassword
          ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
          : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    });
  }

  setupChangePwdToggle("toggle-change-pwd-curr", "change-pwd-current");
  setupChangePwdToggle("toggle-change-pwd-new", "change-pwd-new");
  setupChangePwdToggle("toggle-change-pwd-conf", "change-pwd-confirm");

  changePwdForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const currInput = $("#change-pwd-current");
    const newInput = $("#change-pwd-new");
    const confInput = $("#change-pwd-confirm");

    const currentPassword = currInput?.value?.trim() || "";
    const newPassword = newInput?.value?.trim() || "";
    const confirmPassword = confInput?.value?.trim() || "";

    if (!currentPassword) {
      if (changePwdMsg) {
        changePwdMsg.textContent = "Please enter your current admin password.";
        changePwdMsg.className = "form-message error";
      }
      currInput?.focus();
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      if (changePwdMsg) {
        changePwdMsg.textContent = "New password must be at least 4 characters long.";
        changePwdMsg.className = "form-message error";
      }
      newInput?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      if (changePwdMsg) {
        changePwdMsg.textContent = "New passwords do not match. Please re-check.";
        changePwdMsg.className = "form-message error";
      }
      confInput?.focus();
      return;
    }

    if (changePwdSubmitBtn) {
      changePwdSubmitBtn.disabled = true;
      changePwdSubmitBtn.innerHTML = `<span>⏳</span> Updating Password…`;
    }

    try {
      await api("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      showToast("✓ Super Admin password updated successfully!", "success");
      if (changePwdDialog) changePwdDialog.close();
      if (changePwdForm) changePwdForm.reset();
    } catch (err) {
      const errMsg = err.message || "Failed to update password.";
      if (changePwdMsg) {
        changePwdMsg.textContent = errMsg;
        changePwdMsg.className = "form-message error";
      }
      showToast(errMsg, "error");
    } finally {
      if (changePwdSubmitBtn) {
        changePwdSubmitBtn.disabled = false;
        changePwdSubmitBtn.innerHTML = `<span>🔒</span> Update Password`;
      }
    }
  });

  // Logout All Sessions Handlers
  const logoutAllDialog = $("#admin-logout-all-dialog");
  const logoutAllOpenBtn = $("#profile-logout-all-btn");
  const logoutAllForm = $("#admin-logout-all-form");
  const logoutAllMsg = $("#admin-logout-all-msg");
  const logoutAllSubmitBtn = $("#admin-logout-all-submit");

  logoutAllOpenBtn?.addEventListener("click", () => {
    if (logoutAllForm) logoutAllForm.reset();
    if (logoutAllMsg) {
      logoutAllMsg.textContent = "";
      logoutAllMsg.className = "form-message";
    }
    if (logoutAllDialog) logoutAllDialog.showModal();
    $("#logout-all-admin-password")?.focus();
  });

  $("#toggle-logout-all-pwd-visibility")?.addEventListener("click", () => {
    const input = $("#logout-all-admin-password");
    if (!input) return;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    const svg = $("#toggle-logout-all-pwd-visibility svg");
    if (svg) {
      svg.innerHTML = isPassword
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }
  });

  logoutAllForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const pwdInput = $("#logout-all-admin-password");
    const password = pwdInput?.value?.trim() || "";

    if (!password) {
      if (logoutAllMsg) {
        logoutAllMsg.textContent = "Please enter your admin password.";
        logoutAllMsg.className = "form-message error";
      }
      pwdInput?.focus();
      return;
    }

    if (logoutAllSubmitBtn) {
      logoutAllSubmitBtn.disabled = true;
      logoutAllSubmitBtn.innerHTML = `<span>⏳</span> Terminating Sessions…`;
    }

    try {
      await api("/api/admin/logout-all-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      sessionStorage.removeItem("exam_admin_local_session");
      showToast("🚪 All administrator sessions have been terminated.", "info");
      if (logoutAllDialog) logoutAllDialog.close();

      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err) {
      const errMsg = err.message || "Failed to terminate sessions.";
      if (logoutAllMsg) {
        logoutAllMsg.textContent = errMsg;
        logoutAllMsg.className = "form-message error";
      }
      showToast(errMsg, "error");
    } finally {
      if (logoutAllSubmitBtn) {
        logoutAllSubmitBtn.disabled = false;
        logoutAllSubmitBtn.innerHTML = `<span>🚪</span> Terminate All Sessions`;
      }
    }
  });

  // Toggle password visibility in profile modal
  $("#toggle-edit-profile-pwd-visibility")?.addEventListener("click", () => {
    const pwdInput = $("#edit-admin-password");
    if (!pwdInput) return;
    const isPassword = pwdInput.type === "password";
    pwdInput.type = isPassword ? "text" : "password";
    const eyeSvg = $("#edit-profile-pwd-eye-icon");
    if (eyeSvg) {
      if (isPassword) {
        eyeSvg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
      } else {
        eyeSvg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    }
  });

  // Live Instagram typing preview inside modal
  $("#edit-admin-instagram")?.addEventListener("input", e => {
    const rawVal = e.target.value.trim().replace(/^@/, "");
    const handle = rawVal || "smart_ai_notes";
    const igHandlePreview = $("#edit-preview-ig-handle");
    const igTestLink = $("#edit-ig-test-link");
    if (igHandlePreview) igHandlePreview.textContent = `@${handle}`;
    if (igTestLink) igTestLink.href = `https://www.instagram.com/${handle}/`;
  });

  // Avatar file picker triggers
  $("#edit-avatar-trigger-btn")?.addEventListener("click", () => {
    editAvatarFileInput?.click();
  });
  $("#edit-avatar-preview-ring")?.addEventListener("click", () => {
    editAvatarFileInput?.click();
  });
  $("#edit-avatar-preview-ring")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      editAvatarFileInput?.click();
    }
  });

  editAvatarFileInput?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await optimizeImageFile(file, 600, 0.88);
      selectedProfileAvatarData = dataUrl;
      if (editAvatarPreviewImg) {
        editAvatarPreviewImg.style.display = "block";
        editAvatarPreviewImg.src = dataUrl;
        const fb = $("#edit-avatar-preview-fallback");
        if (fb) fb.style.display = "none";
      }
      showToast("✓ Profile photo chosen! Click 'Save Profile Changes' to apply.", "info");
    } catch {
      const reader = new FileReader();
      reader.onload = evt => {
        selectedProfileAvatarData = evt.target.result;
        if (editAvatarPreviewImg) {
          editAvatarPreviewImg.style.display = "block";
          editAvatarPreviewImg.src = evt.target.result;
          const fb = $("#edit-avatar-preview-fallback");
          if (fb) fb.style.display = "none";
        }
        showToast("✓ Profile photo chosen! Click 'Save Profile Changes' to apply.", "info");
      };
      reader.readAsDataURL(file);
    }
  });

  // Logo file picker trigger
  $("#edit-logo-trigger-btn")?.addEventListener("click", () => {
    editLogoFileInput?.click();
  });

  editLogoFileInput?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await optimizeImageFile(file, 400, 0.92);
      selectedLogoData = dataUrl;
      if (editLogoPreviewImg) editLogoPreviewImg.src = dataUrl;
      showToast("✓ Website logo selected! Click 'Save Profile Changes' to apply across all pages.", "info");
    } catch {
      const reader = new FileReader();
      reader.onload = evt => {
        selectedLogoData = evt.target.result;
        if (editLogoPreviewImg) editLogoPreviewImg.src = evt.target.result;
        showToast("✓ Website logo selected! Click 'Save Profile Changes' to apply across all pages.", "info");
      };
      reader.readAsDataURL(file);
    }
  });

  // Instagram QR file picker trigger
  $("#edit-ig-qr-trigger-btn")?.addEventListener("click", () => {
    editIgQrFileInput?.click();
  });

  editIgQrFileInput?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await optimizeImageFile(file, 600, 0.95);
      selectedIgQrData = dataUrl;
      if (editIgQrImg) editIgQrImg.src = dataUrl;
      showToast("✓ Instagram QR image selected! Click 'Save Profile Changes' to apply to About Us page.", "info");
    } catch {
      const reader = new FileReader();
      reader.onload = evt => {
        selectedIgQrData = evt.target.result;
        if (editIgQrImg) editIgQrImg.src = evt.target.result;
        showToast("✓ Instagram QR image selected! Click 'Save Profile Changes' to apply to About Us page.", "info");
      };
      reader.readAsDataURL(file);
    }
  });

  editProfileDialog?.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => editProfileDialog.close());
  });

  editProfileForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#edit-admin-name")?.value.trim();
    const role = $("#edit-admin-role")?.value.trim() || "Master Admin & Platform Creator";
    const instagram = $("#edit-admin-instagram")?.value.trim().replace(/^@/, "") || "smart_ai_notes";
    const bio = $("#edit-admin-bio")?.value.trim() || "";
    const email = $("#edit-admin-email")?.value.trim();
    const phone = $("#edit-admin-phone")?.value.trim();
    const enteredPassword = $("#edit-admin-password")?.value.trim();
    const submitBtn = $("#edit-admin-profile-submit");

    if (!name) {
      if (editProfileMsg) {
        editProfileMsg.textContent = "Full Name is required.";
        editProfileMsg.className = "form-message error";
      }
      $("#edit-admin-name")?.focus();
      return;
    }

    // Strict Email Validation Check
    if (!checkAdminProfileEmail()) {
      if (editProfileMsg) {
        editProfileMsg.textContent = "Please enter a valid email address.";
        editProfileMsg.className = "form-message error";
      }
      showToast("Please enter a valid email address.", "error");
      $("#edit-admin-email")?.focus();
      return;
    }

    // Strict 10-Digit Mobile Number Validation Check
    if (!checkAdminProfilePhone()) {
      if (editProfileMsg) {
        editProfileMsg.textContent = "Please enter a valid 10-digit mobile number.";
        editProfileMsg.className = "form-message error";
      }
      showToast("Please enter a valid 10-digit mobile number.", "error");
      $("#edit-admin-phone")?.focus();
      return;
    }

    if (!enteredPassword) {
      if (editProfileMsg) {
        editProfileMsg.textContent = "Admin password confirmation is required to save changes.";
        editProfileMsg.className = "form-message error";
      }
      $("#edit-admin-password")?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (editProfileMsg) {
      editProfileMsg.textContent = "Verifying admin password & saving details…";
      editProfileMsg.className = "form-message";
    }

    try {
      const payload = {
        name,
        role,
        instagram,
        bio,
        email,
        phone,
        password: enteredPassword
      };
      if (selectedProfileAvatarData) payload.avatarData = selectedProfileAvatarData;
      if (selectedLogoData) payload.logoData = selectedLogoData;
      if (selectedIgQrData) payload.instagramQrData = selectedIgQrData;

      const res = await api("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res && res.profile) {
        adminProfileState = { ...adminProfileState, ...res.profile };
      } else {
        adminProfileState = {
          ...adminProfileState,
          name,
          role,
          instagram,
          bio,
          email,
          phone,
          ...(selectedProfileAvatarData ? { avatarUrl: selectedProfileAvatarData } : {}),
          ...(selectedLogoData ? { logoUrl: selectedLogoData } : {}),
          ...(selectedIgQrData ? { instagramQrUrl: selectedIgQrData } : {})
        };
      }

      if (selectedProfileAvatarData) {
        await ImageStore.set("admin_avatar", selectedProfileAvatarData);
        if (adminProfileState.avatarUrl) await ImageStore.set(adminProfileState.avatarUrl, selectedProfileAvatarData);
      }
      if (selectedLogoData) {
        await ImageStore.set("site_logo", selectedLogoData);
        if (adminProfileState.logoUrl) await ImageStore.set(adminProfileState.logoUrl, selectedLogoData);
      }
      if (selectedIgQrData) {
        await ImageStore.set("instagram_qr", selectedIgQrData);
        if (adminProfileState.instagramQrUrl) await ImageStore.set(adminProfileState.instagramQrUrl, selectedIgQrData);
      }

      localStorage.setItem("exam_admin_profile_data", JSON.stringify(adminProfileState));
      applyAdminProfileUI(adminProfileState);
      
      const pwdInput = $("#edit-admin-password");
      if (pwdInput) pwdInput.value = "";
      selectedProfileAvatarData = null;
      selectedLogoData = null;
      selectedIgQrData = null;

      editProfileDialog?.close();
      showToast("✓ Administrator profile, logo & Instagram QR updated successfully!", "success");
    } catch (err) {
      if (editProfileMsg) {
        editProfileMsg.textContent = err.message || "Incorrect admin password. Changes rejected.";
        editProfileMsg.className = "form-message error";
      }
      showToast(err.message || "Incorrect admin password", "error");
      const pwdInput = $("#edit-admin-password");
      if (pwdInput) {
        pwdInput.value = "";
        pwdInput.focus();
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Keyboard accessibility for interactive profile card in sidebar
  $(".portal-profile-card")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      switchAdminView("profile");
      if (isMobile()) {
        hideSidebar();
      }
    }
  });

  // ==========================================
  // 1-Click Backup Export & Restore Listeners (Includes Notes, Profile Pic, Logo, & QR)
  // ==========================================
  async function performBackupExport(btnElement) {
    if (btnElement) btnElement.disabled = true;
    const origHtml = btnElement ? btnElement.innerHTML : "";
    if (btnElement) btnElement.innerHTML = `<span>⏳</span> Generating Backup…`;

    try {
      let backupData = null;
      try {
        const res = await api("/api/admin/backup/export");
        if (res && res.backup) {
          backupData = res.backup;
        }
      } catch {}

      const idbImages = await ImageStore.getAll();

      // Fallback if local or api error
      if (!backupData) {
        const clientImages = { ...idbImages };
        const clientNotes = allNotes.map(n => {
          const copy = { ...n };
          const cleanName = (copy.imageUrl || "").split("?")[0].replace(/^\/uploads\//, "");
          const base64 = clientImages[cleanName] || clientImages[copy.imageUrl] || clientImages[copy.id] || (copy.imageUrl?.startsWith("data:image/") ? copy.imageUrl : null);
          if (base64) {
            const imgKey = cleanName || `${copy.id || Date.now()}.jpg`;
            clientImages[imgKey] = base64;
            copy.imageData = base64;
          }
          return copy;
        });

        // Calculate comprehensive Tag Analytics
        const tagCounts = {};
        for (const note of clientNotes) {
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
        for (const note of clientNotes) {
          const s = note.subject || "Others";
          catCounts[s] = (catCounts[s] || 0) + 1;
        }
        const categoryAnalytics = {
          categories: catCounts,
          totalNotes: clientNotes.length
        };

        // Calculate Search Demands & Missing Searches
        const missingSearches = liveInteractions.missingSearches || {};
        const searchDemands = {
          unfulfilledDemands: Object.values(missingSearches).sort((a, b) => (b.count || 0) - (a.count || 0)),
          allSearches: liveInteractions.searches || {},
          totalSearchVolume: liveInteractions.totalSearches || 0
        };

        backupData = {
          version: "3.0",
          type: "ExamAlertIndiaMasterBackup",
          exportedAt: new Date().toISOString(),
          system: {
            platform: "Free AI Govt Exam Notes",
            generator: "Admin Studio Unified Master Backup Engine v3.0",
            notesCount: clientNotes.length,
            tagsCount: tagAnalytics.totalUniqueTags,
            searchDemandsCount: searchDemands.unfulfilledDemands.length
          },
          notes: clientNotes,
          visits: {
            count: Number(localStorage.getItem("exam_notes_local_visits") || "0"),
            today: Number(localStorage.getItem("exam_notes_local_visits_today") || "0")
          },
          interactions: liveInteractions,
          searchDemands,
          tagAnalytics,
          categoryAnalytics,
          profile: adminProfileState,
          profileAssets: {
            avatarData: adminProfileState.avatarUrl || null,
            logoData: adminProfileState.logoUrl || null,
            instagramQrData: adminProfileState.instagramQrUrl || null
          },
          images: clientImages
        };
        // Enrich server backup ONLY with IndexedDB images that belong to active notes or branding
        const activeNoteIds = new Set((allNotes || []).map(n => n.id));
        const activeImageKeys = new Set((allNotes || []).map(n => (n.imageUrl || "").split("?")[0].replace(/^\/uploads\//, "")).filter(Boolean));
        if (!backupData.images) backupData.images = {};
        for (const [k, v] of Object.entries(idbImages)) {
          if (activeNoteIds.has(k) || activeImageKeys.has(k) || k === "site_logo" || k === "admin_avatar" || k === "instagram_qr") {
            if (!backupData.images[k]) backupData.images[k] = v;
          }
        }
        if (Array.isArray(backupData.notes)) {
          backupData.notes = backupData.notes.map(n => {
            const copy = { ...n };
            if (!copy.imageData && copy.imageUrl) {
              const clean = copy.imageUrl.split("?")[0].replace(/^\/uploads\//, "");
              const base64 = backupData.images[clean] || backupData.images[copy.imageUrl] || idbImages[clean] || idbImages[copy.id];
              if (base64) copy.imageData = base64;
            }
            return copy;
          });
        }
        // Ensure registeredUsers are bundled
        if (!backupData.users && Array.isArray(registeredUsers)) {
          backupData.users = registeredUsers;
        }
      }

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const dlUrl = URL.createObjectURL(blob);
      const dlLink = document.createElement("a");
      const dateTag = new Date().toISOString().slice(0, 10);
      dlLink.href = dlUrl;
      dlLink.download = `exam_alert_india_master_backup_${dateTag}.json`;
      document.body.appendChild(dlLink);
      dlLink.click();
      document.body.removeChild(dlLink);
      URL.revokeObjectURL(dlUrl);

      showToast(`✓ Master Backup exported! Saved ${backupData.notes?.length || 0} notes, ${(backupData.users || []).length} students, profile & branding!`, "success");
    } catch (err) {
      showToast("Failed to create backup file: " + err.message, "error");
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = origHtml;
      }
    }
  }

  const backupExportBtn = $("#backup-export-btn");
  backupExportBtn?.addEventListener("click", () => performBackupExport(backupExportBtn));

  const backupPageExportBtn = $("#backup-page-export-btn");
  backupPageExportBtn?.addEventListener("click", () => performBackupExport(backupPageExportBtn));

  const modalQuickBackupBtn = $("#modal-quick-backup-btn");
  modalQuickBackupBtn?.addEventListener("click", () => performBackupExport(modalQuickBackupBtn));

  const backupRestoreFileInput = $("#backup-restore-file-input");
  const backupRestoreTriggerBtn = $("#backup-restore-trigger-btn");
  backupRestoreTriggerBtn?.addEventListener("click", () => {
    backupRestoreFileInput?.click();
  });

  const backupPageRestoreFileInput = $("#backup-page-restore-file-input");
  const backupPageRestoreTriggerBtn = $("#backup-page-restore-trigger-btn");
  backupPageRestoreTriggerBtn?.addEventListener("click", () => {
    backupPageRestoreFileInput?.click();
  });

  $("#backup-center-refresh-btn")?.addEventListener("click", () => {
    refreshBackupCenterKpis();
    showToast("Backup Center metrics refreshed! 🔄", "info");
  });

  // Windows-Style Backup Restore Progress Popup Window Controller
  async function showWindowsRestoreProgress(file) {
    const dialog = $("#backup-restore-progress-dialog");
    const windowTitleEl = $("#win-window-title");
    const titleEl = $("#win-transfer-title");
    const subEl = $("#win-transfer-sub");
    const stageLabel = $("#win-progress-stage-label");
    const pctEl = $("#win-progress-pct");
    const fillEl = $("#win-progress-fill");
    const itemNameEl = $("#win-transfer-item-name");
    const speedEl = $("#win-transfer-speed");
    const etaEl = $("#win-transfer-eta");
    const itemsCountEl = $("#win-transfer-items-count");
    const sourceFileEl = $("#win-transfer-source-file");
    const iconEl = $("#win-transfer-icon");
    const footerEl = $("#win-transfer-footer");

    if (!dialog) return { updateLiveStats: () => {}, animateTo: () => Promise.resolve(), setItems: () => {}, complete: () => {}, close: () => {} };

    const totalBytes = (file && file.size) || (1024 * 1024 * 3.5);
    const startOverallTime = performance.now();
    let currentPct = 0;
    let totalItemsCount = 0;
    let processedItemsCount = 0;

    // Reset initial visual state
    if (iconEl) iconEl.textContent = "📦";
    if (windowTitleEl) windowTitleEl.textContent = `Restoring from ${file.name}`;
    if (titleEl) titleEl.textContent = "Copying & Restoring Website Data…";
    if (subEl) subEl.textContent = "Transferring notes library, branding & analytics";
    if (stageLabel) stageLabel.textContent = "Reading backup package...";
    if (pctEl) pctEl.textContent = "0%";
    if (fillEl) fillEl.style.width = "0%";
    if (itemNameEl) itemNameEl.textContent = `Reading ${file.name}...`;
    if (speedEl) speedEl.textContent = "Calculating…";
    if (etaEl) etaEl.textContent = "Calculating…";
    if (itemsCountEl) itemsCountEl.textContent = "Calculating…";
    if (sourceFileEl) sourceFileEl.textContent = file.name;
    if (footerEl) footerEl.style.display = "none";

    try {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } catch {
      dialog.setAttribute("open", "");
    }

    const updateLiveStats = (pct, currentItemText = null) => {
      currentPct = Math.min(100, Math.max(0, pct));
      if (pctEl) pctEl.textContent = `${Math.round(currentPct)}%`;
      if (fillEl) fillEl.style.width = `${currentPct}%`;
      if (itemNameEl && currentItemText) itemNameEl.textContent = currentItemText;

      const elapsedSec = Math.max(0.1, (performance.now() - startOverallTime) / 1000);
      const processedBytes = (currentPct / 100) * totalBytes;
      // Realistic smooth transfer speed with slight natural variation
      const baseMBps = (processedBytes / (1024 * 1024)) / elapsedSec;
      const speedMBps = Math.max(16.2, Math.min(38.5, (baseMBps || 21.4) + (Math.sin(elapsedSec * 3) * 1.8)));

      if (speedEl) {
        speedEl.textContent = `${speedMBps.toFixed(1)} MB/s`;
      }

      const remainingBytes = Math.max(0, totalBytes - processedBytes);
      const estSeconds = speedMBps > 0 ? (remainingBytes / (speedMBps * 1024 * 1024)) : 0;

      if (etaEl) {
        if (currentPct >= 99) {
          etaEl.textContent = "Finalizing commit...";
        } else if (estSeconds <= 1.2) {
          etaEl.textContent = "About 1 second remaining";
        } else if (estSeconds < 60) {
          etaEl.textContent = `About ${Math.ceil(estSeconds)} seconds remaining`;
        } else {
          etaEl.textContent = `About ${Math.ceil(estSeconds / 60)} minutes remaining`;
        }
      }

      if (itemsCountEl && totalItemsCount > 0) {
        const remaining = Math.max(0, totalItemsCount - processedItemsCount);
        itemsCountEl.textContent = `${remaining} of ${totalItemsCount} items`;
      }
    };

    const animateTo = (targetPct, durationMs, stageText, currentItem) => {
      if (stageLabel && stageText) stageLabel.textContent = stageText;
      return new Promise(resolve => {
        const start = currentPct;
        const startTime = performance.now();
        const frame = (now) => {
          const elapsed = now - startTime;
          const p = Math.min(elapsed / durationMs, 1);
          const interpolated = start + (targetPct - start) * p;
          updateLiveStats(interpolated, currentItem);
          if (p < 1) {
            requestAnimationFrame(frame);
          } else {
            updateLiveStats(targetPct, currentItem);
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    };

    return {
      updateLiveStats,
      animateTo,
      setItems: (processed, total) => {
        processedItemsCount = processed;
        totalItemsCount = total;
        if (itemsCountEl) {
          const rem = Math.max(0, total - processed);
          itemsCountEl.textContent = `${rem} of ${total} items`;
        }
      },
      setItemName: (name) => {
        if (itemNameEl) itemNameEl.textContent = name;
      },
      complete: async (notesCount) => {
        updateLiveStats(100, `Successfully restored ${notesCount} notes and brand assets`);
        if (iconEl) iconEl.textContent = "✅";
        if (titleEl) titleEl.textContent = "System Restored Successfully!";
        if (subEl) subEl.textContent = `All ${notesCount} notes, brand logo, profile photo & QR barcode loaded`;
        if (speedEl) speedEl.textContent = "Transfer complete";
        if (etaEl) etaEl.textContent = "0 seconds remaining";
        if (itemsCountEl) itemsCountEl.textContent = `0 of ${totalItemsCount || notesCount} items`;
        if (footerEl) footerEl.style.display = "flex";
        await new Promise(r => setTimeout(r, 1500));
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
      },
      close: () => {
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
      }
    };
  }

  async function handleBackupRestoreWorkflow(file) {
    if (!file) return;

    if (backupRestoreTriggerBtn) {
      backupRestoreTriggerBtn.disabled = true;
      backupRestoreTriggerBtn.innerHTML = `<span>⏳</span> Restoring data…`;
    }
    if (backupPageRestoreTriggerBtn) {
      backupPageRestoreTriggerBtn.disabled = true;
      backupPageRestoreTriggerBtn.innerHTML = `<span>⏳</span> Restoring data…`;
    }

    let progressModal = null;

    try {
      progressModal = await showWindowsRestoreProgress(file);

      // Stage 1: Read and verify file (0% -> 15%)
      await progressModal.animateTo(15, 450, "Reading backup package & verifying JSON...", `Verifying ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

      const text = await file.text();
      const backupObj = JSON.parse(text);

      if (!backupObj || (!backupObj.notes && !backupObj.type)) {
        throw new Error("The selected file is not a valid Exam Alert India backup file.");
      }

      const notesCount = (backupObj.notes || []).length;
      const usersCount = (backupObj.users || []).length;
      const totalEstimatedItems = notesCount + usersCount + 3 + (backupObj.searchDemands?.unfulfilledDemands?.length || 0);
      progressModal.setItems(0, totalEstimatedItems);

      // Stage 2: Decode notes and diagram buffers with dynamic individual file feedback (15% -> 50%)
      const notesList = backupObj.notes || [];
      for (let i = 0; i < notesList.length; i++) {
        const note = notesList[i];
        const stepTargetPct = 15 + Math.round(((i + 1) / Math.max(1, notesList.length)) * 35);
        progressModal.setItems(i + 1, totalEstimatedItems);
        await progressModal.animateTo(
          stepTargetPct,
          Math.max(60, Math.min(220, 800 / Math.max(1, notesList.length))),
          "Decoding note records & diagram buffers...",
          `Decoding note ${i + 1}/${notesCount}: "${note.title || note.id}.jpg"`
        );
      }

      // Stage 3: Server synchronization (50% -> 75%)
      let restoreRes = null;
      let serverSaved = false;
      progressModal.setItemName("Sending database snapshot to server disk...");
      try {
        restoreRes = await api("/api/admin/backup/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backup: backupObj })
        });
        if (restoreRes && restoreRes.success) serverSaved = true;
      } catch (e1) {
        console.warn("[Restore] Full payload failed, retrying with lightweight schema + asset uploads...", e1);
        try {
          const lightBackup = {
            ...backupObj,
            notes: (backupObj.notes || []).map(n => {
              const cp = { ...n };
              delete cp.imageData;
              delete cp.image;
              return cp;
            }),
            images: {}
          };
          restoreRes = await api("/api/admin/backup/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ backup: lightBackup })
          });
          if (restoreRes && restoreRes.success) {
            serverSaved = true;
            if (backupObj.images && typeof backupObj.images === "object") {
              for (const [fn, dataUrl] of Object.entries(backupObj.images)) {
                if (fn && dataUrl && typeof dataUrl === "string") {
                  progressModal.setItemName(`Uploading image asset: "${fn}"`);
                  await api("/api/admin/backup/upload-asset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: fn, dataUrl })
                  }).catch(() => {});
                }
              }
            }
            if (Array.isArray(backupObj.notes)) {
              for (const n of backupObj.notes) {
                const raw = n.imageData || n.image || "";
                if (raw && typeof raw === "string" && raw.startsWith("data:image/")) {
                  const ext = raw.includes("png") ? "png" : raw.includes("webp") ? "webp" : "jpg";
                  const filename = `${n.id || "note"}.${ext}`;
                  progressModal.setItemName(`Uploading diagram image: "${filename}"`);
                  await api("/api/admin/backup/upload-asset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename, dataUrl: raw })
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (e2) {
          console.warn("[Restore] Server API not reachable (static host mode):", e2);
        }
      }

      await progressModal.animateTo(75, 400, "Uploading & committing database records...", "Writing database snapshot to server storage...");

      if (restoreRes && restoreRes.profile) {
        adminProfileState = { ...adminProfileState, ...restoreRes.profile };
      }

      // Stage 4: Apply branding, student user accounts & IndexedDB storage (75% -> 96%)
      await progressModal.animateTo(82, 350, "Saving images into offline IndexedDB...", "Caching diagrams into local image repository...");

      if (backupObj.images && typeof backupObj.images === "object") {
        for (const [key, dataUrl] of Object.entries(backupObj.images)) {
          if (key && dataUrl && typeof dataUrl === "string") {
            await ImageStore.set(key, dataUrl);
            const clean = key.split("?")[0].replace(/^\/uploads\//, "");
            await ImageStore.set(clean, dataUrl);
            await ImageStore.set(`/uploads/${clean}`, dataUrl);
          }
        }
      }
      if (Array.isArray(backupObj.notes)) {
        for (const n of backupObj.notes) {
          const raw = n.imageData || n.image || "";
          if (raw && typeof raw === "string" && raw.startsWith("data:image/")) {
            await ImageStore.set(n.id, raw);
            if (n.imageUrl) {
              await ImageStore.set(n.imageUrl, raw);
              const clean = n.imageUrl.split("?")[0].replace(/^\/uploads\//, "");
              await ImageStore.set(clean, raw);
            }
          }
        }
      }

      if (Array.isArray(backupObj.notes)) {
        const clientNotes = backupObj.notes.map(n => {
          const c = { ...n };
          delete c.imageData;
          if (c.imageUrl && c.imageUrl.startsWith("data:image/") && c.imageUrl.length > 30000) {
            c.imageUrl = `/uploads/${c.id || "note"}.jpg`;
          }
          return c;
        });
        safeSetLocalStorage("exam_notes_custom_uploads", clientNotes);
        allNotes = clientNotes;
      }

      // Restore Student Accounts
      if (Array.isArray(backupObj.users)) {
        registeredUsers = backupObj.users;
        safeSetLocalStorage("exam_users_data", registeredUsers);
        renderUsersView();
      }

      await progressModal.animateTo(90, 300, "Applying branding assets & student accounts...", 'Syncing creator avatar: "admin_avatar.jpg"...');

      if (backupObj.profile || backupObj.profileAssets) {
        const pObj = backupObj.profile || {};
        const pAssets = backupObj.profileAssets || backupObj.profile || {};
        adminProfileState = {
          ...adminProfileState,
          ...pObj,
          ...(pObj.avatarUrl ? { avatarUrl: pObj.avatarUrl } : {}),
          ...(pObj.logoUrl ? { logoUrl: pObj.logoUrl } : {}),
          ...(pObj.instagramQrUrl ? { instagramQrUrl: pObj.instagramQrUrl } : {})
        };

        if (pAssets.avatarData) {
          progressModal.setItemName('Saving: "admin_avatar.jpg"');
          await ImageStore.set("admin_avatar", pAssets.avatarData);
          if (adminProfileState.avatarUrl) await ImageStore.set(adminProfileState.avatarUrl, pAssets.avatarData);
        }
        if (pAssets.logoData) {
          progressModal.setItemName('Saving: "site_logo.png"');
          await ImageStore.set("site_logo", pAssets.logoData);
          if (adminProfileState.logoUrl) await ImageStore.set(adminProfileState.logoUrl, pAssets.logoData);
        }
        if (pAssets.instagramQrData) {
          progressModal.setItemName('Saving: "instagram_qr.png"');
          await ImageStore.set("instagram_qr", pAssets.instagramQrData);
          if (adminProfileState.instagramQrUrl) await ImageStore.set(adminProfileState.instagramQrUrl, pAssets.instagramQrData);
        }

        safeSetLocalStorage("exam_admin_profile_data", adminProfileState);
        applyAdminProfileUI(adminProfileState);
      }

      await progressModal.animateTo(96, 250, "Restoring search demands & analytics...", "Syncing search demand logs and category analytics...");

      if (backupObj.interactions) {
        liveInteractions = backupObj.interactions;
        safeSetLocalStorage("exam_notes_interactions_data", liveInteractions);
      } else if (backupObj.searchDemands) {
        liveInteractions = {
          totalLikes: 0,
          totalDownloads: 0,
          totalShares: 0,
          totalSearches: backupObj.searchDemands.totalSearchVolume || 0,
          totalImpressions: 0,
          notes: {},
          shares: {},
          searches: backupObj.searchDemands.allSearches || {},
          missingSearches: (backupObj.searchDemands.unfulfilledDemands || []).reduce((acc, item) => {
            if (item && item.query) acc[item.query] = item;
            return acc;
          }, {})
        };
        safeSetLocalStorage("exam_notes_interactions_data", liveInteractions);
      }
      if (backupObj.visits) {
        safeSetLocalStorage("exam_notes_local_visits", backupObj.visits.count || 0);
        safeSetLocalStorage("exam_notes_local_visits_today", backupObj.visits.today || 0);
      }

      progressModal.setItems(totalEstimatedItems, totalEstimatedItems);

      // Stage 5: Complete (96% -> 100%)
      await progressModal.animateTo(100, 300, "Restore Complete!", `Successfully synchronized ${notesCount} notes, ${usersCount} students & assets`);
      await progressModal.complete(notesCount);
      await loadDashboardData();
      await refreshBackupCenterKpis();
      if (serverSaved) {
        showToast(`✓ Master data restored to server! ${notesCount} notes and ${usersCount} student profiles active.`, "success");
      } else {
        showToast(`✓ Master data restored! (${notesCount} notes loaded)`, "success");
      }
    } catch (err) {
      if (progressModal) progressModal.close();
      showToast("Restore failed: " + (err.message || "Invalid file format"), "error");
    } finally {
      if (backupRestoreTriggerBtn) {
        backupRestoreTriggerBtn.disabled = false;
        backupRestoreTriggerBtn.innerHTML = `<span>🔄</span> Select Backup File to Restore`;
      }
      if (backupPageRestoreTriggerBtn) {
        backupPageRestoreTriggerBtn.disabled = false;
        backupPageRestoreTriggerBtn.innerHTML = `<span>🔄</span> Select Backup File to Restore`;
      }
      if (backupRestoreFileInput) backupRestoreFileInput.value = "";
      if (backupPageRestoreFileInput) backupPageRestoreFileInput.value = "";
    }
  }

  backupRestoreFileInput?.addEventListener("change", (e) => {
    handleBackupRestoreWorkflow(e.target.files?.[0]);
  });

  backupPageRestoreFileInput?.addEventListener("change", (e) => {
    handleBackupRestoreWorkflow(e.target.files?.[0]);
  });

  // Missing Demands Filter & Sort listeners
  $("#missing-demands-search-input")?.addEventListener("input", e => {
    missingSearchesState.filter = e.target.value;
    renderMissingSearchesView();
  });

  $("#missing-demands-sort-select")?.addEventListener("change", e => {
    missingSearchesState.sortBy = e.target.value;
    renderMissingSearchesView();
  });

  // Clear all missing searches
  $("#clear-missing-searches-btn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear all logged search demands?")) return;
    try {
      await api("/api/admin/missing-searches/clear", { method: "POST" });
    } catch {}
    if (liveInteractions) {
      liveInteractions.missingSearches = {};
    }
    renderMissingSearchesView();
    showToast("✓ All search demands cleared!", "success");
  });

  // Event Delegation for Fulfill & Dismiss
  $("#missing-demands-tbody")?.addEventListener("click", async e => {
    const fulfillBtn = e.target.closest("[data-fulfill-topic]");
    if (fulfillBtn) {
      const topic = fulfillBtn.dataset.fulfillTopic;
      switchAdminView("publish");
      const titleInput = $("#studio-note-title");
      if (titleInput) {
        titleInput.value = topic;
        const charCount = $("#studio-title-char-count");
        if (charCount) charCount.textContent = `${topic.length}/80`;
        const simTitle = $("#sim-title-text");
        if (simTitle) simTitle.textContent = topic;
      }
      showToast(`✓ Pre-filled note title with in-demand topic: "${topic}"`, "success");
      setTimeout(() => {
        $("#studio-file-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      return;
    }

    const dismissBtn = e.target.closest("[data-dismiss-topic]");
    if (dismissBtn) {
      const topic = dismissBtn.dataset.dismissTopic;
      if (!confirm(`Remove "${topic}" from the search demands log?`)) return;
      try {
        await api("/api/admin/missing-searches/" + encodeURIComponent(topic), { method: "DELETE" });
      } catch {}
      if (liveInteractions && liveInteractions.missingSearches) {
        delete liveInteractions.missingSearches[topic];
      }
      renderMissingSearchesView();
      showToast(`Topic "${topic}" removed from demands log.`, "info");
    }
  });

  // Clean / Reset All Data Modal & Password Verification
  const cleanDialog = $("#admin-clean-data-dialog");
  const cleanForm = $("#admin-clean-data-form");
  const cleanPwd = $("#clean-data-password-input");
  const cleanMsg = $("#clean-data-error-msg");

  $("#admin-clean-data-btn")?.addEventListener("click", () => {
    if (cleanPwd) cleanPwd.value = "";
    if (cleanMsg) {
      cleanMsg.textContent = "";
      cleanMsg.className = "form-message";
    }
    cleanDialog?.showModal();
    cleanPwd?.focus();
  });

  $("#toggle-clean-pwd-visibility")?.addEventListener("click", () => {
    if (!cleanPwd) return;
    const isPassword = cleanPwd.type === "password";
    cleanPwd.type = isPassword ? "text" : "password";
    const eyeSvg = $("#clean-pwd-eye-icon");
    if (eyeSvg) {
      if (isPassword) {
        eyeSvg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
      } else {
        eyeSvg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    }
  });

  cleanDialog?.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => cleanDialog.close());
  });

  cleanForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const enteredPassword = cleanPwd?.value.trim();
    if (!enteredPassword) {
      if (cleanMsg) {
        cleanMsg.textContent = "Please enter your admin password.";
        cleanMsg.className = "form-message error";
      }
      return;
    }

    const submitBtn = $("#clean-data-submit-btn");
    if (submitBtn) submitBtn.disabled = true;
    if (cleanMsg) {
      cleanMsg.textContent = "Verifying admin credentials…";
      cleanMsg.className = "form-message";
    }

    try {
      await api("/api/admin/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword })
      });

      localStorage.removeItem("exam_notes_local_visits");
      localStorage.removeItem("exam_notes_local_visits_today");
      localStorage.removeItem("exam_notes_bookmarks");
      localStorage.removeItem("exam_notes_recent");
      localStorage.removeItem("exam_notes_favorites");
      localStorage.removeItem("exam_notes_offline_queue");
      localStorage.removeItem("exam_notes_interactions_data");

      liveInteractions = {
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

      if (cleanDialog) cleanDialog.close();
      showToast("✓ Visitor logs, search queries, entire feedback & ideas, and interaction telemetry have been completely cleared! Admin profile, published notes, and registered users remain safe.", "success");
      await loadDashboardData();
      if (typeof renderUsersView === "function") renderUsersView();
      if (typeof renderInteractionsView === "function") renderInteractionsView();
      if (typeof fetchAdminFeedback === "function") await fetchAdminFeedback();
    } catch (err) {
      if (cleanMsg) {
        cleanMsg.textContent = err.message || "Incorrect admin password. Data wipe was rejected.";
        cleanMsg.className = "form-message error";
      }
      cleanPwd?.focus();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (cleanPwd) cleanPwd.value = "";
    }
  });

  // Delete Note Password Verification Modal
  const deleteDialog = $("#admin-delete-note-dialog");
  const deleteForm = $("#admin-delete-note-form");
  const deletePwd = $("#delete-note-password-input");
  const deleteMsg = $("#delete-note-error-msg");

  $("#toggle-delete-pwd-visibility")?.addEventListener("click", () => {
    if (!deletePwd) return;
    const isPassword = deletePwd.type === "password";
    deletePwd.type = isPassword ? "text" : "password";
    const eyeSvg = $("#delete-pwd-eye-icon");
    if (eyeSvg) {
      if (isPassword) {
        eyeSvg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
      } else {
        eyeSvg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    }
  });

  deleteDialog?.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => deleteDialog.close());
  });

  deleteForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const enteredPassword = deletePwd?.value.trim();
    if (!enteredPassword) {
      if (deleteMsg) {
        deleteMsg.textContent = "Please enter your admin password.";
        deleteMsg.className = "form-message error";
      }
      return;
    }

    if (pendingDeleteNoteIds.length === 0) {
      deleteDialog?.close();
      return;
    }

    const submitBtn = $("#delete-note-submit-btn");
    if (submitBtn) submitBtn.disabled = true;
    if (deleteMsg) {
      deleteMsg.textContent = "Verifying admin credentials…";
      deleteMsg.className = "form-message";
    }

    try {
      await api("/api/admin/notes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: pendingDeleteNoteIds,
          password: enteredPassword
        })
      });

      // Update local storage and in-memory collections
      const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
      const filteredLocal = existingLocal.filter(x => !pendingDeleteNoteIds.includes(x.id));
      localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(filteredLocal));

      const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
      pendingDeleteNoteIds.forEach(id => {
        if (!deletedSamples.includes(id)) deletedSamples.push(id);
        sampleNotes = sampleNotes.filter(x => x.id !== id);
        tableState.selectedIds.delete(id);
      });
      localStorage.setItem("exam_notes_deleted_sample_ids", JSON.stringify(deletedSamples));

      const count = pendingDeleteNoteIds.length;
      deleteDialog?.close();
      showToast(`✓ ${count} note${count > 1 ? "s" : ""} permanently deleted from library.`, "success");
      pendingDeleteNoteIds = [];
      await loadDashboardData();
      await fetchAdminUsersData();
      renderUsersView();
      if (currentUserDetailId) {
        openUserDetailsModal(currentUserDetailId);
      }
    } catch (err) {
      if (deleteMsg) {
        deleteMsg.textContent = err.message || "Incorrect admin password. Deletion was rejected.";
        deleteMsg.className = "form-message error";
      }
      deletePwd?.focus();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (deletePwd) deletePwd.value = "";
    }
  });

  // Recent notes delegation click to preview
  $("#dashboard-recent-notes")?.addEventListener("click", e => {
    const prev = e.target.closest("[data-preview-id]");
    if (prev) {
      openLightbox(prev.dataset.previewId);
    }
  });

  // Table Subject Filter Dropdown
  $("#admin-table-filter-subject")?.addEventListener("change", renderTable);

  // Clear / Reset filters button
  $("#reset-search-btn")?.addEventListener("click", () => {
    const s = $("#admin-table-search");
    if (s) s.value = "";
    const f = $("#admin-table-filter-subject");
    if (f) f.value = "";
    renderTable();
  });

  // Password Visibility Toggle
  const togglePwdBtn = $("#toggle-pwd-visibility");
  const pwdInput = $("#admin-page-password");
  togglePwdBtn?.addEventListener("click", () => {
    if (!pwdInput) return;
    const isPassword = pwdInput.type === "password";
    pwdInput.type = isPassword ? "text" : "password";
    const eyeSvg = $("#pwd-eye-icon");
    if (eyeSvg) {
      if (isPassword) {
        eyeSvg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
      } else {
        eyeSvg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    }
  });

  // Clear password input on initial load & reset
  const purgePasswordAutofill = () => {
    const pInput = $("#admin-page-password");
    if (pInput && !pInput.matches(":focus")) {
      pInput.value = "";
    }
  };

  purgePasswordAutofill();

  // Login Form Submit
  $("#admin-page-login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#admin-page-login-msg");
    const btn = $("#admin-page-login-submit");
    const pwdInput = $("#admin-page-password");

    if (!pwdInput || !msg) return;

    const enteredPassword = pwdInput.value.trim();
    if (!enteredPassword) {
      msg.textContent = "Please enter your admin password.";
      msg.className = "form-message error";
      pwdInput.focus();
      return;
    }

    msg.textContent = "Verifying credentials…";
    msg.className = "form-message";
    if (btn) btn.disabled = true;

    try {
      const loginRes = await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword })
      });
      sessionStorage.setItem("exam_admin_local_session", "true");
      try {
        localStorage.setItem("exam_admin_auth_sync_event", JSON.stringify({ action: "login", time: Date.now() }));
        if (authBroadcastChannel) {
          authBroadcastChannel.postMessage({ type: "LOGIN", time: Date.now() });
        }
      } catch {}
      pwdInput.value = "";
      showToast("✓ Authentication successful! Welcome to Admin Studio.", "success");
      showDashboard();
    } catch (err) {
      const errMsg = err.message || "The admin password is incorrect.";
      msg.textContent = errMsg.includes("incorrect") ? "✕ Incorrect admin password. Please try again." : `✕ ${errMsg}`;
      msg.className = "form-message error";
      showToast(errMsg.includes("incorrect") ? "Incorrect admin password." : errMsg, "error");
      pwdInput.focus();
      pwdInput.select();
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Logout Buttons (Header & Sidebar)
  const handleLogout = async () => {
    if (confirm("Logout from the Admin session?")) {
      executeLogout(true);
      showToast("Logged out successfully.", "info");
    }
  };

  $("#admin-logout-btn")?.addEventListener("click", handleLogout);
  $("#sidebar-signout-btn")?.addEventListener("click", handleLogout);

  // Upload Form Submit (Opens Image Verification Popup First)
  $("#admin-upload-form")?.addEventListener("submit", e => {
    e.preventDefault();
    openPublishVerificationModal();
  });

  // Edit Note Form Submit & Image URL Preview Listener
  $("#edit-note-image-url")?.addEventListener("input", e => {
    const val = (e.target.value || "").trim();
    const previewBox = $("#edit-image-preview-box");
    const imgPreview = $("#edit-img-preview");
    if (val && (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/uploads/") || val.startsWith("data:image/"))) {
      if (imgPreview) imgPreview.src = val;
      if (previewBox) previewBox.hidden = false;
    } else {
      if (previewBox) previewBox.hidden = true;
    }
  });

  $("#edit-note-overview")?.addEventListener("input", e => {
    const charCount = $("#edit-overview-char-count");
    if (charCount) charCount.textContent = `${e.target.value.length}/2000`;
  });

  $("#admin-edit-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#edit-note-id").value;
    const title = $("#edit-note-title").value.trim();
    const subject = $("#edit-note-subject").value;
    const tagsInput = $("#edit-note-tags");
    const rawTags = tagsInput ? tagsInput.value : "";
    const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
    const overviewEditor = $("#edit-note-overview-editor");
    const overview = overviewEditor ? overviewEditor.innerHTML.trim() : ($("#edit-note-overview")?.value || "").trim();
    const imageUrl = ($("#edit-note-image-url")?.value || "").trim();

    const msg = $("#edit-form-msg");
    const submitBtn = $("#edit-submit-btn");

    if (!id || !title || !subject) return;

    msg.textContent = "Saving updates…";
    msg.className = "form-message";
    submitBtn.disabled = true;

    try {
      const payload = { title, subject, tags: parsedTags, overview };
      if (imageUrl) payload.imageUrl = imageUrl;
      if (editImageData) payload.imageData = editImageData;

      await api(`/api/admin/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      showToast("✓ Note updated successfully!", "success");
      $("#admin-edit-dialog")?.close();
      await loadDashboardData();
    } catch (err) {
      console.error("Edit Note Error:", err);
      showToast("Update Failed: " + (err.message || "Failed to update note."), "error");
      if (msg) {
        msg.textContent = "Error: " + (err.message || "Failed to save changes.");
        msg.className = "form-message error";
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Table Search Filter (Resets to page 1 on input)
  $("#admin-table-search")?.addEventListener("input", () => {
    tableState.page = 1;
    renderTable();
  });

  // View Mode Buttons (Table vs Grid)
  $("#admin-view-btn-table")?.addEventListener("click", () => {
    tableState.viewMode = "table";
    renderTable();
  });

  $("#admin-view-btn-grid")?.addEventListener("click", () => {
    tableState.viewMode = "grid";
    renderTable();
  });

  // Column Sort Headers
  $$(".sortable-col").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (tableState.sortKey === key) {
        tableState.sortDir = tableState.sortDir === "asc" ? "desc" : "asc";
      } else {
        tableState.sortKey = key;
        tableState.sortDir = key === "date" ? "desc" : "asc";
      }
      renderTable();
    });
  });

  // Select All Checkbox
  $("#admin-select-all")?.addEventListener("change", e => {
    const checked = e.target.checked;
    const filtered = getFilteredAndSortedNotes();
    const rowsPerPage = tableState.rowsPerPage === "all" ? filtered.length : Number(tableState.rowsPerPage) || 10;
    const startIndex = (tableState.page - 1) * rowsPerPage;
    const endIndex = tableState.rowsPerPage === "all" ? filtered.length : Math.min(startIndex + rowsPerPage, filtered.length);
    const displayed = filtered.slice(startIndex, endIndex);

    displayed.forEach(n => {
      if (checked) {
        tableState.selectedIds.add(n.id);
      } else {
        tableState.selectedIds.delete(n.id);
      }
    });
    renderTable();
  });

  // Checkbox Selection on Rows & Grid Cards
  $("#admin-view-modify")?.addEventListener("change", e => {
    const cb = e.target.closest(".admin-row-cb");
    if (cb) {
      const id = cb.dataset.cbId;
      if (cb.checked) {
        tableState.selectedIds.add(id);
      } else {
        tableState.selectedIds.delete(id);
      }
      renderTable();
    }
  });

  // Bulk Actions: Delete Selected & Clear Selection
  $("#admin-bulk-delete-btn")?.addEventListener("click", () => {
    deleteNotesByIds(Array.from(tableState.selectedIds));
  });

  $("#admin-bulk-clear-btn")?.addEventListener("click", () => {
    tableState.selectedIds.clear();
    renderTable();
  });

  // Pagination Pages Navigation
  $("#admin-pagination-pages")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-page]");
    if (btn && !btn.disabled) {
      tableState.page = Number(btn.dataset.page) || 1;
      renderTable();
      $("#admin-table-view-wrap")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  // Rows Per Page Selector
  $("#admin-rows-per-page")?.addEventListener("change", e => {
    tableState.rowsPerPage = e.target.value;
    tableState.page = 1;
    renderTable();
  });

  // Table & Grid Actions Delegation (Preview Popup, Edit & Delete)
  const handleModifyActionClick = async e => {
    if (e.target.closest(".admin-row-cb")) return;

    const prevBtn = e.target.closest("[data-preview-id]");
    if (prevBtn && !e.target.closest("[data-edit-id]") && !e.target.closest("[data-delete-id]")) {
      openLightbox(prevBtn.dataset.previewId);
      return;
    }

    const editBtn = e.target.closest("[data-edit-id]");
    if (editBtn) {
      openEditModal(editBtn.dataset.editId);
      return;
    }

    const delBtn = e.target.closest("[data-delete-id]");
    if (delBtn) {
      deleteNotesByIds([delBtn.dataset.deleteId]);
      return;
    }
  };

  $("#admin-notes-tbody")?.addEventListener("click", handleModifyActionClick);
  $("#admin-grid-view-wrap")?.addEventListener("click", handleModifyActionClick);

  // Category Chart Card & Bar Graph Click Filter -> Switches to Modify view & filters table
  const handleCatFilterClick = e => {
    const card = e.target.closest("[data-cat-filter]");
    if (card) {
      const cat = card.dataset.catFilter;
      switchAdminView("modify");
      const searchInput = $("#admin-table-search");
      if (searchInput) {
        if (searchInput.value.toLowerCase() === cat.toLowerCase()) {
          searchInput.value = "";
        } else {
          searchInput.value = cat;
        }
        renderTable();
        searchInput.focus();
      }
    }
  };

  $("#category-chart-grid")?.addEventListener("click", handleCatFilterClick);
  $("#category-bar-chart")?.addEventListener("click", handleCatFilterClick);

  // Lightbox Zoom & Navigation Actions
  $("#lightbox-zoom-in")?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    zoomIn();
  });
  $("#lightbox-zoom-out")?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    zoomOut();
  });
  $("#lightbox-zoom-reset")?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    resetZoom();
  });

  $("#lightbox-prev-btn")?.addEventListener("click", prevLightbox);
  $("#lightbox-next-btn")?.addEventListener("click", nextLightbox);
  setupLightboxTTS();
  initAiAssistant();
  initAdminFeedbackListeners();

  $("#lightbox-close-btn")?.addEventListener("click", () => {
    stopAudioNarration();
    resetAiAssistantChat();
    $("#lightbox-dialog")?.close();
  });

  const adminLightboxDialog = $("#lightbox-dialog");
  adminLightboxDialog?.addEventListener("close", () => {
    stopAudioNarration();
    resetAiAssistantChat();
  });
  adminLightboxDialog?.addEventListener("cancel", () => {
    stopAudioNarration();
  });

  // Regional Translation Pills in Admin Lightbox
  $("#overview-translate-pills")?.addEventListener("click", e => {
    const btn = e.target.closest(".translate-lang-btn");
    if (!btn) return;
    const targetLang = btn.dataset.lang || "en";
    currentTranslationLang = targetLang;
    if (currentLightboxIndex >= 0 && currentLightboxIndex < allNotes.length) {
      renderNoteOverview(allNotes[currentLightboxIndex], targetLang);
    }
  });

  // Global Delegated Click Listener for Any Note Preview / View Button
  document.addEventListener("click", e => {
    const viewBtn = e.target.closest("[data-view-note-id]");
    if (viewBtn) {
      const noteId = viewBtn.dataset.viewNoteId;
      if (noteId) {
        const parentDialog = viewBtn.closest("dialog:not(#lightbox-dialog)");
        if (parentDialog) parentDialog.close();
        openLightbox(noteId);
      }
    }
  });

  // Mouse Wheel Zoom & Drag-to-Pan inside Lightbox (Zero Scroll)
  const mediaBox = $("#lightbox-media-container");
  if (mediaBox) {
    mediaBox.addEventListener("wheel", e => {
      const dialog = $("#lightbox-dialog");
      if (dialog && dialog.open) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        setZoom(currentZoom + delta);
      }
    }, { passive: false });

    // Mouse Drag to Pan
    mediaBox.addEventListener("mousedown", e => {
      if (currentZoom <= 1.05) return;
      e.preventDefault();
      isDragging = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
      mediaBox.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", e => {
      if (!isDragging) return;
      e.preventDefault();
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      applyZoomTransform();
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        mediaBox.classList.remove("is-dragging");
      }
    });

    // Touch Pinch-to-Zoom & Touch Pan
    let touchStartDist = 0;
    let initialZoom = 1.0;
    let touchStartX = 0;
    let touchStartY = 0;

    mediaBox.addEventListener("touchstart", e => {
      if (e.touches.length === 1 && currentZoom > 1.05) {
        isDragging = true;
        touchStartX = e.touches[0].clientX - panX;
        touchStartY = e.touches[0].clientY - panY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = currentZoom;
      }
    }, { passive: true });

    mediaBox.addEventListener("touchmove", e => {
      if (e.touches.length === 1 && isDragging && currentZoom > 1.05) {
        e.preventDefault();
        panX = e.touches[0].clientX - touchStartX;
        panY = e.touches[0].clientY - touchStartY;
        applyZoomTransform();
      } else if (e.touches.length === 2 && touchStartDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = (dist / touchStartDist) * initialZoom;
        setZoom(scale);
      }
    }, { passive: false });

    mediaBox.addEventListener("touchend", () => {
      isDragging = false;
      touchStartDist = 0;
    });

    // Double-click to toggle 200% zoom / reset
    mediaBox.addEventListener("dblclick", e => {
      e.preventDefault();
      if (currentZoom > 1.05) {
        resetZoom();
      } else {
        setZoom(2.0);
      }
    });
  }

  // Keyboard shortcuts for Lightbox
  window.addEventListener("keydown", e => {
    const dialog = $("#lightbox-dialog");
    if (dialog && dialog.open) {
      if (e.key === "ArrowLeft") prevLightbox();
      if (e.key === "ArrowRight") nextLightbox();
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-" || e.key === "_") zoomOut();
      if (e.key === "0") resetZoom();
    }
  });

  // Close Dialog buttons
  $$("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  });

  // Admin Lightbox Direct Watermarked Download
  $("#lightbox-download-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentLightboxIndex >= 0 && currentLightboxIndex < allNotes.length) {
      triggerAdminNoteDownload(allNotes[currentLightboxIndex]);
    }
  });
}

function triggerAdminNoteDownload(note) {
  if (!note || !note.imageUrl) return;

  const dlBtn = $("#lightbox-download-btn");
  if (dlBtn) dlBtn.classList.add("is-downloading");
  showToast("Preparing image note with official watermark... 📥", "info");

  const safeFilename = `${(note.title || "exam-note").replace(/[^a-zA-Z0-9_-]/g, "_")}_ExamAlertIndia.jpg`;

  function initiateDirectBlobDownload(blob) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1500);

    if (dlBtn) dlBtn.classList.remove("is-downloading");
    showToast("Downloaded revision note with official watermark! ✅", "success");
  }

  function stampWatermarkAndDownload(img) {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const width = img.naturalWidth || img.width || 1200;
      const height = img.naturalHeight || img.height || 800;

      const bannerHeight = Math.max(54, Math.round(width * 0.048));
      canvas.width = width;
      canvas.height = height + bannerHeight;

      ctx.drawImage(img, 0, 0, width, height);

      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, height, width, bannerHeight);

      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(0, height, width, Math.max(2, Math.round(bannerHeight * 0.045)));

      const host = window.location.hostname;
      const domain = (host && !["localhost", "127.0.0.1"].includes(host)) ? host : "examalertindia.com";
      const fontSize = Math.max(16, Math.round(bannerHeight * 0.36));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";

      const centerY = height + (bannerHeight / 2) + Math.round(bannerHeight * 0.02);
      const paddingX = Math.max(20, Math.round(width * 0.025));

      if (width >= 640) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("📚 Exam Alert India", paddingX, centerY);

        ctx.textAlign = "right";
        ctx.fillStyle = "#60a5fa";
        ctx.fillText(`🌐 ${domain}  •  Free AI Govt Exam Notes`, width - paddingX, centerY);
      } else {
        ctx.textAlign = "center";
        ctx.fillStyle = "#60a5fa";
        ctx.fillText(`📚 Exam Alert India • ${domain}`, width / 2, centerY);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          initiateDirectBlobDownload(blob);
        } else {
          fallbackProxyDownload();
        }
      }, "image/jpeg", 0.95);
    } catch (err) {
      fallbackProxyDownload();
    }
  }

  function fallbackProxyDownload() {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(note.imageUrl)}`;
    const proxyImg = new Image();
    proxyImg.crossOrigin = "anonymous";
    proxyImg.onload = () => {
      stampWatermarkAndDownload(proxyImg);
    };
    proxyImg.onerror = () => {
      if (dlBtn) dlBtn.classList.remove("is-downloading");
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);
      showToast("Downloaded revision note! ✅", "success");
    };
    proxyImg.src = proxyUrl;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    stampWatermarkAndDownload(img);
  };
  img.onerror = () => {
    fallbackProxyDownload();
  };
  img.src = note.imageUrl;
}

// ==========================================
// 8. Admin Lightbox Preview Engine (Zero Scroll)
// ==========================================
let currentLightboxIndex = -1;
let currentZoom = 1.0;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const INDIAN_LANGUAGES = {
  en: "English",
  hi: "हिन्दी",
  ta: "தமிழ்",
  bn: "বাংলা",
  mr: "मराठी",
  te: "తెలుగు",
  ml: "മലയാളം",
  kn: "ಕನ್ನಡ"
};

let currentTranslationLang = localStorage.getItem("exam_notes_preferred_lang") || "en";
const overviewTranslationCache = new Map();

function sanitizeRichHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const badTags = ["script", "iframe", "object", "embed", "link", "style", "form", "input", "button"];
    badTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    doc.querySelectorAll("*").forEach(el => {
      for (let i = el.attributes.length - 1; i >= 0; i--) {
        const attr = el.attributes[i];
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith("on") || (attr.value && attr.value.toLowerCase().includes("javascript:"))) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return doc.body.innerHTML;
  } catch {
    return escapeHtml(html);
  }
}

function formatOverviewHtml(rawText) {
  if (!rawText || !rawText.trim()) {
    return `<div class="overview-empty-box"><p class="overview-empty-prompt">💡 <em>High-yield revision diagram. Focus on core exam keywords, flowchart connections, and visual mnemonics for rapid recall.</em></p></div>`;
  }

  const trimmed = rawText.trim();
  // Check if it's already a complete block-level HTML document
  const hasBlockHtml = /<\/?(p|ul|ol|li|div|table|h[1-6]|blockquote)\b/i.test(trimmed);
  if (hasBlockHtml) {
    return sanitizeRichHtml(trimmed);
  }

  // Parse lines, supporting bullet points + inline HTML tags (like <span class="highlight-yellow">, <strong>, etc.)
  const lines = trimmed.split("\n");
  let html = "";
  let inList = false;

  for (let line of lines) {
    const l = line.trim();
    if (!l) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }

    if (l.startsWith("•") || l.startsWith("- ") || l.startsWith("* ")) {
      if (!inList) {
        html += '<ul class="overview-bullet-list">';
        inList = true;
      }
      const itemContent = l.replace(/^[•\-\*]\s*/, "");
      html += `<li>${formatInlineText(itemContent)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p class="overview-para">${formatInlineText(l)}</p>`;
    }
  }

  if (inList) {
    html += "</ul>";
  }

  return sanitizeRichHtml(html);
}

function formatInlineText(text) {
  let content = text;
  // Convert markdown **bold** to <strong>
  content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return content;
}

// ==========================================
// Web Speech API & Regional Audio Engine (Admin Preview)
// ==========================================
let activeSpeechUtterance = null;
let activeAudioElement = null;
let isSpeechPlaying = false;
let isSpeechPaused = false;
let speechPlaybackRate = 1.0;
let speechKeepAliveTimer = null;
let speechChunks = [];
let currentSpeechChunkIndex = 0;

const LANG_VOICE_MAP = {
  en: ["en-IN", "en-GB", "en-US", "en"],
  hi: ["hi-IN", "hi"],
  ta: ["ta-IN", "ta"],
  bn: ["bn-IN", "bn-BD", "bn"],
  mr: ["mr-IN", "mr"],
  te: ["te-IN", "te"],
  ml: ["ml-IN", "ml"],
  kn: ["kn-IN", "kn"]
};

function hasNativeBrowserVoice(langCode) {
  if (!("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices() || [];
  const targetPrefixes = LANG_VOICE_MAP[langCode] || [langCode];
  return voices.some(v => v.lang && targetPrefixes.some(p => v.lang.toLowerCase().replace("_", "-").startsWith(p.toLowerCase())));
}

function getBestVoiceForLang(langCode) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const targetPrefixes = LANG_VOICE_MAP[langCode] || [langCode];

  for (const prefix of targetPrefixes) {
    const matched = voices.find(v => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith(prefix.toLowerCase()));
    if (matched) return matched;
  }
  return null;
}

function extractCleanSpeechText(title, overviewEl) {
  let text = "";
  if (title) {
    text += title.trim() + ". ";
  }

  if (overviewEl) {
    const clone = overviewEl.cloneNode(true);
    clone.querySelectorAll("script, style, noscript").forEach(el => el.remove());
    clone.querySelectorAll("li").forEach(li => {
      li.textContent = " " + li.textContent.trim() + ". ";
    });
    clone.querySelectorAll("p").forEach(p => {
      p.textContent = " " + p.textContent.trim() + ". ";
    });
    text += " " + (clone.textContent || clone.innerText || "");
  }

  return text
    .replace(/[•\-\*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s*(?=[.!?])/g, "")
    .trim();
}

// Mobile-Safe Sentence & Natural Clause Chunking (Prevents Android / iOS 15-second speech buffer cutoffs)
function splitSpeechIntoChunks(text, maxLen = 130) {
  if (!text) return [];
  const rawSentences = text.split(/([.!?;:\n।]+)/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (let i = 0; i < rawSentences.length; i++) {
    const piece = rawSentences[i].trim();
    if (!piece) continue;
    if ((current + " " + piece).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      if (piece.length > maxLen) {
        const words = piece.split(/\s+/);
        let sub = "";
        for (const w of words) {
          if ((sub + " " + w).length > maxLen) {
            if (sub.trim()) chunks.push(sub.trim());
            sub = w;
          } else {
            sub = sub ? (sub + " " + w) : w;
          }
        }
        current = sub.trim();
      } else {
        current = piece;
      }
    } else {
      current = current ? (current + " " + piece) : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

function stopAudioNarration() {
  if (speechKeepAliveTimer) {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = null;
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {}
    activeAudioElement = null;
  }
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  isSpeechPlaying = false;
  isSpeechPaused = false;
  activeSpeechUtterance = null;
  window.__activeUtterance = null;
  speechChunks = [];
  currentSpeechChunkIndex = 0;
  updateTTSControlsUI();
}

function toggleAudioNarration() {
  if (isSpeechPlaying && !isSpeechPaused) {
    if (activeAudioElement) {
      activeAudioElement.pause();
    } else if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    isSpeechPaused = true;
    updateTTSControlsUI();
    return;
  }

  if (isSpeechPlaying && isSpeechPaused) {
    if (activeAudioElement) {
      activeAudioElement.play().catch(() => {});
    } else if ("speechSynthesis" in window && speechChunks.length > 0) {
      isSpeechPaused = false;
      speakCurrentSpeechChunk();
      updateTTSControlsUI();
      return;
    }
    isSpeechPaused = false;
    updateTTSControlsUI();
    return;
  }

  const title = $("#lightbox-title")?.textContent || "";
  const overviewEl = $("#lightbox-overview-text");
  const speechText = extractCleanSpeechText(title, overviewEl);

  if (!speechText) {
    alert("No text available to read.");
    return;
  }

  stopAudioNarration();

  const targetLang = typeof currentTranslationLang !== "undefined" ? currentTranslationLang : "en";
  const hasNativeVoice = (targetLang === "en" || targetLang === "hi") && hasNativeBrowserVoice(targetLang);

  if (!hasNativeVoice) {
    const audio = new Audio();
    audio.src = `/api/tts?lang=${encodeURIComponent(targetLang)}&text=${encodeURIComponent(speechText)}`;
    audio.playbackRate = speechPlaybackRate;
    activeAudioElement = audio;

    isSpeechPlaying = true;
    isSpeechPaused = false;
    updateTTSControlsUI();

    audio.onplay = () => {
      isSpeechPlaying = true;
      isSpeechPaused = false;
      updateTTSControlsUI();
    };

    audio.onended = () => {
      stopAudioNarration();
    };

    audio.onerror = (e) => {
      console.warn("Audio stream notice:", e);
      stopAudioNarration();
    };

    audio.play().catch(err => {
      console.warn("Audio play notice:", err);
      stopAudioNarration();
    });
    return;
  }

  speechChunks = splitSpeechIntoChunks(speechText);
  currentSpeechChunkIndex = 0;
  isSpeechPlaying = true;
  isSpeechPaused = false;
  updateTTSControlsUI();
  speakCurrentSpeechChunk();
}

function speakCurrentSpeechChunk() {
  if (!("speechSynthesis" in window)) {
    stopAudioNarration();
    return;
  }

  if (currentSpeechChunkIndex >= speechChunks.length) {
    stopAudioNarration();
    return;
  }

  const chunkText = speechChunks[currentSpeechChunkIndex];
  const targetLang = typeof currentTranslationLang !== "undefined" ? currentTranslationLang : "en";

  try {
    window.speechSynthesis.cancel();
  } catch {}

  const utterance = new SpeechSynthesisUtterance(chunkText);
  utterance.rate = speechPlaybackRate;
  utterance.pitch = 1.0;

  const voice = getBestVoiceForLang(targetLang);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = (LANG_VOICE_MAP[targetLang] && LANG_VOICE_MAP[targetLang][0]) || "en-IN";
  }

  utterance.onstart = () => {
    isSpeechPlaying = true;
    isSpeechPaused = false;
    updateTTSControlsUI();
  };

  utterance.onend = () => {
    if (isSpeechPlaying && !isSpeechPaused) {
      currentSpeechChunkIndex++;
      speakCurrentSpeechChunk();
    }
  };

  utterance.onerror = (e) => {
    if (e.error === "canceled" || e.error === "interrupted") {
      return;
    }
    console.warn("Speech chunk notice:", e);
    if (isSpeechPlaying && !isSpeechPaused) {
      currentSpeechChunkIndex++;
      speakCurrentSpeechChunk();
    } else {
      stopAudioNarration();
    }
  };

  activeSpeechUtterance = utterance;
  window.__activeUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function updateTTSControlsUI() {
  const btn = $("#lightbox-tts-btn");
  const label = $("#lightbox-tts-btn-label");
  const waves = $("#tts-audio-waves");
  const controls = $("#lightbox-tts-controls");
  const pauseIcon = $("#tts-pause-icon");
  const statusPill = $("#tts-status-pill");
  const statusText = $("#tts-status-text");

  if (!btn) return;

  if (isSpeechPlaying) {
    btn.classList.add("playing");
    if (controls) controls.hidden = false;
    if (statusPill) statusPill.hidden = false;

    if (isSpeechPaused) {
      btn.classList.add("paused");
      if (label) label.textContent = "Resume Narration";
      if (waves) waves.hidden = true;
      if (pauseIcon) pauseIcon.textContent = "▶️";
      if (statusText) statusText.textContent = "Audio paused. Click Resume to continue.";
    } else {
      btn.classList.remove("paused");
      if (label) label.textContent = "Playing Audio";
      if (waves) waves.hidden = false;
      if (pauseIcon) pauseIcon.textContent = "⏸️";
      const targetLang = typeof currentTranslationLang !== "undefined" ? currentTranslationLang : "en";
      const langName = (typeof INDIAN_LANGUAGES !== "undefined" && INDIAN_LANGUAGES[targetLang]) || "English";
      if (statusText) statusText.textContent = `Listening in ${langName} (${speechPlaybackRate}x)...`;
    }
  } else {
    btn.classList.remove("playing", "paused");
    if (label) label.textContent = "Listen to Notes";
    if (waves) waves.hidden = true;
    if (controls) controls.hidden = true;
    if (statusPill) statusPill.hidden = true;
    if (pauseIcon) pauseIcon.textContent = "⏸️";
  }
}

function setTTSSpeed(rate) {
  speechPlaybackRate = rate;
  document.querySelectorAll(".tts-speed-btn").forEach(b => {
    b.classList.toggle("active", parseFloat(b.dataset.rate) === rate);
  });

  if (activeAudioElement) {
    activeAudioElement.playbackRate = rate;
    updateTTSControlsUI();
  } else if (isSpeechPlaying && !isSpeechPaused && speechChunks.length > 0) {
    speakCurrentSpeechChunk();
    updateTTSControlsUI();
  } else {
    updateTTSControlsUI();
  }
}

function setupLightboxTTS() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  $("#lightbox-tts-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleAudioNarration();
  });

  $("#tts-pause-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleAudioNarration();
  });

  $("#tts-stop-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    stopAudioNarration();
  });

  document.querySelectorAll(".tts-speed-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const rate = parseFloat(btn.dataset.rate) || 1.0;
      setTTSSpeed(rate);
    });
  });
}

// ==========================================
// On-Device Local AI Study Assistant (Admin Preview)
// ==========================================
let detectedAiProvider = "cloud";
let isAiGenerating = false;

async function detectAiProvider() {
  const badge = $("#ai-engine-badge");
  const badgeText = $("#ai-engine-badge-text");
  if (!badge || !badgeText) return;

  if (typeof window.ai !== "undefined" && window.ai?.languageModel) {
    try {
      const caps = await window.ai.languageModel.capabilities();
      if (caps && (caps.available === "readily" || caps.available === "after-download")) {
        detectedAiProvider = "chrome-nano";
        badge.className = "ai-engine-badge badge-nano";
        badgeText.textContent = "Chrome Built-in AI (Nano)";
        badge.title = "Running 100% locally on your device via Chrome Gemini Nano (0 network transfer, 0 latency)";
        return;
      }
    } catch {}
  }

  if (typeof navigator !== "undefined" && navigator.gpu) {
    detectedAiProvider = "webllm";
    badge.className = "ai-engine-badge badge-webllm";
    badgeText.textContent = "WebLLM (Local GPU)";
    badge.title = "Local WebGPU detected: ready for on-device AI inference";
    return;
  }

  detectedAiProvider = "cloud";
  badge.className = "ai-engine-badge badge-cloud";
  badgeText.textContent = "Free AI Assistant";
  badge.title = "High-speed free study assistant powered by Google Gemini";
}

function formatAiMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = html.split("\n");
  let inList = false;
  const processedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        processedLines.push("<ul>");
        inList = true;
      }
      processedLines.push(`<li>${trimmed.replace(/^[•\-\*]\s*/, "")}</li>`);
    } else {
      if (inList) {
        processedLines.push("</ul>");
        inList = false;
      }
      if (trimmed.length > 0) {
        if (!trimmed.startsWith("<h")) {
          processedLines.push(`<p>${line}</p>`);
        } else {
          processedLines.push(line);
        }
      }
    }
  }
  if (inList) processedLines.push("</ul>");
  return processedLines.join("\n");
}

function resetAiAssistantChat() {
  const chatOutput = $("#ai-chat-output");
  if (chatOutput) {
    chatOutput.innerHTML = `
      <div class="ai-welcome-msg">
        <span class="ai-welcome-icon">✨</span>
        <div>
          <p><strong>Hi aspirant!</strong> Ask any doubt about this topic, or tap one of the quick revision chips above.</p>
        </div>
      </div>
    `;
  }
  document.querySelectorAll(".ai-chip-btn").forEach(b => b.classList.remove("active"));
  const input = $("#ai-query-input");
  if (input) input.value = "";
  isAiGenerating = false;
}

async function askAiAssistant(userQuery = "", actionType = null) {
  if (isAiGenerating) return;

  const chatOutput = $("#ai-chat-output");
  const inputEl = $("#ai-query-input");
  const sendBtn = $("#ai-send-btn");
  if (!chatOutput) return;

  const noteTitle = $("#lightbox-title")?.textContent?.trim() || "";
  const noteSubject = $("#lightbox-subject")?.textContent?.trim() || "";
  const noteOverview = $("#lightbox-overview-text")?.innerText?.trim() || "";

  let userLabel = userQuery;
  if (actionType === "explain_simple") userLabel = "💡 Explain this topic in simple terms";
  else if (actionType === "mnemonic") userLabel = "🧠 Give me a memory mnemonic trick";
  else if (actionType === "exam_questions") userLabel = "🎯 What are the probable exam questions?";
  else if (actionType === "key_takeaways") userLabel = "📝 Give me the key exam takeaways";

  if (!userLabel) return;

  const userBubble = document.createElement("div");
  userBubble.className = "ai-bubble ai-user-bubble";
  userBubble.textContent = userLabel;
  chatOutput.appendChild(userBubble);

  const loadingBubble = document.createElement("div");
  loadingBubble.className = "ai-bubble ai-assistant-bubble";
  loadingBubble.innerHTML = `
    <div class="ai-loading-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  chatOutput.appendChild(loadingBubble);
  chatOutput.scrollTop = chatOutput.scrollHeight;

  isAiGenerating = true;
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;

  try {
    let answerText = "";
    let providerName = "Free AI Assistant";

    if (detectedAiProvider === "chrome-nano" && window.ai?.languageModel) {
      try {
        const session = await window.ai.languageModel.create({
          systemPrompt: "You are an expert tutor for competitive government exams (UPSC, SSC CGL, State PSC). Answer clearly, concisely, and helpfully using bullet points and bold key terms."
        });
        const prompt = `Study Topic: ${noteTitle} (${noteSubject})\nNotes:\n${noteOverview.slice(0, 1500)}\n\nStudent Request: ${userLabel}`;
        answerText = await session.prompt(prompt);
        session.destroy();
        providerName = "Chrome Built-in AI (Nano)";
      } catch (err) {
        console.warn("Chrome AI prompt error, switching to cloud relay:", err);
      }
    }

    if (!answerText) {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteTitle,
          noteSubject,
          noteOverview,
          userQuery: userQuery,
          quickAction: actionType
        })
      });

      if (res.ok) {
        const data = await res.json();
        answerText = data.answer || "No response received.";
        if (data.provider === "gemini-cloud") {
          providerName = "Google Gemini AI";
        } else if (data.provider === "cloud-cache") {
          providerName = "Instant Cached AI";
        } else {
          providerName = "Free AI Assistant";
        }
      } else {
        answerText = "Unable to process question at this time. Please try again or tap another quick chip.";
      }
    }

    loadingBubble.innerHTML = `
      <div class="ai-answer-content">${formatAiMarkdown(answerText)}</div>
      <div class="ai-bubble-actions">
        <span class="ai-provider-tag">⚡ ${providerName}</span>
        <button type="button" class="ai-copy-btn" title="Copy answer to clipboard">
          <span class="copy-icon">📋</span>
          <span class="copy-text">Copy</span>
        </button>
      </div>
    `;

    const copyBtn = loadingBubble.querySelector(".ai-copy-btn");
    copyBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(answerText).then(() => {
        const copyText = copyBtn.querySelector(".copy-text");
        if (copyText) {
          copyText.textContent = "Copied!";
          setTimeout(() => { copyText.textContent = "Copy"; }, 2000);
        }
      }).catch(() => {});
    });

  } catch (err) {
    loadingBubble.innerHTML = `<p style="color: #ef4444; margin: 0;">Notice: ${escapeHtml(err.message || "Failed to reach AI assistant. Please try again.")}</p>`;
  } finally {
    isAiGenerating = false;
    if (sendBtn) sendBtn.disabled = false;
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.value = "";
    }
    chatOutput.scrollTop = chatOutput.scrollHeight;
  }
}

function initAiAssistant() {
  detectAiProvider();

  const toggleHeader = $("#ai-assistant-toggle");
  const assistantContainer = $("#lightbox-ai-assistant");
  toggleHeader?.addEventListener("click", (e) => {
    e.preventDefault();
    assistantContainer?.classList.toggle("is-collapsed");
  });

  document.querySelectorAll(".ai-chip-btn").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".ai-chip-btn").forEach(b => b.classList.remove("active"));
      chip.classList.add("active");
      const action = chip.getAttribute("data-action");
      askAiAssistant("", action);
    });
  });

  const form = $("#ai-input-form");
  const input = $("#ai-query-input");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input?.value?.trim();
    if (!query) return;
    document.querySelectorAll(".ai-chip-btn").forEach(b => b.classList.remove("active"));
    askAiAssistant(query, null);
  });
}

async function renderNoteOverview(note, targetLang = "en") {
  stopAudioNarration();
  resetAiAssistantChat();
  if (!note) return;
  const overviewEl = $("#lightbox-overview-text");
  if (!overviewEl) return;

  // Update language pills UI active state
  document.querySelectorAll("#overview-translate-pills .translate-lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === targetLang);
  });

  const rawOverview = note.overview || note.description || "";
  if (!rawOverview) {
    overviewEl.innerHTML = '<p class="overview-empty-muted" style="color: var(--ink-muted); font-style: italic;">No specific study overview notes written for this diagram.</p>';
    return;
  }

  // 1. If English selected, render original formatted overview
  if (targetLang === "en") {
    overviewEl.innerHTML = formatOverviewHtml(rawOverview);
    return;
  }

  // 2. Check in-memory translation cache for instant response
  const cacheKey = `${note.id}_${targetLang}`;
  if (overviewTranslationCache.has(cacheKey)) {
    const cachedText = overviewTranslationCache.get(cacheKey);
    overviewEl.innerHTML = formatOverviewHtml(cachedText);
    return;
  }

  // 3. Show sleek loading placeholder
  const langLabel = INDIAN_LANGUAGES[targetLang] || targetLang;
  overviewEl.innerHTML = `
    <div class="translate-loading-shimmer">
      <span>🌐</span> Translating study notes to ${escapeHtml(langLabel)}…
    </div>
  `;

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawOverview, targetLang })
    });

    if (!response.ok) throw new Error("Translation request failed");
    const data = await response.json();
    const translatedText = data.translatedText || rawOverview;

    overviewTranslationCache.set(cacheKey, translatedText);

    if (allNotes[currentLightboxIndex]?.id === note.id && currentTranslationLang === targetLang) {
      overviewEl.innerHTML = formatOverviewHtml(translatedText);
    }
  } catch (err) {
    if (allNotes[currentLightboxIndex]?.id === note.id && currentTranslationLang === targetLang) {
      overviewEl.innerHTML = formatOverviewHtml(rawOverview);
    }
  }
}

function applyZoomTransform() {
  const container = $("#lightbox-media-container");
  const layer = $("#lightbox-media-container .lightbox-img-transform-layer") || $("#lightbox-media-container img");
  const zoomText = $("#lightbox-zoom-level");

  if (zoomText) {
    zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  if (layer) {
    if (currentZoom <= 1.02) {
      panX = 0;
      panY = 0;
    }
    layer.style.transformOrigin = "center center";
    layer.style.transition = isDragging ? "none" : "transform 0.16s ease-out";
    layer.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;
  }

  if (container) {
    container.classList.toggle("is-zoomed", currentZoom > 1.02);
  }
}

function setZoom(scale) {
  currentZoom = Math.min(Math.max(Math.round(scale * 100) / 100, 0.5), 4.0);
  applyZoomTransform();
}

function zoomIn() { setZoom(currentZoom + 0.25); }
function zoomOut() { setZoom(currentZoom - 0.25); }

function resetZoom() {
  currentZoom = 1.0;
  panX = 0;
  panY = 0;
  applyZoomTransform();
}

function openLightbox(noteIdOrIdx) {
  stopAudioNarration();
  let idx = -1;
  if (typeof noteIdOrIdx === "string") {
    idx = allNotes.findIndex(n => n.id === noteIdOrIdx);
  } else {
    idx = noteIdOrIdx;
  }

  if (idx < 0 || idx >= allNotes.length) return;
  currentLightboxIndex = idx;
  const note = allNotes[idx];

  updateLightboxContent(note);
  resetZoom();
  const dialog = $("#lightbox-dialog");
  if (dialog) {
    const bodyScroll = dialog.querySelector(".lightbox-blog-body");
    if (bodyScroll) bodyScroll.scrollTop = 0;
    if (!dialog.open) {
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    }
  }
}

function updateLightboxContent(note) {
  if (!note) return;
  const title = $("#lightbox-title");
  const badge = $("#lightbox-badge");
  const mediaContainer = $("#lightbox-media-container");
  const meta = $("#lightbox-meta");
  const downloadBtn = $("#lightbox-download-btn");
  const tagsContainer = $("#lightbox-tags");

  if (title) title.textContent = note.title;
  if (badge) {
    const key = getSubjectKey(note.subject);
    badge.className = `subject-chip ${key}`;
    badge.textContent = note.subject;
  }

  if (mediaContainer) {
    if (note.imageUrl) {
      mediaContainer.innerHTML = `
        <div class="lightbox-img-transform-layer">
          <img src="${note.imageUrl}" alt="${escapeHtml(note.title)}" class="lightbox-img" decoding="sync" onerror="handleAdminNoteImageError(this, '${note.id}', '${note.imageUrl}')">
        </div>
      `;
    } else {
      mediaContainer.innerHTML = `
        <div class="lightbox-img-transform-layer">
          <div class="lightbox-preview-card"><div class="card-media"><div class="preview"><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.subject)}</p><div class='diagram'>📖</div></div></div></div>
        </div>
      `;
    }
  }

  // Render overview in active language
  renderNoteOverview(note, currentTranslationLang);

  if (meta) {
    let dateFormatted = "Recent";
    if (note.createdAt) {
      const d = new Date(note.createdAt);
      if (!isNaN(d.getTime())) {
        dateFormatted = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      }
    } else if (note.date) {
      const d = new Date(note.date);
      if (!isNaN(d.getTime())) {
        dateFormatted = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      } else {
        dateFormatted = note.date;
      }
    }
    meta.textContent = `📅 ${dateFormatted}`;
  }

  if (downloadBtn) {
    downloadBtn.hidden = !note.imageUrl;
  }

  if (tagsContainer) {
    if (note.tags && note.tags.length > 0) {
      tagsContainer.innerHTML = note.tags.map(t => `<span class="note-tag-chip">#${escapeHtml(t)}</span>`).join("");
    } else {
      tagsContainer.innerHTML = "";
    }
  }
}

function nextLightbox() {
  if (currentLightboxIndex < allNotes.length - 1) {
    openLightbox(currentLightboxIndex + 1);
  } else {
    openLightbox(0);
  }
}

function prevLightbox() {
  if (currentLightboxIndex > 0) {
    openLightbox(currentLightboxIndex - 1);
  } else {
    openLightbox(allNotes.length - 1);
  }
}

// Start
loadAdminProfile();
setupEventListeners();
checkAuth();

// ==========================================
// Real-Time Active Users Presence & Auth Security Poller (Relaxed 45s)
// ==========================================
let isPresencePolling = false;
async function performPresenceCheck() {
  if (isPresencePolling || document.hidden) return;
  const dashSec = $("#admin-dashboard-section");
  const isDashboardActive = dashSec && !dashSec.hidden;
  if (!isDashboardActive) return;

  isPresencePolling = true;
  try {
    const res = await api("/api/heartbeat");
    if (res && res.activeUsers !== undefined) {
      updateActiveUsersDisplay(res.activeUsers);
    }
  } catch {}

  if (window.location.protocol !== "file:") {
    try {
      const authCheck = await api("/api/admin/me");
      if (!authCheck || !authCheck.admin) {
        executeLogout(false);
      }
    } catch {}
  }
  isPresencePolling = false;
}

// Periodic check every 45s only when tab is active and visible
setInterval(performPresenceCheck, 45000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    performPresenceCheck();
  }
});
