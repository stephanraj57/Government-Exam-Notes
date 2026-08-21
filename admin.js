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
  const authSec = $("#admin-auth-section");
  const dashSec = $("#admin-dashboard-section");
  const logoutBtn = $("#admin-logout-btn");

  if (authSec) {
    authSec.hidden = false;
    authSec.style.display = "flex";
  }
  if (dashSec) {
    dashSec.hidden = true;
    dashSec.style.display = "none";
  }
  if (logoutBtn) logoutBtn.hidden = true;
  $("#admin-page-password")?.focus();
}

function showDashboard() {
  const authSec = $("#admin-auth-section");
  const dashSec = $("#admin-dashboard-section");
  const logoutBtn = $("#admin-logout-btn");

  if (authSec) {
    authSec.hidden = true;
    authSec.style.display = "none";
  }
  if (dashSec) {
    dashSec.hidden = false;
    dashSec.style.display = "block";
  }
  if (logoutBtn) logoutBtn.hidden = false;
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

  allNotes = [...mergedUploaded, ...activeSamples];

  // Update Metrics
  $("#metric-total-notes").textContent = allNotes.length;
  $("#metric-uploaded-notes").textContent = mergedUploaded.length;
  $("#metric-visitors-count").textContent = visitsCount;

  renderTable();
}

function renderTable() {
  const tbody = $("#admin-notes-tbody");
  const searchTerm = $("#admin-table-search")?.value.trim().toLowerCase() || "";
  const emptyBox = $("#admin-empty-table");

  if (!tbody) return;

  const filtered = allNotes.filter(n => {
    if (!searchTerm) return true;
    const allText = `${n.title} ${n.subject} ${(n.tags || []).join(" ")}`.toLowerCase();
    return allText.includes(searchTerm);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyBox) emptyBox.hidden = false;
    return;
  }

  if (emptyBox) emptyBox.hidden = true;

  tbody.innerHTML = filtered.map(n => {
    const subjKey = getSubjectKey(n.subject);
    const dateFormatted = n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");
    const isUploaded = Boolean(n.imageUrl);

    const thumbHtml = n.imageUrl
      ? `<img src="${n.imageUrl}" alt="${escapeHtml(n.title)}" class="admin-table-thumb">`
      : `<div class="admin-table-thumb-placeholder">📖</div>`;

    const tagsHtml = (n.tags && n.tags.length > 0)
      ? `<div class="table-tags">${n.tags.map(t => `<span class="table-tag">#${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

    return `
      <tr>
        <td>${thumbHtml}</td>
        <td>
          <strong>${escapeHtml(n.title)}</strong>
          ${isUploaded ? '<span class="chip-uploaded">Uploaded</span>' : '<span class="chip-sample">Demo Note</span>'}
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

  editImageData = null;
  $("#edit-note-id").value = note.id;
  $("#edit-note-title").value = note.title;
  $("#edit-note-subject").value = note.subject;
  
  const tagsInput = $("#edit-note-tags");
  if (tagsInput) {
    tagsInput.value = (note.tags || []).join(", ");
  }

  const currentImg = $("#edit-current-img");
  const placeholder = $("#edit-thumb-placeholder");
  const fileNamePrev = $("#edit-file-name-preview");
  const msg = $("#edit-form-msg");
  const fileInput = $("#edit-file-input");

  if (fileInput) fileInput.value = "";
  if (fileNamePrev) fileNamePrev.textContent = "";
  if (msg) {
    msg.textContent = "";
    msg.className = "form-message";
  }

  if (note.imageUrl) {
    if (currentImg) {
      currentImg.src = note.imageUrl;
      currentImg.style.display = "block";
    }
    if (placeholder) placeholder.style.display = "none";
  } else {
    if (currentImg) {
      currentImg.src = "";
      currentImg.style.display = "none";
    }
    if (placeholder) placeholder.style.display = "block";
  }

  const dialog = $("#admin-edit-dialog");
  if (dialog) dialog.showModal();
}

function setupEditFileDrop() {
  const fileInput = $("#edit-file-input");
  const fileNamePrev = $("#edit-file-name-preview");
  const currentImg = $("#edit-current-img");
  const placeholder = $("#edit-thumb-placeholder");
  const msg = $("#edit-form-msg");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!file.type.match(/^image\/jpeg$/) && !/\.jpe?g$/i.test(file.name)) {
      if (msg) {
        msg.textContent = "Please select a JPG or JPEG image.";
        msg.className = "form-message error";
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (msg) {
        msg.textContent = "File size exceeds 5 MB.";
        msg.className = "form-message error";
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      editImageData = e.target.result;
      if (currentImg) {
        currentImg.src = editImageData;
        currentImg.style.display = "block";
      }
      if (placeholder) placeholder.style.display = "none";
      if (fileNamePrev) fileNamePrev.textContent = `New: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      if (msg) msg.textContent = "";
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// 7. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  initTheme();
  setupFileDrop();
  setupEditFileDrop();

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

  // Logout Button
  $("#admin-logout-btn")?.addEventListener("click", async () => {
    if (confirm("Sign out from the Admin session?")) {
      try {
        await api("/api/admin/logout", { method: "POST" });
      } catch {}
      sessionStorage.removeItem("exam_admin_local_session");
      showToast("Signed out successfully.", "info");
      showLogin();
    }
  });

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

  // Table Search Filter
  $("#admin-table-search")?.addEventListener("input", renderTable);

  // Table Actions Delegation (Preview Popup, Edit & Delete for ALL Notes)
  $("#admin-notes-tbody")?.addEventListener("click", async e => {
    const prevBtn = e.target.closest("[data-preview-id]");
    if (prevBtn) {
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
      const id = delBtn.dataset.deleteId;
      if (confirm("Are you sure you want to permanently delete this note?")) {
        try {
          await api("/api/admin/notes/" + id, { method: "DELETE" });
        } catch {}

        // Remove from local custom uploads if present
        const existingLocal = JSON.parse(localStorage.getItem("exam_notes_custom_uploads") || "[]");
        const filteredLocal = existingLocal.filter(x => x.id !== id);
        localStorage.setItem("exam_notes_custom_uploads", JSON.stringify(filteredLocal));

        // Track deleted sample IDs so deleted demo notes disappear permanently
        const deletedSamples = JSON.parse(localStorage.getItem("exam_notes_deleted_sample_ids") || "[]");
        if (!deletedSamples.includes(id)) {
          deletedSamples.push(id);
          localStorage.setItem("exam_notes_deleted_sample_ids", JSON.stringify(deletedSamples));
        }

        sampleNotes = sampleNotes.filter(x => x.id !== id);

        showToast("Note deleted from library.", "success");
        await loadDashboardData();
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
    const dateFormatted = note.date || (note.createdAt ? new Date(note.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent");
    meta.textContent = `${dateFormatted} · 1 Image · High-Resolution Revision Note`;
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
