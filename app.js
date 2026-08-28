/**
 * Free AI Govt Exam Notes - Frontend Application Logic
 * Supports: 7 Core Subjects (History, Polity, Economy, Geography, Art and Culture, Maths, Science),
 * Multiple Tags for every note (#Tags), 6 Notes Per Page Pagination, Lightbox Zoom Viewer,
 * Bookmarks, Recently Viewed, Theme System, and Admin State.
 */

// ==========================================
// 1. Initial State & 7-Category Sample Notes with Multiple Tags
// ==========================================
// 1. Initial State & Notes Repository
// ==========================================
const samples = [];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Application State
let notes = [];
let category = "All Notes";
let activeTag = null;
let currentView = "notes"; // "notes" | "bookmarks" | "about"
let viewMode = localStorage.getItem("exam_notes_view") || "grid";
let isAdmin = false;
let currentLightboxIndex = -1;
let currentFilteredList = [];
let noteInteractions = { notes: {}, totalImpressions: 0 };

// 6 Notes Per Page Pagination State
const PAGE_SIZE = 6;
let currentPage = 1;

// Local Storage Collections
let bookmarks = new Set(JSON.parse(localStorage.getItem("exam_notes_bookmarks") || "[]"));
let recentViewed = JSON.parse(localStorage.getItem("exam_notes_recent") || "[]");

// ==========================================
// 2. Utility Helpers & Universal Portable Image Store (IndexedDB)
// ==========================================
const escapeHtml = v => {
  const e = document.createElement("div");
  e.textContent = v || "";
  return e.innerHTML;
};

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
  }
};

window.handleNoteImageError = async function(imgEl, noteId, imgUrl, title, subject) {
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
        imgEl.parentElement.innerHTML = `<div class="preview"><h3>${title}</h3><p>${subject}</p><div class="diagram">📖</div></div>`;
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
    imgEl.parentElement.innerHTML = `<div class="preview"><h3>${title}</h3><p>${subject}</p><div class="diagram">📖</div></div>`;
  }
};

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

function getNoteViews(noteId) {
  if (!noteId) return 0;
  let localViews = 0;
  try {
    const raw = localStorage.getItem("exam_notes_interactions_data");
    if (raw) {
      const parsed = JSON.parse(raw);
      localViews = Number(parsed?.notes?.[noteId]?.impressions) || 0;
    }
  } catch {}
  const serverViews = Number(noteInteractions?.notes?.[noteId]?.impressions) || Number(noteInteractions?.notes?.[noteId]?.views) || 0;
  return Math.max(localViews, serverViews);
}

function formatViewsCount(count) {
  const num = Number(count) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toLocaleString("en-IN");
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
  }, 2800);
}

// ==========================================
// 3. Theme System
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
// 4. Data Loading & Persistence
// ==========================================
async function loadNotes() {
  let serverNotes = [];
  try {
    let notesData = null;
    try {
      const res = await fetch(`/api/notes?_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) notesData = await res.json();
    } catch {}

    // Fall back to static data/notes.json for mobile devices & static cloud hosting
    if (!notesData || !Array.isArray(notesData.notes) || notesData.notes.length === 0) {
      try {
        const staticRes = await fetch(`data/notes.json?_t=${Date.now()}`, { cache: "no-store" });
        if (staticRes.ok) {
          const raw = await staticRes.json();
          notesData = { notes: Array.isArray(raw) ? raw : (raw.notes || []) };
        }
      } catch {}
    }

    serverNotes = (notesData && notesData.notes) || [];
    isAdmin = false;
    try {
      const meRes = await fetch(`/api/admin/me?_t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : { admin: false });
      isAdmin = Boolean(meRes.admin);
    } catch {}

    try {
      const interRes = await fetch(`/api/interactions?_t=${Date.now()}`, { cache: "no-store" });
      if (interRes.ok) {
        noteInteractions = await interRes.json();
      }
    } catch {}
  } catch {
    serverNotes = [];
    isAdmin = false;
  }

  // Merge static/server notes and local storage custom uploads (ensuring restored backup notes always appear on mobile & desktop)
  const localUploads = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
  const mergedNotes = [...localUploads.filter(l => !serverNotes.some(s => s.id === l.id)), ...serverNotes];

  notes = mergedNotes;

  // Prune any stale bookmark IDs that no longer exist in current library
  const noteIdSet = new Set(notes.map(n => n.id));
  bookmarks = new Set([...bookmarks].filter(id => noteIdSet.has(id)));
  try {
    localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
  } catch {}

  // Hydrate Brand Logo & Admin Profile Avatar immediately from LocalStorage, static file, or API
  const localProfile = JSON.parse(localStorage.getItem("exam_admin_profile_data") || "null");
  if (localProfile) {
    if (localProfile.avatarUrl) {
      document.querySelectorAll(".avatar-img").forEach(img => { img.src = localProfile.avatarUrl; });
    }
    if (localProfile.logoUrl) {
      document.querySelectorAll(".brand-logo").forEach(img => { img.src = localProfile.logoUrl; });
    }
  }

  // Fetch from API or fallback to static data/profile.json
  fetch(`/api/admin/profile?_t=${Date.now()}`, { cache: "no-store" })
    .then(r => r.ok ? r.json() : fetch(`data/profile.json?_t=${Date.now()}`, { cache: "no-store" }).then(r2 => r2.ok ? r2.json() : null).then(d => ({ profile: d })))
    .then(d => {
      if (d && d.profile) {
        const avatar = d.profile.avatarUrl;
        if (avatar) {
          localStorage.setItem("exam_admin_profile_data", JSON.stringify(d.profile));
          document.querySelectorAll(".avatar-img").forEach(img => {
            img.src = avatar;
          });
        }
        const logo = d.profile.logoUrl;
        if (logo) {
          document.querySelectorAll(".brand-logo").forEach(img => {
            img.src = logo;
          });
        }
      }
    })
    .catch(() => {});

  // Track genuine student homepage visit (recording daily & total website traffic)
  if (!sessionStorage.getItem("exam_student_session_visit")) {
    sessionStorage.setItem("exam_student_session_visit", "true");
    fetch("/api/visits/track", { method: "POST" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          localStorage.setItem("exam_notes_local_visits", String(data.count || 0));
          localStorage.setItem("exam_notes_local_visits_today", String(data.today || 0));
        }
      })
      .catch(() => {});
  }

  updateAdminState();
  updatePopularTags();
  handleUrlHash();
  render();
  checkDeepLinkedNote();
}

function updateAdminState() {
  const adminText = $("#admin-status-text");
  const adminSub = $("#admin-status-sub");
  const adminBtn = $("#admin-login-button");

  if (isAdmin) {
    if (adminText) adminText.textContent = "Admin Studio";
    if (adminSub) adminSub.textContent = "Active Session";
    if (adminBtn) adminBtn.classList.add("admin-logged-in");
  } else {
    if (adminText) adminText.textContent = "Admin Studio";
    if (adminSub) adminSub.textContent = "Upload & Manage";
    if (adminBtn) adminBtn.classList.remove("admin-logged-in");
  }
}

