/**
 * Free AI Govt Exam Notes - Frontend Application Logic
 * Supports: 7 Core Subjects (History, Polity, Economy, Geography, Art and Culture, Maths, Science),
 * Multiple Tags for every note (#Tags), 6 Notes Per Page Pagination, Lightbox Zoom Viewer,
 * Bookmarks, Recently Viewed, Theme System, and Admin State.
 */

// ==========================================
// 1. Initial State & 7-Category Sample Notes with Multiple Tags
// ==========================================
const samples = [
  ["Preamble of the Constitution", "Polity", "20 May 2024", "preamble", ["Polity"], ["UPSC", "Constitution", "Preamble", "Prelims 2025"]],
  ["Fundamental Rights – Articles 12 to 35", "Polity", "19 May 2024", "rights", ["Polity"], ["Polity", "Articles", "Fundamental Rights", "SSC CGL"]],
  ["Revolt of 1857 – Causes & Leaders", "History", "18 May 2024", "revolt", ["History"], ["Modern History", "Freedom Struggle", "1857", "SSC"]],
  ["Mauryan Administration & Ashokan Edicts", "History", "17 May 2024", "mauryan", ["History"], ["Ancient History", "Ashoka", "Edicts", "UPSC"]],
  ["Physical Divisions & Mountain Passes of India", "Geography", "16 May 2024", "map", ["Geography"], ["Himalayas", "Passes", "Map Work", "Geography"]],
  ["River Systems & Water Resources of India", "Geography", "15 May 2024", "water", ["Geography"], ["Rivers", "Dams", "Drainage System", "SSC"]],
  ["Sectors of Indian Economy & GDP Breakdown", "Economy", "14 May 2024", "economy", ["Economy"], ["GDP", "Sectors", "Banking", "Economy"]],
  ["Monetary Policy & RBI Quantitative Tools", "Economy", "13 May 2024", "rbi", ["Economy"], ["RBI", "Repo Rate", "Inflation", "Banking"]],
  ["Classical Dance Forms & Traditions", "Art and Culture", "12 May 2024", "dance", ["Art and Culture"], ["Dance", "Classical", "Traditions", "Culture"]],
  ["Temple Architecture – Nagara, Dravida & Vesara", "Art and Culture", "11 May 2024", "temple", ["Art and Culture"], ["Architecture", "Temples", "Art & Culture"]],
  ["Speed, Distance & Time – Shortcut Formulas", "Maths", "10 May 2024", "maths_speed", ["Maths"], ["Maths Shortcuts", "Speed & Time", "Aptitude", "SSC"]],
  ["Percentage & Profit-Loss Calculations", "Maths", "09 May 2024", "maths_calc", ["Maths"], ["Profit & Loss", "Percentages", "Arithmetic", "RRB"]],
  ["Human Digestive System & Enzyme Action", "Science", "08 May 2024", "biology", ["Science"], ["Biology", "Enzymes", "Digestive System", "Science"]],
  ["Newton’s Laws of Motion & Gravitation", "Science", "07 May 2024", "physics", ["Science"], ["Physics", "Mechanics", "Gravitation", "SSC"]],
  ["English Grammar – Subject-Verb Agreement Rules", "English", "06 May 2024", "english_grammar", ["English"], ["English", "Grammar", "Rules", "SSC CGL"]],
  ["Idioms, Phrases & One-Word Substitutions", "English", "05 May 2024", "english_vocab", ["English"], ["Vocabulary", "Idioms", "English", "Banking"]]
].map(([title, subject, date, type, categories, tags], i) => ({
  id: "sample" + i,
  title,
  subject,
  date,
  type,
  categories,
  tags: tags || [],
  isSample: true
}));

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Application State
let notes = [];
let category = "All Notes";
let activeTag = null;
let currentView = "notes"; // "notes" | "bookmarks" | "recent"
let viewMode = localStorage.getItem("exam_notes_view") || "grid";
let isAdmin = false;
let currentLightboxIndex = -1;
let currentFilteredList = [];

// 6 Notes Per Page Pagination State
const PAGE_SIZE = 6;
let currentPage = 1;

// Local Storage Collections
let bookmarks = new Set(JSON.parse(localStorage.getItem("exam_notes_bookmarks") || "[]"));
let recentViewed = JSON.parse(localStorage.getItem("exam_notes_recent") || "[]");

// ==========================================
// 2. Utility Helpers
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
  }, 2800);
}

