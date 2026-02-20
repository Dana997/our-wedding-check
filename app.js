// app.js — Our Pig Wedding v1 (localStorage)
// - Summary + Categories + Vendors + Costs + Dates (upcoming + calendar)
// - Export/Import JSON

const CATEGORIES = [
  { id: "hall", name: "웨딩홀" },
  { id: "sde", name: "스드메+예복" },
  { id: "parents", name: "양가준비" },
  { id: "honeymoon", name: "신혼여행" },
  { id: "home", name: "우리집" },
];

const STORAGE_KEY = "our_pig_wedding_v1";

function uid() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(2, 7)
  );
}

function money(n) {
  const v = Number(n || 0);
  if (!isFinite(v)) return "0";
  return v.toLocaleString("ko-KR");
}

function parseMoney(s) {
  if (typeof s !== "string") s = String(s ?? "");
  const cleaned = s.replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdToDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function defaultState() {
  const s = {
    meta: { title: "우리 결혼 준비 아지트" },
    summaryMemo: "",
    categories: {},
  };
  for (const c of CATEGORIES) {
    s.categories[c.id] = { finalVendorId: null, vendors: [] };
  }
  return s;
}

function normalizeVendor(v) {
  return {
    id: v?.id || uid(),
    name: v?.name || "",
    link: v?.link || "",
    photo: v?.photo || "",
    memo: v?.memo || "",
    date: v?.date || "",
    dateTitle: v?.dateTitle || "",
    budget: Number(v?.budget || 0),
    deposit: Number(v?.deposit || 0),
    balance: Number(v?.balance || 0),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();

    base.meta.title = parsed?.meta?.title || base.meta.title;
    base.summaryMemo = typeof parsed?.summaryMemo === "string" ? parsed.summaryMemo : "";

    for (const c of CATEGORIES) {
      const srcCat = parsed?.categories?.[c.id];
      if (!srcCat) continue;

      base.categories[c.id].finalVendorId = srcCat.finalVendorId || null;
      base.categories[c.id].vendors = (srcCat.vendors || []).map(normalizeVendor);
    }
    return base;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- DOM ----
const $viewSummary = document.getElementById("view-summary");
const $viewCategory = document.getElementById("view-category");

const $siteTitle = document.getElementById("siteTitle");
const $catTitle = document.getElementById("catTitle");
const $vendorList = document.getElementById("vendorList");
const $btnAddVendor = document.getElementById("btnAddVendor");

const $kpiBudget = document.getElementById("kpiBudget");
const $kpiDeposit = document.getElementById("kpiDeposit");
const $kpiBalance = document.getElementById("kpiBalance");
const $kpiTotal = document.getElementById("kpiTotal");

const $finalList = document.getElementById("finalList");
const $upcomingList = document.getElementById("upcomingList");

const $summaryMemo = document.getElementById("summaryMemo");
const $btnSaveSummaryMemo = document.getElementById("btnSaveSummaryMemo");

const $btnExport = document.getElementById("btnExport");
const $importFile = document.getElementById("importFile");

const $calPrev = document.getElementById("calPrev");
const $calNext = document.getElementById("calNext");
const $calLabel = document.getElementById("calLabel");
const $calendar = document.getElementById("calendar");

const vendorTpl = document.getElementById("vendorCardTpl");

// ---- State ----
let state = loadState();
let active = { view: "summary", catId: null };
let calCursor = new Date(); // month cursor for calendar

function getCategory(catId) {
  return state.categories[catId];
}

function setActiveView(view, catId = null) {
  active = { view, catId };

  if ($viewSummary) $viewSummary.classList.toggle("active", view === "summary");
  if ($viewCategory) $viewCategory.classList.toggle("active", view === "category");

  render();
}

// ---- Computations ----
function computeTotalsFromFinals() {
  let budget = 0, deposit = 0, balance = 0, total = 0;

  for (const c of CATEGORIES) {
    const cat = getCategory(c.id);
    const finalId = cat.finalVendorId;
    if (!finalId) continue;

    const v = cat.vendors.find((x) => x.id === finalId);
    if (!v) continue;

    budget += Number(v.budget || 0);
    deposit += Number(v.deposit || 0);
    balance += Number(v.balance || 0);
    total += Number(v.deposit || 0) + Number(v.balance || 0);
  }

  return { budget, deposit, balance, total };
}

function collectAllEvents() {
  const events = [];

  for (const c of CATEGORIES) {
    const cat = getCategory(c.id);
    for (const v of cat.vendors) {
      if (!v.date) continue;
      events.push({
        catId: c.id,
        catName: c.name,
        vendorId: v.id,
        vendorName: v.name || "(이름 없음)",
        date: v.date,
        dateTitle: v.dateTitle || "",
        isFinal: cat.finalVendorId === v.id,
      });
    }
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

// ---- Summary Rendering ----
function renderSummary() {
  if ($siteTitle) $siteTitle.textContent = state.meta.title || "우리 결혼 준비 아지트";
  if ($summaryMemo) $summaryMemo.value = state.summaryMemo || "";

  const t = computeTotalsFromFinals();
  if ($kpiBudget) $kpiBudget.textContent = money(t.budget);
  if ($kpiDeposit) $kpiDeposit.textContent = money(t.deposit);
  if ($kpiBalance) $kpiBalance.textContent = money(t.balance);
  if ($kpiTotal) $kpiTotal.textContent = money(t.total);

  buildFinalList();
  buildUpcomingList();
  renderCalendar();
}

function buildFinalList() {
  if (!$finalList) return;
  $finalList.innerHTML = "";

  for (const c of CATEGORIES) {
    const cat = getCategory(c.id);
    const finalId = cat.finalVendorId;
    const v = finalId ? cat.vendors.find((x) => x.id === finalId) : null;

    const div = document.createElement("div");
    div.className = "final-item";
    div.innerHTML = `
      <div>
        <strong>${c.name}</strong>
        <small>${v ? (v.name || "이름 없음") : "아직 선택 없음"}</small>
      </div>
      <div style="text-align:right">
        <div><small>예산 ${money(v?.budget || 0)}</small></div>
        <div><small>계약금 ${money(v?.deposit || 0)} · 잔금 ${money(v?.balance || 0)}</small></div>
      </div>
    `;
    $finalList.appendChild(div);
  }
}

function buildUpcomingList() {
  if (!$upcomingList) return;
  $upcomingList.innerHTML = "";

  const now = ymdToDate(todayYMD());
  const events = collectAllEvents()
    .filter((e) => ymdToDate(e.date) && ymdToDate(e.date) >= now)
    .slice(0, 8);

  if (events.length === 0) {
    const div = document.createElement("div");
    div.className = "final-item";
    div.innerHTML = `
      <div>
        <strong>등록된 일정이 없어요</strong>
        <small>각 메뉴에서 날짜를 넣으면 여기랑 달력에 표시돼요.</small>
      </div>
    `;
    $upcomingList.appendChild(div);
    return;
  }

  for (const e of events) {
    const div = document.createElement("div");
    div.className = "final-item";
    const badge = e.isFinal ? " · 최종" : "";
    const title = e.dateTitle ? ` - ${escapeHtml(e.dateTitle)}` : "";
    div.innerHTML = `
      <div>
        <strong>${e.date}${badge}</strong>
        <small>${e.catName} · ${escapeHtml(e.vendorName)}${title}</small>
      </div>
      <div style="text-align:right">
        <button class="btn ghost" type="button">열기</button>
      </div>
    `;
    div.querySelector("button").onclick = () => setActiveView("category", e.catId);
    $upcomingList.appendChild(div);
  }
}

function renderCalendar() {
  if (!$calendar || !$calLabel) return;

  const year = calCursor.getFullYear();
  const month = calCursor.getMonth(); // 0-11
  $calLabel.textContent = `${year}년 ${month + 1}월`;

  $calendar.innerHTML = "";

  const heads = ["일", "월", "화", "수", "목", "금", "토"];
  for (const h of heads) {
    const hd = document.createElement("div");
    hd.className = "cal-head";
    hd.textContent = h;
    $calendar.appendChild(hd);
  }

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const totalDays = last.getDate();

  const events = collectAllEvents();
  const eventMap = new Map(); // ymd -> {count, finalCount}
  for (const e of events) {
    if (!e.date) continue;
    if (!eventMap.has(e.date)) eventMap.set(e.date, { count: 0, finalCount: 0 });
    const obj = eventMap.get(e.date);
    obj.count += 1;
    if (e.isFinal) obj.finalCount += 1;
  }

  for (let i = 0; i < startDay; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell mutedCell";
    cell.innerHTML = `<div class="cal-date"></div>`;
    $calendar.appendChild(cell);
  }

  const today = todayYMD();

  for (let day = 1; day <= totalDays; day++) {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const ymd = `${year}-${m}-${d}`;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (ymd === today) cell.classList.add("today");

    const meta = eventMap.get(ymd);
    const dots = [];
    if (meta) {
      const normal = Math.max(0, meta.count - meta.finalCount);
      for (let i = 0; i < Math.min(3, normal); i++) dots.push(`<span class="dot"></span>`);
      for (let i = 0; i < Math.min(2, meta.finalCount); i++) dots.push(`<span class="dot secondary"></span>`);
    }

    cell.innerHTML = `
      <div class="cal-date">${day}</div>
      <div class="cal-dots">${dots.join("")}</div>
    `;

    $calendar.appendChild(cell);
  }
}

// ---- Category Rendering ----
function renderCategory(catId) {
  const meta = CATEGORIES.find((x) => x.id === catId);
  const cat = getCategory(catId);
  if ($catTitle) $catTitle.textContent = meta ? meta.name : "카테고리";
  if (!$vendorList) return;

  $vendorList.innerHTML = "";
  const radioName = `finalPick_${catId}`;

  for (const v of cat.vendors) {
    const node = vendorTpl.content.firstElementChild.cloneNode(true);

    const $radio = node.querySelector(".radioFinal");
    const $badge = node.querySelector(".badge");
    const $name = node.querySelector(".vendorName");
    const $link = node.querySelector(".vendorLink");
    const $photo = node.querySelector(".vendorPhoto");
    const $memo = node.querySelector(".vendorMemo");
    const $date = node.querySelector(".vendorDate");
    const $dateTitle = node.querySelector(".vendorDateTitle");

    const $budget = node.querySelector(".vendorBudget");
    const $deposit = node.querySelector(".vendorDeposit");
    const $balance = node.querySelector(".vendorBalance");
    const $total = node.querySelector(".vendorTotal");

    const $linkOpen = node.querySelector(".linkOpen");
    const $preview = node.querySelector(".preview");
    const $previewImg = node.querySelector(".previewImg");

    $radio.name = radioName;
    $radio.checked = cat.finalVendorId === v.id;
    $badge.style.display = $radio.checked ? "inline-flex" : "none";

    $name.value = v.name;
    $link.value = v.link;
    $photo.value = v.photo;
    $memo.value = v.memo;
    $date.value = v.date || "";
    $dateTitle.value = v.dateTitle || "";

    $budget.value = v.budget ? String(v.budget) : "";
    $deposit.value = v.deposit ? String(v.deposit) : "";
    $balance.value = v.balance ? String(v.balance) : "";

    const refreshTotals = () => {
      v.budget = parseMoney($budget.value);
      v.deposit = parseMoney($deposit.value);
      v.balance = parseMoney($balance.value);

      $total.textContent = money(v.deposit + v.balance);
      saveState();

      renderSummary();
    };

    const refreshLink = () => {
      const url = ($link.value || "").trim();
      if (url) {
        $linkOpen.href = url;
        $linkOpen.style.pointerEvents = "auto";
        $linkOpen.style.opacity = "1";
      } else {
        $linkOpen.href = "javascript:void(0)";
        $linkOpen.style.pointerEvents = "none";
        $linkOpen.style.opacity = ".55";
      }
    };

    const refreshPhoto = () => {
      const url = ($photo.value || "").trim();
      if (url) {
        $preview.classList.remove("hidden");
        $previewImg.src = url;
      } else {
        $preview.classList.add("hidden");
        $previewImg.removeAttribute("src");
      }
    };

    $radio.onchange = () => {
      cat.finalVendorId = v.id;
      saveState();
      render();
    };

    $name.oninput = () => { v.name = $name.value; saveState(); renderSummary(); };
    $link.oninput = () => { v.link = $link.value; saveState(); refreshLink(); };
    $photo.oninput = () => { v.photo = $photo.value; saveState(); refreshPhoto(); };
    $memo.oninput = () => { v.memo = $memo.value; saveState(); };

    $date.oninput = () => { v.date = $date.value; saveState(); renderSummary(); };
    $dateTitle.oninput = () => { v.dateTitle = $dateTitle.value; saveState(); renderSummary(); };

    $budget.oninput = refreshTotals;
    $deposit.oninput = refreshTotals;
    $balance.oninput = refreshTotals;

    node.querySelector(".btnDel").onclick = () => {
      cat.vendors = cat.vendors.filter((x) => x.id !== v.id);
      if (cat.finalVendorId === v.id) cat.finalVendorId = null;
      saveState();
      render();
    };

    refreshTotals();
    refreshLink();
    refreshPhoto();

    $vendorList.appendChild(node);
  }
}

// ---- Render Router ----
function render() {
  if (active.view === "summary") renderSummary();
  if (active.view === "category" && active.catId) renderCategory(active.catId);
}

// ---- Controls ----
if ($btnAddVendor) {
  $btnAddVendor.onclick = () => {
    if (!active.catId) return;

    const cat = getCategory(active.catId);
    cat.vendors.unshift(
      normalizeVendor({
        id: uid(),
        name: "",
        link: "",
        photo: "",
        memo: "",
        date: "",
        dateTitle: "",
        budget: 0,
        deposit: 0,
        balance: 0,
      })
    );

    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

if ($btnSaveSummaryMemo) {
  $btnSaveSummaryMemo.onclick = () => {
    state.summaryMemo = $summaryMemo?.value || "";
    saveState();
  };
}

if ($btnExport) {
  $btnExport.onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "our-pig-wedding-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

if ($importFile) {
  $importFile.onchange = async () => {
    const file = $importFile.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      const base = defaultState();
      base.meta.title = imported?.meta?.title || base.meta.title;
      base.summaryMemo = imported?.summaryMemo || "";

      for (const c of CATEGORIES) {
        const srcCat = imported?.categories?.[c.id];
        if (!srcCat) continue;

        base.categories[c.id].finalVendorId = srcCat.finalVendorId || null;
        base.categories[c.id].vendors = (srcCat.vendors || []).map(normalizeVendor);
      }

      state = base;
      saveState();
      render();
      alert("가져오기 완료!");
    } catch {
      alert("JSON 파일이 올바르지 않아요.");
    } finally {
      $importFile.value = "";
    }
  };
}

if ($calPrev) {
  $calPrev.onclick = () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderSummary();
  };
}
if ($calNext) {
  $calNext.onclick = () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderSummary();
  };
}

// ---- Helpers ----
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- Side Menu ----
function buildSideMenu(){
  const el = document.getElementById("sideMenu");
  if(!el) return;

  el.innerHTML = "";

  const home = document.createElement("button");
  home.className = "btn primary";
  home.type = "button";
  home.textContent = "MAIN";
  home.onclick = () => setActiveView("summary");
  el.appendChild(home);

  // ✅ IDs MUST match CATEGORIES
  const fixedCategories = [
    { id: "hall", name: "웨딩홀" },
    { id: "sde", name: "스드메 + 예복" },
    { id: "parents", name: "양가준비" },
    { id: "honeymoon", name: "신혼여행" },
    { id: "home", name: "우리집" }
  ];

  for(const c of fixedCategories){
    const b = document.createElement("button");
    b.className = "btn";
    b.type = "button";
    b.textContent = c.name;
    b.onclick = () => setActiveView("category", c.id);
    el.appendChild(b);
  }
}

buildSideMenu();
setActiveView("summary");
render();

// ===== Mobile sidebar toggle =====
(() => {
  const openBtn = document.getElementById("btnSidebarOpen");
  const closeBtn = document.getElementById("btnSidebarClose");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sideMenu = document.getElementById("sideMenu");

  const open = () => document.body.classList.add("sidebar-open");
  const close = () => document.body.classList.remove("sidebar-open");

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);

  sideMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (window.matchMedia("(max-width: 768px)").matches) close();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();
