"use strict";

/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

async function api(path, opts = {}) {
  const timeout = AbortSignal.timeout(20000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const res = await fetch(path, {
    credentials: "same-origin", headers: { Accept: "application/json" }, ...opts, signal,
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.error || JSON.stringify(j); } catch (e) {}
    throw new Error(`HTTP ${res.status} ${detail || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : null;
}

const apiCache = new Map();
async function cachedApi(path, ttlMs = 10000) {
  const now = Date.now();
  const hit = apiCache.get(path);
  if (hit && now - hit.ts < ttlMs) return hit.data;
  const data = await api(path);
  apiCache.set(path, { ts: now, data });
  return data;
}
function invalidate(prefix) { for (const k of apiCache.keys()) if (k.startsWith(prefix)) apiCache.delete(k); }

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return esc(s);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function classTag(c) { return `<span class="tag ${esc(c || "")}">${esc(c || "")}</span>`; }
function statusTag(s) { return `<span class="status-badge status-${esc(s || "")}">${esc(s || "")}</span>`; }
function scoreClass(s) { return s >= 70 ? "score-hi" : s >= 45 ? "score-mid" : "score-lo"; }
function fmtSalary(min, max, cur) {
  // Ignora salários 0 ou nulos
  if ((!min && !max) || (min === 0 && max === 0)) return null;
  const c = cur || "BRL";
  const f = (n) => (n != null ? Number(n).toLocaleString("pt-BR") : "?");
  if (min && max) return `${f(min)}–${f(max)} ${c}`;
  return `${f(min || max)} ${c}`;
}
function techList(j) {
  const raw = typeof j.technologies === "string" ? j.technologies : (j.technologies || []).join(",");
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function showMsg(text, type = "error") {
  const el = $("#msg");
  el.textContent = text;
  el.className = "msg " + type;
  el.style.display = "block";
  if (type === "ok") setTimeout(() => { el.style.display = "none"; }, 3000);
}
function hideMsg() { $("#msg").style.display = "none"; }

function toast(text, type = "") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 250); }, 2600);
}

/* ============ navigation ============ */
const pages = ["dashboard", "jobs", "sources", "reports", "applications", "settings"];
const pageTitles = { dashboard: "Dashboard", jobs: "Vagas", sources: "Fontes", reports: "Relatórios", applications: "Candidaturas", settings: "Configuração" };

function currentPage() { return location.hash.slice(1).split("?")[0] || "dashboard"; }

function showPage(name) {
  pages.forEach((p) => $("#page-" + p).classList.toggle("active", p === name));
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === name));
  $("#page-title").textContent = pageTitles[name] || name;
  if (name === "dashboard") loadDashboard();
  if (name === "jobs") { ensureSourcesForFilter(); ensureCompaniesForFilter(); loadJobs({ reset: true }); }
  if (name === "sources") loadSources();
  if (name === "reports") loadReports();
  if (name === "applications") { restoreApplicationFilters(); loadApplications(); }
  if (name === "settings") loadSettings();
}
$$("#nav a").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  location.hash = a.dataset.page;

}));
window.addEventListener("hashchange", () => {
  const p = currentPage();
  if (pages.includes(p)) showPage(p);
});

const includeEnglishToggle = $("#include-english");
try {
  includeEnglishToggle.checked = localStorage.getItem("includeEnglishPostings") === "true";
} catch {}

function postingLanguagePath(path) {
  return includeEnglishToggle.checked ? path + "?includeEnglish=true" : path;
}

includeEnglishToggle.addEventListener("change", () => {
  try {
    localStorage.setItem("includeEnglishPostings", String(includeEnglishToggle.checked));
  } catch {}
  const company = $("#f-company");
  company.options.length = 1;
  if (currentPage() === "reports") {
    $("#report-detail-content").style.display = "none";
    $("#report-detail-empty").style.display = "block";
  }
  if (currentPage() === "dashboard") $("#dash-recent").textContent = "Atualizando vagas…";
  if (["dashboard", "jobs", "settings"].includes(currentPage())) showPage(currentPage());
});

/* ============ bar list ============ */
function barList(targetId, obj) {
  const el = $("#" + targetId);
  if (!obj || Object.keys(obj).length === 0) { el.innerHTML = '<div class="muted">—</div>'; return; }
  const entries = Object.entries(obj).map(([k, v]) => [k, Number(v) || 0]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  el.innerHTML = entries.map(([k, v]) => `
    <div class="bar-row">
      <div class="name" title="${esc(k)}">${esc(k)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
      <div class="num">${v}</div>
    </div>`).join("");
}

/* ============ DASHBOARD ============ */
async function loadDashboard() {
  const includeEnglish = includeEnglishToggle.checked;
  try {
    const [s, recentJobs] = await Promise.all([
      cachedApi(postingLanguagePath("/api/stats"), 30000),
      cachedApi(postingLanguagePath("/api/jobs/recent"), 30000).catch(() => []),
    ]);
    if (includeEnglish !== includeEnglishToggle.checked || currentPage() !== "dashboard") return;
    $("#dbmode-text").textContent = "DB: " + (s.dbMode || "—");
    $("#nav-dash").textContent = s.total;
    $("#nav-jobs").textContent = s.byStatus?.NEW != null ? s.byStatus.NEW : "·";
    const cards = [
      { label: "Total de vagas", value: s.total, hint: "nos idiomas selecionados" },
      { label: "Favoritadas", value: s.favorited, hint: "★" },
      { label: "Candidaturas", value: s.applied, hint: "enviadas/aprovadas" },
      { label: "Relevantes (GOOD+)", value: (s.byClassification?.GOOD || 0) + (s.byClassification?.PRIORITARY || 0), hint: "aderência alta" },
    ];
    $("#dash-cards").innerHTML = cards.map((c) =>
      `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="hint">${c.hint}</div></div>`).join("");
    barList("dash-class", s.byClassification);
    barList("dash-status", s.byStatus);
    barList("dash-source", s.bySource);
    barList("dash-companies", Object.fromEntries((s.topCompanies || []).map((c) => [c.company, c.count])));

    // Vagas recentes
    const recentEl = $("#dash-recent");
    if (!recentJobs.length) {
      recentEl.innerHTML = '<div class="muted">Nenhuma vaga encontrada ainda.</div>';
    } else {
      recentEl.innerHTML = `<table style="width:100%"><thead><tr><th>Título</th><th>Empresa</th><th>Score</th><th>Classificação</th><th>Data</th><th></th></tr></thead><tbody>
        ${recentJobs.map((j) => {
          const salary = fmtSalary(j.salaryMin, j.salaryMax, j.currency);
          return `<tr>
            <td class="title-cell">${esc(j.title || "")}<div class="company">${esc(j.location || "")}${salary ? ` · <span class="salary">${salary}</span>` : ""}</div></td>
            <td>${esc(j.company || "")}</td>
            <td><span class="score-badge ${scoreClass(j.score)}">${j.score != null ? j.score : ""}</span></td>
            <td>${classTag(j.classification)}</td>
            <td>${fmtDate(j.firstSeenAt)}</td>
            <td><a href="${esc(j.url || "#")}" target="_blank" rel="noopener" class="btn-link" title="Abrir vaga">↗</a></td>
          </tr>`;
        }).join("")}
        </tbody></table>
        <div style="text-align:center;margin-top:12px"><a href="#jobs" class="btn-link">Ver todas as vagas →</a></div>`;
    }

    hideMsg();
  } catch (e) {
    showMsg("Falha ao carregar dashboard: " + e.message);
  }
}

/* ============ JOBS (com cache de cliente + lazy loading) ============ */
const jobsState = {
  filters: {}, sortKey: "score", sortDir: "desc", offset: 0, limit: 50, items: [], total: 0, loading: false,
};

async function ensureSourcesForFilter() {
  const sel = $("#f-source");
  if (sel.options.length > 1) return;
  try {
    const sources = await cachedApi("/api/sources", 60000);
    sources.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.name;
      sel.appendChild(o);
    });
  } catch (e) { /* non-fatal */ }
}

async function ensureCompaniesForFilter() {
  const sel = $("#f-company");
  if (sel.options.length > 1) return;
  const includeEnglish = includeEnglishToggle.checked;
  try {
    const companies = await cachedApi(postingLanguagePath("/api/companies"), 60000);
    if (includeEnglish !== includeEnglishToggle.checked || sel.options.length > 1) return;
    companies.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.company; o.textContent = `${c.company} (${c.count})`;
      sel.appendChild(o);
    });
  } catch (e) { /* non-fatal */ }
}

/* ============ FILTERS ============ */
const FILTER_IDS = ["#f-score", "#f-stack", "#f-seniority", "#f-workModel", "#f-location", "#f-source", "#f-english", "#f-status", "#f-search", "#f-company"];

function readFilters() {
  const f = {};
  const v = (id) => $(id)?.value?.trim() || "";
  if (v("#f-score")) f.scoreMin = v("#f-score");
  if (v("#f-stack")) f.stack = v("#f-stack");
  if (v("#f-seniority")) f.seniority = v("#f-seniority");
  if (v("#f-workModel")) f.workModel = v("#f-workModel");
  if (v("#f-location")) f.location = v("#f-location");
  if (v("#f-source")) f.source = v("#f-source");
  if (v("#f-english")) f.english = v("#f-english");
  if (v("#f-status")) f.status = v("#f-status");
  if (v("#f-company")) f.company = v("#f-company");
  if (v("#f-search")) f.search = v("#f-search");
  if (v("#global-search") && !f.search) f.search = v("#global-search");
  if ($("#f-fav")?.checked) f.favorited = "true";
  return f;
}

function clearAllFilters() {
  [...FILTER_IDS, "#global-search"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
  const fav = $("#f-fav"); if (fav) fav.checked = false;
  clearChips();
  updateFilterCount();
  loadJobs({ reset: true });
}

function updateFilterCount() {
  const count = Object.keys(readFilters()).length;
  const badge = $("#filters-count");
  if (!badge) return;
  badge.textContent = count || "";
  badge.classList.toggle("has-filters", count > 0);
}

function buildQuery(extra = {}) {
  const p = new URLSearchParams();
  if (includeEnglishToggle.checked) p.set("includeEnglish", "true");
  for (const [k, val] of Object.entries(jobsState.filters)) if (val) p.set(k, val);
  p.set("limit", jobsState.limit);
  p.set("offset", jobsState.offset);
  p.set("sort", jobsState.sortKey);
  p.set("order", jobsState.sortDir);
  for (const [k, val] of Object.entries(extra)) p.set(k, val);
  return p.toString();
}

// Toggle filtros
const filtersToggle = $("#filters-toggle");
const filtersBody = $("#filters-body");
const filtersArrow = $("#filters-arrow");
if (filtersToggle) {
  filtersToggle.addEventListener("click", () => {
    filtersBody?.classList.toggle("open");
    filtersArrow?.classList.toggle("open");
  });
}

// Busca automática ao interagir com qualquer filtro
[...FILTER_IDS, "#f-fav"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  const isInstant = el.tagName === "SELECT" || el.type === "checkbox";
  const evt = isInstant ? "change" : "input";
  el.addEventListener(evt, debounce(() => {
    updateFilterCount();
    loadJobs({ reset: true });
  }, isInstant ? 0 : 300));
});

// Botões
$("#btn-search")?.addEventListener("click", () => { loadJobs({ reset: true }); updateFilterCount(); });
$("#btn-clear")?.addEventListener("click", clearAllFilters);
$("#btn-loadmore")?.addEventListener("click", () => loadJobs({}));

/* quick chips */
function clearChips() {
  $$("#quick-chips .chip").forEach((c) => c.classList.remove("active"));
  const fav = $("#f-fav"); if (fav) fav.checked = false;
  const status = $("#f-status"); if (status) status.value = "";
  const workModel = $("#f-workModel"); if (workModel) workModel.value = "";
}
function syncChipState() {
  const f = jobsState.filters;
  $$("#quick-chips .chip").forEach((c) => {
    const q = c.dataset.q;
    const on = (q === "fav" && f.favorited === "true") ||
      (q === "new" && f.status === "NEW") ||
      (q === "applied" && f.status === "APPLIED") ||
      (q === "remote" && f.workModel === "REMOTE");
    c.classList.toggle("active", on);
  });
}
$$("#quick-chips .chip").forEach((chip) => chip.addEventListener("click", () => {
  const q = chip.dataset.q;
  const active = chip.classList.contains("active");

  const fav = $("#f-fav");
  const status = $("#f-status");
  const workModel = $("#f-workModel");
  if (fav) fav.checked = false;
  if (status) status.value = "";
  if (workModel) workModel.value = "";

  if (!active) {
    if (q === "fav" && fav) fav.checked = true;
    if (q === "new" && status) status.value = "NEW";
    if (q === "applied" && status) status.value = "APPLIED";
    if (q === "remote" && workModel) workModel.value = "REMOTE";
  }

  // Sincroniza filters ANTES de syncChipState para o visual atualizar
  jobsState.filters = readFilters();
  syncChipState();
  updateFilterCount();
  loadJobs({ reset: true });
}));

/* global search */
$("#global-search")?.addEventListener("input", debounce(() => {
  const el = $("#f-search"); if (el) el.value = $("#global-search").value;
  if (location.hash.replace("#", "") !== "jobs") { location.hash = "jobs"; }
  else loadJobs({ reset: true });
}, 400));

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function renderJobs() {
  const body = $("#jobs-body");
  const empty = $("#jobs-empty");
  if (!jobsState.items.length) { body.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  body.innerHTML = jobsState.items.map((j, idx) => {
    const techs = techList(j);
    const shown = techs.slice(0, 5);
    const extra = techs.length - shown.length;
    const pills = shown.map((t) => `<span class="pill sm">${esc(t)}</span>`).join("") +
      (extra > 0 ? `<span class="pill sm muted">+${extra}</span>` : "");
    return `
    <tr data-idx="${idx}">
      <td class="title-cell">
        ${j.url ? `<a href="${esc(j.url)}" target="_blank" rel="noopener" class="job-link" title="Abrir vaga em nova aba">${esc(j.title || "")} ↗</a>` : esc(j.title || "")}
        <div class="company">${esc(j.location || "—")}</div>
        <div class="stack-pills">${pills || '<span class="muted" style="font-size:11px">sem stack</span>'}</div>
      </td>
      <td>${esc(j.company || "")}</td>
      <td><span class="score-badge ${scoreClass(j.score)}">${j.score != null ? j.score : ""}</span></td>
      <td>${classTag(j.classification)}</td>
      <td>${statusTag(j.status)}</td>
      <td>${esc(j.workModel || "")}</td>
      <td>${esc(j.seniority || "")}</td>
      <td>
        <div class="row-actions">
          <span class="star ${j.favorited ? "" : "off"}" data-act="fav" title="Favoritar">${j.favorited ? "★" : "☆"}</span>
          <button data-act="open" title="Abrir detalhes">🔍</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  $$("#jobs-body tr").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      // Se clicou no link da vaga, deixa abrir normalmente
      const link = e.target.closest("a");
      if (link && link.classList.contains("job-link")) {
        e.stopPropagation();
        return; // deixa o browser navegar
      }

      const act = e.target.closest("[data-act]");
      if (act && act.dataset.act === "fav") { e.stopPropagation(); toggleFavQuick(jobsState.items[Number(tr.dataset.idx)], tr); return; }
      openJobDrawer(jobsState.items[Number(tr.dataset.idx)]);
    });
  });
}

