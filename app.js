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

// Local Storage Collections (Active for authenticated users)
let bookmarks = new Set(
  localStorage.getItem("exam_student_user") || localStorage.getItem("exam_student_token")
    ? JSON.parse(localStorage.getItem("exam_notes_bookmarks") || "[]")
    : []
);
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
  return num.toString();
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
  const loadStartTime = Date.now();
  let serverNotes = [];

  // 1. Instant Cache-First Hydration (0ms instant render for returning students)
  if (!notes || notes.length === 0) {
    try {
      const cachedNotes = JSON.parse(localStorage.getItem("exam_notes_cache_v2") || "[]");
      if (Array.isArray(cachedNotes) && cachedNotes.length > 0) {
        notes = cachedNotes;
        if (typeof applyFiltersAndRender === "function") {
          applyFiltersAndRender(false);
        }
      } else if ($("#notes-grid")) {
        renderSkeletonGrid(6);
      }
    } catch {
      if ($("#notes-grid")) renderSkeletonGrid(6);
    }
  }

  // 2. High-Speed Concurrent Fetching (Parallel Network Requests)
  try {
    const [notesFetch, meFetch, interFetch] = await Promise.allSettled([
      fetch(`/api/notes?_t=${Date.now()}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/admin/me?_t=${Date.now()}`).then(r => r.ok ? r.json() : { admin: false }),
      fetch(`/api/interactions?_t=${Date.now()}`).then(r => r.ok ? r.json() : null)
    ]);

    let notesData = notesFetch.status === "fulfilled" ? notesFetch.value : null;

    // Fall back to static data/notes.json for mobile devices & static cloud hosting if API is unreachable
    if (!notesData || !Array.isArray(notesData.notes) || notesData.notes.length === 0) {
      try {
        const staticRes = await fetch(`data/notes.json?_t=${Date.now()}`);
        if (staticRes.ok) {
          const raw = await staticRes.json();
          notesData = { notes: Array.isArray(raw) ? raw : (raw.notes || []) };
        }
      } catch {}
    }

    serverNotes = (notesData && notesData.notes) || [];
    isAdmin = Boolean(meFetch.status === "fulfilled" && meFetch.value && meFetch.value.admin);
    if (interFetch.status === "fulfilled" && interFetch.value) {
      noteInteractions = interFetch.value;
    }

    // Cache latest notes for instant 0ms retrieval on future page loads
    if (serverNotes.length > 0) {
      try {
        localStorage.setItem("exam_notes_cache_v2", JSON.stringify(serverNotes));
      } catch {}
    }
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
  fetch("/api/visits/track", { method: "POST" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        localStorage.setItem("exam_notes_local_visits", String(data.count || 0));
        localStorage.setItem("exam_notes_local_visits_today", String(data.today || 0));
      }
    })
    .catch(() => {});

  // Ensure a smooth minimum window (400ms) on initial load so the luminous wave effect is clearly perceptible
  const loadElapsed = Date.now() - loadStartTime;
  if (loadElapsed < 400) {
    await new Promise(resolve => setTimeout(resolve, 400 - loadElapsed));
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

function renderSkeletonGrid(count = 6) {
  const notesGrid = $("#notes-grid");
  if (!notesGrid) return;
  notesGrid.className = `notes-grid ${viewMode === "list" ? "list-view" : ""}`;
  notesGrid.innerHTML = Array.from({ length: count }, (_, i) => `
    <article class="note-card skeleton-card" style="--card-index: ${i};" aria-hidden="true">
      <div class="card-media skeleton-shimmer"></div>
      <div class="note-content">
        <div class="skeleton-chip skeleton-shimmer"></div>
        <div class="skeleton-title skeleton-shimmer"></div>
        <div class="skeleton-title skeleton-title-short skeleton-shimmer"></div>
        <div class="skeleton-meta skeleton-shimmer"></div>
      </div>
    </article>
  `).join("");
}

function renderCardMedia(note, pIndex = 0) {
  if (note.imageUrl) {
    const isLcp = pIndex < 2;
    const loadingAttr = isLcp ? 'loading="eager"' : 'loading="lazy"';
    const priorityAttr = isLcp ? 'fetchpriority="high"' : '';
    return `
      <div class="card-media skeleton-shimmer">
        <img class="note-image is-loading" src="${note.imageUrl}" alt="${escapeHtml(note.title)}" ${loadingAttr} decoding="async" ${priorityAttr} onload="this.classList.remove('is-loading'); this.parentElement?.classList.remove('skeleton-shimmer');" onerror="this.parentElement?.classList.remove('skeleton-shimmer'); handleNoteImageError(this, '${note.id}', '${note.imageUrl}', '${escapeHtml(note.title)}', '${escapeHtml(note.subject)}')">
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
        (n.title || "").toLowerCase().includes(tagLower);
      if (!matchTag) return false;
    }

    // Search query filter: search ONLY based on title and tags (not subject)
    if (searchTerm) {
      const cleanSearch = searchTerm.startsWith("#") ? searchTerm.slice(1).trim() : searchTerm;
      if (cleanSearch) {
        const titleMatch = (n.title || "").toLowerCase().includes(cleanSearch);
        const tagsMatch = (n.tags || []).some(t => t.toLowerCase().includes(cleanSearch));
        if (!titleMatch && !tagsMatch) return false;
      }
    }

    return true;
  });

  // Sorting
  if (sortOption === "title") {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortOption === "oldest") {
    list.sort((a, b) => (new Date(a.createdAt || a.date || 0)) - (new Date(b.createdAt || b.date || 0)));
  } else if (sortOption === "views" || sortOption === "most-viewed") {
    list.sort((a, b) => {
      const diff = getNoteViews(b.id) - getNoteViews(a.id);
      if (diff !== 0) return diff;
      return (new Date(b.createdAt || b.date || 0)) - (new Date(a.createdAt || a.date || 0));
    });
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

        const tagsList = (n.tags || []).map(t =>
          `<span class="note-tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${escapeHtml(t)}</span>`
        ).join("");

        const tagsHtml = tagsList ? `<div class="note-tags-row">${tagsList}</div>` : '';

        return `
          <article class="note-card" style="--card-index: ${pIndex};" data-note-id="${n.id}" data-index="${fullIndex}" tabindex="0" role="button" aria-label="${escapeHtml(n.title)}">
            <button class="card-bookmark-btn ${isBookmarked ? "bookmarked" : ""}" data-bookmark="${n.id}" type="button" title="${isBookmarked ? "Remove from Saved" : "Like & Save Note"}" aria-label="Like Note">
              ${isBookmarked ? "❤️" : "🤍"}
            </button>
            ${renderCardMedia(n, pIndex)}
            <div class="note-content">
              <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
              <h3 class="note-title">${escapeHtml(n.title)}</h3>
              ${tagsHtml}
              <div class="note-meta">
                <span class="note-views-badge" title="${viewsCount} views">
                  <svg class="views-eye-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <span class="views-badge-text">${viewsFormatted}</span>
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

  // Update Bookmarks Counter Badge across desktop and mobile bottom nav
  updateBookmarkBadges();
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
      setTimeout(initAboutScrollReveal, 60);
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
  // Likes, unlikes, and downloads are strictly restricted to Google authenticated users
  if ((type === "like" || type === "unlike" || type === "download") && !currentStudentUser) {
    return;
  }

  const token = localStorage.getItem("exam_student_token") || "";
  const studentId = currentStudentUser?.id || "";

  try {
    fetch("/api/interactions/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-student-token": token,
        "x-student-id": studentId
      },
      body: JSON.stringify({ type, ...payload })
    }).catch(() => {});
  } catch (e) {}

  // Sync with student user telemetry
  if (currentStudentUser) {
    sendStudentTelemetry(type, payload);
  }

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
let pendingDownloadNote = null;

function triggerNoteDownload(note) {
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

    trackInteraction("download", { noteId: note.id });
    sendStudentTelemetry("download", { noteId: note.id });
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

      // 1. Draw original diagram completely untouched
      ctx.drawImage(img, 0, 0, width, height);

      // 2. Draw watermark bottom bar
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, height, width, bannerHeight);

      // Top glowing accent divider
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(0, height, width, Math.max(2, Math.round(bannerHeight * 0.045)));

      // 3. Domain & Branding text
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
      console.warn("Canvas watermark error, trying proxy fallback:", err);
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

function updateBookmarkButtonsInPlace(noteId) {
  const isLiked = bookmarks.has(noteId);
  // 1. Update all card bookmark buttons in grid
  document.querySelectorAll(`[data-bookmark="${noteId}"]`).forEach(btn => {
    btn.classList.toggle("bookmarked", isLiked);
    btn.textContent = isLiked ? "❤️" : "🤍";
    btn.title = isLiked ? "Remove from Saved" : "Like & Save Note";
    btn.setAttribute("aria-label", isLiked ? "Remove from Saved" : "Like Note");
  });

  // 2. Update lightbox bookmark button if open for this note
  const currentLightboxNote = currentFilteredList && currentFilteredList[currentLightboxIndex];
  if (currentLightboxNote && currentLightboxNote.id === noteId) {
    const bookmarkBtn = $("#lightbox-bookmark-btn");
    const bookmarkLabel = $("#lightbox-bookmark-label");
    if (bookmarkBtn) {
      bookmarkBtn.classList.toggle("active", isLiked);
      const iconSpan = bookmarkBtn.querySelector(".btn-icon");
      if (iconSpan) iconSpan.textContent = isLiked ? "❤️" : "🤍";
    }
    if (bookmarkLabel) {
      bookmarkLabel.textContent = isLiked ? "Liked / Saved" : "Bookmark Note";
    }
  }
}

function toggleBookmark(noteId, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  // 1. Mandatory Google Authentication Check
  if (!currentStudentUser) {
    pendingLikeNoteId = noteId;
    showToast("Please sign in with Google to like and save revision notes! 🔒", "info");
    openStudentAuthModal();
    return;
  }

  // 2. Authenticated user like/unlike toggle
  const isCurrentlyLiked = bookmarks.has(noteId);
  if (isCurrentlyLiked) {
    bookmarks.delete(noteId);
    trackInteraction("unlike", { noteId });
    showToast("Removed from Saved notes.", "info");

    localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
    updateBookmarkBadges(bookmarks.size);
    updateBookmarkButtonsInPlace(noteId);

    // If viewing the Saved Bookmarks page, animate out ONLY the unliked card
    if (currentView === "bookmarks") {
      const cardEl = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
      if (cardEl) {
        cardEl.classList.add("card-exiting");
        setTimeout(() => {
          const notesGrid = $("#notes-grid");
          if (notesGrid) {
            notesGrid.classList.add("no-entrance-anim");
          }
          render();
          setTimeout(() => {
            notesGrid?.classList.remove("no-entrance-anim");
          }, 60);
        }, 240);
      } else {
        render();
      }
      return;
    }
  } else {
    bookmarks.add(noteId);
    trackInteraction("like", { noteId });
    showToast("Saved to your Liked Notes! ❤️", "success");

    localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
    updateBookmarkBadges(bookmarks.size);
    updateBookmarkButtonsInPlace(noteId);

    // If on Saved page and liking (e.g. from lightbox)
    if (currentView === "bookmarks") {
      const notesGrid = $("#notes-grid");
      if (notesGrid) {
        notesGrid.classList.add("no-entrance-anim");
      }
      render();
      setTimeout(() => {
        notesGrid?.classList.remove("no-entrance-anim");
      }, 60);
      return;
    }
  }

  // NOTE: On regular "notes" page, we do NOT call render().
  // updateBookmarkButtonsInPlace(noteId) already updated the heart icon in-place with zero re-rendering,
  // preventing all other cards on the page from re-triggering entrance animations!
}

function updateBookmarkBadges(customCount = null) {
  const validBookmarksCount = customCount !== null
    ? customCount
    : [...bookmarks].filter(id => notes.some(n => n.id === id)).length;

  const countStr = validBookmarksCount.toString();
  document.querySelectorAll("#bookmark-badge, #mobile-bookmark-badge, #about-mobile-bookmark-badge, .mob-badge").forEach(el => {
    el.textContent = countStr;
  });
  const menuBookmarksCount = $("#student-menu-bookmarks-count");
  if (menuBookmarksCount) menuBookmarksCount.textContent = countStr;
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
    cardBadge.textContent = formatViewsCount(updatedCount);
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
  stopAudioNarration();
  resetAiAssistantChat();
  if (index < 0 || index >= currentFilteredList.length) return;
  currentLightboxIndex = index;
  const note = currentFilteredList[index];
  recordRecentView(note.id);

  updateLightboxContent(note);
  resetZoom();
  updateNoteUrlParam(note.id);

  const dialog = $("#lightbox-dialog");
  if (dialog) {
    const bodyScroll = dialog.querySelector(".lightbox-blog-body");
    if (bodyScroll) bodyScroll.scrollTop = 0;
    if (!dialog.open) {
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    }
  }
}

function closeLightbox() {
  stopAudioNarration();
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
// Indian Regional Language Translation Engine
// Supports Hindi (hi), Tamil (ta), Telugu (te), Malayalam (ml), Kannada (kn), English (en)
// ==========================================
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

async function renderNoteOverview(note, targetLang = "en") {
  stopAudioNarration();
  if (!note) return;
  const overviewEl = $("#lightbox-overview-text");
  if (!overviewEl) return;

  // Update language pills UI active state
  document.querySelectorAll(".translate-lang-btn").forEach(btn => {
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

    // Verify current note is still the active note before updating DOM
    if (currentFilteredList[currentLightboxIndex]?.id === note.id && currentTranslationLang === targetLang) {
      overviewEl.innerHTML = formatOverviewHtml(translatedText);
    }
  } catch (err) {
    if (currentFilteredList[currentLightboxIndex]?.id === note.id && currentTranslationLang === targetLang) {
      overviewEl.innerHTML = formatOverviewHtml(rawOverview);
    }
  }
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
// ==========================================
// 9.25 Web Speech API & Regional Audio Engine
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
    // Pause active audio
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
    // Resume active audio
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

  // Start fresh narration
  const title = $("#lightbox-title")?.textContent || "";
  const overviewEl = $("#lightbox-overview-text");
  const speechText = extractCleanSpeechText(title, overviewEl);

  if (!speechText) {
    if (typeof showToast === "function") {
      showToast("No study notes text found to read for this note.", "info");
    } else {
      alert("No text available to read.");
    }
    return;
  }

  stopAudioNarration();

  const targetLang = typeof currentTranslationLang !== "undefined" ? currentTranslationLang : "en";
  const hasNativeVoice = (targetLang === "en" || targetLang === "hi") && hasNativeBrowserVoice(targetLang);

  // If language lacks a native voice in user's browser (e.g. Tamil, Telugu, Malayalam, Kannada),
  // stream authentic native audio via HTML5 Audio
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

  // Use mobile-safe sentence chunking for native Web Speech API (English & Hindi)
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
    // Finished all chunks completely!
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
// 9.28 On-Device Local AI Study Assistant (Chrome Built-in AI / WebLLM)
// ==========================================
let detectedAiProvider = "cloud"; // "chrome-nano" | "webllm" | "cloud"
let isAiGenerating = false;

async function detectAiProvider() {
  const badge = $("#ai-engine-badge");
  const badgeText = $("#ai-engine-badge-text");
  if (!badge || !badgeText) return;

  // 1. Check for Chrome Built-in AI (Prompt API with Gemini Nano)
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

  // 2. Check for WebGPU (WebLLM compatibility)
  if (typeof navigator !== "undefined" && navigator.gpu) {
    detectedAiProvider = "webllm";
    badge.className = "ai-engine-badge badge-webllm";
    badgeText.textContent = "WebLLM (Local GPU)";
    badge.title = "Local WebGPU detected: ready for on-device AI inference";
    return;
  }

  // 3. High-Speed Free Cloud Relay
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

  // Headers
  html = html.replace(/^### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h3>$1</h3>");

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bullet points
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

  // Label for the user bubble
  let userLabel = userQuery;
  if (actionType === "explain_simple") userLabel = "💡 Explain this topic in simple terms";
  else if (actionType === "mnemonic") userLabel = "🧠 Give me a memory mnemonic trick";
  else if (actionType === "exam_questions") userLabel = "🎯 What are the probable exam questions?";
  else if (actionType === "key_takeaways") userLabel = "📝 Give me the key exam takeaways";

  if (!userLabel) return;

  // Append user bubble
  const userBubble = document.createElement("div");
  userBubble.className = "ai-bubble ai-user-bubble";
  userBubble.textContent = userLabel;
  chatOutput.appendChild(userBubble);

  // Append loading bubble
  const loadingBubble = document.createElement("div");
  loadingBubble.className = "ai-bubble ai-assistant-bubble";
  loadingBubble.innerHTML = `
    <div class="ai-loading-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  chatOutput.appendChild(loadingBubble);
  chatOutput.scrollTop = chatOutput.scrollHeight;

  // Disable UI
  isAiGenerating = true;
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;

  try {
    let answerText = "";
    let providerName = "Free AI Assistant";

    // Tier 1: Try Chrome Built-in AI (Prompt API / Gemini Nano) if available
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

    // Tier 2 & 3: Cloud relay / smart engine
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

    // Render Answer Bubble
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

    // Setup Copy button
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

  // Collapsible toggle
  const toggleHeader = $("#ai-assistant-toggle");
  const assistantContainer = $("#lightbox-ai-assistant");
  toggleHeader?.addEventListener("click", (e) => {
    e.preventDefault();
    assistantContainer?.classList.toggle("is-collapsed");
  });

  // Quick Action Chips
  document.querySelectorAll(".ai-chip-btn").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".ai-chip-btn").forEach(b => b.classList.remove("active"));
      chip.classList.add("active");
      const action = chip.getAttribute("data-action");
      askAiAssistant("", action);
    });
  });

  // Input Form
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
    if (btn.closest("#feedback-category-pills")) return;
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

  // ==========================================
  // Instant Voice Search (Web Speech Recognition)
  // ==========================================
  let voiceRecognition = null;
  let isVoiceListening = false;

  function applyVoiceSearchTranscript(spokenText) {
    if (!searchInput || !spokenText) return;

    const cleanQuery = spokenText.trim().replace(/[\.\?!,]+$/, "");
    searchInput.value = cleanQuery;
    syncClearSearchBtn();

    if (cleanQuery.startsWith("#")) {
      activeTag = cleanQuery.slice(1).trim();
    } else {
      activeTag = null;
    }
    updatePopularTags();
    currentPage = 1;
    render();

    trackInteraction("search", { query: cleanQuery, mode: "voice" });

    const notesSection = $("#notes") || $("#notes-grid") || $(".notes-section");
    if (notesSection) {
      notesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function showVoiceIndicator(show, text = "") {
    const indicator = $("#voice-search-indicator");
    const indicatorText = $("#voice-indicator-text");
    if (!indicator) return;
    if (show) {
      indicator.hidden = false;
      if (indicatorText && text) indicatorText.textContent = text;
    } else {
      indicator.hidden = true;
    }
  }

  function initVoiceSearch() {
    const voiceBtn = $("#voice-search-btn");
    const cancelBtn = $("#voice-cancel-btn");
    if (!voiceBtn || !searchInput) return;

    cancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (voiceRecognition && isVoiceListening) {
        voiceRecognition.stop();
      }
      showVoiceIndicator(false);
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      voiceBtn.title = "Voice recognition not supported in this browser (supported in Chrome, Edge, Safari, Android)";
      voiceBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showToast("🎙️ Voice search is supported in Chrome, Edge, Safari, and Android browsers.", "info");
      });
      return;
    }

    try {
      voiceRecognition = new SpeechRecognition();
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = true;
      voiceRecognition.lang = "en-IN"; // Accurately recognizes Indian English and Hindi exam terms

      voiceRecognition.onstart = () => {
        isVoiceListening = true;
        voiceBtn.classList.add("is-listening");
        voiceBtn.setAttribute("aria-pressed", "true");
        showVoiceIndicator(true, "Listening... Speak a topic (e.g. 'Polity', '1857')");
      };

      voiceRecognition.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const currentSpoken = (finalTranscript || interimTranscript).trim();
        if (currentSpoken) {
          const clean = currentSpoken.replace(/[\.\?!,]+$/, "");
          searchInput.value = clean;
          syncClearSearchBtn();
          showVoiceIndicator(true, `"${clean}"`);

          if (finalTranscript) {
            applyVoiceSearchTranscript(clean);
            showToast(`🎙️ Voice Search: "${clean}"`, "success");
          }
        }
      };

      voiceRecognition.onerror = (event) => {
        console.warn("[Voice Search Notice]:", event.error);
        isVoiceListening = false;
        voiceBtn.classList.remove("is-listening");
        voiceBtn.setAttribute("aria-pressed", "false");
        showVoiceIndicator(false);

        if (event.error === "not-allowed") {
          showToast("🎙️ Microphone permission denied. Please allow microphone access in browser.", "warning");
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          showToast(`🎙️ Voice search notice: ${event.error}`, "warning");
        }
      };

      voiceRecognition.onend = () => {
        isVoiceListening = false;
        voiceBtn.classList.remove("is-listening");
        voiceBtn.setAttribute("aria-pressed", "false");
        showVoiceIndicator(false);
      };

      voiceBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (isVoiceListening) {
          voiceRecognition.stop();
        } else {
          try {
            voiceRecognition.start();
          } catch (err) {
            console.warn("Speech recognition restart:", err);
            voiceRecognition.stop();
          }
        }
      });

    } catch (err) {
      console.warn("SpeechRecognition init error:", err);
    }
  }

  initVoiceSearch();

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

  // Ensure categories sidebar is permanently visible
  const appShell = $(".app-shell");
  if (appShell) {
    appShell.classList.remove("sidebar-hidden");
  }
  try {
    localStorage.removeItem("exam_sidebar_hidden");
  } catch {}

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
  setupLightboxTTS();
  initAiAssistant();

  lightboxDialog?.addEventListener("close", () => {
    stopAudioNarration();
    resetAiAssistantChat();
    clearNoteUrlParam();
  });
  lightboxDialog?.addEventListener("cancel", () => {
    stopAudioNarration();
    resetAiAssistantChat();
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

  $("#lightbox-download-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentLightboxIndex >= 0 && currentLightboxIndex < currentFilteredList.length) {
      const note = currentFilteredList[currentLightboxIndex];
      if (!currentStudentUser) {
        pendingDownloadNote = note;
        showToast("Please sign in with Google to download revision notes! 📥", "info");
        openStudentAuthModal();
        return;
      }
      triggerNoteDownload(note);
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

  // Indian Language Translation Pills Listener
  document.querySelectorAll(".translate-lang-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const lang = btn.dataset.lang || "en";
      currentTranslationLang = lang;
      try {
        localStorage.setItem("exam_notes_preferred_lang", lang);
      } catch {}
      if (currentLightboxIndex >= 0 && currentLightboxIndex < currentFilteredList.length) {
        const note = currentFilteredList[currentLightboxIndex];
        renderNoteOverview(note, lang);
      }
    });
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
  if (p.email) {
    document.querySelectorAll(".creator-email-text").forEach(el => el.textContent = p.email);
    document.querySelectorAll(".creator-email-chip").forEach(el => el.href = `mailto:${p.email}`);
  }
  if (p.phone) {
    document.querySelectorAll(".creator-phone-text").forEach(el => el.textContent = p.phone);
    document.querySelectorAll(".creator-phone-chip").forEach(el => el.href = `tel:${p.phone.replace(/\s+/g, "")}`);
  }
  if (p.instagram) {
    const igHandle = p.instagram.replace(/^@/, "");
    document.querySelectorAll(".ig-qr-handle").forEach(el => el.textContent = `@${igHandle}`);
    document.querySelectorAll(".ig-handle-text").forEach(el => el.textContent = `Instagram @${igHandle}`);
    document.querySelectorAll(".creator-ig-text").forEach(el => el.textContent = `@${igHandle}`);
    document.querySelectorAll(".creator-ig-chip").forEach(el => {
      el.href = `https://www.instagram.com/${igHandle}/`;
    });
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

    updateBookmarkBadges(bookmarks.size);
    if (menuViewsCount) menuViewsCount.textContent = user.viewsCount || 0;
  } else {
    try {
      localStorage.removeItem("exam_student_user");
    } catch {}

    if (signinBtn) signinBtn.hidden = false;
    if (profilePill) profilePill.hidden = true;

    bookmarks.clear();
    localStorage.removeItem("exam_notes_bookmarks");
    updateBookmarkBadges(0);
  }
}

let isGsiInitialized = false;

async function fetchGoogleClientId() {
  if (window.__GOOGLE_CLIENT_ID) return window.__GOOGLE_CLIENT_ID;
  try {
    const res = await fetch("/api/auth/google/config");
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && cfg.clientId) {
        window.__GOOGLE_CLIENT_ID = cfg.clientId;
        return cfg.clientId;
      }
    }
  } catch (err) {
    console.warn("[Google Auth] Failed to fetch client ID:", err);
  }
  return "";
}