function updatePopularTags() {
  const tagsContainer = $("#popular-tags-container");
  if (!tagsContainer) return;

  const allTags = new Set();
  notes.forEach(n => {
    if (Array.isArray(n.tags)) {
      n.tags.forEach(t => allTags.add(t));
    }
  });

  if (allTags.size === 0) {
    tagsContainer.innerHTML = `<span style="color: var(--ink-muted); font-size: 0.8rem; padding: 4px 8px;">No tags yet</span>`;
    return;
  }

  tagsContainer.innerHTML = [...allTags].slice(0, 14).map(t =>
    `<button type="button" class="tag-pill ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
  ).join("");
}

function renderCardMedia(note, pIndex = 0) {
  if (note.imageUrl) {
    const priorityAttr = pIndex < 2 ? 'fetchpriority="high"' : 'fetchpriority="low"';
    return `
      <div class="card-media">
        <img class="note-image" src="${note.imageUrl}" alt="${escapeHtml(note.title)}" loading="lazy" decoding="async" ${priorityAttr} onerror="handleNoteImageError(this, '${note.id}', '${note.imageUrl}', '${escapeHtml(note.title)}', '${escapeHtml(note.subject)}')">
      </div>
    `;
  }

  const previews = {
    preamble: `<h3>Preamble of Constitution</h3><p>WE, THE PEOPLE OF INDIA…</p><p>Justice · Liberty · Equality</p><div class='diagram'>⚖</div>`,
    rights: `<h3>Fundamental Rights</h3><p>• Right to Equality (14-18)</p><p>• Right to Freedom (19-22)</p><div class='diagram'>📜</div>`,
    map: `<h3>INDIA — PHYSICAL DIVISIONS</h3><div class='diagram'>🌍</div><p>Himalayas · Northern Plains · Deccan</p>`,
    revolt: `<h3>The Revolt of 1857</h3><p><b>Major Causes & Centers</b></p><p>Meerut · Delhi · Kanpur · Jhansi</p><div class='diagram'>♞</div>`,
    mauryan: `<h3>Mauryan Empire</h3><p>Founder: Chandragupta Maurya</p><p>Ashoka · Dhamma · Rock Edicts</p><div class='diagram'>🏛️</div>`,
    economy: `<h3>Indian Economy — Sectors</h3><div class='diagram'>📈</div><p>Primary · Secondary · Tertiary</p>`,
    rbi: `<h3>RBI & Monetary Policy</h3><div class='diagram'>🏦</div><p>Repo Rate · CRR · SLR · Open Market</p>`,
    water: `<h3>Water Resources of India</h3><p>Major River Basins & Dams</p><div class='diagram'>🌊</div><p>Indus · Ganga · Godavari</p>`,
    dance: `<h3>Classical Dance Forms</h3><div class='diagram'>🎭</div><p>Bharatanatyam · Kathak · Kathakali</p>`,
    temple: `<h3>Temple Architecture</h3><div class='diagram'>🎨</div><p>Nagara · Dravida · Vesara Styles</p>`,
    maths_speed: `<h3>Speed, Distance & Time</h3><div class='diagram'>📐</div><p>Speed = Dist/Time · Relative Speed</p>`,
    maths_calc: `<h3>Percentage & Profit</h3><div class='diagram'>🔢</div><p>Profit% = (Profit/CP) × 100</p>`,
    biology: `<h3>Human Digestive System</h3><div class='diagram'>🔬</div><p>Salivary Amylase · Pepsin · Bile</p>`,
    physics: `<h3>Newton’s Laws of Motion</h3><div class='diagram'>⚛️</div><p>F = ma · Action-Reaction · Gravitation</p>`,
    english_grammar: `<h3>Subject-Verb Agreement</h3><div class='diagram'>🔤</div><p>Singular/Plural Rules · Tenses</p>`,
    english_vocab: `<h3>Idioms & Phrases</h3><div class='diagram'>📖</div><p>One-Word Substitution · Synonyms</p>`
  };

  const previewContent = previews[note.type] || `<h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.subject)}</p><div class='diagram'>📖</div>`;
  return `<div class="card-media"><div class="preview">${previewContent}</div></div>`;
}

// ==========================================
// 5. Main Render Function with 6 Notes / Page & Multiple Tags
// ==========================================
function render() {
  const searchTerm = $("#note-search")?.value.trim().toLowerCase() || "";
  const sortOption = $("#sort-notes")?.value || "newest";

  // Filter notes
  let list = notes.filter(n => {
    // View filter
    if (currentView === "bookmarks" && !bookmarks.has(n.id)) return false;

    // Category filter
    if (currentView === "notes" && category !== "All Notes") {
      const matchCat = n.categories?.includes(category) || n.subject.toLowerCase().includes(category.toLowerCase());
      if (!matchCat) return false;
    }

    // Tag filter
    if (activeTag) {
      const tagLower = activeTag.toLowerCase();
      const matchTag = (n.tags || []).some(t => t.toLowerCase() === tagLower) ||
        (`${n.title} ${n.subject}`).toLowerCase().includes(tagLower);
      if (!matchTag) return false;
    }

    // Search query filter (handles #tag and text keywords)
    if (searchTerm) {
      const cleanSearch = searchTerm.startsWith("#") ? searchTerm.slice(1).trim() : searchTerm;
      if (cleanSearch) {
        const allText = `${n.title} ${n.subject} ${(n.categories || []).join(" ")} ${(n.tags || []).join(" ")}`.toLowerCase();
        const matchesTags = (n.tags || []).some(t => t.toLowerCase().includes(cleanSearch));
        if (!allText.includes(cleanSearch) && !matchesTags) return false;
      }
    }

    return true;
  });

  // Sorting
  if (sortOption === "title") {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortOption === "oldest") {
    list.sort((a, b) => (new Date(a.createdAt || a.date || 0)) - (new Date(b.createdAt || b.date || 0)));
  } else {
    list.sort((a, b) => (new Date(b.createdAt || b.date || 0)) - (new Date(a.createdAt || a.date || 0)));
  }

  currentFilteredList = list;

  // Pagination calculation
  const totalItems = list.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedList = list.slice(startIndex, startIndex + PAGE_SIZE);

  // Render Grid / List (6 notes per page)
  const notesGrid = $("#notes-grid");
  if (notesGrid) {
    notesGrid.className = `notes-grid ${viewMode === "list" ? "list-view" : ""}`;
  }

  const gridBtn = $("#grid-view-btn") || $("#view-grid");
  const listBtn = $("#list-view-btn") || $("#view-list");
  if (gridBtn) gridBtn.classList.toggle("active", viewMode === "grid");
  if (listBtn) listBtn.classList.toggle("active", viewMode === "list");

  if (notesGrid) {
    if (pagedList.length === 0) {
      notesGrid.innerHTML = "";
    } else {
      notesGrid.innerHTML = pagedList.map((n, pIndex) => {
        const fullIndex = startIndex + pIndex;
        const isBookmarked = bookmarks.has(n.id);
        const subjKey = getSubjectKey(n.subject);
        const viewsCount = getNoteViews(n.id);
        const viewsFormatted = formatViewsCount(viewsCount);
        const viewsLabel = `${viewsFormatted} ${viewsCount === 1 ? 'view' : 'views'}`;

        const tagsList = (n.tags || []).map(t =>
          `<span class="note-tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${escapeHtml(t)}</span>`
        ).join("");

        const tagsHtml = tagsList ? `<div class="note-tags-row">${tagsList}</div>` : '';

        return `
          <article class="note-card" data-note-id="${n.id}" data-index="${fullIndex}" tabindex="0" role="button" aria-label="${escapeHtml(n.title)}">
            <button class="card-bookmark-btn ${isBookmarked ? "bookmarked" : ""}" data-bookmark="${n.id}" type="button" title="${isBookmarked ? "Remove from Saved" : "Like & Save Note"}" aria-label="Like Note">
              ${isBookmarked ? "❤️" : "🤍"}
            </button>
            ${renderCardMedia(n, pIndex)}
            <div class="note-content">
              <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
              <h3 class="note-title">${escapeHtml(n.title)}</h3>
              ${tagsHtml}
              <div class="note-meta">
                <span class="note-views-badge" title="${viewsCount} student views">
                  <svg class="views-eye-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <span class="views-badge-text">${viewsLabel}</span>
                </span>
                <button class="card-share-btn" data-share="${n.id}" type="button" title="Share Note (WhatsApp, Telegram, Link)" aria-label="Share Note">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                  </svg>
                  <span>Share</span>
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("");
    }
  }

  // Render Pagination Controls
  renderPagination(totalItems, totalPages);

  // Update Page Headings & Counter
  const pageTitle = $("#page-title");
  if (pageTitle) {
    if (currentView === "bookmarks") {
      pageTitle.textContent = "Saved Bookmarks";
    } else {
      pageTitle.textContent = category;
    }
  }

  const noteTotal = $("#note-total");
  if (noteTotal) {
    noteTotal.textContent = `${totalItems} note${totalItems === 1 ? "" : "s"} ready for revision`;
  }

  // Empty State Handling
  const emptyNotes = $("#empty-notes");
  if (emptyNotes) {
    emptyNotes.hidden = totalItems > 0;
    const emptyMsg = $("#empty-message");
    if (emptyMsg) {
      if (currentView === "bookmarks") {
        emptyMsg.textContent = "You haven't bookmarked any notes yet. Tap the heart icon (♡) on any note to save it here.";
      } else if (searchTerm || activeTag || category !== "All Notes") {
        emptyMsg.textContent = "No notes matched your search query or active filter. Try clearing filters or searching for another topic.";
      } else {
        emptyMsg.textContent = "No revision notes published yet. Notes published by Master Admin will appear here in high resolution.";
      }
    }
  }

  // Clear Search Button state
  const clearBtn = $("#clear-search");
  if (clearBtn) clearBtn.hidden = !searchTerm;

  // Update Category Counts
  updateCategoryCounts();

  // Update Bookmarks Counter Badge
  const bookmarkBadge = $("#bookmark-badge");
  const validBookmarksCount = [...bookmarks].filter(id => notes.some(n => n.id === id)).length;
  if (bookmarkBadge) bookmarkBadge.textContent = validBookmarksCount;
}

// ==========================================
// 6. Pagination Bar Generation (6 Notes / Page)
// ==========================================
function renderPagination(totalItems, totalPages) {
  const wrapper = $("#pagination-wrapper");
  const controls = $("#pagination-controls");
  const showingCount = $("#showing-count");

  if (!wrapper || !controls) return;

  if (totalItems === 0) {
    wrapper.style.display = "none";
    controls.innerHTML = "";
    if (showingCount) showingCount.textContent = "";
    return;
  }

  wrapper.style.display = "flex";

  const startItem = (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);
  if (showingCount) {
    showingCount.textContent = `Showing ${startItem}–${endItem} of ${totalItems} notes (Page ${currentPage} of ${totalPages})`;
  }

  let html = "";

  if (totalPages > 1) {
    // Prev Button
    html += `
      <button type="button" class="page-btn prev-btn ${currentPage === 1 ? "disabled" : ""}" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Previous Page">
        ‹ Prev
      </button>
    `;

    // Numbered Buttons
    for (let p = 1; p <= totalPages; p++) {
      if (totalPages > 7) {
        if (p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
          if (p === 2 && currentPage > 3) {
            html += `<span class="page-ellipsis">…</span>`;
          } else if (p === totalPages - 1 && currentPage < totalPages - 2) {
            html += `<span class="page-ellipsis">…</span>`;
          }
          continue;
        }
      }

      const isActive = p === currentPage;
      html += `
        <button type="button" class="page-btn ${isActive ? "active" : ""}" data-page="${p}" aria-label="Page ${p}" ${isActive ? 'aria-current="page"' : ""}>
          ${p}
        </button>
      `;
    }

    // Next Button
    html += `
      <button type="button" class="page-btn next-btn ${currentPage === totalPages ? "disabled" : ""}" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Next Page">
        Next ›
      </button>
    `;
  } else {
    // Single page (<= 6 notes)
    html += `
      <button type="button" class="page-btn active" data-page="1" aria-label="Page 1" aria-current="page">
        1
      </button>
    `;
  }

  controls.innerHTML = html;
}

// ==========================================
// 7. Category Counters
// ==========================================
function updateCategoryCounts() {
  const counts = {
    all: notes.length,
    history: 0,
    polity: 0,
    economy: 0,
    geography: 0,
    "art-culture": 0,
    maths: 0,
    science: 0,
    others: 0
  };

  notes.forEach(n => {
    const k = getSubjectKey(n.subject);
    if (counts[k] !== undefined) counts[k]++;
  });

  const setCnt = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val;
  };

  setCnt("#all-count", counts.all);
  setCnt("#history-count", counts.history);
  setCnt("#polity-count", counts.polity);
  setCnt("#economy-count", counts.economy);
  setCnt("#geography-count", counts.geography);
  setCnt("#art-culture-count", counts["art-culture"]);
  setCnt("#maths-count", counts.maths);
  setCnt("#science-count", counts.science);
  setCnt("#others-count", counts.others);
}

// ==========================================
// 8. Navigation & View Handling (Unified SPA Panel)
// ==========================================
function switchView(viewName, updateHash = true) {
  if (!["notes", "bookmarks", "about"].includes(viewName)) {
    viewName = "notes";
  }
  currentView = viewName;
  activeTag = null;
  currentPage = 1;

  if (viewName !== "notes") {
    closeLightbox();
  }

  if (updateHash) {
    if (viewName === "notes") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } else {
      window.location.hash = viewName;
    }
  }

  $$(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  $$(".mobile-nav-btn[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  const appShell = $(".app-shell");
  const aboutViewPanel = $("#about-view-panel");
  const mobileCatStrip = $(".mobile-category-strip");

  if (viewName === "about") {
    document.body.classList.add("about-mode");
    if (appShell) appShell.style.display = "none";
    if (aboutViewPanel) {
      aboutViewPanel.style.display = "flex";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (mobileCatStrip) mobileCatStrip.style.display = "none";
    document.title = "About Us | Free AI Govt Exam Notes";
    return;
  } else {
    document.body.classList.remove("about-mode");
    if (appShell) appShell.style.display = "";
    if (aboutViewPanel) aboutViewPanel.style.display = "none";
    if (mobileCatStrip && window.innerWidth <= 768) mobileCatStrip.style.display = "block";
    document.title = "Free AI Govt Exam Notes - Smart Notes · Clear Concepts · Better Revision";
  }

  render();
}

function handleUrlHash() {
  const rawHash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  if (rawHash === "bookmarks" || rawHash === "saved") {
    switchView("bookmarks", false);
  } else if (rawHash === "about" || rawHash === "about-us") {
    switchView("about", false);
  } else if (rawHash === "notes" || rawHash === "all" || !rawHash) {
    switchView("notes", false);
  }
}

function selectCategory(catName) {
  category = catName;
  activeTag = null;
  currentPage = 1;
  if (currentView !== "notes") {
    switchView("notes");
  }

  $$(".category").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === catName);
  });

  $$(".cat-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === catName);
  });

  if (catName && catName !== "All Notes") {
    trackInteraction("search", { query: catName });
  }

  render();
}

// ==========================================
// 8.1 Real-Time Interaction Telemetry Tracker
// ==========================================
async function trackInteraction(type, payload = {}) {
  try {
    fetch("/api/interactions/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload })
    }).catch(() => {});
  } catch (e) {}

  // Sync with student user telemetry
  sendStudentTelemetry(type, payload);

  // Local storage fallback sync
  try {
    const raw = localStorage.getItem("exam_notes_interactions_data");
    const data = raw ? JSON.parse(raw) : {
      totalLikes: 0,
      totalDownloads: 0,
      totalSearches: 0,
      totalImpressions: 0,
      notes: {},
      searches: {}
    };
    if (!data.notes) data.notes = {};
    if (!data.searches) data.searches = {};

    const noteId = payload.noteId;
    const noteIds = Array.isArray(payload.noteIds) ? payload.noteIds : (noteId ? [noteId] : []);
    const query = (payload.query || "").trim();

    if (type === "like") {
      data.totalLikes = Math.max(0, (data.totalLikes || 0) + 1);
      if (noteId) {
        if (!data.notes[noteId]) data.notes[noteId] = { likes: 0, downloads: 0, impressions: 0 };
        data.notes[noteId].likes = Math.max(0, (data.notes[noteId].likes || 0) + 1);
      }
    } else if (type === "unlike") {
      data.totalLikes = Math.max(0, (data.totalLikes || 0) - 1);
      if (noteId && data.notes[noteId]) {
        data.notes[noteId].likes = Math.max(0, (data.notes[noteId].likes || 0) - 1);
      }
    } else if (type === "download") {
      data.totalDownloads = (data.totalDownloads || 0) + 1;
      if (noteId) {
        if (!data.notes[noteId]) data.notes[noteId] = { likes: 0, downloads: 0, impressions: 0 };
        data.notes[noteId].downloads = (data.notes[noteId].downloads || 0) + 1;
      }
    } else if (type === "search") {
      data.totalSearches = (data.totalSearches || 0) + 1;
      if (query && query.length >= 2) {
        const qKey = query.slice(0, 40);
        data.searches[qKey] = (data.searches[qKey] || 0) + 1;
      }
    } else if (type === "missing_search" || type === "unfulfilled_search") {
      if (!data.missingSearches) data.missingSearches = {};
      if (query && query.length >= 2) {
        const qKey = query.slice(0, 60);
        if (!data.missingSearches[qKey]) {
          data.missingSearches[qKey] = {
            query: qKey,
            count: 0,
            firstSearched: new Date().toISOString(),
            lastSearched: new Date().toISOString()
          };
        }
        data.missingSearches[qKey].count = (data.missingSearches[qKey].count || 0) + 1;
        data.missingSearches[qKey].lastSearched = new Date().toISOString();
      }
    } else if (type === "impression" || type === "view") {
      const increment = noteIds.length > 0 ? noteIds.length : 1;
      data.totalImpressions = (data.totalImpressions || 0) + increment;
      noteIds.forEach(id => {
        if (!data.notes[id]) data.notes[id] = { likes: 0, downloads: 0, impressions: 0 };
        data.notes[id].impressions = (data.notes[id].impressions || 0) + 1;
      });
    }
    localStorage.setItem("exam_notes_interactions_data", JSON.stringify(data));
  } catch (e) {}
}

let pendingLikeNoteId = null;

function toggleBookmark(noteId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  const isCurrentlyLiked = bookmarks.has(noteId);
  if (isCurrentlyLiked) {
    bookmarks.delete(noteId);
    trackInteraction("unlike", { noteId });
    if (currentStudentUser) {
      sendStudentTelemetry("unlike", { noteId });
    }
    showToast("Removed from Saved notes.", "info");
  } else {
    bookmarks.add(noteId);
    trackInteraction("like", { noteId });
    if (currentStudentUser) {
      sendStudentTelemetry("like", { noteId });
    }
    showToast("Saved to your Liked Notes! ❤️", "success");

    // If user is not authenticated yet, prompt sign-in so they know they can sync to cloud
    if (!currentStudentUser) {
      pendingLikeNoteId = noteId;
      setTimeout(() => {
        openStudentAuthModal();
      }, 500);
    }
  }

  localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
  const menuBookmarksCount = $("#student-menu-bookmarks-count");
  if (menuBookmarksCount) menuBookmarksCount.textContent = bookmarks.size;
  const bookmarkBadge = $("#bookmark-badge");
  if (bookmarkBadge) bookmarkBadge.textContent = bookmarks.size;

  render();
}

function recordRecentView(noteId) {
  recentViewed = [noteId, ...recentViewed.filter(id => id !== noteId)].slice(0, 25);
  localStorage.setItem("exam_notes_recent", JSON.stringify(recentViewed));
  trackInteraction("view", { noteId });

  // Update in-memory count & immediately update card badge on screen
  if (!noteInteractions.notes) noteInteractions.notes = {};
  if (!noteInteractions.notes[noteId]) noteInteractions.notes[noteId] = { impressions: 0 };
  noteInteractions.notes[noteId].impressions = (Number(noteInteractions.notes[noteId].impressions) || 0) + 1;

  const cardBadge = document.querySelector(`[data-note-id="${noteId}"] .views-badge-text`);
  if (cardBadge) {
    const updatedCount = getNoteViews(noteId);
    cardBadge.textContent = `${formatViewsCount(updatedCount)} ${updatedCount === 1 ? 'view' : 'views'}`;
  }
}

// ==========================================
// 9. Lightbox Modal Zoom & Pan Engine
// ==========================================
// ==========================================
// 9. Lightbox Modal & High-Res Zoom Viewer (Zero Scroll)
// ==========================================
let currentZoom = 1.0;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

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

function zoomIn() {
  setZoom(currentZoom + 0.25);
}

function zoomOut() {
  setZoom(currentZoom - 0.25);
}

function resetZoom() {
  currentZoom = 1.0;
  panX = 0;
  panY = 0;
  applyZoomTransform();
}

function updateNoteUrlParam(noteId) {
  try {
    const url = new URL(window.location.href);
    if (noteId) {
      url.searchParams.set("note", noteId);
      url.searchParams.delete("id");
    } else {
      url.searchParams.delete("note");
      url.searchParams.delete("id");
    }
    const searchStr = url.searchParams.toString();
    const newRelativePath = url.pathname + (searchStr ? '?' + searchStr : '') + url.hash;
    window.history.replaceState(null, "", newRelativePath);
  } catch {}
}

function clearNoteUrlParam() {
  updateNoteUrlParam(null);
}

function openLightbox(index) {
  if (index < 0 || index >= currentFilteredList.length) return;
  currentLightboxIndex = index;
  const note = currentFilteredList[index];
  recordRecentView(note.id);

  updateLightboxContent(note);
  resetZoom();
  updateNoteUrlParam(note.id);

  const dialog = $("#lightbox-dialog");
  if (dialog && !dialog.open) {
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
  }
}

function closeLightbox() {
  const dialog = $("#lightbox-dialog");
  if (dialog && dialog.open) {
    try { dialog.close(); } catch { dialog.removeAttribute("open"); }
  }
  clearNoteUrlParam();
}

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
  // Detect if rawText already contains rich HTML tags
  const hasHtml = /<[a-z][\s\S]*>/i.test(trimmed);

  if (hasHtml) {
    return sanitizeRichHtml(trimmed);
  }

  // Fallback markdown / bullet points parser for legacy plain text notes
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

  return html;
}

function formatInlineText(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return escaped;
}

function updateLightboxContent(note) {
  if (!note) return;
  const title = $("#lightbox-title");
  const badge = $("#lightbox-badge");
  const mediaContainer = $("#lightbox-media-container");
  const meta = $("#lightbox-meta");
  const bookmarkBtn = $("#lightbox-bookmark-btn");
  const bookmarkLabel = $("#lightbox-bookmark-label");
  const shareBtn = $("#lightbox-share-btn");
  const downloadBtn = $("#lightbox-download-btn");
  const tagsContainer = $("#lightbox-tags");
  const overviewEl = $("#lightbox-overview-text");

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
          <img src="${note.imageUrl}" alt="${escapeHtml(note.title)}" class="lightbox-img" decoding="sync" onerror="handleNoteImageError(this, '${note.id}', '${note.imageUrl}', '${escapeHtml(note.title)}', '${escapeHtml(note.subject)}')">
        </div>
      `;
    } else {
      mediaContainer.innerHTML = `
        <div class="lightbox-img-transform-layer">
          <div class="lightbox-preview-card">${renderCardMedia(note)}</div>
        </div>
      `;
    }
  }

  if (overviewEl) {
    overviewEl.innerHTML = formatOverviewHtml(note.overview || note.description || "");
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

  if (bookmarkBtn) {
    const isBookmarked = bookmarks.has(note.id);
    bookmarkBtn.classList.toggle("active", isBookmarked);
    if (bookmarkLabel) {
      bookmarkLabel.textContent = isBookmarked ? "Liked / Saved" : "Bookmark Note";
    }
    const iconSpan = bookmarkBtn.querySelector(".btn-icon");
    if (iconSpan) iconSpan.textContent = isBookmarked ? "❤️" : "🤍";
  }

  if (shareBtn) {
    shareBtn.onclick = () => {
      openShareModal(note.id);
    };
  }

  if (downloadBtn) {
    downloadBtn.href = note.imageUrl || "#";
    downloadBtn.hidden = !note.imageUrl;
  }

  if (tagsContainer) {
    if (note.tags && note.tags.length > 0) {
      tagsContainer.innerHTML = note.tags.map(t =>
        `<button type="button" class="note-tag-chip" data-filter-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${escapeHtml(t)}</button>`
      ).join("");
    } else {
      tagsContainer.innerHTML = `<span class="no-tags-hint">#RevisionNotes</span>`;
    }
  }
}

