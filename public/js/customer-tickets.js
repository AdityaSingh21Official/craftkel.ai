import { showToast } from "./toast.js";

const API_BASE = "http://127.0.0.1:6901/api";
const LOGIN_PAGE = "login.html";
const MIN_LOADING_MS = 450;
const SKELETON_COUNT = 4;
const REFRESH_META_MS = 60000;

const listEl = document.getElementById("myTicketsList");
const filterButtons = [...document.querySelectorAll(".filter-pill")];

const FILTER_LABELS = { all: "All", open: "Open", resolved: "Resolved" };

const state = {
  tickets: [],
  filter: "all",
  requestId: 0,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizePriority(value) {
  const p = String(value ?? "")
    .toLowerCase()
    .trim();
  if (["high", "urgent", "critical"].includes(p)) return "high";
  if (["low", "minor"].includes(p)) return "low";
  return "medium";
}

function normalizeStatus(value) {
  const s = String(value ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (["closed", "resolved", "done", "completed"].includes(s)) return "closed";
  if (
    ["inprogress", "progress", "pending", "assigned", "processing"].includes(s)
  )
    return "progress";
  return "open";
}

const STATUS_LABEL = {
  open: "Open",
  progress: "In progress",
  closed: "Closed",
};

function formatAgo(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (d < 30) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (d < 365) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function toTicket(row, fetchedAt) {
  const opened = Number(row.opened);
  return {
    id: row.tid,
    title: String(row.ttitle ?? "Untitled ticket"),
    priority: normalizePriority(row.tpriority),
    status: normalizeStatus(row.tstatus),
    openedAt: fetchedAt - (Number.isFinite(opened) ? opened : 0) * 1000,
  };
}

function matchesFilter(ticket, filter) {
  if (filter === "all") return true;
  if (filter === "open") return ticket.status !== "closed";
  if (filter === "resolved") return ticket.status === "closed";
  return true;
}

function updateCounts() {
  const counts = {
    all: state.tickets.length,
    open: state.tickets.filter((t) => matchesFilter(t, "open")).length,
    resolved: state.tickets.filter((t) => matchesFilter(t, "resolved")).length,
  };
  filterButtons.forEach((btn) => {
    const key = btn.dataset.filter;
    btn.textContent = `${FILTER_LABELS[key] ?? key} · ${counts[key] ?? 0}`;
  });
}

function setActiveFilter(filter) {
  filterButtons.forEach((btn) => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function enter(nodes) {
  if (reduced()) return;
  nodes.forEach((node, i) => {
    node.animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 380,
        delay: Math.min(i, 12) * 45,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "backwards",
      },
    );
  });
}

function buildRow(ticket) {
  const row = el("a", "ticket-row");
  row.href = `ticket-detail.html?id=${encodeURIComponent(ticket.id)}`;
  row.dataset.ticketId = ticket.id;

  const bar = el("span", `priority-bar p-${ticket.priority}`);

  const idEl = el("span", "ticket-id", `#TCK-${ticket.id}`);

  const body = el("div", "grow-min");
  const title = el("p", "tk-title", ticket.title);
  title.title = ticket.title;
  const meta = el(
    "p",
    "tk-meta",
    `Opened ${formatAgo((Date.now() - ticket.openedAt) / 1000)}`,
  );
  meta.dataset.openedAt = String(ticket.openedAt);
  body.append(title, meta);

  const pill = el("span", `status-pill status-${ticket.status}`);
  pill.append(el("span"), document.createTextNode(STATUS_LABEL[ticket.status]));

  row.append(bar, idEl, body, pill);
  return row;
}

function buildMessage(headline, detail, actionLabel, onAction) {
  const box = el("div");
  box.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:10px;padding:48px 24px;text-align:center;";

  const h = el("p", "tk-title", headline);
  h.style.whiteSpace = "normal";
  const d = el("p", "tk-meta", detail);
  box.append(h, d);

  if (actionLabel && onAction) {
    const btn = el("button", "btn-soft", actionLabel);
    btn.type = "button";
    btn.style.marginTop = "8px";
    btn.addEventListener("click", onAction);
    box.append(btn);
  }
  return box;
}

function render() {
  const visible = state.tickets.filter((t) => matchesFilter(t, state.filter));
  updateCounts();
  setActiveFilter(state.filter);

  if (!visible.length) {
    const empty =
      state.tickets.length === 0
        ? buildMessage(
            "No tickets yet",
            "When you raise a ticket, it will show up here.",
            "Create a ticket",
            () => (window.location.href = "new-ticket.html"),
          )
        : buildMessage(
            "Nothing in this view",
            "No tickets match the selected filter.",
          );
    listEl.replaceChildren(empty);
    enter([empty]);
    return;
  }

  const rows = visible.map(buildRow);
  listEl.replaceChildren(...rows);
  enter(rows);
}

function showSkeleton() {
  const rows = Array.from({ length: SKELETON_COUNT }, () => {
    const row = el("div", "ticket-row");
    row.setAttribute("aria-hidden", "true");

    const bar = el("span", "priority-bar");
    bar.style.background = "var(--grey)";
    bar.style.opacity = "0.5";

    const body = el("div", "grow-min");
    const line1 = el("div");
    line1.style.cssText =
      "height:14px;width:62%;border-radius:9999px;box-shadow:var(--inset-sm);";
    const line2 = el("div");
    line2.style.cssText =
      "height:10px;width:28%;margin-top:10px;border-radius:9999px;box-shadow:var(--inset-sm);";
    body.append(line1, line2);

    const pill = el("div");
    pill.style.cssText =
      "height:28px;width:88px;border-radius:9999px;box-shadow:var(--inset-sm);flex-shrink:0;";

    row.append(bar, body, pill);

    if (!reduced()) {
      row.animate([{ opacity: 0.45 }, { opacity: 1 }, { opacity: 0.45 }], {
        duration: 1400,
        iterations: Infinity,
        easing: "ease-in-out",
      });
    }
    return row;
  });

  listEl.replaceChildren(...rows);
  listEl.setAttribute("aria-busy", "true");
}

function redirectToLogin() {
  localStorage.removeItem("token");
  window.location.replace(LOGIN_PAGE);
}

async function fetchTickets() {
  const token = localStorage.getItem("token");
  if (!token) {
    redirectToLogin();
    return null;
  }

  const response = await fetch(`${API_BASE}/customer/myTickets`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    return null;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

async function loadTickets() {
  const requestId = ++state.requestId;
  showSkeleton();

  try {
    const [rows] = await Promise.all([fetchTickets(), wait(MIN_LOADING_MS)]);
    if (requestId !== state.requestId || rows === null) return;

    const fetchedAt = Date.now();
    state.tickets = rows.map((row) => toTicket(row, fetchedAt));
    listEl.removeAttribute("aria-busy");
    render();
  } catch (err) {
    if (requestId !== state.requestId) return;
    console.error("myTickets failed:", err);
    listEl.removeAttribute("aria-busy");

    const failed = buildMessage(
      "Couldn't load your tickets",
      "Check your connection and try again.",
      "Retry",
      loadTickets,
    );
    listEl.replaceChildren(failed);
    enter([failed]);
    showToast(err.message || "Could not reach the server", true, 5000);
  }
}

function refreshMeta() {
  listEl.querySelectorAll(".tk-meta[data-opened-at]").forEach((node) => {
    const openedAt = Number(node.dataset.openedAt);
    node.textContent = `Opened ${formatAgo((Date.now() - openedAt) / 1000)}`;
  });
}

filterButtons.forEach((btn) => {
  btn.type = "button";
  btn.addEventListener("click", () => {
    const next = btn.dataset.filter;
    if (!next || next === state.filter) return;
    state.filter = next;
    render();
  });
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted) loadTickets();
});

setInterval(refreshMeta, REFRESH_META_MS);

loadTickets();
