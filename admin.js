/**
 * Admin Portal JavaScript Logic
 * Supports: Authentication, Drag-and-Drop Live Preview, Note Uploads with Multiple Tags (#Tags),
 * Note Editing (Title, Category, Tags & Image Replacement), Notes Management Table with Delete for All Notes,
 * Real-time Metrics, and Toast Alerts.
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let allNotes = [];
let sampleNotes = [
  { id: "sample0", title: "Indian Constitution – Fundamental Rights & Preamble", subject: "Polity", tags: ["UPSC", "Constitution", "Preamble", "Prelims 2025"], date: "20 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000002.jpg", isSample: true },
  { id: "sample1", title: "Directive Principles of State Policy (DPSP – 36 to 51)", subject: "Polity", tags: ["Polity", "Articles", "Fundamental Rights", "SSC CGL"], date: "19 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000002.jpg", isSample: true },
  { id: "sample2", title: "American Civil War & Emancipation (1861–1865)", subject: "History", tags: ["World History", "American War", "Lincoln", "SSC", "UPSC"], date: "18 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000001.jpg", isSample: true },
  { id: "sample3", title: "American War of Independence (1775–1783)", subject: "History", tags: ["World History", "Independence", "Revolutions", "UPSC"], date: "17 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000002.jpg", isSample: true },
  { id: "sample4", title: "Battle of Buxar & Plassey (1757–1764)", subject: "History", tags: ["Modern History", "East India Company", "Battles", "SSC"], date: "16 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000003.jpg", isSample: true },
  { id: "sample5", title: "Chauri Chaura Incident & Non-Cooperation (1922)", subject: "History", tags: ["Freedom Struggle", "Non-Cooperation", "Gandhian Era", "UPSC"], date: "15 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000005.jpg", isSample: true },
  { id: "sample6", title: "French Revolution & Declaration of Rights (1789)", subject: "History", tags: ["World History", "Bastille", "Revolutions", "UPSC"], date: "14 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000006.jpg", isSample: true },
  { id: "sample7", title: "India's Independence & Partition Plan (1947)", subject: "History", tags: ["Freedom Struggle", "Mountbatten Plan", "Partition", "Modern History"], date: "13 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000007.jpg", isSample: true },
  { id: "sample8", title: "Jallianwala Bagh Massacre & Rowlatt Act (1919)", subject: "History", tags: ["Freedom Struggle", "Rowlatt Act", "Amritsar", "Modern History"], date: "12 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000008.jpg", isSample: true },
  { id: "sample9", title: "Physical Divisions & Mountain Passes of India", subject: "Geography", tags: ["Himalayas", "Passes", "Map Work", "Geography"], date: "11 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000004.jpg", isSample: true },
  { id: "sample10", title: "River Systems & Water Resources of India", subject: "Geography", tags: ["Rivers", "Dams", "Drainage System", "SSC"], date: "10 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000004.jpg", isSample: true },
  { id: "sample11", title: "Sectors of Indian Economy & GDP Breakdown", subject: "Economy", tags: ["GDP", "Sectors", "Banking", "Economy"], date: "09 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000003.jpg", isSample: true },
  { id: "sample12", title: "Monetary Policy & RBI Quantitative Tools", subject: "Economy", tags: ["RBI", "Repo Rate", "Inflation", "Banking"], date: "08 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000003.jpg", isSample: true },
  { id: "sample13", title: "Classical Dance Forms & Traditions", subject: "Art and Culture", tags: ["Dance", "Classical", "Traditions", "Culture"], date: "07 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000005.jpg", isSample: true },
  { id: "sample14", title: "Temple Architecture – Nagara, Dravida & Vesara", subject: "Art and Culture", tags: ["Architecture", "Temples", "Art & Culture"], date: "06 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000005.jpg", isSample: true },
  { id: "sample15", title: "Speed, Distance & Time – Shortcut Formulas", subject: "Maths", tags: ["Maths Shortcuts", "Speed & Time", "Aptitude", "SSC"], date: "05 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000006.jpg", isSample: true },
  { id: "sample16", title: "Percentage & Profit-Loss Calculations", subject: "Maths", tags: ["Profit & Loss", "Percentages", "Arithmetic", "RRB"], date: "04 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000006.jpg", isSample: true },
  { id: "sample17", title: "Human Digestive System & Enzyme Action", subject: "Science", tags: ["Biology", "Enzymes", "Digestive System", "Science"], date: "03 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000007.jpg", isSample: true },
  { id: "sample18", title: "Newton’s Laws of Motion & Gravitation", subject: "Science", tags: ["Physics", "Mechanics", "Gravitation", "SSC"], date: "02 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000007.jpg", isSample: true },
  { id: "sample19", title: "English Grammar – Subject-Verb Agreement Rules", subject: "English", tags: ["English", "Grammar", "Rules", "SSC CGL"], date: "01 May 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000008.jpg", isSample: true },
  { id: "sample20", title: "Idioms, Phrases & One-Word Substitutions", subject: "English", tags: ["Vocabulary", "Idioms", "English", "Banking"], date: "30 Apr 2024", imageUrl: "/uploads/00000000-0000-4000-8000-000000000008.jpg", isSample: true }
];

let selectedImageData = null;
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

function getSubjectKey(subject = "") {
  const s = (subject || "").toLowerCase();
  if (s.includes("art") || s.includes("culture")) return "art-culture";
  if (s.includes("math")) return "maths";
  if (s.includes("science")) return "science";
  if (s.includes("english")) return "english";
  if (s.includes("history")) return "history";
  if (s.includes("polity")) return "polity";
  if (s.includes("geography")) return "geography";
  if (s.includes("economy")) return "economy";
  return "history";
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

async function api(url, options) {
  const r = await fetch(url, options);
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error || "Something went wrong.");
  return v;
}

// ==========================================
// 2. Theme Management
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("exam_notes_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  setTheme(theme, false);

  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    let next = "dark";
    if (current === "light") next = "dark";
    else if (current === "dark") next = "eye-care";
    else next = "light";

    setTheme(next, true);

    if (next === "eye-care") {
      showToast("👓 Blue Light Filter Mode Enabled (Warm Reading Theme)", "info");
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
    if (themeToggle) themeToggle.title = "Current: Dark Mode (Click for Blue Light Filter 👓)";
  } else if (theme === "eye-care") {
    if (themeIcon) themeIcon.textContent = "👓";
    if (themeToggle) themeToggle.title = "Current: Blue Light Filter Mode (Click for Light Mode ☀️)";
  } else {
    if (themeIcon) themeIcon.textContent = "☀️";
    if (themeToggle) themeToggle.title = "Current: Light Mode (Click for Dark Mode 🌙)";
  }
}

// ==========================================
// 3. Authentication & View Switch
// ==========================================
async function checkAuth() {
  if (sessionStorage.getItem("exam_admin_local_session") === "true") {
    isLocalClientMode = true;
    showDashboard();
    return;
  }

  try {
    const res = await api("/api/admin/me");
    if (res.admin) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
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
  $("#admin-page-password")?.focus();
}

function showDashboard() {
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
  if (dashSec) {
    dashSec.hidden = false;
    dashSec.removeAttribute("hidden");
    dashSec.style.removeProperty("display");
  }
  if (logoutBtn) {
    logoutBtn.hidden = false;
    logoutBtn.removeAttribute("hidden");
    logoutBtn.style.removeProperty("display");
  }
  loadDashboardData();
}

// ==========================================
// 4. Data Loading & Metrics
// ==========================================
async function loadDashboardData() {
  let uploaded = [];
  let visitsCount = 0;

  try {
    const [notesData, visitsData] = await Promise.all([
      api("/api/notes"),
      api("/api/visits").catch(() => ({ count: 0 }))
    ]);

    uploaded = notesData.notes || [];
    visitsCount = visitsData.count || 0;
  } catch {
    isLocalClientMode = true;
    uploaded = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
    visitsCount = Number(localStorage.getItem("exam_notes_local_visits") || "1");
  }

  const localUploads = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
  const mergedUploaded = [...localUploads.filter(l => !uploaded.some(u => u.id === l.id)), ...uploaded];

  const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
  const activeSamples = sampleNotes.filter(s => !deletedSamples.includes(s.id));

  allNotes = [...mergedUploaded, ...activeSamples].sort((a, b) => getNoteDateValue(b) - getNoteDateValue(a));

function animateNumberCounter(el, target, duration = 1400) {
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

  // Update Metrics with smooth Counter Animation & Sidebar Badges
  animateNumberCounter($("#metric-total-notes"), allNotes.length, 1400);
  animateNumberCounter($("#metric-uploaded-notes"), mergedUploaded.length, 1400);
  animateNumberCounter($("#metric-visitors-count"), visitsCount, 1400);
  const dashBadge = $("#dash-notes-badge");
  if (dashBadge) dashBadge.textContent = allNotes.length;
  const modBadge = $("#modify-notes-badge");
  if (modBadge) modBadge.textContent = allNotes.length;

  // Calculate Top Category
  const catCountMap = {};
  allNotes.forEach(n => {
    const s = n.subject || "General";
    catCountMap[s] = (catCountMap[s] || 0) + 1;
  });
  let topCat = "Polity";
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
  if (topCountEl) topCountEl.textContent = `${maxCatCount} Notes Published`;

  renderCategoryChart();
  renderRecentNotes();
  renderTable();
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
    { name: "English", icon: "🔤", color: "#0284c7", key: "english" }
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
      const pct = Math.round((count / total) * 100);
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
        ? `<img src="${n.imageUrl}" alt="${escapeHtml(n.title)}" class="grid-card-img" data-preview-id="${n.id}">`
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

async function deleteNotesByIds(ids) {
  if (!ids || ids.length === 0) return;
  const count = ids.length;
  const confirmMsg = count === 1 
    ? "Are you sure you want to permanently delete this note?"
    : `Are you sure you want to permanently delete ${count} selected notes?`;

  if (!confirm(confirmMsg)) return;

  for (const id of ids) {
    try {
      await api("/api/admin/notes/" + id, { method: "DELETE" });
    } catch {}

    const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
    const filteredLocal = existingLocal.filter(x => x.id !== id);
    localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(filteredLocal));

    const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
    if (!deletedSamples.includes(id)) {
      deletedSamples.push(id);
      localStorage.setItem("exam_notes_deleted_sample_ids", JSON.stringify(deletedSamples));
    }

    sampleNotes = sampleNotes.filter(x => x.id !== id);
    tableState.selectedIds.delete(id);
  }

  showToast(`✓ ${count} note${count > 1 ? 's' : ''} deleted from library.`, "success");
  await loadDashboardData();
}

// ==========================================
// 5. File Drag & Drop + Live Image Preview
// ==========================================
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

  function processFile(file) {
    msg.textContent = "";
    msg.className = "form-message";

    if (!file || (!file.type.match(/^image\/jpeg$/) && !/\.jpe?g$/i.test(file.name))) {
      msg.textContent = "Please select a JPG or JPEG image.";
      msg.className = "form-message error";
      clearPreview();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      msg.textContent = "File size exceeds 5 MB. Please select a smaller JPG image.";
      msg.className = "form-message error";
      clearPreview();
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      selectedImageData = e.target.result;
      imgPreview.src = selectedImageData;
      nameLabel.textContent = file.name;
      sizeLabel.textContent = `${(file.size / 1024).toFixed(1)} KB`;

      promptBox.hidden = true;
      previewWrap.hidden = false;
    };
    reader.readAsDataURL(file);
  }

  function clearPreview() {
    selectedImageData = null;
    fileInput.value = "";
    imgPreview.src = "";
    promptBox.hidden = false;
    previewWrap.hidden = true;
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
// 6. Edit Note Modal Operations
// ==========================================
function openEditModal(noteId) {
  const note = allNotes.find(n => n.id === noteId);
  if (!note) return;

  $("#edit-note-id").value = note.id;
  $("#edit-note-title").value = note.title;
  $("#edit-note-subject").value = note.subject;
  
  const tagsInput = $("#edit-note-tags");
  if (tagsInput) {
    tagsInput.value = (note.tags || []).join(", ");
  }

  const msg = $("#edit-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }

  const dialog = $("#admin-edit-dialog");
  if (dialog) dialog.showModal();
}

// ==========================================
// 7. Event Listeners Setup
// ==========================================
let currentAdminView = "dashboard";

function switchAdminView(viewName) {
  currentAdminView = viewName;
  const dashView = $("#admin-view-dashboard");
  const publishView = $("#admin-view-publish");
  const modifyView = $("#admin-view-modify");
  const navButtons = $$("[data-admin-view]");

  navButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.adminView === viewName);
  });

  if (dashView) {
    dashView.hidden = (viewName !== "dashboard");
    dashView.classList.toggle("active", viewName === "dashboard");
  }
  if (publishView) {
    publishView.hidden = (viewName !== "publish");
    publishView.classList.toggle("active", viewName === "publish");
  }
  if (modifyView) {
    modifyView.hidden = (viewName !== "modify");
    modifyView.classList.toggle("active", viewName === "modify");
  }

  const secName = viewName === "dashboard" ? "Dash Board" : (viewName === "publish" ? "Publish Studio" : "Content Library");
  const secEl = $("#portal-current-section");
  if (secEl) secEl.textContent = secName;
  const greetEl = $("#portal-greeting-heading");
  if (greetEl) {
    greetEl.textContent = viewName === "dashboard" ? "Welcome back, Stephanraj 👋" : (viewName === "publish" ? "Publish Revision Note ☁" : "Content Library Management ✏️");
  }

  if (viewName === "dashboard") {
    renderCategoryChart();
    renderRecentNotes();
  } else if (viewName === "modify") {
    renderTable();
  }
}

function setupEventListeners() {
  initTheme();
  setupFileDrop();

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
    const eyeIcon = $(".pwd-eye-icon");
    if (eyeIcon) eyeIcon.textContent = isPassword ? "🙈" : "👁️";
  });

  // Login Form Submit
  $("#admin-page-login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#admin-page-login-msg");
    const btn = $("#admin-page-login-submit");

    if (!pwdInput || !msg) return;

    const enteredPassword = pwdInput.value.trim();
    msg.textContent = "Verifying password credentials…";
    msg.className = "form-message";
    btn.disabled = true;

    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword })
      });
      sessionStorage.setItem("exam_admin_local_session", "true");
      showToast("Authentication successful! Welcome to Admin Studio.", "success");
      showDashboard();
    } catch (err) {
      if (err.message.includes("Failed to fetch") || window.location.protocol === "file:") {
        const savedPass = localStorage.getItem("exam_admin_custom_password") || "admin123";
        if (enteredPassword === savedPass || enteredPassword === "admin123") {
          sessionStorage.setItem("exam_admin_local_session", "true");
          showToast("Signed in (Direct Browser Mode).", "success");
          showDashboard();
        } else {
          msg.textContent = "Incorrect password. (Default is admin123 or check your .env file)";
          msg.className = "form-message error";
        }
      } else {
        msg.textContent = err.message || "Invalid password.";
        msg.className = "form-message error";
      }
    } finally {
      btn.disabled = false;
    }
  });

  // Logout Buttons (Header & Sidebar)
  const handleLogout = async () => {
    if (confirm("Sign out from the Admin session?")) {
      try {
        await api("/api/admin/logout", { method: "POST" });
      } catch {}
      sessionStorage.removeItem("exam_admin_local_session");
      showToast("Signed out successfully.", "info");
      showLogin();
    }
  };

  $("#admin-logout-btn")?.addEventListener("click", handleLogout);
  $("#sidebar-signout-btn")?.addEventListener("click", handleLogout);

  // Upload Form Submit
  $("#admin-upload-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const titleInput = $("#studio-note-title");
    const subjectInput = $("#studio-note-subject");
    const tagsInput = $("#studio-note-tags");
    const msg = $("#studio-upload-msg");
    const submitBtn = $("#studio-submit-btn");

    if (!selectedImageData) {
      msg.textContent = "Please choose a JPG image to upload.";
      msg.className = "form-message error";
      return;
    }

    const rawTags = tagsInput ? tagsInput.value : "";
    const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);

    msg.textContent = "Publishing note to library…";
    msg.className = "form-message";
    submitBtn.disabled = true;

    try {
      await api("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          subject: subjectInput.value,
          tags: parsedTags,
          imageData: selectedImageData
        })
      });

      showToast("✓ Revision note published! Live on Home Page.", "success");
      msg.textContent = "✓ Published! Note is now visible to all students.";
    } catch (err) {
      const localNote = {
        id: "local_" + Date.now(),
        title: titleInput.value.trim(),
        subject: subjectInput.value,
        tags: parsedTags,
        imageUrl: selectedImageData,
        createdAt: new Date().toISOString()
      };

      const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
      existingLocal.unshift(localNote);
      localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(existingLocal));

      showToast("✓ Note saved locally & added to Home Page!", "success");
      msg.textContent = "✓ Published to your library!";
    } finally {
      $("#admin-upload-form").reset();
      selectedImageData = null;
      $("#dropzone-prompt").hidden = false;
      $("#dropzone-preview-wrap").hidden = true;
      submitBtn.disabled = false;
      await loadDashboardData();
    }
  });

  // Edit Note Form Submit
  $("#admin-edit-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#edit-note-id").value;
    const title = $("#edit-note-title").value.trim();
    const subject = $("#edit-note-subject").value;
    const tagsInput = $("#edit-note-tags");
    const rawTags = tagsInput ? tagsInput.value : "";
    const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);

    const msg = $("#edit-form-msg");
    const submitBtn = $("#edit-submit-btn");

    if (!id || !title || !subject) return;

    msg.textContent = "Saving updates…";
    msg.className = "form-message";
    submitBtn.disabled = true;

    try {
      const payload = { title, subject, tags: parsedTags };
      if (editImageData) payload.imageData = editImageData;

      await api(`/api/admin/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      showToast("✓ Note updated successfully!", "success");
    } catch (err) {
      const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
      const idx = existingLocal.findIndex(x => x.id === id);
      if (idx !== -1) {
        existingLocal[idx].title = title;
        existingLocal[idx].subject = subject;
        existingLocal[idx].tags = parsedTags;
        if (editImageData) existingLocal[idx].imageUrl = editImageData;
        localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(existingLocal));
      } else {
        const sampleIdx = sampleNotes.findIndex(x => x.id === id);
        if (sampleIdx !== -1) {
          sampleNotes[sampleIdx].title = title;
          sampleNotes[sampleIdx].subject = subject;
          sampleNotes[sampleIdx].tags = parsedTags;
          if (editImageData) sampleNotes[sampleIdx].imageUrl = editImageData;
        }
      }
      showToast("✓ Note updated in local storage!", "success");
    } finally {
      submitBtn.disabled = false;
      $("#admin-edit-dialog")?.close();
      await loadDashboardData();
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
  $("#lightbox-zoom-in")?.addEventListener("click", zoomIn);
  $("#lightbox-zoom-out")?.addEventListener("click", zoomOut);
  $("#lightbox-zoom-reset")?.addEventListener("click", resetZoom);

  $("#lightbox-prev-btn")?.addEventListener("click", prevLightbox);
  $("#lightbox-next-btn")?.addEventListener("click", nextLightbox);
  $("#lightbox-close-btn")?.addEventListener("click", () => {
    $("#lightbox-dialog")?.close();
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

function applyZoomTransform() {
  const layer = $("#lightbox-media-container .lightbox-img-transform-layer");
  const container = $("#lightbox-media-container");
  const zoomText = $("#lightbox-zoom-level");

  if (zoomText) zoomText.textContent = `${Math.round(currentZoom * 100)}%`;

  if (layer) {
    if (currentZoom <= 1.05) {
      panX = 0;
      panY = 0;
    }
    layer.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  }

  if (container) {
    container.classList.toggle("is-zoomed", currentZoom > 1.05);
  }
}

function setZoom(scale) {
  currentZoom = Math.min(Math.max(scale, 0.6), 3.5);
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
  if (dialog) dialog.showModal();
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
          <img src="${note.imageUrl}" alt="${escapeHtml(note.title)}" class="lightbox-img" decoding="sync">
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
    downloadBtn.href = note.imageUrl || "#";
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
setupEventListeners();
checkAuth();
