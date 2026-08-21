/**
 * Admin Portal JavaScript Logic
 * Handles Authentication, File Drag-and-Drop Live Preview, Note Uploads,
 * Notes Management Table, Real-time Metrics, and Toast Alerts.
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let allNotes = [];
let sampleNotes = [
  { id: "sample0", title: "Preamble of the Constitution", subject: "UPSC Polity", date: "20 May 2024", isSample: true },
  { id: "sample1", title: "Fundamental Rights – Overview", subject: "UPSC Polity", date: "19 May 2024", isSample: true },
  { id: "sample2", title: "Physical Divisions of India", subject: "Geography", date: "18 May 2024", isSample: true },
  { id: "sample3", title: "Governor – Powers & Functions", subject: "UPSC Polity", date: "18 May 2024", isSample: true },
  { id: "sample4", title: "Revolt of 1857 – Causes", subject: "SSC History", date: "17 May 2024", isSample: true },
  { id: "sample5", title: "Mauryan Empire – Key Points", subject: "SSC History", date: "16 May 2024", isSample: true },
  { id: "sample6", title: "Sectors of Indian Economy", subject: "Economy", date: "15 May 2024", isSample: true },
  { id: "sample7", title: "Water Resources – Overview", subject: "Geography", date: "14 May 2024", isSample: true }
];

let selectedImageData = null;

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
// 3. Authentication & View Switch
// ==========================================
async function checkAuth() {
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
  $("#admin-auth-section").hidden = false;
  $("#admin-dashboard-section").hidden = true;
  $("#admin-logout-btn").hidden = true;
  $("#admin-page-password")?.focus();
}

function showDashboard() {
  $("#admin-auth-section").hidden = true;
  $("#admin-dashboard-section").hidden = false;
  $("#admin-logout-btn").hidden = false;
  loadDashboardData();
}

// ==========================================
// 4. Data Loading & Metrics
// ==========================================
async function loadDashboardData() {
  try {
    const [notesData, visitsData] = await Promise.all([
      api("/api/notes"),
      api("/api/visits").catch(() => ({ count: 0 }))
    ]);

    const uploaded = notesData.notes || [];
    allNotes = [...uploaded, ...sampleNotes];

    // Update Metrics
    $("#metric-total-notes").textContent = allNotes.length;
    $("#metric-uploaded-notes").textContent = uploaded.length;
    $("#metric-visitors-count").textContent = visitsData.count || 0;

    renderTable();
  } catch (err) {
    console.error("Error loading dashboard data:", err);
    allNotes = sampleNotes;
    renderTable();
  }
}

function renderTable() {
  const tbody = $("#admin-notes-tbody");
  const searchTerm = $("#admin-table-search")?.value.trim().toLowerCase() || "";
  const emptyBox = $("#admin-empty-table");

  if (!tbody) return;

  const filtered = allNotes.filter(n => {
    if (!searchTerm) return true;
    return (`${n.title} ${n.subject}`).toLowerCase().includes(searchTerm);
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

    return `
      <tr>
        <td>${thumbHtml}</td>
        <td>
          <strong>${escapeHtml(n.title)}</strong>
          ${isUploaded ? '<span class="chip-uploaded">Uploaded</span>' : '<span class="chip-sample">Demo Note</span>'}
        </td>
        <td><span class="subject-chip ${subjKey}">${escapeHtml(n.subject)}</span></td>
        <td class="text-muted">${dateFormatted}</td>
        <td class="text-right">
          <div class="action-btn-group">
            <a href="index.html" class="table-btn preview-btn" title="View on Live Home Page">👁</a>
            ${isUploaded ? `
              <button type="button" class="table-btn delete-btn" data-delete-id="${n.id}" title="Delete Note from Library">🗑</button>
            ` : `<span class="text-muted" title="Sample notes are built-in">Fixed</span>`}
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
// 6. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  initTheme();
  setupFileDrop();

  // Login Form Submit
  $("#admin-page-login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const pwdInput = $("#admin-page-password");
    const msg = $("#admin-page-login-msg");
    const btn = $("#admin-page-login-submit");

    if (!pwdInput || !msg) return;

    msg.textContent = "Verifying password credentials…";
    msg.className = "form-message";
    btn.disabled = true;

    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdInput.value })
      });
      showToast("Authentication successful! Welcome to Admin Studio.", "success");
      showDashboard();
    } catch (err) {
      msg.textContent = err.message || "Invalid password.";
      msg.className = "form-message error";
    } finally {
      btn.disabled = false;
    }
  });

  // Logout Button
  $("#admin-logout-btn")?.addEventListener("click", async () => {
    if (confirm("Sign out from the Admin session?")) {
      try {
        await api("/api/admin/logout", { method: "POST" });
        showToast("Signed out successfully.", "info");
        showLogin();
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });

  // Upload Form Submit
  $("#admin-upload-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const titleInput = $("#studio-note-title");
    const subjectInput = $("#studio-note-subject");
    const msg = $("#studio-upload-msg");
    const submitBtn = $("#studio-submit-btn");

    if (!selectedImageData) {
      msg.textContent = "Please choose a JPG image to upload.";
      msg.className = "form-message error";
      return;
    }

    msg.textContent = "Publishing note to library…";
    msg.className = "form-message";
    submitBtn.disabled = true;

    try {
      const res = await api("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          subject: subjectInput.value,
          imageData: selectedImageData
        })
      });

      showToast("✓ Revision note successfully published! Now live on Home Page.", "success");
      msg.textContent = "✓ Published! Note is now visible to all students.";
      msg.className = "form-message";

      // Reset form
      $("#admin-upload-form").reset();
      selectedImageData = null;
      $("#dropzone-prompt").hidden = false;
      $("#dropzone-preview-wrap").hidden = true;

      // Refresh dashboard
      await loadDashboardData();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-message error";
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Table Search Filter
  $("#admin-table-search")?.addEventListener("input", renderTable);

  // Table Delete Button Click Delegation
  $("#admin-notes-tbody")?.addEventListener("click", async e => {
    const delBtn = e.target.closest("[data-delete-id]");
    if (!delBtn) return;

    const id = delBtn.dataset.deleteId;
    if (confirm("Are you sure you want to permanently delete this note? It will be removed from the public site immediately.")) {
      try {
        await api("/api/admin/notes/" + id, { method: "DELETE" });
        showToast("Note deleted from library.", "success");
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

// Start
setupEventListeners();
checkAuth();
