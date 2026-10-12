// Record tuple: [test-name, sub-category, category, extra, keys]
// listening [3] = first-image { svg }, reading [3] = first-line (string | string[])
const R = { NAME: 0, SUB_CAT: 1, CAT: 2, EXTRA: 3, KEYS: 4 };

function flTitles(row) {
  const fl = row[R.EXTRA];
  return Array.isArray(fl) ? fl : [fl];
}

// State
const cache = { listening: null, reading: null };
const loadMeta = {
  listening: { inProgress: false, started: false, promise: null },
  reading: { inProgress: false, started: false, promise: null },
};
const loadedUrls = { listening: new Set(), reading: new Set() };
const prefixes = { listening: "l-", reading: "r-" };
const svgCache = new WeakMap();
const expandedItems = new Set();

let currentTab = "listening";
let sortDir = 1;
let searchQuery = "";
let currentDetail = null;

// Filter state for tree navigation
let filterKind = null; // 'listening' | 'reading' | null
let filterCat = null;  // category name or null for all
let filterSubCat = null; // sub-cat name or null for all
let filterName = null;  // test name or null for all

// Sidebar footer (GitHub repo meta)
const sidebarFooter = { contributorsHtml: null, lastUpdated: null };
let githubMetaFetchStarted = false;

// Elements
const main = document.getElementById("main");
const searchInput = document.getElementById("searchInput");
const searchBox = document.getElementById("searchBox");
const searchContainer = document.getElementById("searchContainer");
const searchClear = document.getElementById("searchClear");
const themeBtn = document.getElementById("themeBtn");
const themeIcon = document.getElementById("themeIcon");
const scrollTopBtn = document.getElementById("scrollTop");
const toast = document.getElementById("toast");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const listeningCount = document.getElementById("listeningCount");
const readingCount = document.getElementById("readingCount");

// Mobile sidebar state
let sidebarOpen = false;
const isMobile = () => window.innerWidth <= 768;

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle("open", sidebarOpen);
  if (sidebarOpen && isMobile()) {
    // Show overlay on mobile
    let overlay = document.getElementById("sidebarOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sidebarOverlay";
      overlay.className = "sidebar-overlay";
      overlay.addEventListener("click", closeSidebar);
      document.body.appendChild(overlay);
    }
    overlay.classList.add("open");
  } else {
    const overlay = document.getElementById("sidebarOverlay");
    if (overlay) overlay.classList.remove("open");
  }
}

function closeSidebar() {
  sidebarOpen = false;
  sidebar.classList.remove("open");
  const overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.classList.remove("open");
}

// IndexedDB for caching larger JSON files (much better than localStorage 5MB limit)
const DB_NAME = "toeic-keys-cache";
const DB_VERSION = 2;
const STORE_NAME = "data-cache";
const CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour

let db = null;
let manifest = null; // Will be loaded from data/manifest.json

// Load manifest from data/manifest.json
async function loadManifest() {
  try {
    const res = await fetch("data/manifest.json");
    if (!res.ok) throw new Error("Failed to load manifest");
    manifest = await res.json();
    console.log("Loaded manifest:", Object.keys(manifest));
    return manifest;
  } catch (e) {
    console.error("Manifest load failed:", e);
    // Fallback - old flat format for backwards compat
    manifest = {
      listening: { Hacker: ["data/listening/l-hacker-keys.json"] },
      reading: { Hacker: ["data/reading/r-hacker-keys.json"] }
    };
    return manifest;
  }
}

async function openDB() {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

async function getCachedData(key) {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      
      req.onsuccess = () => {
        const result = req.result;
        if (!result) return resolve(null);
        
        const isExpired = Date.now() - result.timestamp > CACHE_EXPIRY;
        resolve(isExpired ? null : result.data);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function setCachedData(key, data) {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, data, timestamp: Date.now() });
      
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Cache write failed:", e);
  }
}

function collectKindUrls(kind) {
  const categories = manifest[kind];
  if (!categories || typeof categories !== "object") return [];
  const urls = [];
  for (const catName of Object.keys(categories)) {
    for (const url of categories[catName]) urls.push(url);
  }
  return urls;
}

