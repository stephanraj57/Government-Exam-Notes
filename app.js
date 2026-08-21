/**
 * Exam Notes Library - Frontend Application Logic
 * Supports: Dark/Light Themes, Lightbox Zoom, Bookmarks, Recently Viewed,
 * Mobile navigation, Tag Filtering, Grid/List Views, and Admin Actions.
 */

// ==========================================
// 1. Initial State & Sample Notes
// ==========================================
const samples = [
  ["Preamble of the Constitution", "UPSC Polity", "20 May 2024", "preamble", ["UPSC", "Polity"]],
  ["Fundamental Rights – Overview", "UPSC Polity", "19 May 2024", "rights", ["UPSC", "Polity"]],
  ["Physical Divisions of India", "Geography", "18 May 2024", "map", ["Geography"]],
  ["Governor – Powers & Functions", "UPSC Polity", "18 May 2024", "governor", ["UPSC", "Polity"]],
  ["Revolt of 1857 – Causes", "SSC History", "17 May 2024", "revolt", ["SSC", "History"]],
  ["Mauryan Empire – Key Points", "SSC History", "16 May 2024", "mauryan", ["SSC", "History"]],
  ["Sectors of Indian Economy", "Economy", "15 May 2024", "economy", ["Economy"]],
  ["Water Resources – Overview", "Geography", "14 May 2024", "water", ["Geography"]]
].map(([title, subject, date, type, categories], i) => ({
  id: "sample" + i,
  title,
  subject,
  date,
  type,
  categories,
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
  const s = subject.toLowerCase();
  if (s.includes("upsc")) return "upsc";
  if (s.includes("ssc")) return "ssc";
  if (s.includes("rrb")) return "rrb";
  if (s.includes("polity")) return "polity";
  if (s.includes("history")) return "history";
  if (s.includes("geography")) return "geography";
  if (s.includes("economy")) return "economy";
  return "upsc";
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

// ==========================================
// 3. Theme Toggle & Persistence
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("exam_notes_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  setTheme(theme, false);

  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next, true);
  });
}

