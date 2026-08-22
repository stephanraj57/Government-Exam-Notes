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
  const pwdInput = $("#admin-page-password");
  if (pwdInput) {
    pwdInput.value = "";
    pwdInput.focus();
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

  // Restore user's current view from URL hash, sessionStorage or localStorage
  const validViews = ["dashboard", "analysis", "interactions", "tags", "missing-searches", "publish", "modify"];
  const hash = window.location.hash.replace(/^#/, "");
  const savedView = sessionStorage.getItem("exam_admin_active_view") || localStorage.getItem("exam_admin_active_view") || "dashboard";
  const targetView = validViews.includes(hash) ? hash : (validViews.includes(savedView) ? savedView : "dashboard");

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

async function loadDashboardData() {
  let uploaded = [];
  let visitsCount = 0;
  let todayVisits = 0;
  let activeUsers = 1;

  try {
    const [notesData, visitsData, interData] = await Promise.all([
      api("/api/notes"),
      api("/api/visits").catch(() => ({ count: 0, today: 0 })),
      api("/api/interactions").catch(() => null)
    ]);

    uploaded = notesData.notes || [];
    visitsCount = visitsData.count || 0;
    todayVisits = visitsData.today || 0;
    activeUsers = (visitsData && visitsData.activeUsers) || (interData && interData.activeUsers) || 1;
    if (interData && interData.totalLikes !== undefined) {
      liveInteractions = interData;
    } else {
      liveInteractions = JSON.parse(localStorage.getItem("exam_notes_interactions_data") || '{"totalLikes":0,"totalDownloads":0,"totalSearches":0,"totalImpressions":0,"notes":{},"searches":{}}');
    }
  } catch {
    isLocalClientMode = true;
    uploaded = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
    visitsCount = Number(localStorage.getItem("exam_notes_local_visits") || "0");
    todayVisits = Number(localStorage.getItem("exam_notes_local_visits_today") || "0");
    liveInteractions = JSON.parse(localStorage.getItem("exam_notes_interactions_data") || '{"totalLikes":0,"totalDownloads":0,"totalSearches":0,"totalImpressions":0,"notes":{},"searches":{}}');
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
  const searchesEl = $("#interaction-total-searches");
  const viewsEl = $("#interaction-total-views");
  const interBadge = $("#interactions-badge");

  // Read ACTUAL telemetry values
  const realLikes = Number(liveInteractions.totalLikes) || 0;
  const realDownloads = Number(liveInteractions.totalDownloads) || 0;
  const realSearches = Number(liveInteractions.totalSearches) || 0;
  const realViews = Number(liveInteractions.totalImpressions) || 0;

  animateNumberCounter(likesEl, realLikes, 800);
  animateNumberCounter(downloadsEl, realDownloads, 800);
  animateNumberCounter(searchesEl, realSearches, 800);
  animateNumberCounter(viewsEl, realViews, 800);

  if (interBadge) {
    interBadge.textContent = realViews > 999 ? `${(realViews / 1000).toFixed(1)}k` : String(realViews);
  }

  // Update Summary Metrics
  const convRateEl = $("#summary-conversion-rate");
  const engRateEl = $("#summary-engagement-rate");
  const searchVelEl = $("#summary-avg-searches");
  const convRate = realViews > 0 ? ((realDownloads / realViews) * 100).toFixed(1) + "%" : "0.0%";
  const engRate = realViews > 0 ? ((realLikes / realViews) * 100).toFixed(1) + "%" : "0.0%";
  if (convRateEl) convRateEl.textContent = convRate;
  if (engRateEl) engRateEl.textContent = engRate;
  if (searchVelEl) searchVelEl.textContent = `${realSearches} Searches`;

  // Update Progress Bars & Values with animated fill
  const pctViews = $("#pct-val-views");
  const pctDownloads = $("#pct-val-downloads");
  const pctSearches = $("#pct-val-searches");
  const pctLikes = $("#pct-val-likes");

  const barViews = $("#bar-fill-views");
  const barDownloads = $("#bar-fill-downloads");
  const barSearches = $("#bar-fill-searches");
  const barLikes = $("#bar-fill-likes");

  const barViewsPct = realViews > 0 ? 100 : 0;
  const barDownloadsPct = realViews > 0 ? Math.min(100, Math.round((realDownloads / realViews) * 100)) : 0;
  const barSearchesPct = realViews > 0 ? Math.min(100, Math.round((realSearches / realViews) * 100)) : (realSearches > 0 ? 50 : 0);
  const barLikesPct = realViews > 0 ? Math.min(100, Math.round((realLikes / realViews) * 100)) : 0;

  if (barViews) barViews.style.width = "0%";
  if (barDownloads) barDownloads.style.width = "0%";
  if (barSearches) barSearches.style.width = "0%";
  if (barLikes) barLikes.style.width = "0%";

  setTimeout(() => {
    if (barViews) barViews.style.width = `${barViewsPct}%`;
    if (barDownloads) barDownloads.style.width = `${barDownloadsPct}%`;
    if (barSearches) barSearches.style.width = `${barSearchesPct}%`;
    if (barLikes) barLikes.style.width = `${barLikesPct}%`;
  }, 50);

  if (pctViews) pctViews.textContent = realViews.toLocaleString();
  if (pctDownloads) pctDownloads.textContent = realDownloads.toLocaleString();
  if (pctSearches) pctSearches.textContent = realSearches.toLocaleString();
  if (pctLikes) pctLikes.textContent = realLikes.toLocaleString();

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
      return;
    }

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

  // Tab Switch Handler
  const tabTopNotesBtn = $("#tab-top-notes-btn");
  const tabTopSearchesBtn = $("#tab-top-searches-btn");
  const paneTopNotes = $("#pane-top-notes");
  const paneTopSearches = $("#pane-top-searches");

  tabTopNotesBtn?.addEventListener("click", () => {
    tabTopNotesBtn.classList.add("active");
    tabTopSearchesBtn?.classList.remove("active");
    if (paneTopNotes) paneTopNotes.hidden = false;
    if (paneTopSearches) paneTopSearches.hidden = true;
  });

  tabTopSearchesBtn?.addEventListener("click", () => {
    tabTopSearchesBtn.classList.add("active");
    tabTopNotesBtn?.classList.remove("active");
    if (paneTopNotes) paneTopNotes.hidden = true;
    if (paneTopSearches) paneTopSearches.hidden = false;
  });
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
      nameLabel.textContent = file.name;
      sizeLabel.textContent = "Optimizing note image…";
      promptBox.hidden = true;
      previewWrap.hidden = false;

      const dataUrl = await optimizeImageFile(file);
      selectedImageData = dataUrl;
      imgPreview.src = selectedImageData;
      sizeLabel.textContent = `${(file.size / 1024).toFixed(1)} KB (High-Res)`;
      if (msg) msg.textContent = "";
    } catch (err) {
      showToast("Failed to process image file.", "error");
      clearPreview();
    }
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

function setupPublishStudio() {
  const titleInput = $("#studio-note-title");
  const charCount = $("#studio-title-char-count");
  const subjectSelect = $("#studio-note-subject");
  const categoryPills = $$(".pub-cat-pill");
  const tagsInput = $("#studio-note-tags");
  const simTitle = $("#sim-title-text");
  const simBadge = $("#sim-subject-badge");
  const simTagsRow = $("#sim-tags-row");

  const catEmojiMap = {
    "History": "📜 History",
    "Polity": "⚖️ Polity",
    "Economy": "📈 Economy",
    "Geography": "🌍 Geography",
    "Art and Culture": "🎨 Art and Culture",
    "Maths": "📐 Maths",
    "Science": "🔬 Science",
    "English": "🔤 English"
  };

  // 1. Live Title input & character counter
  titleInput?.addEventListener("input", () => {
    const val = titleInput.value;
    if (charCount) charCount.textContent = `${val.length}/80`;
    if (simTitle) {
      simTitle.textContent = val.trim() || "Indian Constitution – Fundamental Rights & Preamble";
    }
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
      if (simBadge) {
        simBadge.textContent = catEmojiMap[catVal] || catVal;
      }
    });
  });

  // 3. Live Tags Simulator & Dynamic Quick Tag Filtering
  const handleTagsInput = () => {
    if (!tagsInput) return;
    const raw = tagsInput.value;
    const tags = raw.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
    if (simTagsRow) {
      if (tags.length === 0) {
        simTagsRow.innerHTML = `<span class="sim-tag">#UPSC</span><span class="sim-tag">#Constitution</span>`;
      } else {
        simTagsRow.innerHTML = tags.map(t => `<span class="sim-tag">#${escapeHtml(t)}</span>`).join("");
      }
    }

    // Filter existing tag suggestions based on the last token being typed
    const currentToken = raw.split(",").pop().trim().replace(/^#/, "");
    renderPublishTagSuggestions(currentToken);
  };

  tagsInput?.addEventListener("input", handleTagsInput);
  tagsInput?.addEventListener("focus", () => {
    const currentToken = (tagsInput.value || "").split(",").pop().trim().replace(/^#/, "");
    renderPublishTagSuggestions(currentToken);
  });

  // Initial tag render
  renderPublishTagSuggestions("");

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

  // Strict Validation for all mandatory fields
  if (!selectedImageData) {
    showToast("Please upload a Note Image diagram.", "error");
    if (msg) {
      msg.textContent = "Note Image diagram is mandatory. Please upload an image file.";
      msg.className = "form-message error";
    }
    $("#studio-dropzone")?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  // Populate Verification Modal
  const modalImg = $("#verify-modal-img");
  const modalTitle = $("#verify-meta-title");
  const modalSubj = $("#verify-meta-subject");
  const modalTags = $("#verify-meta-tags");
  const modalFileName = $("#verify-file-name");
  const modalFileSize = $("#verify-file-size");
  const fileInput = $("#studio-file-input");

  if (modalImg) modalImg.src = selectedImageData;
  if (modalTitle) modalTitle.textContent = title;
  
  const catEmojiMap = {
    "History": "📜 History",
    "Polity": "⚖️ Polity",
    "Economy": "📈 Economy",
    "Geography": "🌍 Geography",
    "Art and Culture": "🎨 Art and Culture",
    "Maths": "📐 Maths",
    "Science": "🔬 Science",
    "English": "🔤 English"
  };

  if (modalSubj) {
    modalSubj.textContent = catEmojiMap[subject] || subject;
    modalSubj.className = `subject-chip ${getSubjectKey(subject)}`;
  }

  if (modalTags) {
    if (parsedTags.length === 0) {
      modalTags.innerHTML = `<span class="text-muted" style="font-size: 0.72rem;">No tags specified</span>`;
    } else {
      modalTags.innerHTML = parsedTags.map(t => `<span class="table-tag">#${escapeHtml(t)}</span>`).join("");
    }
  }

  const fileName = fileInput?.files?.[0]?.name || $("#preview-file-name")?.textContent || "revision-note.jpg";
  const fileSize = fileInput?.files?.[0] ? `${(fileInput.files[0].size / 1024).toFixed(1)} KB` : $("#preview-file-size")?.textContent || "High-Res JPG";
  if (modalFileName) modalFileName.textContent = fileName;
  if (modalFileSize) modalFileSize.textContent = fileSize;

  // Reset zoom
  currentVerifyZoom = 1;
  applyVerifyZoom();

  if (dialog) dialog.showModal();
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

  if (!selectedImageData) {
    showToast("Please upload a note image diagram first.", "error");
    return;
  }

  const rawTags = tagsInput ? tagsInput.value : "";
  const parsedTags = rawTags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span>⏳</span> Publishing to Library…`;
  }
  if (submitBtn) submitBtn.disabled = true;

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
    if (msg) {
      msg.textContent = "✓ Published! Note is now live for all students.";
      msg.className = "form-message success";
    }

    if (verifyDialog) verifyDialog.close();

    // Reset Form & Preview on successful publish
    $("#admin-upload-form").reset();
    selectedImageData = null;
    $("#dropzone-prompt").hidden = false;
    $("#dropzone-preview-wrap").hidden = true;
    const charCount = $("#studio-title-char-count");
    if (charCount) charCount.textContent = "0/80";
    const simTitle = $("#sim-title-text");
    if (simTitle) simTitle.textContent = "Indian Constitution – Fundamental Rights & Preamble";
    const simTagsRow = $("#sim-tags-row");
    if (simTagsRow) simTagsRow.innerHTML = `<span class="sim-tag">#UPSC</span><span class="sim-tag">#Constitution</span>`;
    const simBadge = $("#sim-subject-badge");
    if (simBadge) simBadge.textContent = "⚖️ Polity";
    $$(".pub-cat-pill").forEach(p => p.classList.toggle("active", p.dataset.catVal === "Polity"));

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

function switchAdminView(viewName, updateHash = true) {
  const validViews = ["dashboard", "analysis", "interactions", "tags", "missing-searches", "publish", "modify"];
  if (!validViews.includes(viewName)) {
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
            : (viewName === "tags"
                ? "Tag Analysis"
                : (viewName === "missing-searches"
                    ? "Search Demands"
                    : (viewName === "publish" 
                        ? "Publish Studio" 
                        : "Content Library")))));
            
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
              : (viewName === "tags"
                  ? "Tag Cloud & Keyword Distribution 🏷️"
                  : (viewName === "missing-searches"
                      ? "Student Search Demands & Content Gaps 🔎"
                      : (viewName === "publish" 
                          ? "Publish Revision Note ☁" 
                          : "Content Library Management ✏️")))));
  }

  if (viewName === "dashboard") {
    renderCategoryChart();
    renderRecentNotes();
  } else if (viewName === "analysis") {
    renderAnalysisView();
  } else if (viewName === "interactions") {
    renderInteractionsView();
  } else if (viewName === "tags") {
    renderTagsView();
  } else if (viewName === "missing-searches") {
    renderMissingSearchesView();
  } else if (viewName === "modify") {
    renderTable();
  }
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
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
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

  let daysHtml = "";

  // 1. Trailing days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    daysHtml += `<button type="button" class="cal-day-cell other-month" disabled>${d}</button>`;
  }

  // 2. Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dayOfWeek = cellDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = isCurrentMonth && d === todayDate;
    
    const classes = [
      "cal-day-cell",
      isToday ? "today" : "",
      isWeekend ? "weekend" : ""
    ].filter(Boolean).join(" ");

    daysHtml += `
      <button type="button" class="${classes}" data-cal-day="${d}" data-cal-month="${month}" data-cal-year="${year}" title="${monthNames[month]} ${d}, ${year}${isToday ? ' (Today)' : ''}">
        ${d}
      </button>
    `;
  }

  // 3. Leading days of next month to fill grid (up to 35 or 42 cells)
  const totalCellsSoFar = firstDay + daysInMonth;
  const targetTotal = totalCellsSoFar > 35 ? 42 : 35;
  const remaining = targetTotal - totalCellsSoFar;
  for (let d = 1; d <= remaining; d++) {
    daysHtml += `<button type="button" class="cal-day-cell other-month" disabled>${d}</button>`;
  }

  gridEl.innerHTML = daysHtml;

  // Add click handler to days
  gridEl.querySelectorAll(".cal-day-cell:not(.other-month)").forEach(btn => {
    btn.addEventListener("click", () => {
      gridEl.querySelectorAll(".cal-day-cell").forEach(c => c.classList.remove("selected"));
      btn.classList.add("selected");
      const d = btn.dataset.calDay;
      const m = Number(btn.dataset.calMonth) + 1;
      const y = btn.dataset.calYear;
      const dateStr = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
      showToast(`Selected date: ${dateStr}`, "info");
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
    const validViews = ["dashboard", "analysis", "interactions", "tags", "missing-searches", "publish", "modify"];
    if (validViews.includes(hash) && sessionStorage.getItem("exam_admin_local_session") === "true") {
      switchAdminView(hash, false);
    }
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

  // Clean / Reset All Data Button
  $("#admin-clean-data-btn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clean all test data, custom notes, and local cache? This will reset the website to a clean state for testing.")) {
      return;
    }

    try {
      await api("/api/admin/reset-data", { method: "POST" });
    } catch {}

    localStorage.removeItem("exam_notes_custom_uploads");
    localStorage.removeItem("exam_notes_deleted_sample_ids");
    localStorage.removeItem("exam_notes_local_visits");
    localStorage.removeItem("exam_notes_bookmarks");
    localStorage.removeItem("exam_notes_recent");
    localStorage.removeItem("exam_notes_favorites");
    localStorage.removeItem("exam_notes_offline_queue");
    localStorage.removeItem("exam_notes_interactions_data");

    liveInteractions = {
      totalLikes: 0,
      totalDownloads: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      searches: {},
      missingSearches: {}
    };

    showToast("✓ All test data, interactions & local caches have been wiped clean!", "success");
    await loadDashboardData();
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

  // Multi-stage aggressive password clearing on page load & refresh
  const purgePasswordAutofill = () => {
    const pInput = $("#admin-page-password");
    if (pInput) {
      pInput.value = "";
      pInput.setAttribute("value", "");
    }
    const lForm = $("#admin-page-login-form");
    if (lForm) lForm.reset();
  };

  purgePasswordAutofill();
  [30, 80, 150, 300, 600, 1000].forEach(delay => {
    setTimeout(purgePasswordAutofill, delay);
  });

  // Always clear password input on window pageshow / back navigation
  window.addEventListener("pageshow", () => {
    purgePasswordAutofill();
  });

  // Login Form Submit
  $("#admin-page-login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#admin-page-login-msg");
    const btn = $("#admin-page-login-submit");

    if (!pwdInput || !msg) return;

    const enteredPassword = pwdInput.value.trim();
    // Instantly wipe password input field for security
    pwdInput.value = "";
    msg.textContent = "Verifying credentials…";
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
          msg.textContent = "Incorrect password.";
          msg.className = "form-message error";
          pwdInput.focus();
        }
      } else {
        msg.textContent = err.message || "Invalid password.";
        msg.className = "form-message error";
        pwdInput.focus();
      }
    } finally {
      btn.disabled = false;
      if (pwdInput) pwdInput.value = "";
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

  // Upload Form Submit (Opens Image Verification Popup First)
  $("#admin-upload-form")?.addEventListener("submit", e => {
    e.preventDefault();
    openPublishVerificationModal();
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

// ==========================================
// Real-Time Active Users Presence Poller
// ==========================================
setInterval(async () => {
  if (sessionStorage.getItem("exam_admin_local_session") === "true" || document.visibilityState === "visible") {
    try {
      const res = await api("/api/heartbeat");
      if (res && res.activeUsers !== undefined) {
        updateActiveUsersDisplay(res.activeUsers);
      }
    } catch {}
  }
}, 10000);