function nextLightbox() {
  if (currentLightboxIndex < currentFilteredList.length - 1) {
    openLightbox(currentLightboxIndex + 1);
  } else {
    openLightbox(0); // loop
  }
}

function prevLightbox() {
  if (currentLightboxIndex > 0) {
    openLightbox(currentLightboxIndex - 1);
  } else {
    openLightbox(currentFilteredList.length - 1); // loop
  }
}

// ==========================================
// 9.3 Social Share Modal & Deep Link Router
// ==========================================
let activeSharingNote = null;

function openShareModal(noteId) {
  const note = notes.find(n => n.id === noteId) || currentFilteredList.find(n => n.id === noteId);
  if (!note) return;

  activeSharingNote = note;
  const shareDialog = $("#share-dialog");
  if (!shareDialog) return;

  // Build clean direct URL for sharing
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?note=${encodeURIComponent(note.id)}`;

  // Populate Preview
  const previewTitle = $("#share-preview-title");
  const previewSubject = $("#share-preview-subject");
  const previewImg = $("#share-preview-img");
  const linkInput = $("#share-link-input");
  const copyBtnText = $("#share-copy-text");

  if (previewTitle) previewTitle.textContent = note.title;
  if (previewSubject) {
    previewSubject.textContent = note.subject;
    previewSubject.className = `subject-chip ${getSubjectKey(note.subject)}`;
  }
  if (linkInput) linkInput.value = shareUrl;
  if (copyBtnText) copyBtnText.textContent = "Copy Link";

  if (previewImg) {
    const rawUrl = note.image || note.imageUrl || (note.images && note.images[0]) || "";
    if (rawUrl) {
      previewImg.src = rawUrl.startsWith("/") ? rawUrl.replace(/^\/+/, "") : rawUrl;
      previewImg.style.display = "block";
    } else {
      previewImg.style.display = "none";
    }
  }

  // 1. WhatsApp Share
  const waBtn = $("#share-whatsapp-btn");
  if (waBtn) {
    waBtn.onclick = () => {
      const text = `📖 *${note.title}* (${note.subject})\nHigh-yield visual revision notes for Govt Exams!\n🔗 ${shareUrl}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      trackInteraction("share", { noteId: note.id, platform: "whatsapp" });
    };
  }

  // 2. Telegram Share
  const tgBtn = $("#share-telegram-btn");
  if (tgBtn) {
    tgBtn.onclick = () => {
      const text = `📖 ${note.title} (${note.subject}) - Free AI Govt Exam Notes`;
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
      window.open(tgUrl, "_blank", "noopener,noreferrer");
      trackInteraction("share", { noteId: note.id, platform: "telegram" });
    };
  }

  // 3. Twitter / X Share
  const twBtn = $("#share-twitter-btn");
  if (twBtn) {
    twBtn.onclick = () => {
      const text = `📖 ${note.title} (${note.subject}) - Visual Revision Notes for Govt Exams:`;
      const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(twUrl, "_blank", "noopener,noreferrer");
      trackInteraction("share", { noteId: note.id, platform: "twitter" });
    };
  }

  // 4. Native Device Share Sheet
  const nativeBtn = $("#share-native-btn");
  if (nativeBtn) {
    nativeBtn.onclick = () => {
      if (navigator.share) {
        navigator.share({
          title: `${note.title} - Free AI Govt Exam Notes`,
          text: `📖 ${note.title} (${note.subject}) - High-yield visual exam revision note`,
          url: shareUrl
        }).then(() => {
          trackInteraction("share", { noteId: note.id, platform: "native" });
        }).catch(() => {});
      } else {
        copyShareLink(shareUrl);
      }
    };
  }

  // 5. Copy Link Button
  const copyBtn = $("#share-copy-btn");
  if (copyBtn) {
    copyBtn.onclick = () => copyShareLink(shareUrl);
  }

  try {
    shareDialog.showModal();
  } catch {
    shareDialog.setAttribute("open", "");
  }
}

function copyShareLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast("Direct note link copied to clipboard! 📋", "success");
    const copyBtnText = $("#share-copy-text");
    if (copyBtnText) copyBtnText.textContent = "Copied! ✓";
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "Copy Link";
    }, 2200);
  }).catch(() => {
    const input = $("#share-link-input");
    if (input) {
      input.select();
      document.execCommand("copy");
      showToast("Direct note link copied to clipboard! 📋", "success");
    }
  });
}

function checkDeepLinkedNote() {
  try {
    const params = new URLSearchParams(window.location.search);
    const noteId = params.get("note") || params.get("id");
    if (noteId) {
      const idx = currentFilteredList.findIndex(n => n.id === noteId);
      if (idx >= 0) {
        setTimeout(() => openLightbox(idx), 150);
      } else {
        const found = notes.find(n => n.id === noteId);
        if (found) {
          currentFilteredList = [found];
          render();
          setTimeout(() => openLightbox(0), 150);
        }
      }
    }
  } catch {}
}

// ==========================================
// 9.5 Unified Tag Search & Demand Tracking
// ==========================================
function searchByTag(tag) {
  if (!tag) return;
  const cleanTag = String(tag).trim().replace(/^#/, "");
  if (!cleanTag) return;

  // 1. Reset specific category to 'All Notes' if needed so notes across all subjects are discovered
  if (currentView !== "notes") {
    currentView = "notes";
    document.querySelectorAll(".nav-link, .mobile-nav-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.view === "notes");
    });
  }

  // 2. Populate Search Bar with hashtag
  const searchInput = $("#note-search");
  if (searchInput) {
    searchInput.value = `#${cleanTag}`;
    const clearBtn = $("#clear-search");
    if (clearBtn) clearBtn.hidden = false;
  }

  // 3. Set active tag state
  activeTag = cleanTag;
  currentPage = 1;

  // 4. Close Lightbox modal if open
  const lightboxDialog = $("#lightbox-dialog");
  if (lightboxDialog && lightboxDialog.open) {
    try { lightboxDialog.close(); } catch { lightboxDialog.removeAttribute("open"); }
  }

  // 5. Update tag pills active state
  updatePopularTags();

  // 6. Render filtered notes immediately
  render();

  // 7. Track search interaction in telemetry for Search Demands log
  trackInteraction("search", { query: `#${cleanTag}`, tag: cleanTag });

  // 8. If no notes match, log as missing search demand for admin
  if (currentFilteredList.length === 0) {
    trackInteraction("missing_search", { query: `#${cleanTag}`, resultCount: 0 });
  }

  // 9. Smoothly scroll directly to the search box (not the top heading) and focus it
  const searchBox = document.querySelector(".search-box") || document.querySelector(".toolbar");
  if (searchBox) {
    searchBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  setTimeout(() => {
    searchInput?.focus({ preventScroll: true });
  }, 200);

  showToast(`🔍 Searching notes tagged with #${cleanTag}`, "info");
}

// ==========================================
// 10. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  initTheme();

  // Handle URL hash changes (e.g. #bookmarks, #recent)
  window.addEventListener("hashchange", handleUrlHash);

  // Desktop Navigation
  $$(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Mobile Bottom Navigation
  $$(".mobile-nav-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Desktop Sidebar Categories
  $$(".category").forEach(btn => {
    btn.addEventListener("click", () => selectCategory(btn.dataset.category));
  });

  // Mobile Category Pill Strip
  $$(".cat-pill").forEach(btn => {
    btn.addEventListener("click", () => selectCategory(btn.dataset.category));
  });

  // Popular Tags Clicks (Sidebar, Card Note Chips & Lightbox Tag Chips)
  document.addEventListener("click", e => {
    // 1. Tag pill in sidebar / popular strip
    const tagEl = e.target.closest(".tag-pill[data-tag]") || (e.target.closest("[data-tag]") && !e.target.closest(".note-card"));
    if (tagEl) {
      e.preventDefault();
      const tag = tagEl.dataset.tag;
      if (activeTag === tag && $("#note-search")?.value) {
        // Toggle off if clicked again
        activeTag = null;
        if ($("#note-search")) $("#note-search").value = "";
        currentPage = 1;
        updatePopularTags();
        render();
      } else {
        searchByTag(tag);
      }
      return;
    }

    // 2. Note card tag chip
    const noteTagChip = e.target.closest(".note-tags-row .note-tag-chip") || e.target.closest(".note-tag-chip[data-tag]");
    if (noteTagChip) {
      e.stopPropagation();
      e.preventDefault();
      const tag = noteTagChip.dataset.tag;
      searchByTag(tag);
      return;
    }

    // 3. Lightbox tag clicked
    const lightboxTag = e.target.closest("[data-filter-tag]");
    if (lightboxTag) {
      e.stopPropagation();
      e.preventDefault();
      const tag = lightboxTag.dataset.filterTag;
      searchByTag(tag);
      return;
    }
  });

  // Search Input with Telemetry & Missing Demands Tracking
  let searchDebounceTimer = null;
  let missingSearchDebounceTimer = null;
  const searchInput = $("#note-search");
  const clearSearchBtn = $("#clear-search");

  function syncClearSearchBtn() {
    if (clearSearchBtn && searchInput) {
      clearSearchBtn.hidden = !searchInput.value.trim();
    }
  }

  searchInput?.addEventListener("input", () => {
    syncClearSearchBtn();
    const query = (searchInput.value || "").trim();
    if (!query) {
      activeTag = null;
      updatePopularTags();
    } else if (query.startsWith("#")) {
      activeTag = query.slice(1).trim();
      updatePopularTags();
    } else {
      activeTag = null;
      updatePopularTags();
    }
    currentPage = 1;
    render();
    clearTimeout(searchDebounceTimer);
    clearTimeout(missingSearchDebounceTimer);
    if (query.length >= 2) {
      searchDebounceTimer = setTimeout(() => {
        trackInteraction("search", { query });
      }, 700);

      // If search returns 0 matching notes (unavailable data), log as missing search demand!
      missingSearchDebounceTimer = setTimeout(() => {
        if (currentFilteredList.length === 0) {
          trackInteraction("missing_search", { query, resultCount: 0 });
        }
      }, 1100);
    }
  });

  // Clear Search
  clearSearchBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    syncClearSearchBtn();
    activeTag = null;
    currentPage = 1;
    updatePopularTags();
    render();
    searchInput?.focus();
  });

  // Sort Dropdown
  $("#sort-notes")?.addEventListener("change", () => {
    currentPage = 1;
    render();
  });

  // Grid / List View Toggle
  const gridBtn = $("#grid-view-btn") || $("#view-grid");
  const listBtn = $("#list-view-btn") || $("#view-list");

  gridBtn?.addEventListener("click", () => {
    viewMode = "grid";
    localStorage.setItem("exam_notes_view", "grid");
    render();
  });

  listBtn?.addEventListener("click", () => {
    viewMode = "list";
    localStorage.setItem("exam_notes_view", "list");
    render();
  });

  // Sidebar Collapse / Hide Toggle
  const appShell = $(".app-shell");
  const hideSidebarBtn = $("#hide-categories-btn");
  const showSidebarBtn = $("#show-categories-btn");

  const isSidebarHidden = localStorage.getItem("exam_sidebar_hidden") === "true";
  if (isSidebarHidden && appShell) {
    appShell.classList.add("sidebar-hidden");
    if (showSidebarBtn) showSidebarBtn.hidden = false;
  }

  hideSidebarBtn?.addEventListener("click", () => {
    if (appShell) {
      appShell.classList.add("sidebar-hidden");
      if (showSidebarBtn) showSidebarBtn.hidden = false;
      localStorage.setItem("exam_sidebar_hidden", "true");
      showToast("Categories sidebar hidden. Tap '📂 Categories ▸' to restore.", "info");
    }
  });

  showSidebarBtn?.addEventListener("click", () => {
    if (appShell) {
      appShell.classList.remove("sidebar-hidden");
      if (showSidebarBtn) showSidebarBtn.hidden = true;
      localStorage.setItem("exam_sidebar_hidden", "false");
      showToast("Categories sidebar restored.", "info");
    }
  });

  // Pagination Clicks Delegation
  $("#pagination-controls")?.addEventListener("click", e => {
    const pageBtn = e.target.closest(".page-btn[data-page]");
    if (!pageBtn || pageBtn.disabled) return;

    const targetPage = Number(pageBtn.dataset.page);
    if (!targetPage || targetPage === currentPage) return;

    currentPage = targetPage;
    render();

    const targetElem = document.querySelector("#notes") || document.querySelector(".content");
    if (targetElem) {
      targetElem.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Note Card Clicks (Open Lightbox, Share, or Bookmark)
  $("#notes-grid")?.addEventListener("click", e => {
    const shareBtn = e.target.closest("[data-share]");
    if (shareBtn) {
      e.stopPropagation();
      e.preventDefault();
      openShareModal(shareBtn.dataset.share);
      return;
    }

    const bookmarkBtn = e.target.closest("[data-bookmark]");
    if (bookmarkBtn) {
      e.stopPropagation();
      e.preventDefault();
      toggleBookmark(bookmarkBtn.dataset.bookmark, e);
      return;
    }

    const card = e.target.closest(".note-card");
    if (card) {
      const idx = Number(card.dataset.index);
      openLightbox(idx);
    }
  });

  // Keyboard navigation on cards
  $("#notes-grid")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".note-card");
      if (card) {
        e.preventDefault();
        const idx = Number(card.dataset.index);
        openLightbox(idx);
      }
    }
  });

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

  const lightboxDialog = $("#lightbox-dialog");
  $("#lightbox-prev-btn")?.addEventListener("click", prevLightbox);
  $("#lightbox-next-btn")?.addEventListener("click", nextLightbox);
  $("#lightbox-close-btn")?.addEventListener("click", closeLightbox);

  lightboxDialog?.addEventListener("close", () => {
    clearNoteUrlParam();
  });
  lightboxDialog?.addEventListener("cancel", () => {
    clearNoteUrlParam();
  });
  lightboxDialog?.addEventListener("click", (e) => {
    if (e.target === lightboxDialog) {
      closeLightbox();
    }
  });

  $("#lightbox-bookmark-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentLightboxIndex >= 0 && currentLightboxIndex < currentFilteredList.length) {
      const note = currentFilteredList[currentLightboxIndex];
      toggleBookmark(note.id, e);
      updateLightboxContent(note);
    }
  });

  $("#share-dialog-close")?.addEventListener("click", () => {
    $("#share-dialog")?.close();
  });

  $("#lightbox-download-btn")?.addEventListener("click", () => {
    if (currentLightboxIndex >= 0 && currentLightboxIndex < currentFilteredList.length) {
      const note = currentFilteredList[currentLightboxIndex];
      trackInteraction("download", { noteId: note.id });
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

  // Reset Filters Link
  $("#reset-filters-btn")?.addEventListener("click", () => {
    category = "All Notes";
    activeTag = null;
    if (searchInput) searchInput.value = "";
    selectCategory("All Notes");
  });
}

// Instant Branding & Profile Hydration
function applyProfileState(p) {
  if (!p) return;
  if (p.logoUrl) {
    document.querySelectorAll(".brand-logo").forEach(img => {
      img.style.display = "block";
      img.src = p.logoUrl;
    });
  }
  if (p.avatarUrl) {
    document.querySelectorAll(".avatar-img").forEach(img => {
      img.style.display = "block";
      img.src = p.avatarUrl;
      if (img.nextElementSibling) img.nextElementSibling.style.display = "none";
    });
  }
  if (p.name) {
    document.querySelectorAll(".creator-name").forEach(el => el.textContent = p.name);
  }
  if (p.role) {
    document.querySelectorAll(".creator-role-title").forEach(el => el.textContent = p.role);
  }
  if (p.bio) {
    const bioEl = document.querySelector(".creator-bio");
    if (bioEl) bioEl.textContent = `"${p.bio}"`;
  }
  if (p.instagram) {
    const igHandle = p.instagram.replace(/^@/, "");
    document.querySelectorAll(".ig-qr-handle").forEach(el => el.textContent = `@${igHandle}`);
    document.querySelectorAll(".ig-handle-text").forEach(el => el.textContent = `Instagram @${igHandle}`);
    document.querySelectorAll(".ig-follow-btn-link").forEach(el => {
      el.href = `https://www.instagram.com/${igHandle}/`;
    });
  }
  if (p.instagramQrUrl) {
    document.querySelectorAll(".ig-qr-img").forEach(img => {
      img.src = p.instagramQrUrl;
    });
  }
}

function initBranding() {
  const saved = localStorage.getItem("exam_admin_profile_data");
  if (saved) {
    try {
      applyProfileState(JSON.parse(saved));
    } catch {}
  }

  fetch("/api/admin/profile")
    .then(r => r.json())
    .then(d => {
      if (d && d.profile) {
        localStorage.setItem("exam_admin_profile_data", JSON.stringify(d.profile));
        applyProfileState(d.profile);
      }
    })
    .catch(() => {});
}

// ==========================================
// Student Google Auto-Authentication & Sync Engine
// ==========================================
let currentStudentUser = null;

async function sendStudentTelemetry(type, meta = {}) {
  const token = localStorage.getItem("exam_student_token") || "";
  const studentId = currentStudentUser?.id || "";

  // Locally update student metrics instantly
  if (currentStudentUser) {
    if (type === "view") currentStudentUser.viewsCount = (currentStudentUser.viewsCount || 0) + 1;
    else if (type === "like" && meta.noteId) {
      if (!Array.isArray(currentStudentUser.likes)) currentStudentUser.likes = [];
      const hasNote = currentStudentUser.likes.some(l => (typeof l === "object" ? l.noteId : l) === meta.noteId);
      if (!hasNote) currentStudentUser.likes.push({ noteId: meta.noteId, timestamp: new Date().toISOString() });
      currentStudentUser.likesCount = currentStudentUser.likes.length;
    }
    else if (type === "unlike" && meta.noteId) {
      if (Array.isArray(currentStudentUser.likes)) {
        currentStudentUser.likes = currentStudentUser.likes.filter(l => (typeof l === "object" ? l.noteId : l) !== meta.noteId);
      }
      currentStudentUser.likesCount = (currentStudentUser.likes || []).length;
    }
    else if (type === "download") currentStudentUser.downloadsCount = (currentStudentUser.downloadsCount || 0) + 1;
    else if (type === "share") currentStudentUser.sharesCount = (currentStudentUser.sharesCount || 0) + 1;

    updateStudentAuthUi(currentStudentUser, false);
  }

  try {
    const res = await fetch("/api/user/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-student-token": token,
        "x-student-id": studentId
      },
      body: JSON.stringify({ type, ...meta })
    });
    const data = await res.json();
    if (data && data.success && currentStudentUser) {
      if (typeof data.likesCount === "number") currentStudentUser.likesCount = data.likesCount;
      if (typeof data.viewsCount === "number") currentStudentUser.viewsCount = data.viewsCount;
      if (typeof data.downloadsCount === "number") currentStudentUser.downloadsCount = data.downloadsCount;
      if (typeof data.sharesCount === "number") currentStudentUser.sharesCount = data.sharesCount;
      updateStudentAuthUi(currentStudentUser, false);
    }
  } catch {}
}

