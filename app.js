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

// Filter state for tree navigation
let filterKind = null; // 'listening' | 'reading' | null
let filterCat = null;  // category name or null for all
let filterSubCat = null; // sub-cat name or null for all

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
    <div class="reading-search">
      <div class="search-box" id="searchBox">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input type="text" id="searchInput" placeholder="Search by title or answers…" autocomplete="off" value="${searchQuery}">
        <button class="search-clear" id="searchClear" style="${searchQuery ? "" : "display:none"}">✕</button>
      </div>
    </div>
    <div class="reading-list">
      ${sorted.map(row => {
        const titles = Array.isArray(row.item.fl) ? row.item.fl : [row.item.fl];
        const isOpen = expandedItems.has(row.i);
        const testLabel = `P${row.item["sub-cat"] || row.item.name}`;
        const metaInfo = `${row.item.cat || ""} • ${row.item.name || ""}`;
        return `
          <div class="reading-item ${isOpen ? "expanded" : ""}" data-index="${row.i}">
            <div class="reading-main">
              <button class="reading-header" onclick="toggleReading(${row.i})">
                <div class="reading-expand">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
                <div class="reading-title">${titles[0] || "Untitled"}</div>
              </button>
              <div class="reading-meta">
                <span class="reading-badge">${testLabel}</span>
                <span class="reading-meta-text">${metaInfo}</span>
              </div>
            </div>
            <div class="reading-body">
              ${titles.slice(1).map(t => `<div class="reading-extra">${t}</div>`).join("")}
              <div class="reading-answers" style="margin-top: 12px;">
                ${(row.item.keys || []).map((k, i) => `
                  <div class="answer-chip">${i + 1}. ${k}</div>
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
    let rows = cache.listening || [];
    
    // Apply filters
    if (filterKind === "listening") {
      if (filterCat) {
        rows = rows.filter(r => r.item.cat === filterCat);
        if (filterSubCat) {
          rows = rows.filter(r => r.item["sub-cat"] === filterSubCat);
        }
      }
    }
    
    if (!rows.length) {
      main.innerHTML = renderLoading();
      if (!cache.listening) ensure("listening").then(render);
    } else {
      main.innerHTML = renderListeningCards(rows);
    }
  } else {
    let rows = cache.reading || [];
    
    // Apply filters
    if (filterKind === "reading") {
      if (filterCat) {
        rows = rows.filter(r => r.item.cat === filterCat);
        if (filterSubCat) {
          rows = rows.filter(r => r.item["sub-cat"] === filterSubCat);
        }
      }
    }
    
    if (!rows.length) {
      main.innerHTML = renderLoading();
      if (!cache.reading) ensure("reading").then(render);
    } else {
      main.innerHTML = renderReadingList(rows);
      attachSearchListeners();
    }
  }
}

function updateTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === currentTab);
  });
  
  // Show/hide search based on current tab
  if (searchContainer) {
    searchContainer.hidden = currentTab !== "reading";
  }
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
  const listeningData = cache.listening || [];
  const readingData = cache.reading || [];
  
  // Group listening by cat then sub-cat
  const listeningByCat = groupBy(listeningData, "cat");
  const readingByCat = groupBy(readingData, "cat");
  
  let html = `
    <div class="drawer-tree">
      <!-- Listening Section -->
      <div class="tree-folder ${filterKind === 'listening' && !filterCat ? 'open' : ''}" data-type="listening">
        <button class="tree-folder-header" onclick="toggleTreeFolder(this)">
          <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          <span>Listening</span>
          <span class="tree-count">${listeningData.length}</span>
        </button>
        <div class="tree-children">
          ${listeningByCat.map(g => renderTreeCatGroup('listening', g, listeningData)).join("")}
        </div>
      </div>
      
      <!-- Reading Section -->
      <div class="tree-folder ${filterKind === 'reading' && !filterCat ? 'open' : ''}" data-type="reading">
        <button class="tree-folder-header" onclick="toggleTreeFolder(this)">
          <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>Reading</span>
          <span class="tree-count">${readingData.length}</span>
        </button>
        <div class="tree-children">
          ${readingByCat.map(g => renderTreeCatGroup('reading', g, readingData)).join("")}
        </div>
      </div>
    </div>
  `;
  
  drawerNav.innerHTML = html;
}