function updateLoadMore() {
  const wrap = $("#loadmore-wrap");
  wrap.style.display = jobsState.items.length < jobsState.total ? "flex" : "none";
}

async function loadJobs({ reset = false } = {}) {
  if (jobsState.loading && !reset) return;
  jobsState.request?.abort();
  const request = new AbortController();
  jobsState.request = request;
  if (reset) {
    jobsState.offset = 0;
    jobsState.items = [];
    jobsState.total = 0;
    jobsState.filters = readFilters();
    $("#jobs-body").innerHTML = "";
    $("#jobs-empty").style.display = "none";
  }
  jobsState.loading = true;
  $("#jobs-count").textContent = "Carregando vagas…";
  $("#jobs-retry").hidden = true;
  $("#btn-loadmore").disabled = true;
  const sentOffset = jobsState.offset;
  try {
    const cacheKey = "/api/jobs?" + buildQuery();
    const data = await api(cacheKey, { signal: request.signal });
    if (jobsState.request !== request) return;
    const items = data.items || [];
    if (sentOffset === 0) jobsState.items = items;
    else jobsState.items = jobsState.items.concat(items);
    jobsState.total = data.total;
    jobsState.offset = sentOffset + items.length;
    renderJobs();
    $("#btn-loadmore").hidden = false;
    updateLoadMore();
    const shown = jobsState.items.length;
    $("#jobs-count").innerHTML = `<b>${shown}</b> de <b>${jobsState.total}</b> vagas`;
    if (reset) hideMsg();
  } catch (e) {
    if (jobsState.request !== request) return;
    $("#jobs-count").textContent = "Falha ao carregar vagas.";
    $("#jobs-retry").hidden = false;
    $("#loadmore-wrap").style.display = "flex";
    $("#btn-loadmore").hidden = reset;
  } finally {
    if (jobsState.request === request) {
      jobsState.loading = false;
      $("#btn-loadmore").disabled = false;
    }
  }
}