async function renderGoogleGsiButton() {
  const btnContainer = $("#google-gsi-btn-container");
  if (!btnContainer) return;
  
  if (!isGsiInitialized) {
    await tryInitGsi();
  }

  if (!window.google?.accounts?.id || !isGsiInitialized) {
    btnContainer.innerHTML = `<div style="text-align:center; padding:8px 0; font-size:0.82rem; color:var(--ink-muted);">Loading Google Sign-In...</div>`;
    return;
  }
  
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

async function openStudentAuthModal() {
  const dialog = $("#student-auth-dialog");
  if (!dialog) return;
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute("open", "");
  }
  
  await renderGoogleGsiButton();
  if (!currentStudentUser && isGsiInitialized && window.google?.accounts?.id) {
    try { window.google.accounts.id.prompt(); } catch {}
  }
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

        // Check if user already liked this note previously
        const wasAlreadyLiked = (data.user.likes || []).some(l => (typeof l === "object" ? l?.noteId : l) === noteToLike) ||
                                (data.user.bookmarks || []).includes(noteToLike);

        bookmarks.add(noteToLike);
        localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
        updateBookmarkBadges(bookmarks.size);
        updateBookmarkButtonsInPlace(noteToLike);

        if (wasAlreadyLiked) {
          showToast("Note is already in your Liked notes! ❤️", "info");
        } else {
          trackInteraction("like", { noteId: noteToLike });
          showToast("Note saved to your account! ❤️", "success");
        }
      }

      if (pendingDownloadNote) {
        const noteToDownload = pendingDownloadNote;
        pendingDownloadNote = null;
        setTimeout(() => {
          triggerNoteDownload(noteToDownload);
        }, 500);
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
  if (!window.google?.accounts?.id) return;
  if (isGsiInitialized) return;

  try {
    const clientId = await fetchGoogleClientId();
    if (!clientId) {
      console.warn("[Google Auth] Missing Client ID from backend configuration.");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleStudentGoogleLogin,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    isGsiInitialized = true;
    if (!currentStudentUser) {
      try { window.google.accounts.id.prompt(); } catch {}
    }
  } catch (e) {
    console.warn("[Google Auth] Init error:", e);
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

// ==========================================
// Student Feedback & Suggestions Form Controller
// ==========================================
function initFeedbackForm() {
  const form = document.getElementById("student-feedback-form");
  if (!form) return;

  const emojiContainer = document.getElementById("feedback-emoji-rating");
  const emojiBtns = emojiContainer ? emojiContainer.querySelectorAll(".emoji-rate-btn") : [];
  const ratingValInput = document.getElementById("feedback-rating-val");
  const sentimentDisplay = document.getElementById("emoji-sentiment-display");

  const emojiSentiments = {
    1: "😞 Poor (1/5)",
    2: "😐 Fair (2/5)",
    3: "🙂 Good (3/5)",
    4: "😊 Satisfied (4/5)",
    5: "🤩 Very Satisfied (5/5)"
  };

  function updateEmojiRating(rating) {
    const r = parseInt(rating) || 5;
    if (ratingValInput) ratingValInput.value = r;
    if (sentimentDisplay) sentimentDisplay.textContent = emojiSentiments[r] || `${r}/5`;

    emojiBtns.forEach(btn => {
      const btnRating = parseInt(btn.dataset.rating) || 5;
      btn.classList.toggle("is-active", btnRating === r);
    });
  }

  emojiBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = parseInt(btn.dataset.rating) || 5;
      updateEmojiRating(r);
    });
  });

  // Category Selection (no search redirect, isolated class .feedback-cat-pill)
  const catPills = document.querySelectorAll("#feedback-category-pills .feedback-cat-pill");
  const catVal = document.getElementById("feedback-category-val");

  catPills.forEach(pill => {
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      catPills.forEach(p => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      if (catVal) catVal.value = pill.dataset.category || "topic_request";
    });
  });

  // Message Character Counter
  const messageInput = document.getElementById("feedback-message");
  const charsCounter = document.getElementById("feedback-chars");
  if (messageInput && charsCounter) {
    messageInput.addEventListener("input", () => {
      charsCounter.textContent = messageInput.value.length;
    });
  }

  // Google Authentication Banner & Profile Sync
  const authBanner = document.getElementById("feedback-auth-banner");

  function renderAuthBanner() {
    if (!authBanner) return;
    const user = typeof currentStudentUser !== "undefined" ? currentStudentUser : null;

    if (user) {
      const initial = (user.name || "A").trim().charAt(0).toUpperCase();
      authBanner.innerHTML = `
        <div class="feedback-user-auth-badge">
          ${user.picture 
            ? `<img class="feedback-user-pic" src="${escapeHtml(user.picture)}" alt="${escapeHtml(user.name || 'User')}" onerror="this.style.display='none'">` 
            : `<div class="feedback-user-avatar-fallback">${initial}</div>`
          }
          <div class="feedback-user-meta">
            <span class="feedback-user-meta-name">${escapeHtml(user.name || "Student Aspirant")}</span>
            <span class="feedback-user-meta-email">${escapeHtml(user.email || "")}</span>
          </div>
          <span class="feedback-auth-check">✓ Google Verified Aspirant</span>
        </div>
      `;

      // Google authenticated user -> Reveal form
      if (form) form.style.display = "flex";

      // Auto-prefill target exam if user set a goal
      const examSelect = document.getElementById("feedback-target-exam");
      if (examSelect && user.targetExam && !examSelect.value) {
        for (const opt of examSelect.options) {
          if (opt.value && opt.value.toLowerCase().includes(user.targetExam.toLowerCase())) {
            examSelect.value = opt.value;
            break;
          }
        }
      }
    } else {
      // Unauthenticated user -> Lock form completely, only Google authenticated users can access
      if (form) form.style.display = "none";

      authBanner.innerHTML = `
        <div class="feedback-login-banner">
          <span class="login-banner-icon">🔒</span>
          <div class="login-banner-info">
            <h4>Google Authentication Required</h4>
            <p>Aspirant Voice is exclusively accessible to Google authenticated aspirants. Please sign in to submit visual note demands, report issues, and share ideas.</p>
          </div>
          <button type="button" class="feedback-google-signin-btn" id="feedback-google-signin-btn">
            <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Sign in with Google to Access Aspirant Voice</span>
          </button>
        </div>
      `;

      const signinBtn = document.getElementById("feedback-google-signin-btn");
      if (signinBtn) {
        signinBtn.addEventListener("click", () => {
          if (typeof openStudentAuthModal === "function") {
            openStudentAuthModal();
          }
        });
      }
    }
  }

  renderAuthBanner();
  window.addEventListener("student-auth-changed", renderAuthBanner);

  // Form Submit Handler
  const submitBtn = document.getElementById("feedback-submit-btn");
  const successState = document.getElementById("feedback-success-state");
  const anotherBtn = document.getElementById("feedback-another-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Check Google authentication (mandatory)
    if (typeof currentStudentUser === "undefined" || !currentStudentUser) {
      if (typeof showToast === "function") {
        showToast("🔒 Please sign in with Google to access Aspirant Voice!", "warning");
      }
      if (typeof openStudentAuthModal === "function") {
        openStudentAuthModal();
      }
      return;
    }

    // Validate Category (mandatory)
    const category = catVal ? catVal.value : "";
    if (!category) {
      if (typeof showToast === "function") {
        showToast("Please select what your suggestion is about (mandatory field).", "warning");
      }
      return;
    }

    // Validate Target Exam (mandatory)
    const examSelect = document.getElementById("feedback-target-exam");
    const targetExam = (examSelect?.value || "").trim();
    if (!targetExam) {
      if (typeof showToast === "function") {
        showToast("Please select your Target Exam (mandatory field).", "warning");
      } else {
        alert("Please select your Target Exam (mandatory field).");
      }
      examSelect?.focus();
      return;
    }

    // Validate Message (mandatory)
    const msg = (messageInput ? messageInput.value : "").trim();
    if (!msg || msg.length < 5) {
      if (typeof showToast === "function") {
        showToast("Please write your suggestion or feedback (mandatory, at least 5 characters).", "warning");
      } else {
        alert("Please write your suggestion or feedback (mandatory).");
      }
      messageInput?.focus();
      return;
    }

    const rating = ratingValInput ? parseInt(ratingValInput.value) || 5 : 5;

    if (submitBtn) {
      submitBtn.disabled = true;
      const btnText = submitBtn.querySelector(".btn-text");
      if (btnText) btnText.textContent = "Sending...";
    }

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-student-id": currentStudentUser.id || ""
        },
        credentials: "same-origin",
        body: JSON.stringify({
          rating,
          category,
          targetExam,
          message: msg
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 401 || data.requiresAuth) {
          if (typeof openStudentAuthModal === "function") openStudentAuthModal();
        }
        throw new Error(data.error || "Failed to submit feedback.");
      }

      // Success
      const successTitle = document.getElementById("feedback-success-title");
      if (successTitle) {
        const studentName = currentStudentUser?.name ? currentStudentUser.name.trim() : "Aspirant";
        successTitle.textContent = `Thank You, ${studentName}!`;
      }

      form.style.display = "none";
      if (successState) successState.classList.remove("is-hidden");

      if (typeof showToast === "function") {
        showToast("🎉 Thank you! Your feedback has been sent directly to Admin Studio.", "success");
      }
    } catch (err) {
      if (typeof showToast === "function") {
        showToast(`✕ ${err.message || "Could not submit feedback"}`, "error");
      } else {
        alert(err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Submit Suggestion";
      }
    }
  });

  if (anotherBtn) {
    anotherBtn.addEventListener("click", () => {
      form.reset();
      const examSelect = document.getElementById("feedback-target-exam");
      if (examSelect) examSelect.value = "";
      if (charsCounter) charsCounter.textContent = "0";
      if (successState) successState.classList.add("is-hidden");
      renderAuthBanner();
    });
  }
}

