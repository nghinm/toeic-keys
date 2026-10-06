// State
const cache = { listening: null, reading: null };
const pending = { listening: null, reading: null };
const prefixes = { listening: "l-", reading: "r-" };
const svgCache = new WeakMap();
const expandedItems = new Set();

let currentTab = "listening";
let sortDir = 1;
let searchQuery = "";
let currentDetail = null;
let drawerOpen = false;

// Elements
const main = document.getElementById("main");
const tabs = document.getElementById("tabs");
const searchInput = document.getElementById("searchInput");
const searchBox = document.getElementById("searchBox");
const searchContainer = document.getElementById("searchContainer");
const searchClear = document.getElementById("searchClear");
const themeBtn = document.getElementById("themeBtn");
const themeIcon = document.getElementById("themeIcon");
const scrollTopBtn = document.getElementById("scrollTop");
const toast = document.getElementById("toast");
const menuBtn = document.getElementById("menuBtn");
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const drawerNav = document.getElementById("drawerNav");
const closeDrawerBtn = document.getElementById("closeDrawer");
const listeningCount = document.getElementById("listeningCount");
const readingCount = document.getElementById("readingCount");

// Load data directly from JSON files in data/ directory
async function loadKind(kind) {
  const files = {
    listening: "data/l-hacker-keys.json",
    reading: "data/r-hacker-keys.json"
  };
  
  const url = files[kind];
  if (!url) throw new Error("Unknown kind: " + kind);
  
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + url);
  
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Invalid data format");
  
  // Add index for tracking
  return data.map((item, i) => ({ item, file: url, i }));
}

function ensure(kind) {
  if (cache[kind]) return Promise.resolve(cache[kind]);
  if (pending[kind]) return pending[kind];
  
  pending[kind] = loadKind(kind).then(data => {
    cache[kind] = data;
    pending[kind] = null;
    updateCounts();
    return data;
  }).catch(() => {
    pending[kind] = null;
    cache[kind] = [];
    updateCounts();
    return [];
  });
  
  return pending[kind];
}

function updateCounts() {
  listeningCount.textContent = cache.listening?.length || "—";
  readingCount.textContent = cache.reading?.length || "—";
}

// Render functions
function renderWelcome() {
  return `
    <div class="welcome">
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          <path d="M12 6v7M9 10l3-3 3 3"/>
        </svg>
      </div>
      <h1>Welcome to TOEIC Keys</h1>
      <p>Select Listening or Reading above to browse answer keys</p>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="welcome">
      <div class="welcome-icon" style="animation: pulse 1.5s infinite;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <h1>Loading…</h1>
      <p>Fetching the latest data</p>
    </div>
  `;
}

function getSvg(item) {
  if (svgCache.has(item)) return svgCache.get(item).cloneNode(true);
  const tmpl = new DOMParser().parseFromString(item.first_img.svg, "image/svg+xml").documentElement;
  svgCache.set(item, tmpl);
  return tmpl.cloneNode(true);
}