function wrapFileRecords(kind, url, records) {
  const wrapped = [];
  records.forEach((row, i) => {
    if (!Array.isArray(row)) {
      console.warn(`⚠️ [${url}:${i}] Invalid record, skipped`);
      return;
    }
    if (kind === "listening") {
      const img = row[R.EXTRA];
      if (!img || !img.svg) {
        console.warn(`⚠️ [${url}:${i}] Missing [3].svg, skipped (name: "${row[R.NAME] || "N/A"}")`);
        return;
      }
    } else if (kind === "reading") {
      if (!row[R.EXTRA]) {
        console.warn(`⚠️ [${url}:${i}] Missing [3] fl, skipped (name: "${row[R.NAME] || "N/A"}")`);
        return;
      }
      if (!Array.isArray(row[R.KEYS])) {
        console.warn(`⚠️ [${url}:${i}] Missing [4] keys, skipped (name: "${row[R.NAME] || "N/A"}")`);
        return;
      }
    }
    wrapped.push({ item: row, file: url, i });
  });
  return wrapped;
}

function appendToCache(kind, rows) {
  if (!cache[kind]) cache[kind] = [];
  for (const row of rows) {
    row.globalIndex = cache[kind].length;
    cache[kind].push(row);
  }
}

let uiUpdateQueued = false;
function scheduleUIUpdate() {
  if (uiUpdateQueued) return;
  uiUpdateQueued = true;
  requestAnimationFrame(() => {
    uiUpdateQueued = false;
    renderSidebar();
    render();
  });
}

