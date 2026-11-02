const $ = (id) => document.getElementById(id);
let state = null;

const RANKS = ["Stone I","Stone II","Stone III","Iron I","Iron II","Iron III","Bronze I","Bronze II","Bronze III",
  "Silver I","Silver II","Silver III","Gold I","Gold II","Gold III","Diamond I","Diamond II","Diamond III",
  "Adamantine I","Adamantine II","Adamantine III"];

// camelCase / snake_case -> readable label
const label = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

function fmtDur(sec) {
  if (sec == null || sec <= 0) return "0분";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return (h ? `${h}시간 ` : "") + `${m}분`;
}

// Project the token count forward from the server snapshot time.
function project(t, syncedAt, now) {
  const elapsed = Math.max(0, now - syncedAt);
  const delay = t.regenDelayInSeconds;
  let cur = t.current, toNext = t.nextTokenInSeconds;
  if (cur >= t.max) return { cur: t.max, toNext: null, toFull: 0 };
  if (!delay || toNext == null) return { cur, toNext: null, toFull: null };
  let left = elapsed;
  if (left >= toNext) {
    left -= toNext; cur += 1;
    cur += Math.floor(left / delay);
    left = left % delay;
    toNext = delay - left;
  } else toNext -= left;
  if (cur >= t.max) return { cur: t.max, toNext: null, toFull: 0 };
  return { cur, toNext, toFull: toNext + (t.max - cur - 1) * delay };
}

function renderTokens() {
  const now = Math.floor(Date.now() / 1000);
  const synced = state.lastUpdatedOn || state.serverTime;
  const box = $("tokens");
  if (!state.tokens.length) {
    box.innerHTML = '<p class="muted">응답에서 토큰 정보를 찾지 못했습니다. 키에 Player 권한이 있는지 확인하세요.</p>';
    return;
  }
  box.innerHTML = state.tokens.map((t) => {
    const p = project(t, synced, now);
    const full = p.cur >= t.max;
    const pct = Math.min(100, Math.round((p.cur / t.max) * 100));
    return `<div class="tok ${full ? "full" : ""}">
      <div class="name">${label(t.name)}${full ? '<span class="badge">가득 참 · 낭비 중</span>' : ""}</div>
      <div class="count">${p.cur}<small> / ${t.max}</small></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="muted small">${full ? "재생이 멈춘 상태입니다" :
        p.toNext == null ? "재생 정보 없음" :
        `다음 토큰까지 ${fmtDur(p.toNext)} · 가득 찰 때까지 ${fmtDur(p.toFull)}`}</div>
    </div>`;
  }).join("");
}

function renderUnits() {
  const q = $("filter").value.trim().toLowerCase();
  const rows = state.units
    .filter((u) => !q || `${u.name} ${u.faction || ""}`.toLowerCase().includes(q))
    .sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1) || String(a.name).localeCompare(String(b.name)));
  $("units").innerHTML = rows.map((u) => `<tr>
    <td>${esc(label(String(u.name)))}</td><td>${esc(u.faction || "-")}</td>
    <td>${u.rank != null ? RANKS[u.rank] || u.rank : "-"}</td><td>${u.xpLevel ?? "-"}</td>
    <td>${u.progressionIndex ?? "-"}</td><td>${u.upgrades}/6</td></tr>`).join("");
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  $("login").hidden = true;
  $("result").hidden = false;
  $("pname").textContent = state.name || "이름 없음";
  const synced = state.lastUpdatedOn ? new Date(state.lastUpdatedOn * 1000).toLocaleString("ko-KR") : "-";
  $("pmeta").textContent = `전투력 ${state.powerLevel ?? "-"} · 마지막 서버 동기화 ${synced}`;
  $("ucount").textContent = `(${state.unitCount})`;
  renderTokens();
  renderUnits();
}

function showError(msg) {
  const e = $("error");
  e.textContent = msg;
  e.hidden = false;
  $("login").hidden = false;
  $("result").hidden = true;
}

async function load(key) {
  $("go").disabled = true;
  $("error").hidden = true;
  try {
    const r = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `오류 (HTTP ${r.status})`);
    state = data;
    sessionStorage.setItem("tacticus_key", key);
    render();
  } catch (err) {
    sessionStorage.removeItem("tacticus_key");
    showError(err.message);
  } finally {
    $("go").disabled = false;
  }
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); load($("key").value.trim()); });
$("refresh").addEventListener("click", () => load(sessionStorage.getItem("tacticus_key") || ""));
$("filter").addEventListener("input", () => state && renderUnits());
setInterval(() => state && renderTokens(), 30000);

const saved = sessionStorage.getItem("tacticus_key");
if (saved) load(saved);