function renderListeningCards(rows) {
  if (!rows.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <path d="M12 19v4M8 23h8"/>
        </svg>
        <p>No listening tests found</p>
      </div>
    `;
  }
  
  const sorted = [...rows].sort((a, b) => 
    sortDir * (a.item.name || "").localeCompare(b.item.name || "", "en", { numeric: true })
  );
  
  return `
    <div class="section-header">
      <div class="section-title listening">
        <div class="icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
        </div>
        Listening
      </div>
      <span class="section-count">${rows.length} tests</span>
    </div>
    <div class="cards-grid">
      ${sorted.map(row => `
        <button class="card" data-index="${row.i}" onclick="openListening(${row.i})">
          <div class="card-thumb">
            ${getSvg(row.item).outerHTML}
          </div>
          <div class="card-body">
            <div class="card-title">${row.item.name || row.item.cat}</div>
            <div class="card-meta">
              <span>${row.item["sub-cat"] || row.item.cat}</span>
            </div>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderReadingList(rows) {
  if (!rows.length) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>No reading passages found</p>
      </div>
    `;
  }
  
  let sorted = [...rows].sort((a, b) => 
    sortDir * ((a.item.fl?.[0]) || "").localeCompare((b.item.fl?.[0]) || "", "en", { numeric: true })
  );
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    sorted = sorted.filter(row => {
      const titles = Array.isArray(row.item.fl) ? row.item.fl : [row.item.fl];
      const keys = row.item.keys || [];
      return titles.some(t => t.toLowerCase().includes(q)) || 
             keys.some(k => k.toLowerCase().includes(q));
    });
  }
  
  return `
    <div class="section-header">
      <div class="section-title reading">
        <div class="icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        Reading
      </div>
      <span class="section-count">${sorted.length} passages${searchQuery ? " (filtered)" : ""}</span>
    </div>
    <div class="reading-list">
      ${sorted.map(row => {
        const titles = Array.isArray(row.item.fl) ? row.item.fl : [row.item.fl];
        const isOpen = expandedItems.has(row.i);
        return `
          <div class="reading-item ${isOpen ? "expanded" : ""}" data-index="${row.i}">
            <button class="reading-header" onclick="toggleReading(${row.i})">
              <div class="reading-expand">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
              <div class="reading-title">${titles[0] || "Untitled"}</div>
            </button>
            <div class="reading-body">
              ${titles.slice(1).map(t => `<div class="reading-extra">${t}</div>`).join("")}
              <div class="reading-answers" style="margin-top: 12px;">
                ${(row.item.keys || []).map((k, i) => `
                  <span class="answer-chip">${i + 1}. ${k}</span>
                `).join("")}
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDetail(item) {
  return `
    <div class="detail-view">
      <div class="detail-header">
        <button class="back-btn" onclick="backToList()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="detail-breadcrumb">
          <span>${item.cat}</span>
          <span>›</span>
          <strong>${item.name}</strong>
        </div>
      </div>
      <div class="detail-answers">
        <div class="answers-grid">
          ${item.keys.map((k, i) => `
            <div class="answer-cell">
              <span class="answer-num">${i + 1}</span>
              <span class="answer-letter">${k}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (searchQuery && currentTab === "listening") {
    currentTab = "reading";
    updateTabs();
  }
  
  if (currentDetail) {
    main.innerHTML = renderDetail(currentDetail);
    return;
  }
  
  if (currentTab === "listening") {
    const rows = cache.listening;
    if (!rows) {
      main.innerHTML = renderLoading();
      ensure("listening").then(render);
    } else {
      main.innerHTML = renderListeningCards(rows);
    }
  } else {
    const rows = cache.reading;
    if (!rows) {
      main.innerHTML = renderLoading();
      ensure("reading").then(render);
    } else {
      main.innerHTML = renderReadingList(rows);
    }
  }
}

function updateTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === currentTab);
  });
}