function updateStudentAuthUi(user, syncBookmarksFromUser = true) {
  currentStudentUser = user;
  const signinBtn = $("#student-signin-btn");
  const profilePill = $("#student-profile-pill");
  const avatarImg = $("#student-avatar-img");
  const menuName = $("#student-menu-name");
  const menuEmail = $("#student-menu-email");
  const menuTargetExam = $("#student-menu-target-exam");
  const menuBookmarksCount = $("#student-menu-bookmarks-count");
  const menuViewsCount = $("#student-menu-views-count");
  const bookmarkBadge = $("#bookmark-badge");

  if (user) {
    try {
      localStorage.setItem("exam_student_user", JSON.stringify(user));
    } catch {}

    if (signinBtn) signinBtn.hidden = true;
    if (profilePill) profilePill.hidden = false;
    if (avatarImg) {
      avatarImg.src = user.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.email)}`;
      avatarImg.alt = user.name || "Student Profile";
    }
    if (menuName) menuName.textContent = user.name || "Student User";
    if (menuEmail) menuEmail.textContent = user.email || "";
    if (menuTargetExam) {
      menuTargetExam.textContent = user.targetExam ? (user.targetExam + (user.targetExamDetail ? ` (${user.targetExamDetail})` : "")) : "Not Set";
    }

    if (syncBookmarksFromUser) {
      const userLikedIds = new Set();
      (user.likes || []).forEach(l => {
        const id = typeof l === "object" ? l.noteId : l;
        if (id) userLikedIds.add(id);
      });
      (user.bookmarks || []).forEach(bId => {
        if (bId) userLikedIds.add(bId);
      });

      bookmarks = new Set(userLikedIds);
      localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
    }

    if (menuBookmarksCount) menuBookmarksCount.textContent = bookmarks.size;
    if (menuViewsCount) menuViewsCount.textContent = user.viewsCount || 0;
    if (bookmarkBadge) bookmarkBadge.textContent = bookmarks.size;
  } else {
    try {
      localStorage.removeItem("exam_student_user");
    } catch {}

    if (signinBtn) signinBtn.hidden = false;
    if (profilePill) profilePill.hidden = true;

    bookmarks.clear();
    localStorage.removeItem("exam_notes_bookmarks");
    if (bookmarkBadge) bookmarkBadge.textContent = "0";
    if (menuBookmarksCount) menuBookmarksCount.textContent = "0";
  }
}

function renderGoogleGsiButton() {
  const btnContainer = $("#google-gsi-btn-container");
  if (!btnContainer || !window.google?.accounts?.id) return;
  btnContainer.innerHTML = "";
  
  const targetWidth = Math.min(Math.max(window.innerWidth - 64, 220), 280);
  try {
    window.google.accounts.id.renderButton(btnContainer, {
      theme: "filled_blue",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: targetWidth,
      logo_alignment: "left"
    });
  } catch (err) {
    console.warn("[Google GSI] renderButton error:", err);
  }
}

function openStudentAuthModal() {
  const dialog = $("#student-auth-dialog");
  if (!dialog) return;
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
  
  setTimeout(() => {
    if (window.google?.accounts?.id) {
      renderGoogleGsiButton();
      if (!currentStudentUser) {
        try { window.google.accounts.id.prompt(); } catch {}
      }
    } else {
      tryInitGsi().then(() => renderGoogleGsiButton());
    }
  }, 60);
}

function openExamGoalModal(user = currentStudentUser) {
  const dialog = $("#student-exam-goal-dialog");
  if (!dialog) return;

  const currentGoal = user?.targetExam || "";
  const currentDetail = user?.targetExamDetail || "";
  const form = $("#student-exam-goal-form");
  const customWrap = $("#custom-exam-wrap");
  const customInput = $("#custom-exam-input");

  if (form) form.reset();
  if (customWrap) customWrap.hidden = true;

  if (currentGoal) {
    const radio = form?.querySelector(`input[name="target_exam_radio"][value="${currentGoal}"]`);
    if (radio) radio.checked = true;
    if (currentGoal === "Others" && customWrap && customInput) {
      customWrap.hidden = false;
      customInput.value = currentDetail;
    }
  }

  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
}

async function checkCurrentStudentSession() {
  const token = localStorage.getItem("exam_student_token");
  if (!token) {
    updateStudentAuthUi(null);
    return;
  }

  try {
    const res = await fetch("/api/auth/me", {
      headers: {
        "x-student-token": token,
        "x-student-id": currentStudentUser?.id || ""
      },
      credentials: "same-origin"
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        updateStudentAuthUi(data.user);
      } else {
        localStorage.removeItem("exam_student_token");
        localStorage.removeItem("exam_student_user");
        updateStudentAuthUi(null);
      }
    } else if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("exam_student_token");
      localStorage.removeItem("exam_student_user");
      updateStudentAuthUi(null);
    }
  } catch (err) {
    console.warn("[Student Auth] Session check deferred:", err);
  }
}

async function handleStudentGoogleLogin(responsePayload) {
  try {
    showToast("Authenticating with Google...", "info");
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: responsePayload.credential })
    });

    const data = await res.json();
    if (data && data.success && data.user) {
      if (data.token) {
        localStorage.setItem("exam_student_token", data.token);
      }
      updateStudentAuthUi(data.user);

      const authDialog = $("#student-auth-dialog");
      if (authDialog) authDialog.close();

      if (pendingLikeNoteId) {
        const noteToLike = pendingLikeNoteId;
        pendingLikeNoteId = null;
        bookmarks.add(noteToLike);
        localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
        sendStudentTelemetry("like", { noteId: noteToLike });
        showToast("Note saved to your account! ❤️", "success");
      }

      showToast(`Welcome, ${data.user.name || "Student"}! Cloud sync active.`, "success");

      if (!data.user.targetExam) {
        setTimeout(() => {
          openExamGoalModal(data.user);
        }, 600);
      }

      render();
    } else {
      showToast(data?.error || "Google Sign-In failed.", "error");
    }
  } catch (err) {
    showToast("Network error during Google Sign-In.", "error");
  }
}

async function tryInitGsi() {
  if (window.google?.accounts?.id) {
    try {
      let clientId = window.__GOOGLE_CLIENT_ID;
      if (!clientId) {
        const cfg = await api("/api/auth/google/config").catch(() => ({}));
        clientId = cfg.clientId;
      }
      if (!clientId) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleStudentGoogleLogin,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      if (!currentStudentUser) {
        try { window.google.accounts.id.prompt(); } catch {}
      }
    } catch (e) {
      console.warn("[Google Auth] Init error:", e);
    }
  }
};

function initStudentAuth() {
  // Instant Session Hydration from localStorage Cache
  try {
    const cachedUserStr = localStorage.getItem("exam_student_user");
    const cachedToken = localStorage.getItem("exam_student_token");
    if (cachedUserStr && cachedToken) {
      const cachedUser = JSON.parse(cachedUserStr);
      if (cachedUser && cachedUser.id) {
        updateStudentAuthUi(cachedUser, false);
      }
    }
  } catch {}

  checkCurrentStudentSession();

  $("#student-signin-btn")?.addEventListener("click", () => {
    openStudentAuthModal();
  });

  $("#student-auth-close-btn")?.addEventListener("click", () => {
    $("#student-auth-dialog")?.close();
  });

  $("#student-change-goal-btn")?.addEventListener("click", () => {
    const dropdownMenu = $("#student-dropdown-menu");
    if (dropdownMenu) dropdownMenu.hidden = true;
    openExamGoalModal(currentStudentUser);
  });

  $("#exam-goal-close-btn")?.addEventListener("click", () => {
    $("#student-exam-goal-dialog")?.close();
  });

  const examRadios = $$(`input[name="target_exam_radio"]`);
  examRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      const customWrap = $("#custom-exam-wrap");
      const customInput = $("#custom-exam-input");
      if (radio.value === "Others") {
        if (customWrap) customWrap.hidden = false;
        if (customInput) customInput.focus();
      } else {
        if (customWrap) customWrap.hidden = true;
      }
    });
  });

  $("#student-exam-goal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedRadio = document.querySelector(`input[name="target_exam_radio"]:checked`);
    if (!selectedRadio) {
      showToast("Please select your target examination.", "warning");
      return;
    }

    const targetExam = selectedRadio.value;
    const customInput = $("#custom-exam-input");
    const targetExamDetail = targetExam === "Others" && customInput ? customInput.value.trim() : "";
    const token = localStorage.getItem("exam_student_token") || "";
    const studentId = currentStudentUser?.id || "";

    try {
      const res = await fetch("/api/user/exam-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-student-token": token,
          "x-student-id": studentId
        },
        body: JSON.stringify({ targetExam, targetExamDetail })
      });
      const data = await res.json();
      if (data && data.success && data.user) {
        if (currentStudentUser) {
          currentStudentUser.targetExam = data.user.targetExam;
          currentStudentUser.targetExamDetail = data.user.targetExamDetail;
          updateStudentAuthUi(currentStudentUser);
        }
        $("#student-exam-goal-dialog")?.close();
        showToast(`🎯 Preparation Goal set to ${targetExam}!`, "success");
      } else {
        showToast(data?.error || "Could not save exam goal.", "error");
      }
    } catch {
      showToast("Unable to save exam goal right now.", "error");
    }
  });

  const profileBtn = $("#student-profile-btn");
  const dropdownMenu = $("#student-dropdown-menu");
  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdownMenu) {
      dropdownMenu.hidden = !dropdownMenu.hidden;
      profileBtn.setAttribute("aria-expanded", String(!dropdownMenu.hidden));
    }
  });

  document.addEventListener("click", (e) => {
    if (dropdownMenu && !dropdownMenu.hidden && !e.target.closest("#student-auth-wrap")) {
      dropdownMenu.hidden = true;
      profileBtn?.setAttribute("aria-expanded", "false");
    }
  });

  $("#student-menu-bookmarks")?.addEventListener("click", () => {
    if (dropdownMenu) dropdownMenu.hidden = true;
    switchView("bookmarks");
  });

  $("#student-menu-history")?.addEventListener("click", () => {
    if (dropdownMenu) dropdownMenu.hidden = true;
    switchView("notes");
    showToast(`Viewing study history (${currentStudentUser?.viewsCount || 0} notes studied)`, "info");
  });

  $("#student-signout-btn")?.addEventListener("click", async () => {
    const token = localStorage.getItem("exam_student_token") || "";
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-student-token": token }
      });
    } catch {}
    localStorage.removeItem("exam_student_token");
    localStorage.removeItem("exam_notes_bookmarks");
    bookmarks.clear();
    updateStudentAuthUi(null);
    if (dropdownMenu) dropdownMenu.hidden = true;
    showToast("Signed out successfully. Saved notes reset for this device.", "info");
    render();
  });

  if (window.google) {
    tryInitGsi();
  } else {
    window.addEventListener("load", tryInitGsi);
  }
}

// Start Application
initBranding();
setupEventListeners();
initStudentAuth();
loadNotes();

// ==========================================
// Real-Time Student Presence Heartbeat
// ==========================================
(function initHeartbeat() {
  let sessionId = sessionStorage.getItem("exam_visitor_session_id");
  if (!sessionId) {
    sessionId = "s_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now().toString(36);
    sessionStorage.setItem("exam_visitor_session_id", sessionId);
  }

  function sendHeartbeat(isLeave = false) {
    if (isLeave) {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/heartbeat?leave=true", JSON.stringify({ sessionId }));
      }
      return;
    }
    fetch("/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    }).catch(() => {});
  }

  // Initial heartbeat
  sendHeartbeat(false);

  // Periodic heartbeat every 45s when page is active
  setInterval(() => {
    if (!document.hidden) {
      sendHeartbeat(false);
    }
  }, 45000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      sendHeartbeat(false);
    }
  });

  window.addEventListener("beforeunload", () => {
    sendHeartbeat(true);
  });
})();