function renderTreeCatGroup(kind, catGroup, allData) {
  const catName = catGroup.key;
  const subCatGroups = groupBySubCat(allData.filter(r => r.item.cat === catName), "sub-cat");
  const isActive = filterKind === kind && filterCat === catName;
  
  return `
    <div class="tree-folder tree-sub ${isActive ? 'open' : ''}" data-type="${kind}" data-cat="${catName}">
      <button class="tree-folder-header" onclick="toggleTreeFolder(this)">
        <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        <span>${catName}</span>
        <span class="tree-count">${catGroup.count}</span>
      </button>
      <div class="tree-children">
        ${subCatGroups.map(sg => `
          <button class="tree-item ${filterKind === kind && filterCat === catName && filterSubCat === sg.key ? 'active' : ''}" 
                  onclick="setFilter('${kind}', '${catName}', '${sg.key}'); closeDrawer();">
            <span>${sg.key}</span>
            <span class="tree-count">${sg.count}</span>
          </button>
        `).join("")}
        <button class="tree-item ${filterKind === kind && filterCat === catName && !filterSubCat ? 'active' : ''}" 
                onclick="setFilter('${kind}', '${catName}', null); closeDrawer();">
          <span>All ${catName}</span>
          <span class="tree-count">${catGroup.count}</span>
        </button>
      </div>
    </div>
  `;
}

window.toggleTreeFolder = function(btn) {
  const folder = btn.closest('.tree-folder');
  folder.classList.toggle('open');
};

window.setFilter = function(kind, cat, subCat) {
  filterKind = kind;
  filterCat = cat;
  filterSubCat = subCat || null;
  currentTab = kind;
  currentDetail = null;
  updateTabs();
  render();
  updateBreadcrumb();
};

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.item[key];
    if (!map.has(k)) map.set(k, { key: k, count: 0 });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function groupBySubCat(rows, key) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.item[key] || "Other";
    if (!map.has(k)) map.set(k, { key: k, count: 0 });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

window.selectTab = function(tab) {
  filterKind = null;
  filterCat = null;
  filterSubCat = null;
  currentTab = tab;
  currentDetail = null;
  updateTabs();
  render();
  updateBreadcrumb();
};

window.closeDrawer = closeDrawer;

// Breadcrumb
const breadcrumb = document.getElementById("breadcrumb");

function updateBreadcrumb() {
  if (!breadcrumb) return;
  
  if (!filterKind) {
    breadcrumb.style.display = "none";
    return;
  }
  
  breadcrumb.style.display = "flex";
  const kindLabel = filterKind === "listening" ? "Listening" : "Reading";
  const icon = filterKind === "listening" 
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  
  if (filterSubCat) {
    breadcrumb.innerHTML = `
      <button onclick="clearFilter()">${icon} ${kindLabel}</button>
      <span class="breadcrumb-sep">›</span>
      <button onclick="setFilter('${filterKind}', '${filterCat}', null)">${filterCat}</button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${filterSubCat}</span>
    `;
  } else if (filterCat) {
    breadcrumb.innerHTML = `
      <button onclick="clearFilter()">${icon} ${kindLabel}</button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${filterCat}</span>
    `;
  }
}

window.clearFilter = function() {
  filterKind = null;
  filterCat = null;
  filterSubCat = null;
  updateBreadcrumb();
  render();
};

// Search - attach after render since elements are dynamic
function attachSearchListeners() {
  const si = document.getElementById("searchInput");
  const sb = document.getElementById("searchBox");
  const sc = document.getElementById("searchClear");
  
  if (!si || !sb || !sc) return;
  
  si.addEventListener("input", () => {
    searchQuery = si.value.trim();
    sb.classList.toggle("has-value", searchQuery.length > 0);
    sc.style.display = searchQuery ? "block" : "none";
    if (searchQuery && !cache.reading) {
      ensure("reading").then(render);
    } else {
      render();
    }
  });
  
  sc.addEventListener("click", () => {
    si.value = "";
    searchQuery = "";
    sb.classList.remove("has-value");
    sc.style.display = "none";
    render();
    si.focus();
  });
}

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

// Sort button
const sortBtn = document.getElementById("sortBtn");
sortBtn?.addEventListener("click", () => {
  sortDir *= -1;
  sortBtn.classList.toggle("active", sortDir === -1);
  render();
});

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