// ==========================================
// Quick Study Experience Pulse Controller (No Auth Required, 1 per session, Compact)
// ==========================================
function initStudyExperienceRating() {
  const section = document.getElementById("study-experience-section");
  if (!section) return;

  const wrapper = document.getElementById("experience-rating-wrapper");
  const thankyouCard = document.getElementById("experience-thankyou-card");
  const selectedBadge = document.getElementById("experience-selected-badge");
  const buttons = section.querySelectorAll(".experience-rate-btn");

  const emojiMap = {
    1: { emoji: "😞", label: "Poor" },
    2: { emoji: "😐", label: "Fair" },
    3: { emoji: "🙂", label: "Good" },
    4: { emoji: "😊", label: "Satisfied" },
    5: { emoji: "🤩", label: "Very Satisfied" }
  };

  const SESSION_KEY = "study_experience_rated";
  const savedRating = sessionStorage.getItem(SESSION_KEY);

  function showThankYouState(rating, animated = false) {
    if (!wrapper || !thankyouCard) return;
    wrapper.style.display = "none";
    thankyouCard.classList.remove("is-hidden");
    thankyouCard.style.display = "flex";
    if (animated) {
      thankyouCard.style.animation = "none";
      void thankyouCard.offsetWidth; // trigger reflow
      thankyouCard.style.animation = "celebrationPopIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both";
    }

    if (selectedBadge && rating) {
      const info = emojiMap[rating] || { emoji: "⭐", label: "Rated" };
      selectedBadge.innerHTML = `<span class="experience-selected-pill">${info.emoji} Rated ${info.label} (${rating}/5)</span>`;
    }
  }

  // 1 Rating Per Session Enforcement:
  // If already rated in this session, show the compact thank you state (locked for this session)
  if (savedRating) {
    showThankYouState(parseInt(savedRating) || 5, false);
    return;
  }

  // If not rated yet in this session:
  // Strictly display the 5 unselected emojis; thank you card is hidden before feedback
  if (wrapper) wrapper.style.display = "flex";
  if (thankyouCard) {
    thankyouCard.style.display = "none";
    thankyouCard.classList.add("is-hidden");
  }

  buttons.forEach(btn => {
    btn.classList.remove("is-active");
    btn.style.transform = "";
    btn.style.borderColor = "";
  });

  // Handle click: user rates strictly once per session
  buttons.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Guard: strictly 1 rating per session
      if (sessionStorage.getItem(SESSION_KEY)) return;

      const rating = parseInt(btn.dataset.rating) || 5;
      sessionStorage.setItem(SESSION_KEY, rating.toString());

      // Button pop feedback
      btn.style.transform = "scale(1.18)";
      btn.style.borderColor = "#10b981";

      // Show immediate compact celebration thank you state (zero panel height growth)
      setTimeout(() => {
        showThankYouState(rating, true);
        if (typeof showToast === "function") {
          showToast("🎉 Thank You for your Rating!", "success");
        }
      }, 180);

      // Record to server & admin panel
      try {
        await fetch("/api/experience-rating", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating })
        });
      } catch (err) {
        // Silent catch for smooth UX
      }
    });
  });
}