// ==========================================
// 3. Theme System
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
// 4. Data Loading & Persistence
// ==========================================
async function loadNotes() {
  let uploaded = [];

  try {
    const [notesRes, visitsRes, meRes] = await Promise.all([
      fetch("/api/notes").then(r => r.ok ? r.json() : { notes: [] }),
      fetch("/api/visits").then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
      fetch("/api/admin/me").then(r => r.ok ? r.json() : { admin: false }).catch(() => ({ admin: false }))
    ]);

    uploaded = notesRes.notes || [];
    isAdmin = Boolean(meRes.admin);
  } catch {
    uploaded = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
    isAdmin = sessionStorage.getItem("exam_admin_local_session") === "true";
  }

  // Merge server uploads with local client uploads
  const localUploads = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
  const mergedUploaded = [...localUploads.filter(l => !uploaded.some(u => u.id === l.id)), ...uploaded];

  const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
  const activeSamples = samples.filter(s => !deletedSamples.includes(s.id));

  notes = [...mergedUploaded, ...activeSamples];

  updateAdminState();
  updatePopularTags();
  render();
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
  notes.forEach(n => (n.tags || []).forEach(t => allTags.add(t)));
  
  if (allTags.size === 0) {
    ["UPSC", "Constitution", "Modern History", "Geography", "GDP", "Dance", "Shortcuts", "Biology"].forEach(t => allTags.add(t));
  }

  tagsContainer.innerHTML = [...allTags].slice(0, 14).map(t =>
    `<button type="button" class="tag-pill ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
  ).join("");
}

function renderCardMedia(note) {
  if (note.imageUrl) {
    return `
      <div class="card-media">
        <img class="note-image" src="${note.imageUrl}" alt="${escapeHtml(note.title)}" loading="lazy">
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
    if (currentView === "recent" && !recentViewed.includes(n.id)) return false;

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

    // Search query filter
    if (searchTerm) {
      const allText = `${n.title} ${n.subject} ${(n.categories || []).join(" ")} ${(n.tags || []).join(" ")}`.toLowerCase();
      if (!allText.includes(searchTerm)) return false;
    }

    return true;
  });

  // Recency or custom sorting
  if (currentView === "recent") {
    list.sort((a, b) => recentViewed.indexOf(a.id) - recentViewed.indexOf(b.id));
  } else {
    if (sortOption === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOption === "oldest") {
      list.sort((a, b) => (new Date(a.createdAt || a.date || 0)) - (new Date(b.createdAt || b.date || 0)));
    } else {
      list.sort((a, b) => (new Date(b.createdAt || b.date || 0)) - (new Date(a.createdAt || a.date || 0)));
    }
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
    
    if (pagedList.length === 0) {
      notesGrid.innerHTML = "";
    } else {
      notesGrid.innerHTML = pagedList.map((n, pIndex) => {
        const fullIndex = startIndex + pIndex;
        const isBookmarked = bookmarks.has(n.id);
        const subjKey = getSubjectKey(n.subject);
        const dateFormatted = n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");

        const tagsList = (n.tags || []).map(t =>
          `<span class="note-tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${escapeHtml(t)}</span>`
        ).join("");

        const tagsHtml = tagsList ? `<div class="note-tags-row">${tagsList}</div>` : '';

        return `
          <article class="note-card" data-note-id="${n.id}" data-index="${fullIndex}" tabindex="0" role="button" aria-label="${escapeHtml(n.title)}">
            <button class="card-bookmark-btn ${isBookmarked ? "bookmarked" : ""}" data-bookmark="${n.id}" type="button" title="${isBookmarked ? "Remove Bookmark" : "Save Bookmark"}" aria-label="Bookmark Note">
              ${isBookmarked ? "♥" : "♡"}
            </button>
            ${renderCardMedia(n)}
            <div class="note-content">
              <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
              <h3 class="note-title">${escapeHtml(n.title)}</h3>
              ${tagsHtml}
              <div class="note-meta">
                <span>${dateFormatted} · 1 Image</span>
                ${isAdmin && n.imageUrl ? `<button class="delete-note" data-delete-id="${n.id}" type="button">Delete</button>` : ""}
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
    } else if (currentView === "recent") {
      pageTitle.textContent = "Recently Viewed Notes";
    } else {
      pageTitle.textContent = category;
    }
  }

  const activeTagChip = $("#active-tag-chip");
  if (activeTagChip) {
    if (activeTag) {
      activeTagChip.hidden = false;
      activeTagChip.textContent = `Tag: #${activeTag} ✕`;
    } else {
      activeTagChip.hidden = true;
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
      } else if (currentView === "recent") {
        emptyMsg.textContent = "No recently viewed notes. Tap any note to open and review it in high resolution.";
      } else {
        emptyMsg.textContent = "No notes matched your search query or active filter. Try clearing filters or searching for another topic.";
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
  if (bookmarkBadge) bookmarkBadge.textContent = bookmarks.size;
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
    english: 0
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
  setCnt("#english-count", counts.english);
}

// ==========================================
// 8. Navigation & View Handling
// ==========================================
function switchView(viewName) {
  currentView = viewName;
  activeTag = null;
  currentPage = 1;

  $$(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  $$(".mobile-nav-btn[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  render();
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

  render();
}

function toggleBookmark(noteId, e) {
  if (e) e.stopPropagation();
  if (bookmarks.has(noteId)) {
    bookmarks.delete(noteId);
    showToast("Removed from bookmarks.", "info");
  } else {
    bookmarks.add(noteId);
    showToast("Saved to your Bookmarks! ♡", "success");
  }
  localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
  render();
}

function recordRecentView(noteId) {
  recentViewed = [noteId, ...recentViewed.filter(id => id !== noteId)].slice(0, 25);
  localStorage.setItem("exam_notes_recent", JSON.stringify(recentViewed));
}

// ==========================================
// 9. Lightbox Modal Zoom & Pan Engine
// ==========================================
let currentZoom = 1.0;
let isDragging = false;
let startX = 0, startY = 0;
let scrollLeftPos = 0, scrollTopPos = 0;

function setZoom(scale) {
  currentZoom = Math.min(Math.max(scale, 0.5), 3.0);
  const zoomText = $("#lightbox-zoom-level");
  if (zoomText) zoomText.textContent = `${Math.round(currentZoom * 100)}%`;

  const img = $("#lightbox-media-container img, #lightbox-media-container .preview");
  const container = $("#lightbox-media-container");

  if (img) {
    img.style.transform = `scale(${currentZoom})`;
  }
  if (container) {
    container.classList.toggle("is-zoomed", currentZoom > 1.05);
  }
}

function zoomIn() { setZoom(currentZoom + 0.25); }
function zoomOut() { setZoom(currentZoom - 0.25); }
function resetZoom() {
  setZoom(1.0);
  const container = $("#lightbox-media-container");
  if (container) {
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }
}

function openLightbox(index) {
  if (index < 0 || index >= currentFilteredList.length) return;
  currentLightboxIndex = index;
  const note = currentFilteredList[index];
  recordRecentView(note.id);

  resetZoom();
  updateLightboxContent(note);
  const dialog = $("#lightbox-dialog");
  if (dialog) dialog.showModal();
}

function updateLightboxContent(note) {
  if (!note) return;
  const title = $("#lightbox-title");
  const badge = $("#lightbox-badge");
  const mediaContainer = $("#lightbox-media-container");
  const meta = $("#lightbox-meta");
  const bookmarkBtn = $("#lightbox-bookmark-btn");
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
      mediaContainer.innerHTML = `<img src="${note.imageUrl}" alt="${escapeHtml(note.title)}" class="lightbox-img">`;
    } else {
      mediaContainer.innerHTML = `<div class="lightbox-preview-card">${renderCardMedia(note)}</div>`;
    }
  }

  if (meta) {
    const dateFormatted = note.date || (note.createdAt ? new Date(note.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");
    meta.textContent = `${dateFormatted} · 1 Image · High-Resolution Revision Note`;
  }

  if (bookmarkBtn) {
    const isBookmarked = bookmarks.has(note.id);
    bookmarkBtn.textContent = isBookmarked ? "♥" : "♡";
    bookmarkBtn.classList.toggle("active", isBookmarked);
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
      tagsContainer.innerHTML = "";
    }
  }

  setZoom(1.0);
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
// 10. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  initTheme();

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

  // Popular Tags Clicks (Sidebar & Card Tag Chips)
  document.addEventListener("click", e => {
    // 1. Tag pill or chip clicked
    const tagEl = e.target.closest("[data-tag]");
    if (tagEl && !tagEl.closest(".note-card")) {
      const tag = tagEl.dataset.tag;
      activeTag = activeTag === tag ? null : tag;
      currentPage = 1;
      updatePopularTags();
      render();
      return;
    }

    const noteTagChip = e.target.closest(".note-tags-row .note-tag-chip");
    if (noteTagChip) {
      e.stopPropagation();
      const tag = noteTagChip.dataset.tag;
      activeTag = activeTag === tag ? null : tag;
      currentPage = 1;
      updatePopularTags();
      render();
      return;
    }

    // 2. Lightbox tag clicked
    const lightboxTag = e.target.closest("[data-filter-tag]");
    if (lightboxTag) {
      activeTag = lightboxTag.dataset.filterTag;
      currentPage = 1;
      $("#lightbox-dialog")?.close();
      updatePopularTags();
      render();
      return;
    }
  });

  // Active Tag Chip Clear
  $("#active-tag-chip")?.addEventListener("click", () => {
    activeTag = null;
    currentPage = 1;
    updatePopularTags();
    render();
  });

  // Search Input
  const searchInput = $("#note-search");
  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  // Clear Search
  $("#clear-search")?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    currentPage = 1;
    render();
  });

  // Sort Dropdown
  $("#sort-notes")?.addEventListener("change", () => {
    currentPage = 1;
    render();
  });

  // Grid / List View Toggle
  $("#view-grid")?.addEventListener("click", () => {
    viewMode = "grid";
    localStorage.setItem("exam_notes_view", "grid");
    $("#view-grid")?.classList.add("active");
    $("#view-list")?.classList.remove("active");
    render();
  });

  $("#view-list")?.addEventListener("click", () => {
    viewMode = "list";
    localStorage.setItem("exam_notes_view", "list");
    $("#view-list")?.classList.add("active");
    $("#view-grid")?.classList.remove("active");
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

  // Note Card Clicks (Open Lightbox or Bookmark)
  $("#notes-grid")?.addEventListener("click", e => {
    const bookmarkBtn = e.target.closest("[data-bookmark]");
    if (bookmarkBtn) {
      toggleBookmark(bookmarkBtn.dataset.bookmark, e);
      return;
    }

    const delBtn = e.target.closest("[data-delete-id]");
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.deleteId;
      if (confirm("Are you sure you want to delete this note?")) {
        deleteNote(id);
      }
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
  $("#lightbox-zoom-in")?.addEventListener("click", zoomIn);
  $("#lightbox-zoom-out")?.addEventListener("click", zoomOut);
  $("#lightbox-zoom-reset")?.addEventListener("click", resetZoom);

  $("#lightbox-prev-btn")?.addEventListener("click", prevLightbox);
  $("#lightbox-next-btn")?.addEventListener("click", nextLightbox);
  $("#lightbox-close-btn")?.addEventListener("click", () => {
    $("#lightbox-dialog")?.close();
  });

  $("#lightbox-bookmark-btn")?.addEventListener("click", () => {
    if (currentLightboxIndex >= 0 && currentLightboxIndex < currentFilteredList.length) {
      const note = currentFilteredList[currentLightboxIndex];
      toggleBookmark(note.id);
      updateLightboxContent(note);
    }
  });

  // Mouse Wheel Zoom & Drag-to-Pan inside Lightbox
  const mediaBox = $("#lightbox-media-container");
  if (mediaBox) {
    mediaBox.addEventListener("wheel", e => {
      const dialog = $("#lightbox-dialog");
      if (dialog && dialog.open) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    }, { passive: false });

    mediaBox.addEventListener("mousedown", e => {
      if (currentZoom <= 1.05) return;
      isDragging = true;
      mediaBox.classList.add("is-dragging");
      startX = e.pageX - mediaBox.offsetLeft;
      startY = e.pageY - mediaBox.offsetTop;
      scrollLeftPos = mediaBox.scrollLeft;
      scrollTopPos = mediaBox.scrollTop;
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
      mediaBox.classList.remove("is-dragging");
    });

    window.addEventListener("mousemove", e => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.pageX - mediaBox.offsetLeft;
      const y = e.pageY - mediaBox.offsetTop;
      const walkX = (x - startX) * 1.5;
      const walkY = (y - startY) * 1.5;
      mediaBox.scrollLeft = scrollLeftPos - walkX;
      mediaBox.scrollTop = scrollTopPos - walkY;
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

async function deleteNote(id) {
  try {
    await fetch("/api/admin/notes/" + id, { method: "DELETE" });
  } catch {}

  const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
  const filteredLocal = existingLocal.filter(x => x.id !== id);
  localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(filteredLocal));

  const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
  if (!deletedSamples.includes(id)) {
    deletedSamples.push(id);
    localStorage.setItem("exam_notes_deleted_sample_ids", JSON.stringify(deletedSamples));
  }

  showToast("Note deleted.", "success");
  await loadNotes();
}

// Start Application
setupEventListeners();
loadNotes();
