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

// Filter state for tree navigation
let filterKind = null; // 'listening' | 'reading' | null
let filterCat = null;  // category name or null for all
let filterSubCat = null; // sub-cat name or null for all
let filterName = null;  // test name or null for all

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
    renderSidebar();
    return data;
  }).catch(() => {
    pending[kind] = null;
    cache[kind] = [];
    updateCounts();
    renderSidebar();
    return [];
  });
  
  return pending[kind];
}

function updateCounts() {
  // Count badges are no longer shown in UI
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
    <div class="cards-grid">
      ${sorted.map(row => {
        // Show meta based on current filter context (order: cat -> sub-cat -> name)
        let cardMeta;
        if (filterName && filterCat === row.item.cat && filterSubCat === row.item["sub-cat"]) {
          // Already filtered to this test, hide meta
          cardMeta = "";
        } else if (filterSubCat && filterCat === row.item.cat) {
          // Filtered to sub-cat, show name only
          cardMeta = row.item.name || "";
        } else if (filterCat && filterCat === row.item.cat) {
          // Filtered to cat only, show sub-cat -> name
          cardMeta = `${row.item["sub-cat"] || ""} • ${row.item.name || ""}`;
        } else {
          // No filter or different cat, show cat -> sub-cat -> name
          cardMeta = `${row.item.cat || ""} • ${row.item["sub-cat"] || ""} • ${row.item.name || ""}`;
        }
        return `
        <button class="card" data-index="${row.i}" onclick="openListening(${row.i})">
          <div class="card-thumb">
            ${getSvg(row.item).outerHTML}
          </div>
          <div class="card-body">
            ${filterName ? `<div class="card-title">${row.item.name || row.item.cat}</div>` : ""}
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
        // Show meta based on current filter context
        let metaInfo;
        if (filterName && filterCat === row.item.cat && filterSubCat === row.item["sub-cat"]) {
          metaInfo = row.item.name || "";
        } else if (filterSubCat && filterCat === row.item.cat) {
          metaInfo = `${row.item["sub-cat"] || ""} • ${row.item.name || ""}`;
        } else {
          metaInfo = `${row.item.cat || ""} • ${row.item["sub-cat"] || ""} • ${row.item.name || ""}`;
        }
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
          if (filterName) {
            rows = rows.filter(r => r.item.name === filterName);
          }
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
          if (filterName) {
            rows = rows.filter(r => r.item.name === filterName);
          }
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
  updateBreadcrumb();
}

// Actions
window.openListening = function(index) {
  const rows = cache.listening;
  if (!rows || !rows[index]) return;
  const item = rows[index].item;
  filterKind = "listening";
  filterCat = item.cat;
  filterSubCat = item["sub-cat"] || null;
  filterName = item.name || null;
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
  filterCat = item.cat;
  filterSubCat = item["sub-cat"] || null;
  filterName = item.name || null;
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
  const listeningByCat = groupBy(listeningData, "cat");
  const readingByCat = groupBy(readingData, "cat");
  
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
      <p class="sidebar-contributors"><strong>Contributors:</strong> <span id="contributorsList"><a href="https://github.com/nghinm" target="_blank">nghinm</a></span></p>
      <p id="updatedDate"><strong>Last Update:</strong> Recently</p>
    </footer>
  `;
}

function renderTreeCatGroup(kind, catGroup, allData) {
  const catName = catGroup.key;
  const subCatGroups = groupBySubCat(allData.filter(r => r.item.cat === catName), "sub-cat");
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
    if (!map.has(k)) map.set(k, { key: k, count: 0, tests: [] });
    map.get(k).count++;
    const testName = r.item.name;
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
          rows = rows.filter(r => r.item.cat === filterCat);
          if (filterSubCat) {
            rows = rows.filter(r => r.item["sub-cat"] === filterSubCat);
            if (filterName) rows = rows.filter(r => r.item.name === filterName);
          }
        }
      }
      return rows.length;
    } else {
      let rows = cache.reading || [];
      if (filterKind === "reading") {
        if (filterCat) {
          rows = rows.filter(r => r.item.cat === filterCat);
          if (filterSubCat) {
            rows = rows.filter(r => r.item["sub-cat"] === filterSubCat);
            if (filterName) rows = rows.filter(r => r.item.name === filterName);
          }
        }
      }
      // For reading, apply search filter to count
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        rows = rows.filter(row => {
          const titles = Array.isArray(row.item.fl) ? row.item.fl : [row.item.fl];
          const keys = row.item.keys || [];
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

    if (filterCat || item.cat) {
      const cat = filterCat || item.cat;
      if (filterKind === currentTab) {
        html += `<span class="breadcrumb-sep">›</span><button onclick="setFilter('${currentTab}', '${cat}', null, null)">${cat}</button>`;
      } else {
        html += `<span class="breadcrumb-sep">›</span><span>${cat}</span>`;
      }
    }
    if (filterSubCat || item["sub-cat"]) {
      const subCat = filterSubCat || item["sub-cat"];
      if (filterKind === currentTab) {
        html += `<span class="breadcrumb-sep">›</span><button onclick="setFilter('${currentTab}', '${filterCat || item.cat}', '${subCat}', null)">${subCat}</button>`;
      } else {
        html += `<span class="breadcrumb-sep">›</span><span>${subCat}</span>`;
      }
    }
    if (filterName) {
      html += `<span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${filterName}</span>`;
    }
    breadcrumb.innerHTML = html;
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

  html += `<span class="breadcrumb-spacer"></span>${countHtml}`;
  breadcrumb.innerHTML = html;
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

// Init
ensure("listening");
ensure("reading");
render();
renderSidebar();

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

// Search bar sticky shadow on scroll
const updatedDate = document.getElementById("updatedDate");
const contributorsList = document.getElementById("contributorsList");
const pathParts = location.pathname.split("/").filter(Boolean);
const repoName = pathParts.length >= 1 ? pathParts[0] : "";

async function fetchGitHubInfo() {
  if (!repoName) return;

  try {
    // Fetch repo info (includes pushed_at for last commit)
    const repoRes = await fetch(`https://api.github.com/repos/nghinm/${repoName}`);
    
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      
      // Update last commit date from pushed_at
      if (repoData.pushed_at) {
        const d = new Date(repoData.pushed_at);
        updatedDate.innerHTML = `<p><strong>Last Update:</strong> ${d.toLocaleDateString()}</p>`;
      }
    }

    // Fetch contributors
    const contributorsRes = await fetch(`https://api.github.com/repos/nghinm/${repoName}/contributors?per_page=10`);
    
    if (contributorsRes.ok) {
      const contributorsData = await contributorsRes.json();
      
      if (Array.isArray(contributorsData) && contributorsData.length > 0) {
        contributorsList.innerHTML = contributorsData.map(c => 
          `<a href="${c.html_url}" target="_blank">${c.login}</a>`
        ).join(", ");
      }
    }
  } catch (err) {
    console.log("GitHub API fetch failed");
  }
}

fetchGitHubInfo();