async function fetchFileRecords(url) {
  let cached = await getCachedData(url);
  if (cached && Array.isArray(cached)) {
    console.log(`✓ [${url}] from cache`);
    return cached;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Not an array (${typeof data})`);
  await setCachedData(url, data);
  console.log(`✓ [${url}] ${data.length} items`);
  return data;
}

async function loadOneFile(kind, url) {
  if (loadedUrls[kind].has(url)) return;
  try {
    const records = await fetchFileRecords(url);
    const wrapped = wrapFileRecords(kind, url, records);
    appendToCache(kind, wrapped);
    loadedUrls[kind].add(url);
    scheduleUIUpdate();
  } catch (e) {
    console.error(`❌ [${url}] ${e.name || "Error"}: ${e.message}`);
  }
}

async function loadKindParallel(kind) {
  if (!manifest) await loadManifest();
  const urls = collectKindUrls(kind);
  if (!urls.length) {
    if (!cache[kind]) cache[kind] = [];
    return;
  }
  await Promise.all(urls.map((url) => loadOneFile(kind, url)));
}

function ensure(kind) {
  if (loadMeta[kind].promise) return loadMeta[kind].promise;

  loadMeta[kind].started = true;
  loadMeta[kind].inProgress = true;

  loadMeta[kind].promise = loadKindParallel(kind)
    .catch((e) => {
      console.error(`❌ load ${kind}:`, e);
      if (!cache[kind]) cache[kind] = [];
    })
    .finally(() => {
      loadMeta[kind].inProgress = false;
      loadMeta[kind].promise = null;
      scheduleUIUpdate();
    });

  return loadMeta[kind].promise;
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

function getSvg(row) {
  if (!Array.isArray(row)) {
    console.warn(`⚠️ [getSvg] Invalid row`);
    return null;
  }
  const img = row[R.EXTRA];
  if (!img || !img.svg) {
    console.warn(`⚠️ [getSvg] Missing [3].svg for: "${row[R.NAME] || "N/A"}"`);
    return null;
  }
  if (svgCache.has(row)) return svgCache.get(row).cloneNode(true);
  try {
    const tmpl = new DOMParser().parseFromString(img.svg, "image/svg+xml").documentElement;
    svgCache.set(row, tmpl);
    return tmpl.cloneNode(true);
  } catch (e) {
    console.error(`❌ [getSvg] Parse SVG failed for "${row[R.NAME] || "N/A"}": ${e.message}`);
    return null;
  }
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
    sortDir * (a.item[R.NAME] || "").localeCompare(b.item[R.NAME] || "", "en", { numeric: true })
  );
  
  return `
    <div class="cards-grid">
      ${sorted.map(row => {
        // Skip items without valid SVG
        const svgEl = getSvg(row.item);
        if (!svgEl) return "";
        
        // Show meta based on current filter context (order: cat -> sub-cat -> name)
        let cardMeta;
        if (filterName && filterCat === row.item[R.CAT] && filterSubCat === row.item[R.SUB_CAT]) {
          cardMeta = "";
        } else if (filterSubCat && filterCat === row.item[R.CAT]) {
          cardMeta = row.item[R.NAME] || "";
        } else if (filterCat && filterCat === row.item[R.CAT]) {
          cardMeta = `${row.item[R.SUB_CAT] || ""} • ${row.item[R.NAME] || ""}`;
        } else {
          cardMeta = `${row.item[R.CAT] || ""} • ${row.item[R.SUB_CAT] || ""} • ${row.item[R.NAME] || ""}`;
        }
        return `
        <button class="card" data-index="${row.globalIndex}" onclick="openListening(${row.globalIndex})">
          <div class="card-thumb">
            ${svgEl.outerHTML}
          </div>
          <div class="card-body">
            ${filterName ? `<div class="card-title">${row.item[R.NAME] || row.item[R.CAT]}</div>` : ""}
            ${cardMeta ? `<div class="card-meta"><span>${cardMeta}</span></div>` : ""}
          </div>
        </button>
        `;
      }).join("")}
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
    sortDir * (flTitles(a.item)[0] || "").localeCompare(flTitles(b.item)[0] || "", "en", { numeric: true })
  );

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    sorted = sorted.filter(row => {
      const titles = flTitles(row.item);
      const keys = row.item[R.KEYS] || [];
      return titles.some(t => t.toLowerCase().includes(q)) ||
             keys.some(k => k.toLowerCase().includes(q));
    });
  }
  
  return `
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
        const titles = flTitles(row.item);
        const isOpen = expandedItems.has(row.globalIndex);
        let metaInfo;
        if (filterName && filterCat === row.item[R.CAT] && filterSubCat === row.item[R.SUB_CAT]) {
          metaInfo = "";
        } else if (filterSubCat && filterCat === row.item[R.CAT]) {
          metaInfo = row.item[R.NAME] || "";
        } else if (filterCat) {
          metaInfo = `${row.item[R.SUB_CAT] || ""} • ${row.item[R.NAME] || ""}`;
        } else {
          metaInfo = `${row.item[R.CAT] || ""} • ${row.item[R.SUB_CAT] || ""} • ${row.item[R.NAME] || ""}`;
        }
        return `
          <div class="reading-item ${isOpen ? "expanded" : ""}" data-index="${row.globalIndex}">
            <div class="reading-main">
              <button class="reading-header" onclick="toggleReading(${row.globalIndex})">
                <div class="reading-expand">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
                <div class="reading-title">${titles[0] || "Untitled"}</div>
              </button>
              <div class="reading-meta">
                <span class="reading-meta-text">${metaInfo}</span>
              </div>
            </div>
            <div class="reading-body">
              ${titles.slice(1).map(t => `<div class="reading-extra">${t}</div>`).join("")}
              <div class="reading-answers" style="margin-top: 12px;">
                ${(row.item[R.KEYS] || []).map((k, i) => `
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
      <div class="detail-answers">
        <div class="answers-grid">
          ${item[R.KEYS].map((k, i) => `
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
        rows = rows.filter(r => r.item[R.CAT] === filterCat);
        if (filterSubCat) {
          rows = rows.filter(r => r.item[R.SUB_CAT] === filterSubCat);
          if (filterName) {
            rows = rows.filter(r => r.item[R.NAME] === filterName);
          }
        }
      }
    }

    if (!rows.length && loadMeta.listening.inProgress) {
      main.innerHTML = renderLoading();
    } else {
      main.innerHTML = renderListeningCards(rows);
    }
    if (!loadMeta.listening.started) ensure("listening");
  } else {
    let rows = cache.reading || [];

    // Apply filters
    if (filterKind === "reading") {
      if (filterCat) {
        rows = rows.filter(r => r.item[R.CAT] === filterCat);
        if (filterSubCat) {
          rows = rows.filter(r => r.item[R.SUB_CAT] === filterSubCat);
          if (filterName) {
            rows = rows.filter(r => r.item[R.NAME] === filterName);
          }
        }
      }
    }

    if (!rows.length && loadMeta.reading.inProgress) {
      main.innerHTML = renderLoading();
    } else {
      main.innerHTML = renderReadingList(rows);
      attachSearchListeners();
    }
    if (!loadMeta.reading.started) ensure("reading");
  }
  updateBreadcrumb();
}