$("#jobs-retry").addEventListener("click", () => loadJobs({ reset: jobsState.offset === 0 }));

function setSort(key) {
  if (jobsState.sortKey === key) jobsState.sortDir = jobsState.sortDir === "asc" ? "desc" : "asc";
  else { jobsState.sortKey = key; jobsState.sortDir = "desc"; }
  $$("#jobs-table th[data-sort]").forEach((th) => {
    const active = th.dataset.sort === key;
    th.classList.toggle("sorted", active);
    const base = th.textContent.replace(/[▼▲]/g, "").trim();
    th.innerHTML = base + (active ? ` <span class="arrow">${jobsState.sortDir === "asc" ? "▲" : "▼"}</span>` : "");
  });
  loadJobs({ reset: true });
}

$$("#jobs-table th[data-sort]").forEach((th) => th.addEventListener("click", () => setSort(th.dataset.sort)));

/* ============ JOB DRAWER ============ */
let currentJobId = null;
let drawerRequest;

function openJobDrawer(job) {
  currentJobId = job.id;
  $("#drawer").classList.add("active");
  $("#m-title").textContent = "Carregando…";
  $("#m-sub").textContent = "";
  $("#drawer .drawer-body").hidden = true;
  drawerRequest?.abort();
  const request = new AbortController();
  drawerRequest = request;
  api("/api/jobs/" + encodeURIComponent(job.id), { signal: request.signal })
    .then((j) => { if (drawerRequest === request) renderDrawer(j); })
    .catch(() => {
      if (drawerRequest !== request) return;
      $("#m-title").textContent = "Falha ao abrir os detalhes";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Tentar novamente";
      retry.addEventListener("click", () => openJobDrawer(job));
      $("#m-sub").append(retry);
    });
}
function closeDrawer() {
  drawerRequest?.abort();
  drawerRequest = undefined;
  currentJobId = null;
  $("#drawer").classList.remove("active");
}
$("#drawer-close").addEventListener("click", closeDrawer);
$("#drawer").addEventListener("click", (e) => { if (e.target === $("#drawer")) closeDrawer(); });