// ==========================================
// About Page Scroll-Reveal Controller (Style 1: Subtle Glass Lift & Staggered Cascade)
// ==========================================
function initAboutScrollReveal() {
  const isAboutPage = document.body.classList.contains("about-body");
  const aboutPanel = document.getElementById("about-view-panel");
  const isAboutPanelVisible = aboutPanel && window.getComputedStyle(aboutPanel).display !== "none";

  if (!isAboutPage && !isAboutPanelVisible) return;

  // Mark document root as reveal-ready so CSS transitions engage
  document.documentElement.classList.add("js-reveal-ready");

  const container = isAboutPage ? (document.querySelector(".about-page-wrapper") || document.body) : aboutPanel;
  if (!container) return;

  const targets = [];

  // 1. Exclude Top Hero Section so it is immediately visible on page load without animation
  const hero = container.querySelector(".about-hero-section");
  if (hero) {
    hero.classList.remove("about-reveal", "is-revealed");
  }

  // 2. Section Headers
  container.querySelectorAll(".about-section-header").forEach(hdr => {
    if (!hdr.classList.contains("is-revealed")) targets.push({ el: hdr });
  });

  // 3. Standalone Large Box Panels
  const panelSelectors = [
    ".about-creator-card",
    ".about-app-card",
    ".about-instagram-card",
    ".study-experience-card",
    ".feedback-card-container",
    ".about-admin-entry-card"
  ];
  panelSelectors.forEach(sel => {
    const card = container.querySelector(sel);
    if (card && !card.classList.contains("is-revealed")) targets.push({ el: card });
  });

  // 4. Staggered Cascading Grids (Key Features, Exams Covered, Workflow Steps)
  const gridGroups = [
    container.querySelectorAll(".about-features-grid > .about-feature-card"),
    container.querySelectorAll(".about-exams-grid > .about-exam-card"),
    container.querySelectorAll(".about-steps-grid > .about-step-card")
  ];

  gridGroups.forEach(nodeList => {
    nodeList.forEach((card, idx) => {
      if (!card.classList.contains("is-revealed")) {
        const stagger = (idx % 6) + 1;
        targets.push({ el: card, stagger });
      }
    });
  });

  if (!targets.length) return;

  // Graceful fallback for environments without IntersectionObserver
  if (!("IntersectionObserver" in window)) {
    targets.forEach(({ el }) => el.classList.add("is-revealed"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        obs.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: "60px 0px 60px 0px",
    threshold: 0.05
  });

  targets.forEach(({ el, stagger }) => {
    el.classList.add("about-reveal");
    if (stagger) {
      el.classList.add(`stagger-${stagger}`);
    }
    // If element is already within or near viewport, reveal immediately
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportHeight + 120 && rect.bottom > -120) {
      el.classList.add("is-revealed");
    } else {
      observer.observe(el);
    }
  });
}