// Actions
window.openListening = function(index) {
  const rows = cache.listening;
  if (!rows || !rows[index]) return;
  const item = rows[index].item;
  filterKind = "listening";
  filterCat = item[R.CAT];
  filterSubCat = item[R.SUB_CAT] || null;
  filterName = item[R.NAME] || null;
  currentDetail = item;
  render();
  renderSidebar();
  updateBreadcrumb();
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

window.openReading = function(index) {
  const rows = cache.reading;
  if (!rows || !rows[index]) return;
  const item = rows[index].item;
  filterKind = "reading";
  filterCat = item[R.CAT];
  filterSubCat = item[R.SUB_CAT] || null;
  filterName = item[R.NAME] || null;
  expandedItems.delete(index);
  // Toggle expand/collapse instead of showing detail view
  if (expandedItems.has(index)) {
    expandedItems.delete(index);
  } else {
    expandedItems.add(index);
  }
  render();
  renderSidebar();
  updateBreadcrumb();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.backToList = function() {
  currentDetail = null;
  filterCat = null;
  filterSubCat = null;
  filterName = null;
  render();
  renderSidebar();
};

// Drawer
function renderSidebar() {
  const listeningData = cache.listening || [];
  const readingData = cache.reading || [];
  
  // Group listening by cat then sub-cat
  const listeningByCat = groupBy(listeningData, R.CAT);
  const readingByCat = groupBy(readingData, R.CAT);
  
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-title">Contents</span>
      <button class="sidebar-close-btn" onclick="closeSidebar()" aria-label="Close sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <nav class="sidebar-nav">
      <div class="drawer-tree">
        <!-- Listening Section -->
        <div class="tree-folder ${filterKind === 'listening' ? 'open' : ''}" data-type="listening">
          <div class="tree-folder-header">
            <button class="tree-arrow-btn" onclick="toggleTreeFolder(this)">
              <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button class="tree-label-btn" onclick="setFilter('listening', null, null, null)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <span>Listening</span>
              <span class="tree-count">${listeningData.length}</span>
            </button>
          </div>
          <div class="tree-children">
            ${listeningByCat.map(g => renderTreeCatGroup('listening', g, listeningData)).join("")}
          </div>
        </div>

        <!-- Reading Section -->
        <div class="tree-folder ${filterKind === 'reading' ? 'open' : ''}" data-type="reading">
          <div class="tree-folder-header">
            <button class="tree-arrow-btn" onclick="toggleTreeFolder(this)">
              <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button class="tree-label-btn" onclick="setFilter('reading', null, null, null)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span>Reading</span>
              <span class="tree-count">${readingData.length}</span>
            </button>
          </div>
          <div class="tree-children">
            ${readingByCat.map(g => renderTreeCatGroup('reading', g, readingData)).join("")}
          </div>
        </div>
      </div>
    </nav>
    <footer class="sidebar-footer">
      <p class="sidebar-contributors"><strong>Contributors:</strong> <span id="contributorsList">${sidebarFooter.contributorsHtml ?? "Loading…"}</span></p>
      <p id="updatedDate"><strong>Last Updated:</strong> ${sidebarFooter.lastUpdated ?? "Loading…"}</p>
    </footer>
  `;
}

function renderTreeCatGroup(kind, catGroup, allData) {
  const catName = catGroup.key;
  const subCatGroups = groupBySubCat(allData.filter(r => r.item[R.CAT] === catName));
  const isActive = filterKind === kind && filterCat === catName;
  
  return `
    <div class="tree-folder tree-sub ${isActive ? 'open' : ''}" data-type="${kind}" data-cat="${catName}">
      <div class="tree-folder-header">
        <button class="tree-arrow-btn" onclick="toggleTreeFolder(this)">
          <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button class="tree-label-btn" onclick="setFilter('${kind}', '${catName}', null, null)">
          <span>${catName}</span>
          <span class="tree-count">${catGroup.count}</span>
        </button>
      </div>
      <div class="tree-children">
        ${subCatGroups.map(sg => `
          <div class="tree-folder tree-test ${filterKind === kind && filterCat === catName && filterSubCat === sg.key ? 'open' : ''}" data-type="${kind}" data-cat="${catName}" data-subcat="${sg.key}">
            <div class="tree-folder-header">
              <button class="tree-arrow-btn" onclick="toggleTreeFolder(this)">
                <svg class="tree-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
              <button class="tree-label-btn" onclick="setFilter('${kind}', '${catName}', '${sg.key}', null);">
                <span>${sg.key}</span>
                <span class="tree-count">${sg.count}</span>
              </button>
            </div>
            <div class="tree-children">
              ${sg.tests.map(test => `
                <button class="tree-item ${filterKind === kind && filterCat === catName && filterSubCat === sg.key && filterName === test ? 'active' : ''}"
                        onclick="setFilter('${kind}', '${catName}', '${sg.key}', '${test}');">
                  <span>${test}</span>
                </button>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

window.toggleTreeFolder = function(btn) {
  const folder = btn.closest('.tree-folder');
  folder.classList.toggle('open');
};

window.setFilter = function(kind, cat, subCat, name) {
  filterKind = kind;
  filterCat = cat;
  filterSubCat = subCat || null;
  filterName = name || null;
  currentTab = kind;
  currentDetail = null;
  render();
  updateBreadcrumb();
  renderSidebar();
};

function groupBy(rows, idx) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.item[idx];
    if (!map.has(k)) map.set(k, { key: k, count: 0 });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function groupBySubCat(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.item[R.SUB_CAT] || "Other";
    if (!map.has(k)) map.set(k, { key: k, count: 0, tests: [] });
    map.get(k).count++;
    const testName = r.item[R.NAME];
    if (testName && !map.get(k).tests.includes(testName)) {
      map.get(k).tests.push(testName);
    }
  });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

window.selectTab = function(tab) {
  // Reset filter to match the selected tab
  filterKind = tab === "listening" ? "listening" : "reading";
  filterCat = null;
  filterSubCat = null;
  filterName = null;
  currentTab = tab;
  currentDetail = null;
  render();
  updateBreadcrumb();
  renderSidebar();
};

// Breadcrumb
const breadcrumb = document.getElementById("breadcrumb");

function updateBreadcrumb() {
  if (!breadcrumb) return;
  breadcrumb.style.display = "flex";

  const kindLabel = (k) => k === "listening" ? "Listening" : "Reading";

  // Helper to compute count from current filtered state
  const getCount = () => {
    if (currentDetail) return 1;
    if (currentTab === "listening") {
      let rows = cache.listening || [];
      if (filterKind === "listening") {
        if (filterCat) {
          rows = rows.filter(r => r.item[R.CAT] === filterCat);
          if (filterSubCat) {
            rows = rows.filter(r => r.item[R.SUB_CAT] === filterSubCat);
            if (filterName) rows = rows.filter(r => r.item[R.NAME] === filterName);
          }
        }
      }
      return rows.length;
    } else {
      let rows = cache.reading || [];
      if (filterKind === "reading") {
        if (filterCat) {
          rows = rows.filter(r => r.item[R.CAT] === filterCat);
          if (filterSubCat) {
            rows = rows.filter(r => r.item[R.SUB_CAT] === filterSubCat);
            if (filterName) rows = rows.filter(r => r.item[R.NAME] === filterName);
          }
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        rows = rows.filter(row => {
          const titles = flTitles(row.item);
          const keys = row.item[R.KEYS] || [];
          return titles.some(t => t.toLowerCase().includes(q)) ||
                 keys.some(k => k.toLowerCase().includes(q));
        });
      }
      return rows.length;
    }
  };

  const unit = currentTab === "listening" ? "tests" : "passages";
  const countHtml = `<span class="breadcrumb-count">${getCount()} ${unit}</span>`;

  // Detail view - show item info with filter context (only for listening)
  if (currentDetail && currentTab === "listening") {
    const k = currentTab;
    let html = `<button onclick="backToList()">${kindLabel(k)}</button>`;
    const item = currentDetail;

    if (filterCat || item[R.CAT]) {
      const cat = filterCat || item[R.CAT];
      if (filterKind === currentTab) {
        html += `<span class="breadcrumb-sep">›</span><button onclick="setFilter('${currentTab}', '${cat}', null, null)">${cat}</button>`;
      } else {
        html += `<span class="breadcrumb-sep">›</span><span>${cat}</span>`;
      }
    }
    if (filterSubCat || item[R.SUB_CAT]) {
      const subCat = filterSubCat || item[R.SUB_CAT];
      if (filterKind === currentTab) {
        html += `<span class="breadcrumb-sep">›</span><button onclick="setFilter('${currentTab}', '${filterCat || item[R.CAT]}', '${subCat}', null)">${subCat}</button>`;
      } else {
        html += `<span class="breadcrumb-sep">›</span><span>${subCat}</span>`;
      }
    }
    if (filterName) {
      html += `<span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${filterName}</span>`;
    }
    breadcrumb.innerHTML = `<div class="breadcrumb-path">${html}</div>`;
    return;
  }

  // List view - always show breadcrumb
  const k = filterKind || currentTab || "listening";
  let html = "";

  if (filterName) {
    html = `
      <button onclick="clearFilter()">${kindLabel(k)}</button>
      <span class="breadcrumb-sep">›</span>
      <button onclick="setFilter('${k}', '${filterCat}', null, null)">${filterCat}</button>
      <span class="breadcrumb-sep">›</span>
      <button onclick="setFilter('${k}', '${filterCat}', '${filterSubCat}', null)">${filterSubCat}</button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${filterName}</span>
    `;
  } else if (filterSubCat) {
    html = `
      <button onclick="clearFilter()">${kindLabel(k)}</button>
      <span class="breadcrumb-sep">›</span>
      <button onclick="setFilter('${k}', '${filterCat}', null, null)">${filterCat}</button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${filterSubCat}</span>
    `;
  } else if (filterCat) {
    html = `
      <button onclick="clearFilter()">${kindLabel(k)}</button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${filterCat}</span>
    `;
  } else {
    html = `<span class="breadcrumb-current">${kindLabel(k)}</span>`;
  }

  breadcrumb.innerHTML = `<div class="breadcrumb-path">${html}</div>${countHtml}`;
}

window.clearFilter = function() {
  filterKind = currentTab;
  filterCat = null;
  filterSubCat = null;
  filterName = null;
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
    if (searchQuery && !loadMeta.reading.started) {
      ensure("reading");
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

// Menu button - toggle sidebar on mobile
if (menuBtn) {
  menuBtn.addEventListener("click", toggleSidebar);
}

// Sidebar (always visible on desktop)
renderSidebar();

// Keyboard shortcut for search
document.addEventListener("keydown", e => {
  if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchInput.focus();
  }
});

// Init - load manifest first, then load all data kinds
async function init() {
  await loadManifest();
  
  // Load all kinds defined in manifest
  for (const kind of Object.keys(manifest)) {
    ensure(kind);
  }
  
  render();
  renderSidebar();
}

init();

// Menu button - toggle sidebar on mobile
if (menuBtn) {
  menuBtn.addEventListener("click", toggleSidebar);
}

// Handle resize
window.addEventListener("resize", () => {
  if (!isMobile()) closeSidebar();
});

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
  sortBtn.querySelector(".sort-btn-text").textContent = sortDir === 1 ? "A-Z" : "Z-A";
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

function getGitHubRepo() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.slice(0, -".github.io".length);
    const repo = location.pathname.split("/").filter(Boolean)[0];
    if (owner && repo) return { owner, repo };
  }
  return { owner: "nghinm", repo: "toeic-keys" };
}

const GH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCommitDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = GH_MONTHS[d.getMonth()];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd} ${mon} ${yyyy}, ${hh}:${mm}:${ss}`;
}

const EXCLUDED_CONTRIBUTOR = /\[bot\]$|^(dependabot|renovate(?:-bot)?|github-actions|cursoragent|cursor[-_]?bot|devin-ai|copilot|allcontributors|web-flow)$/i;

function isHumanContributor(c) {
  if (!c || !c.login) return false;
  if (c.type === "Bot") return false;
  return !EXCLUDED_CONTRIBUTOR.test(c.login);
}

async function ghFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

async function fetchGitHubRepoMeta() {
  if (githubMetaFetchStarted) return;
  githubMetaFetchStarted = true;

  const { owner, repo } = getGitHubRepo();
  const base = `/repos/${owner}/${repo}`;

  try {
    const [commits, contributors] = await Promise.all([
      ghFetch(`${base}/commits?per_page=1`),
      ghFetch(`${base}/contributors?per_page=100`),
    ]);

    const commitDate = commits?.[0]?.commit?.committer?.date;
    if (commitDate) {
      sidebarFooter.lastUpdated = formatCommitDate(commitDate) ?? "Unavailable";
    } else {
      sidebarFooter.lastUpdated = "Unavailable";
    }

    const humans = Array.isArray(contributors)
      ? contributors.filter(isHumanContributor)
      : [];

    sidebarFooter.contributorsHtml = humans.length
      ? humans.map(c => `<a href="${c.html_url}" target="_blank" rel="noopener">${c.login}</a>`).join(", ")
      : "None";
  } catch {
    sidebarFooter.contributorsHtml = sidebarFooter.contributorsHtml ?? "Unavailable";
    sidebarFooter.lastUpdated = sidebarFooter.lastUpdated ?? "Unavailable";
  }

  renderSidebar();
}

fetchGitHubRepoMeta();