function renderDrawer(j) {
  $("#drawer .drawer-body").hidden = false;
  $("#m-title").textContent = j.title || "(sem título)";
  const stack = (j.technologies || []).map((t) => `<span class="pill">${esc(t)}</span>`).join("");
  $("#m-sub").innerHTML = `${esc(j.company || "")} · ${esc(j.location || "")} · ${esc(j.workModel || "")} · ${esc(j.seniority || "")} · ${classTag(j.classification)} · ${statusTag(j.status)} · Score ${j.score != null ? j.score : ""}`;
  $("#m-pills").innerHTML = stack || '<span class="muted">sem stack detectada</span>';
  $("#m-desc").textContent = j.description || "(sem descrição)";
  $("#m-reasons").innerHTML = (j.matchReasons || []).length ? j.matchReasons.map((r) => `<li>${esc(r)}</li>`).join("") : '<li class="muted">—</li>';
  $("#m-concerns").innerHTML = (j.concerns || []).length ? j.concerns.map((c) => `<li>${esc(c)}</li>`).join("") : '<li class="muted">—</li>';
  const bd = j.breakdown || [];
  $("#m-breakdown").innerHTML = bd.length ? bd.map((b) => {
    const pct = b.maxPoints ? (b.points / b.maxPoints * 100) : 0;
    return `<div class="bd-row"><div class="cat" title="${esc(b.category)}">${esc(b.category)}</div><div class="track"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div><div class="num">${b.points}/${b.maxPoints}</div></div>${b.detail ? `<div class="muted" style="margin:-4px 0 8px 172px;font-size:11px">${esc(b.detail)}</div>` : ""}`;
  }).join("") : '<div class="muted">—</div>';
  $("#m-notes").value = j.notes || "";
  $("#m-notes-msg").textContent = "";
  updateDrawerButtons(j);
  renderApplication(j);
}