function setTheme(theme, save = true) {
  document.documentElement.setAttribute("data-theme", theme);
  if (save) localStorage.setItem("exam_notes_theme", theme);

  const themeIcon = $(".theme-icon");
  if (themeIcon) {
    themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
}

// ==========================================
// 4. Note Previews (Rich Templates & Uploaded Images)
// ==========================================
function renderCardMedia(note) {
  if (note.imageUrl) {
    return `<div class="card-media"><img class="note-image" src="${note.imageUrl}" alt="${escapeHtml(note.title)}" loading="lazy"></div>`;
  }

  const previews = {
    preamble: `<h3>Preamble of the Constitution</h3><p>WE, THE PEOPLE OF INDIA…</p><p>Justice · Liberty · Equality · Fraternity</p><div class='diagram'>⚖</div>`,
    rights: `<h3>Fundamental Rights</h3><p>• Right to Equality (14-18)</p><p>• Right to Freedom (19-22)</p><p>• Cultural & Educational Rights</p>`,
    map: `<h3>INDIA — PHYSICAL DIVISIONS</h3><div class='diagram'>⌁ ◒ ⌁</div><p>Himalayas · Northern Plains · Deccan</p>`,
    governor: `<h3>The Governor</h3><div class='diagram'>▣</div><p>Article 153-167 · Executive Powers</p>`,
    revolt: `<h3>The Revolt of 1857</h3><p><b>Major Causes & Centers</b></p><p>Meerut · Delhi · Kanpur · Jhansi</p><div class='diagram'>♞</div>`,
    mauryan: `<h3>Mauryan Empire</h3><p>Founder: Chandragupta Maurya</p><p>Ashoka · Dhamma · Rock Edicts</p><div class='diagram'>♜</div>`,
    economy: `<h3>Indian Economy — Sectors</h3><div class='diagram'>◔ ◑ ◕</div><p>Primary · Secondary · Tertiary</p>`,
    water: `<h3>Water Resources of India</h3><p>Major River Basins & Dams</p><div class='diagram'>┬ ┴</div><p>Indus · Ganga · Godavari</p>`
  };

  const previewContent = previews[note.type] || `<h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.subject)}</p><div class='diagram'>📖</div>`;
  return `<div class="card-media"><div class="preview">${previewContent}</div></div>`;
}

// ==========================================
// 5. Main Render Function
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
      const matchCat = n.categories?.includes(category) || n.subject.includes(category);
      if (!matchCat) return false;
    }

    // Tag filter
    if (activeTag) {
      const tagLower = activeTag.toLowerCase();
      const matchTag = (`${n.title} ${n.subject} ${(n.categories || []).join(" ")}`).toLowerCase().includes(tagLower);
      if (!matchTag) return false;
    }

    // Search query filter
    if (searchTerm) {
      const matchSearch = (`${n.title} ${n.subject} ${(n.categories || []).join(" ")}`).toLowerCase().includes(searchTerm);
      if (!matchSearch) return false;
    }

    return true;
  });

  // If viewing recent, maintain recency order
  if (currentView === "recent") {
    list.sort((a, b) => recentViewed.indexOf(a.id) - recentViewed.indexOf(b.id));
  } else {
    // Sort
    if (sortOption === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOption === "oldest") {
      list.sort((a, b) => (new Date(a.createdAt || a.date || 0)) - (new Date(b.createdAt || b.date || 0)));
    } else {
      // Newest
      list.sort((a, b) => (new Date(b.createdAt || b.date || 0)) - (new Date(a.createdAt || a.date || 0)));
    }
  }

  currentFilteredList = list;

  // Render Grid / List
  const notesGrid = $("#notes-grid");
  if (notesGrid) {
    notesGrid.className = `notes-grid ${viewMode === "list" ? "list-view" : ""}`;
    
    if (list.length === 0) {
      notesGrid.innerHTML = "";
    } else {
      notesGrid.innerHTML = list.map((n, idx) => {
        const isBookmarked = bookmarks.has(n.id);
        const subjKey = getSubjectKey(n.subject);
        const dateFormatted = n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");

        return `
          <article class="note-card" data-note-id="${n.id}" data-index="${idx}" tabindex="0" role="button" aria-label="${escapeHtml(n.title)}">
            <button class="card-bookmark-btn ${isBookmarked ? "bookmarked" : ""}" data-bookmark="${n.id}" type="button" title="${isBookmarked ? "Remove Bookmark" : "Save Bookmark"}" aria-label="Bookmark Note">
              ${isBookmarked ? "♥" : "♡"}
            </button>
            ${renderCardMedia(n)}
            <div class="note-content">
              <span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span>
              <h3 class="note-title">${escapeHtml(n.title)}</h3>
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
      activeTagChip.textContent = `Topic: ${activeTag} ✕`;
    } else {
      activeTagChip.hidden = true;
    }
  }

  const noteTotal = $("#note-total");
  if (noteTotal) {
    noteTotal.textContent = `${list.length} note${list.length === 1 ? "" : "s"} ready for revision`;
  }

  const showingCount = $("#showing-count");
  if (showingCount) {
    showingCount.textContent = `Showing ${list.length} of ${notes.length} total notes`;
  }

  // Empty State Handling
  const emptyNotes = $("#empty-notes");
  if (emptyNotes) {
    emptyNotes.hidden = list.length > 0;
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

function updateCategoryCounts() {
  const counts = {
    "all": notes.length,
    "upsc": 0,
    "ssc": 0,
    "rrb": 0,
    "polity": 0,
    "history": 0,
    "geography": 0,
    "economy": 0
  };

  notes.forEach(n => {
    const text = (`${n.subject} ${(n.categories || []).join(" ")}`).toLowerCase();
    if (text.includes("upsc")) counts.upsc++;
    if (text.includes("ssc")) counts.ssc++;
    if (text.includes("rrb")) counts.rrb++;
    if (text.includes("polity")) counts.polity++;
    if (text.includes("history")) counts.history++;
    if (text.includes("geography")) counts.geography++;
    if (text.includes("economy")) counts.economy++;
  });

  const setCnt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setCnt("#all-count", counts.all);
  setCnt("#upsc-count", counts.upsc);
  setCnt("#ssc-count", counts.ssc);
  setCnt("#rrb-count", counts.rrb);
  setCnt("#polity-count", counts.polity);
  setCnt("#history-count", counts.history);
  setCnt("#geography-count", counts.geography);
  setCnt("#economy-count", counts.economy);
}

// ==========================================
// 6. Navigation & View Handling
// ==========================================
function switchView(viewName) {
  currentView = viewName;
  activeTag = null;

  // Sync Desktop Navigation buttons
  $$(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Sync Mobile Bottom Navigation buttons
  $$(".mobile-nav-btn[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  render();
}

function selectCategory(catName) {
  category = catName;
  activeTag = null;
  if (currentView !== "notes") {
    switchView("notes");
  }

  // Update Desktop Sidebar
  $$(".category").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === catName);
  });

  // Update Mobile Category Pills
  $$(".cat-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === catName);
  });

  render();
}

// ==========================================
// 7. Lightbox / Fullscreen Viewer
// ==========================================
function openLightbox(noteId) {
  const index = currentFilteredList.findIndex(n => n.id === noteId);
  if (index === -1) return;

  currentLightboxIndex = index;
  const note = currentFilteredList[index];

  // Record into recently viewed
  recentViewed = [note.id, ...recentViewed.filter(id => id !== note.id)].slice(0, 50);
  localStorage.setItem("exam_notes_recent", JSON.stringify(recentViewed));

  updateLightboxContent(note);

  const dialog = $("#lightbox-dialog");
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function updateLightboxContent(note) {
  const title = $("#lightbox-title");
  const badge = $("#lightbox-badge");
  const mediaContainer = $("#lightbox-media-container");
  const meta = $("#lightbox-meta");
  const bookmarkBtn = $("#lightbox-bookmark-btn");
  const downloadBtn = $("#lightbox-download-btn");

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
      mediaContainer.innerHTML = renderCardMedia(note);
    }
  }

  if (meta) {
    const d = note.date || (note.createdAt ? new Date(note.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
    meta.textContent = `${d ? `Published ${d} · ` : ""}High-Resolution Note`;
  }

  if (bookmarkBtn) {
    const isBookmarked = bookmarks.has(note.id);
    bookmarkBtn.textContent = isBookmarked ? "♥" : "♡";
    bookmarkBtn.classList.toggle("bookmarked", isBookmarked);
  }

  if (downloadBtn) {
    if (note.imageUrl) {
      downloadBtn.href = note.imageUrl;
      downloadBtn.style.display = "grid";
    } else {
      downloadBtn.style.display = "none";
    }
  }
}

function stepLightbox(delta) {
  if (currentFilteredList.length === 0) return;
  currentLightboxIndex = (currentLightboxIndex + delta + currentFilteredList.length) % currentFilteredList.length;
  updateLightboxContent(currentFilteredList[currentLightboxIndex]);
}

// ==========================================
// 8. API & Admin Operations
// ==========================================
async function api(url, options) {
  const r = await fetch(url, options);
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error || "Something went wrong.");
  return v;
}

function setAdminState(isAdminUser) {
  isAdmin = isAdminUser;
  const adminBtn = $("#admin-login-button");
  const statusText = $("#admin-status-text");
  const statusSub = $("#admin-status-sub");
  const adminAreaBtn = $("#admin-area-button");

  if (isAdminUser) {
    adminBtn?.classList.add("admin-logged-in");
    if (statusText) statusText.textContent = "Admin Studio";
    if (statusSub) statusSub.textContent = "Active Session ↗";
    if (adminAreaBtn) {
      adminAreaBtn.innerHTML = "<span>⚙</span> Admin Studio";
    }
  } else {
    adminBtn?.classList.remove("admin-logged-in");
    if (statusText) statusText.textContent = "Admin Studio";
    if (statusSub) statusSub.textContent = "Upload & Manage";
    if (adminAreaBtn) {
      adminAreaBtn.innerHTML = "<span>⚙</span> Admin Studio";
    }
  }

  render();
}

async function handleAdminAction() {
  if (isAdmin) {
    // Logout flow
    if (confirm("Would you like to sign out from the Admin session?")) {
      try {
        await api("/api/admin/logout", { method: "POST" });
        setAdminState(false);
        showToast("Signed out from admin mode.", "info");
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  } else {
    // Open sign in dialog
    const msg = $("#admin-login-message");
    if (msg) {
      msg.textContent = "";
      msg.className = "form-message";
    }
    const pwd = $("#admin-password");
    if (pwd) pwd.value = "";
    $("#admin-dialog")?.showModal();
  }
}

function openUploadDialog() {
  if (!isAdmin) {
    showToast("Please sign in as Admin to upload notes.", "info");
    return handleAdminAction();
  }
  const form = $("#upload-form");
  if (form) form.reset();
  const msg = $("#upload-message");
  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }
  const filePreview = $("#file-name-preview");
  if (filePreview) filePreview.textContent = "";

  $("#upload-dialog")?.showModal();
}

// ==========================================
// 9. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Theme Toggle
  initTheme();

  // Desktop Header Navigation Tabs
  $$(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Mobile Bottom Navigation Tabs
  $$(".mobile-nav-btn").forEach(btn => {
    if (btn.dataset.view) {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    } else if (btn.dataset.action === "upload") {
      btn.addEventListener("click", openUploadDialog);
    }
  });

  // Desktop Sidebar Category Click
  $("#category-nav")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-category]");
    if (btn) selectCategory(btn.dataset.category);
  });

  // Mobile Category Pill Strip Click
  $("#mobile-category-nav")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-category]");
    if (btn) selectCategory(btn.dataset.category);
  });

  // Popular Topic Tags Click
  $("#tags-container")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-tag]");
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (activeTag === tag) {
      activeTag = null;
      btn.classList.remove("active");
    } else {
      activeTag = tag;
      $$("#tags-container button").forEach(b => b.classList.toggle("active", b === btn));
    }
    $("#clear-tags").hidden = !activeTag;
    render();
  });

  $("#clear-tags")?.addEventListener("click", () => {
    activeTag = null;
    $$("#tags-container button").forEach(b => b.classList.remove("active"));
    $("#clear-tags").hidden = true;
    render();
  });

  $("#active-tag-chip")?.addEventListener("click", () => {
    activeTag = null;
    $$("#tags-container button").forEach(b => b.classList.remove("active"));
    $("#clear-tags").hidden = true;
    render();
  });

  // Search Input & Clear
  const searchInput = $("#note-search");
  searchInput?.addEventListener("input", () => render());

  $("#clear-search")?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    render();
  });

  // Sort Selector
  $("#sort-notes")?.addEventListener("change", () => render());

  // Grid / List View Toggle
  $("#grid-view-btn")?.addEventListener("click", () => {
    viewMode = "grid";
    localStorage.setItem("exam_notes_view", "grid");
    $("#grid-view-btn")?.classList.add("active");
    $("#list-view-btn")?.classList.remove("active");
    render();
  });

  $("#list-view-btn")?.addEventListener("click", () => {
    viewMode = "list";
    localStorage.setItem("exam_notes_view", "list");
    $("#list-view-btn")?.classList.add("active");
    $("#grid-view-btn")?.classList.remove("active");
    render();
  });

  // Reset Filters button on empty state
  $("#reset-filters-btn")?.addEventListener("click", () => {
    category = "All Notes";
    activeTag = null;
    if (searchInput) searchInput.value = "";
    switchView("notes");
    selectCategory("All Notes");
  });

  // Notes Grid Delegate Click (Card open / Bookmark / Delete)
  $("#notes-grid")?.addEventListener("click", async e => {
    // 1. Bookmark button click
    const bookmarkBtn = e.target.closest("[data-bookmark]");
    if (bookmarkBtn) {
      e.stopPropagation();
      const id = bookmarkBtn.dataset.bookmark;
      if (bookmarks.has(id)) {
        bookmarks.delete(id);
        showToast("Removed from saved bookmarks.", "info");
      } else {
        bookmarks.add(id);
        showToast("Saved to your bookmarks! ♥", "success");
      }
      localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
      render();
      return;
    }

    // 2. Delete Note button click (Admin only)
    const delBtn = e.target.closest("[data-delete-id]");
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.deleteId;
      if (confirm("Are you sure you want to permanently delete this note?")) {
        try {
          await api("/api/admin/notes/" + id, { method: "DELETE" });
          notes = notes.filter(n => n.id !== id);
          bookmarks.delete(id);
          recentViewed = recentViewed.filter(x => x !== id);
          localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
          localStorage.setItem("exam_notes_recent", JSON.stringify(recentViewed));
          showToast("Note deleted successfully.", "success");
          render();
        } catch (err) {
          showToast(err.message, "error");
        }
      }
      return;
    }

    // 3. Card click -> Open Lightbox
    const card = e.target.closest(".note-card");
    if (card && card.dataset.noteId) {
      openLightbox(card.dataset.noteId);
    }
  });

  // Lightbox Controls
  $("#lightbox-prev-btn")?.addEventListener("click", () => stepLightbox(-1));
  $("#lightbox-next-btn")?.addEventListener("click", () => stepLightbox(1));
  $("#lightbox-close-btn")?.addEventListener("click", () => $("#lightbox-dialog")?.close());

  $("#lightbox-bookmark-btn")?.addEventListener("click", () => {
    if (currentLightboxIndex < 0 || !currentFilteredList[currentLightboxIndex]) return;
    const note = currentFilteredList[currentLightboxIndex];
    if (bookmarks.has(note.id)) {
      bookmarks.delete(note.id);
      showToast("Removed from saved bookmarks.", "info");
    } else {
      bookmarks.add(note.id);
      showToast("Saved to your bookmarks! ♥", "success");
    }
    localStorage.setItem("exam_notes_bookmarks", JSON.stringify([...bookmarks]));
    updateLightboxContent(note);
    render();
  });

  // Keyboard navigation for Lightbox
  window.addEventListener("keydown", e => {
    const dialog = $("#lightbox-dialog");
    if (dialog && dialog.open) {
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    }
  });

  // Close buttons on dialogs
  $$("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  });

  // Admin Login Form Submit
  $("#admin-login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#admin-login-message");
    const pwdInput = $("#admin-password");
    if (!msg || !pwdInput) return;

    msg.className = "form-message";
    msg.textContent = "Verifying admin credentials…";

    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdInput.value })
      });
      setAdminState(true);
      $("#admin-dialog")?.close();
      showToast("Admin sign-in successful!", "success");
      openUploadDialog();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-message error";
    }
  });

  // File Dropzone & Preview on Upload Dialog
  const fileInput = $("#note-file");
  const fileDropZone = $("#file-drop-zone");
  const filePreviewName = $("#file-name-preview");

  fileInput?.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      filePreviewName.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size / 1024 / 1024).toFixed(2)} MB)`;
    }
  });

  fileDropZone?.addEventListener("dragover", e => {
    e.preventDefault();
    fileDropZone.classList.add("drag-over");
  });

  fileDropZone?.addEventListener("dragleave", () => {
    fileDropZone.classList.remove("drag-over");
  });

  fileDropZone?.addEventListener("drop", e => {
    e.preventDefault();
    fileDropZone.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      filePreviewName.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size / 1024 / 1024).toFixed(2)} MB)`;
    }
  });

  // Upload Form Submit
  $("#upload-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const file = fileInput?.files[0];
    const msg = $("#upload-message");
    const submitBtn = $("#upload-submit-btn");

    if (!file || (!file.type.match(/^image\/jpeg$/) && !/\.jpe?g$/i.test(file.name))) {
      msg.textContent = "Please choose a valid JPG / JPEG image.";
      msg.className = "form-message error";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      msg.textContent = "Image size exceeds 5 MB. Please choose a smaller JPG image.";
      msg.className = "form-message error";
      return;
    }

    msg.className = "form-message";
    msg.textContent = "Uploading revision note…";
    if (submitBtn) submitBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = {
          title: $("#note-title").value.trim(),
          subject: $("#note-subject").value,
          imageData: reader.result
        };

        const res = await api("/api/admin/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        notes.unshift({ ...res.note, categories: [res.note.subject] });
        render();
        $("#upload-form")?.reset();
        if (filePreviewName) filePreviewName.textContent = "";
        $("#upload-dialog")?.close();
        showToast("Note published successfully to library!", "success");
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "form-message error";
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 10. Initialization
// ==========================================
(async function init() {
  setupEventListeners();

  // Restore saved view mode preference
  if (viewMode === "list") {
    $("#list-view-btn")?.classList.add("active");
    $("#grid-view-btn")?.classList.remove("active");
  }

  try {
    const [notesRes, adminRes] = await Promise.all([
      api("/api/notes"),
      api("/api/admin/me")
    ]);

    const apiNotes = (notesRes.notes || []).map(n => ({
      ...n,
      categories: [n.subject]
    }));

    notes = [...apiNotes, ...samples];
    setAdminState(Boolean(adminRes.admin));
  } catch (err) {
    console.warn("Could not connect to backend server. Operating in offline demo mode.", err);
    notes = samples;
    render();
  }
})();