// Auto-run when DOM is ready
function runPublicFeedbackInits() {
  initFeedbackForm();
  initStudyExperienceRating();
  initAboutScrollReveal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runPublicFeedbackInits);
} else {
  runPublicFeedbackInits();
}

// ==========================================
// Progressive Web App (PWA) & Offline Sync
// ==========================================
(function initPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => console.log("[PWA] ServiceWorker registered:", reg.scope))
        .catch(err => console.warn("[PWA] ServiceWorker registration skipped:", err));
    });
  }

  window.addEventListener("offline", () => {
    showToast("📶 Offline Mode active. Reading from cached AI notes.", "info");
  });

  window.addEventListener("online", () => {
    showToast("🌐 Internet reconnected. Cloud sync active.", "success");
  });

  let deferredPrompt = null;

  function isRunningStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.navigator.standalone === true ||
           document.referrer.includes("android-app://");
  }

  function updateInstallButtons() {
    const installBtns = document.querySelectorAll("#pwa-install-btn, .app-install-btn");
    const statusBadges = document.querySelectorAll("#pwa-installed-msg, .app-installed-status");

    if (isRunningStandalone()) {
      installBtns.forEach(btn => { btn.style.display = "none"; });
      statusBadges.forEach(msg => { msg.style.display = "flex"; });
    } else if (deferredPrompt) {
      installBtns.forEach(btn => {
        btn.classList.add("is-ready");
        const sub = btn.querySelector(".install-btn-secondary");
        if (sub) sub.textContent = "1-Tap Android Install Ready 🚀";
      });
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    updateInstallButtons();
    showToast('🎉 "AI Notes" installed successfully! Check your home screen.', "success");
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#pwa-install-btn, .app-install-btn");
    if (!btn) return;
    e.preventDefault();

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        showToast('Installing "AI Notes" App to your Home Screen...', "info");
      }
      deferredPrompt = null;
      updateInstallButtons();
    } else if (isRunningStandalone()) {
      showToast('✓ "AI Notes" is already installed on this device!', "info");
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        showToast('📲 On iPhone: Tap Share (⬆️) at the bottom, then tap "Add to Home Screen"!', "info");
      } else {
        showToast('📲 Tap Chrome menu (⋮) at top-right, then select "Install app" or "Add to Home screen"!', "info");
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateInstallButtons);
  } else {
    updateInstallButtons();
  }
})();