function renderApplication(j) {
  const app = (j.applications || []).find((a) => a.coverLetter || a.notes);
  const sec = $("#m-application");
  if (!app) { sec.style.display = "none"; return; }
  sec.style.display = "block";
  let parsed = {};
  try { parsed = app.notes ? JSON.parse(app.notes) : {}; } catch (e) { parsed = {}; }
  const highlights = parsed.highlights || [];
  const answers = parsed.answers || [];
  const highlightsHtml = highlights.length ? `<ul class="reasons">${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : '<div class="muted">—</div>';
  const answersHtml = answers.length ? answers.map((a) => `
    <li><span class="tag ${a.safe ? "tag-ok" : "tag-warn"}">${a.safe ? "auto" : "manual"}</span> <strong>${esc(a.question)}</strong><br/><span>${esc(a.answer)}</span></li>`).join("") : '<div class="muted">—</div>';
  $("#m-app-content").innerHTML = `
    <div class="muted" style="margin-bottom:8px">Versão: ${esc(app.resumeVersion || "")} · Status: ${statusTag(app.status || "")} ${app.appliedAt ? ` · Enviada ${fmtDate(app.appliedAt)}` : ""}</div>
    ${app.applicationUrl ? `<div style="margin-bottom:8px"><a href="${esc(app.applicationUrl)}" target="_blank" rel="noopener">Link de envio/confirmação</a></div>` : ""}
    <h5 class="app-h">Mensagem</h5><pre class="app-text">${esc(parsed.message || "")}</pre>
    <h5 class="app-h">Carta de apresentação</h5><pre class="app-text">${esc(app.coverLetter || "")}</pre>
    <h5 class="app-h">Pontos fortes</h5>${highlightsHtml}
    <h5 class="app-h">Respostas sugeridas</h5><ul class="reasons">${answersHtml}</ul>`;
  $("#m-applied").disabled = app.status !== "APPLICATION_READY";
}

function updateDrawerButtons(j) {
  $("#m-fav").textContent = j.favorited ? "★ Favoritado" : "⭐ Favoritar";
  $("#m-view").textContent = j.viewed ? "👁 Vista" : "👁 Marcar vista";
  $("#m-view").disabled = !!j.viewed;

  const canPrepare = !["APPLIED", "INTERVIEW", "OFFER", "REJECTED", "CLOSED"].includes(j.status);
  $("#m-prepare").disabled = !canPrepare;

  // Mudar texto do botão se já existe candidatura
  $("#m-approve").disabled = Boolean(j.applications?.length);
  const hasApplication = j.applications && j.applications.length > 0 &&
    (j.applications[0].coverLetter || j.applications[0].notes);
  if (hasApplication) {
    $("#m-prepare").textContent = "🔄 Regenerar candidatura";
  } else {
    $("#m-prepare").textContent = "📋 Preparar candidatura";
  }
}

async function jobAction(action, value, { silent = false } = {}) {
  if (!currentJobId) return;
  const jobId = currentJobId;
  try {
    const body = value !== undefined ? { action, value } : { action };
    const r = await api("/api/jobs/" + encodeURIComponent(jobId) + "/action", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (r && r.ok) {
      if (!silent) toast("Ação: " + action, "ok");
      invalidate("/api/stats");
      const full = await api("/api/jobs/" + encodeURIComponent(jobId));
      if (currentJobId === jobId) renderDrawer(full);
      if (currentPage() === "applications") loadApplications(applicationsOffset);
      if (currentPage() === "jobs" && ["favorite", "view", "approve", "ignore", "prepare", "applied"].includes(action)) {
        loadJobs({ reset: true });
      }
      if (location.hash.replace("#", "") === "dashboard") loadDashboard();
    } else {
      showMsg("Ação falhou: " + ((r && r.error) || "resposta inesperada"));
      return false;
    }
    return true;
  } catch (e) { showMsg("Erro na ação: " + e.message); return false; }
}

async function toggleFavQuick(job, tr) {
  if (!job) return;
  const star = tr.querySelector(".star");
  const newVal = !job.favorited;
  if (star) { star.classList.toggle("off", !newVal); star.textContent = newVal ? "★" : "☆"; }
  job.favorited = newVal;
  try {
    await api("/api/jobs/" + encodeURIComponent(job.id) + "/action", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "favorite", value: newVal }),
    });
    invalidate("/api/stats");
  } catch (e) {
    job.favorited = !newVal;
    if (star) { star.classList.toggle("off", newVal); star.textContent = newVal ? "☆" : "★"; }
    toast("Falha ao favoritar", "error");
  }
}

$("#m-fav").addEventListener("click", () => jobAction("favorite", true));
$("#m-view").addEventListener("click", () => jobAction("view"));
$("#m-approve").addEventListener("click", () => jobAction("approve"));
$("#m-ignore").addEventListener("click", () => jobAction("ignore"));
$("#m-prepare").addEventListener("click", () => jobAction("prepare"));
$("#m-applied").addEventListener("click", () => jobAction("applied", currentJobId ? jobsState.items.find((x) => x.id === currentJobId)?.url : undefined));
$("#m-save-notes").addEventListener("click", () => {
  const v = $("#m-notes").value;
  const jobId = currentJobId;
  jobAction("notes", v, { silent: true }).then((saved) => {
    if (!saved || currentJobId !== jobId) return;
    $("#m-notes-msg").textContent = "salvo ✓";
    toast("Nota salva", "ok");
  });
});

/* ============ SOURCES ============ */
async function loadSources() {
  try {
    const sources = await cachedApi("/api/sources", 30000);
    const body = $("#sources-body");
    if (!sources.length) { body.innerHTML = ""; $("#sources-empty").style.display = "block"; return; }
    $("#sources-empty").style.display = "none";
    body.innerHTML = sources.map((s) => `
      <tr>
        <td>${esc(s.name || "")}</td>
        <td>${s.enabled ? "✅" : "❌"}</td>
        <td>${statusTag(s.status || "")}</td>
        <td>${fmtDate(s.lastRunAt)}</td>
        <td>${esc(s.note || "")}</td>
        <td>${s.lastRun && s.lastRun.error ? `<span class="err-text">${esc(s.lastRun.error)}</span>` : "—"}</td>
      </tr>`).join("");
    hideMsg();
  } catch (e) { showMsg("Falha ao carregar fontes: " + e.message); }
}

/* ============ REPORTS ============ */
async function loadReports() {
  try {
    const reports = await cachedApi("/api/reports", 30000);
    const body = $("#reports-body");
    if (!reports.length) { body.innerHTML = ""; $("#reports-empty").style.display = "block"; return; }
    $("#reports-empty").style.display = "none";
    body.innerHTML = reports.map((r) => `
      <tr data-id="${esc(r.id)}" style="cursor:pointer">
        <td>${esc(r.date || "")}</td><td>${r.totalFound != null ? r.totalFound : ""}</td><td>${r.totalRelevant != null ? r.totalRelevant : ""}</td>
      </tr>`).join("");
    $$("#reports-body tr").forEach((tr) => tr.addEventListener("click", () => loadReportDetail(tr.dataset.id)));
    hideMsg();
  } catch (e) { showMsg("Falha ao carregar relatórios: " + e.message); }
}
async function loadReportDetail(id) {
  const includeEnglish = includeEnglishToggle.checked;
  try {
    const r = await cachedApi(postingLanguagePath("/api/reports/" + encodeURIComponent(id)), 60000);
    if (includeEnglish !== includeEnglishToggle.checked) return;
    const bd = r.byClassification || {};
    const bdHtml = Object.entries(bd).map(([k, v]) => `<span class="pill">${esc(k)}: ${v}</span>`).join(" ") || "—";
    const jobsHtml = (r.topJobs || []).map((j) => `
      <div style="margin-bottom:8px"><a href="${esc(j.url || "#")}" target="_blank" rel="noopener">${esc(j.title || "")}</a><br/>
      <span class="muted">${esc(j.company || "")} · score ${j.score != null ? j.score : ""}</span></div>`).join("") || '<div class="muted">—</div>';
    $("#report-detail-content").innerHTML = `
      <p><strong>Data:</strong> ${esc(r.date || "")}</p>
      <p><strong>Total encontrado:</strong> ${r.totalFound != null ? r.totalFound : ""} · <strong>Relevante:</strong> ${r.totalRelevant != null ? r.totalRelevant : ""}</p>
      <h4 class="section-title">Por classificação</h4><div>${bdHtml}</div>
      <h4 class="section-title" style="margin-top:14px">Top vagas</h4>${jobsHtml}`;
    $("#report-detail-empty").style.display = "none";
    $("#report-detail-content").style.display = "block";
  } catch (e) { showMsg("Falha ao carregar relatório: " + e.message); }
}

/* ============ APPLICATIONS ============ */
const stageLabels = {
  APPLICATION_READY: "Preparada", APPLIED: "Enviada", INTERVIEW: "Entrevista",
  OFFER: "Proposta", REJECTED: "Rejeitada", CLOSED: "Encerrada",
};
const applicationsForm = $("#apps-filters");
let applicationsOffset = 0;
let applicationsRequest;

function stageOptions(selected) {
  const options = Object.entries(stageLabels).map(([stage, label]) =>
    `<option value="${stage}" ${stage === selected ? "selected" : ""}>${label}</option>`);
  if (selected && !Object.hasOwn(stageLabels, selected)) {
    options.unshift(`<option value="" selected disabled>${esc(selected)}</option>`);
  }
  return options.join("");
}

applicationsForm.elements.stage.insertAdjacentHTML("beforeend", stageOptions());
function restoreApplicationFilters() {
  const query = new URLSearchParams(location.hash.split("?")[1]);
  for (const field of ["search", "stage", "since", "until"]) applicationsForm.elements[field].value = query.get(field) || "";
}

function applyApplicationFilters() {
  const query = applicationQuery();
  const next = "applications" + (query.size ? "?" + query : "");
  if (location.hash.slice(1) === next) loadApplications();
  else location.hash = next;
}

function applicationQuery() {
  const query = new URLSearchParams();
  for (const [field, value] of new FormData(applicationsForm)) {
    if (value.trim()) query.set(field, value.trim());
  }
  return query;
}

applicationsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyApplicationFilters();
});
$("#apps-clear").addEventListener("click", () => {
  applicationsForm.reset();
  applyApplicationFilters();
});
$("#apps-retry").addEventListener("click", () => loadApplications(applicationsOffset));
$("#apps-prev").addEventListener("click", () => loadApplications(Math.max(0, applicationsOffset - 25)));
$("#apps-next").addEventListener("click", () => loadApplications(applicationsOffset + 25));

async function loadApplications(offset = 0) {
  applicationsRequest?.abort();
  const request = new AbortController();
  applicationsRequest = request;
  applicationsOffset = offset;
  const query = applicationQuery();
  const hasFilters = query.size > 0;
  for (const field of ["since", "until"]) {
    const day = query.get(field);
    if (!day) continue;
    const date = new Date(day + "T00:00:00");
    if (field === "until") date.setDate(date.getDate() + 1);
    query.set(field + "Offset", date.getTimezoneOffset());
  }
  query.set("offset", offset);
  const count = $("#apps-count");
  const body = $("#apps-body");
  count.textContent = "Carregando candidaturas…";
  body.innerHTML = "";
  $("#apps-empty").style.display = "none";
  $("#apps-retry").hidden = true;
  $("#apps-pagination").hidden = true;
  try {
    const { items, total, limit } = await api("/api/applications?" + query, { signal: request.signal });
    if (applicationsRequest !== request || currentPage() !== "applications") return;
    if (!items.length && offset > 0) return loadApplications(Math.max(0, Math.ceil(total / limit) * limit - limit));
    count.textContent = items.length ? `${offset + 1}–${offset + items.length} de ${total} candidaturas` : "0 candidaturas";
    $("#apps-empty").style.display = items.length ? "none" : "block";
    $("#apps-empty").textContent = hasFilters ? "Nenhuma candidatura corresponde aos filtros." : "Nenhuma candidatura cadastrada.";
    body.innerHTML = items.map((a, index) => `
      <tr data-index="${index}">
        <td><button type="button" data-open>${esc(a.jobTitle)}</button></td><td>${esc(a.company)}</td>
        <td><select aria-label="Etapa para ${esc(a.jobTitle)}">${stageOptions(a.status)}</select></td>
        <td>${fmtDate(a.appliedAt)}</td>
        <td>${a.applicationUrl ? `<a href="${esc(a.applicationUrl)}" target="_blank" rel="noopener">Envio</a> · ` : ""}${a.jobUrl ? `<a href="${esc(a.jobUrl)}" target="_blank" rel="noopener">Vaga</a>` : ""}</td>
      </tr>`).join("");
    for (const row of body.rows) {
      const application = items[Number(row.dataset.index)];
      row.querySelector("[data-open]").addEventListener("click", () => openJobDrawer({ id: application.jobId }));
      const select = row.querySelector("select");
      select.addEventListener("change", async () => {
        select.disabled = true;
        try {
          await api("/api/applications/" + encodeURIComponent(application.id) + "/stage", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: select.value }),
          });
          invalidate("/api/stats");
          toast("Etapa atualizada", "ok");
          if (currentPage() === "applications") loadApplications(applicationsOffset);
        } catch (error) {
          select.value = Object.hasOwn(stageLabels, application.status) ? application.status : "";
          toast("Falha ao atualizar etapa: " + error.message, "error");
        } finally {
          select.disabled = false;
        }
      });
    }
    $("#apps-pagination").hidden = total <= limit;
    $("#apps-prev").disabled = offset === 0;
    $("#apps-next").disabled = offset + limit >= total;
  } catch (error) {
    if (applicationsRequest !== request || currentPage() !== "applications") return;
    count.textContent = "Falha ao carregar candidaturas: " + error.message;
    $("#apps-retry").hidden = false;
  }
}

/* ============ SETTINGS ============ */
async function loadSettings() {
  const el = $("#settings-content");
  try {
    const [s, resumeData] = await Promise.all([
      cachedApi(postingLanguagePath("/api/stats"), 30000),
      api("/api/resume").catch(() => ({ active: null, history: [] })),
    ]);
    const dbMode = s.dbMode || "—";
    const activeResume = resumeData.active;
    const history = resumeData.history || [];

    let resumeHtml = `
      <div class="panel" style="margin-bottom:20px">
        <h3 style="margin-bottom:15px">📄 Currículo</h3>
        <div id="resume-upload-area" style="border:2px dashed #ccc;border-radius:8px;padding:30px;text-align:center;cursor:pointer;transition:border-color 0.2s">
          <input type="file" id="resume-file" accept=".pdf" style="display:none" />
          <div style="color:#666">
            <div style="font-size:48px;margin-bottom:10px">📄</div>
            <div style="font-size:16px;margin-bottom:5px"><strong>Arraste um PDF ou clique para selecionar</strong></div>
            <div style="font-size:12px">Apenas arquivos PDF (máximo 5MB)</div>
          </div>
        </div>
        <div id="resume-status" style="margin-top:15px"></div>
      </div>`;

    if (activeResume) {
      const techs = activeResume.technologies || [];
      const exp = activeResume.experience || {};
      const edu = activeResume.education || {};
      resumeHtml += `
        <div class="panel" style="margin-bottom:20px">
          <h3 style="margin-bottom:15px">✅ Currículo Ativo</h3>
          <div style="display:grid;grid-template-columns:200px 1fr;gap:10px">
            <div class="muted">Arquivo</div><div><strong>${esc(activeResume.originalName)}</strong></div>
            <div class="muted">Enviado em</div><div>${fmtDate(activeResume.createdAt)}</div>
            <div class="muted">Tecnologias</div><div>${techs.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ") || "—"}</div>
            <div class="muted">Experiência</div><div>${exp.years != null ? `${exp.years} anos` : "—"} ${exp.level ? `(${esc(exp.level)})` : ""}</div>
            <div class="muted">Áreas</div><div>${(exp.areas || []).map((a) => `<span class="pill">${esc(a)}</span>`).join(" ") || "—"}</div>
            <div class="muted">Formação</div><div>${edu.degree ? esc(edu.degree) : "—"} ${edu.field ? `em ${esc(edu.field)}` : ""}</div>
            <div class="muted">Instituição</div><div>${edu.institution ? esc(edu.institution) : "—"}</div>
          </div>
        </div>`;
    }

    if (history.length > 1) {
      resumeHtml += `
        <div class="panel">
          <h3 style="margin-bottom:15px">📚 Histórico de Currículos</h3>
          <table style="width:100%">
            <thead><tr><th>Arquivo</th><th>Tecnologias</th><th>Data</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${history.map((r) => `
                <tr>
                  <td>${esc(r.originalName)}</td>
                  <td>${(r.technologies || []).slice(0, 5).map((t) => `<span class="pill sm">${esc(t)}</span>`).join(" ")}</td>
                  <td>${fmtDate(r.createdAt)}</td>
                  <td>${r.isActive ? '<span class="tag tag-ok">Ativo</span>' : '<span class="tag">Inativo</span>'}</td>
                  <td>
                    ${!r.isActive ? `<button class="btn-sm" onclick="activateResume('${r.id}')">Ativar</button>` : ""}
                    <button class="btn-sm btn-danger" onclick="deleteResume('${r.id}')">Excluir</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`;
    }

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:200px 1fr;gap:10px;margin-bottom:20px">
        <div class="muted">DB Mode</div><div><strong>${esc(dbMode)}</strong></div>
        <div class="muted">Vagas nos idiomas selecionados</div><div><strong>${s.total}</strong></div>
        <div class="muted">Candidaturas</div><div><strong>${s.applied}</strong></div>
      </div>
      <hr style="margin-bottom:20px"/>
      ${resumeHtml}
      <hr style="margin-top:20px"/>
      <p class="muted" style="line-height:1.6">Alvo de produção: <strong>Supabase</strong>. A <strong>Fase 4</strong> é <strong>assistida</strong>: o bot <em>gera</em> a candidatura (mensagem, carta e respostas) a partir do currículo real, mas o <strong>envio é sempre humano</strong> — o bot <strong>nunca</strong> contorna CAPTCHA/2FA/anti-bot nem envia automaticamente.</p>`;

    // Setup upload area
    const uploadArea = $("#resume-upload-area");
    const fileInput = $("#resume-file");

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.style.borderColor = "#007bff"; });
    uploadArea.addEventListener("dragleave", () => { uploadArea.style.borderColor = "#ccc"; });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = "#ccc";
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].name.endsWith(".pdf")) {
        uploadResume(files[0]);
      } else {
        toast("Apenas arquivos PDF são aceitos", "error");
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        uploadResume(e.target.files[0]);
      }
    });

    hideMsg();
  } catch (e) { el.innerHTML = `<div class="err-text">Falha ao carregar config: ${esc(e.message)}</div>`; }
}

async function uploadResume(file) {
  const statusEl = $("#resume-status");
  statusEl.innerHTML = '<div class="muted">⏳ Processando currículo...</div>';

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/resume/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erro ao enviar currículo");
    }

    toast("Currículo enviado com sucesso!", "ok");
    invalidate("/api/resume");
    invalidate("/api/settings");
    loadSettings();
  } catch (e) {
    statusEl.innerHTML = `<div class="err-text">❌ ${esc(e.message)}</div>`;
    toast("Erro ao enviar currículo", "error");
  }
}

async function activateResume(id) {
  try {
    await api(`/api/resume/${id}/activate`, { method: "POST" });
    toast("Currículo ativado", "ok");
    invalidate("/api/resume");
    invalidate("/api/settings");
    loadSettings();
  } catch (e) {
    toast("Erro ao ativar currículo", "error");
  }
}

async function deleteResume(id) {
  if (!confirm("Tem certeza que deseja excluir este currículo?")) return;
  try {
    await api(`/api/resume/${id}`, { method: "DELETE" });
    toast("Currículo excluído", "ok");
    invalidate("/api/resume");
    invalidate("/api/settings");
    loadSettings();
  } catch (e) {
    toast("Erro ao excluir currículo", "error");
  }
}

/* ============ refresh / auto-refresh ============ */
$("#btn-refresh").addEventListener("click", () => {
  invalidate("/api/stats"); invalidate("/api/sources"); invalidate("/api/reports"); invalidate("/api/applications");
  const p = currentPage();
  showPage(p);
  const b = $("#btn-refresh");
  b.classList.add("spin");
  setTimeout(() => b.classList.remove("spin"), 1000);
});
let autoTimer = null;
$("#auto-refresh").addEventListener("change", (e) => {
  if (e.target.checked) {
    autoTimer = setInterval(() => {
      invalidate("/api/stats");
      if (location.hash.replace("#", "") === "jobs") loadJobs({ reset: true });
      else if (location.hash.replace("#", "") === "dashboard") loadDashboard();
    }, 45000);
    toast("Auto-refresh ativado (45s)", "ok");
  } else if (autoTimer) { clearInterval(autoTimer); autoTimer = null; toast("Auto-refresh desativado"); }
});

/* ============ init ============ */
(function init() {
  const p = currentPage();
  if (pages.includes(p)) showPage(p); else { location.hash = "dashboard"; }
})();