// Actions
window.openListening = function(index) {
  const rows = cache.listening;
  if (!rows || !rows[index]) return;
  currentDetail = rows[index].item;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.toggleReading = function(index) {
  if (expandedItems.has(index)) {
    expandedItems.delete(index);
  } else {
    expandedItems.add(index);
  }
  const el = document.querySelector(`.reading-item[data-index="${index}"]`);
  if (el) {
    el.classList.toggle("expanded", expandedItems.has(index));
  }
};

window.backToList = function() {
  currentDetail = null;
  render();
};

// Drawer
function openDrawer() {
  drawerOpen = true;
  drawer.inert = false;
  drawer.classList.add("open");
  drawerOverlay.classList.add("open");
  drawerOverlay.hidden = false;
}

function closeDrawer() {
  drawerOpen = false;
  drawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  setTimeout(() => drawerOverlay.hidden = true, 250);
  drawer.inert = true;
}

function renderDrawerNav() {
  const listeningGroups = groupBy(cache.listening || [], "cat");
  const readingGroups = groupBy(cache.reading || [], "cat");
  
  let html = `
    <button class="drawer-item listening ${currentTab === "listening" ? "active" : ""}" onclick="selectTab('listening'); closeDrawer();">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
      </div>
      All Listening (${cache.listening?.length || 0})
    </button>
    <button class="drawer-item reading ${currentTab === "reading" ? "active" : ""}" onclick="selectTab('reading'); closeDrawer();">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      </div>
      All Reading (${cache.reading?.length || 0})
    </button>
  `;
  
  if (listeningGroups.length) {
    html += `<div style="padding: 16px 16px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-3);">Listening by Category</div>`;
    listeningGroups.forEach(g => {
      html += `
        <button class="drawer-item" onclick="filterByCategory('listening', '${g.key}'); closeDrawer();">
          <div class="icon" style="background: var(--listening-bg); color: var(--listening);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
          </div>
          ${g.key} (${g.count})
        </button>
      `;
    });
  }
  
  if (readingGroups.length) {
    html += `<div style="padding: 16px 16px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-3);">Reading by Category</div>`;
    readingGroups.forEach(g => {
      html += `
        <button class="drawer-item" onclick="filterByCategory('reading', '${g.key}'); closeDrawer();">
          <div class="icon" style="background: var(--reading-bg); color: var(--reading);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
          </div>
          ${g.key} (${g.count})
        </button>
      `;
    });
  }
  
  drawerNav.innerHTML = html;
}

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.item[key];
    if (!map.has(k)) map.set(k, { key: k, count: 0 });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

window.selectTab = function(tab) {
  currentTab = tab;
  currentDetail = null;
  updateTabs();
  render();
};

window.filterByCategory = function(kind, cat) {
  currentTab = kind;
  currentDetail = null;
  updateTabs();
  render();
  // Scroll to section
  const el = document.querySelector(".section-title");
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

window.closeDrawer = closeDrawer;

// Search
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  searchBox.classList.toggle("has-value", searchQuery.length > 0);
  if (searchQuery && !cache.reading) {
    ensure("reading").then(render);
  } else {
    render();
  }
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  searchBox.classList.remove("has-value");
  render();
  searchInput.focus();
});

// Tabs
tabs.addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  currentTab = tab.dataset.tab;
  currentDetail = null;
  updateTabs();
  render();
  if (searchQuery) {
    searchInput.value = "";
    searchQuery = "";
    searchBox.classList.remove("has-value");
  }
});

// Drawer
menuBtn.addEventListener("click", () => {
  if (drawerOpen) closeDrawer();
  else {
    renderDrawerNav();
    openDrawer();
  }
});
closeDrawerBtn.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

// Keyboard
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && drawerOpen) closeDrawer();
  if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchInput.focus();
  }
});

// Init
ensure("listening");
ensure("reading");
render();

// Theme toggle
let isDark = localStorage.getItem("theme") === "dark" || 
  (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);

function setTheme(dark) {
  isDark = dark;
  localStorage.setItem("theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  updateThemeIcon();
}

function updateThemeIcon() {
  if (!themeIcon) return;
  if (isDark) {
    // Moon icon
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    `;
  } else {
    // Sun icon
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    `;
  }
}

themeBtn?.addEventListener("click", () => setTheme(!isDark));

// Set initial theme
setTheme(isDark);

// Scroll to top button
window.addEventListener("scroll", () => {
  if (scrollTopBtn) {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 300);
  }
});

scrollTopBtn?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Toast notification
function showToast(message, duration = 2000) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

// Copy to clipboard helper
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard!");
  }).catch(() => {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Copied to clipboard!");
  });
}

// Search bar sticky shadow on scroll
const updatedDate = document.getElementById("updatedDate");
const owner = location.hostname.endsWith(".github.io") ? location.hostname.slice(0, -10) : "";
if (owner) {
  fetch(`https://api.github.com/repos/${owner}/${owner}.github.io/commits?per_page=1`)
    .then(r => r.json())
    .then(data => {
      if (data[0]?.commit?.committer?.date) {
        const d = new Date(data[0].commit.committer.date);
        updatedDate.innerHTML = `<p><strong>Updated:</strong> ${d.toLocaleDateString()}</p>`;
      }
    })
    .catch(() => {});
}
