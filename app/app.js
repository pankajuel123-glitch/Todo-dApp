import * as anchor from "https://esm.sh/@coral-xyz/anchor@0.32.1";
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.98.0";

// ── CONFIG ─────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("8cBBt1yhJFW2hvQNTTHxf6t6Vntvo2Stizmt6GPD8Y1p");
const RPC_URL = "http://127.0.0.1:8899";
const NETWORK_LABEL = "localnet";

const idl = await fetch("./idl.json").then((r) => r.json());

// ── STATE ──────────────────────────────────────────────────────────────────
let wallet = null;
let provider = null;
let program = null;
let userTasksPda = null;
let currentFilter = "all";
let currentView = "list";
let currentSort = "priority";
let searchQuery = "";
let allTasks = [];
let calMonth = new Date();
calMonth.setDate(1);
let selectedDayKey = null;

// ── DOM REFS ───────────────────────────────────────────────────────────────
const walletBtn         = document.getElementById("wallet-btn");
const walletDropdown    = document.getElementById("wallet-dropdown");
const walletPicker      = document.getElementById("wallet-picker");
const walletAccount     = document.getElementById("wallet-account");
const walletAddressFull = document.getElementById("wallet-address-full");
const walletBalance     = document.getElementById("wallet-balance");
const phantomStatus     = document.getElementById("phantom-status");
const copyAddrBtn       = document.getElementById("copy-addr-btn");
const explorerBtn       = document.getElementById("explorer-btn");
const airdropBtn        = document.getElementById("airdrop-btn");
const disconnectBtn     = document.getElementById("disconnect-btn");
const phantomOption     = document.querySelector('.wallet-option[data-wallet="phantom"]');
const themeToggle       = document.getElementById("theme-toggle");
const addBtn         = document.getElementById("add-btn");
const taskForm       = document.getElementById("task-form");
const taskContent    = document.getElementById("task-content");
const taskPriority   = document.getElementById("task-priority");
const taskDeadline   = document.getElementById("task-deadline");
const taskList       = document.getElementById("task-list");
const taskTableWrap  = document.getElementById("task-table-wrap");
const taskTableBody  = document.getElementById("task-table-body");
const calendarView   = document.getElementById("calendar-view");
const calendarGrid   = document.getElementById("calendar-grid");
const calMonthLabel  = document.getElementById("cal-month");
const calPrev        = document.getElementById("cal-prev");
const calNext        = document.getElementById("cal-next");
const calDayTasks    = document.getElementById("calendar-day-tasks");
const connectPrompt  = document.getElementById("connect-prompt");
const loadingEl      = document.getElementById("loading");
const emptyTasks     = document.getElementById("empty-tasks");
const noAccount      = document.getElementById("no-account");
const initBtn        = document.getElementById("init-btn");
const statusBar      = document.getElementById("status-bar");
const statusMsg      = document.getElementById("status-msg");
const networkName    = document.getElementById("network-name");
const programAddr    = document.getElementById("program-addr");
const taskTemplate   = document.getElementById("task-template");
const filterBtns     = document.querySelectorAll(".filter-btn");
const viewTabs       = document.querySelectorAll(".view-tab");
const searchInput    = document.getElementById("search-input");
const sortSelect     = document.getElementById("sort-select");
const overviewSec    = document.getElementById("overview-section");
const statTotal      = document.getElementById("stat-total");
const statDone       = document.getElementById("stat-done");
const statOverdue    = document.getElementById("stat-overdue");
const statPending    = document.getElementById("stat-pending");
const progressFill   = document.getElementById("progress-fill");
const progressLabel  = document.getElementById("progress-label");

// ── INIT ───────────────────────────────────────────────────────────────────
networkName.textContent = NETWORK_LABEL;
programAddr.textContent = shorten(PROGRAM_ID.toBase58());

initTheme();

const phantom = window.phantom?.solana?.isPhantom ? window.phantom.solana : null;
phantomStatus.textContent = phantom ? "Ready" : "Install";

walletBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown();
});

phantomOption.addEventListener("click", async () => {
  if (!phantom) {
    window.open("https://phantom.app", "_blank");
    return;
  }
  try {
    await phantom.connect();
  } catch {
    /* user rejected */
  }
  closeDropdown();
});

disconnectBtn.addEventListener("click", async () => {
  if (phantom) {
    try {
      await phantom.disconnect();
    } catch {
      /* ignore */
    }
  }
  onDisconnected();
  closeDropdown();
});

copyAddrBtn.addEventListener("click", async () => {
  if (!wallet) return;
  try {
    await navigator.clipboard.writeText(wallet.publicKey.toBase58());
    showStatus("Address copied!");
  } catch {
    showStatus("Copy failed", true);
  }
});

explorerBtn.addEventListener("click", () => {
  if (!wallet) return;
  const addr = wallet.publicKey.toBase58();
  const url = `https://explorer.solana.com/address/${addr}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  window.open(url, "_blank");
});

airdropBtn.addEventListener("click", async () => {
  if (!wallet || !provider) return;
  airdropBtn.disabled = true;
  showStatus("Requesting airdrop of 2 SOL…");
  try {
    const sig = await provider.connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    showStatus("Airdrop successful! +2 SOL");
    await refreshBalance();
  } catch (err) {
    showStatus("Airdrop failed: " + errString(err), true);
  } finally {
    airdropBtn.disabled = false;
  }
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!walletDropdown.contains(e.target) && !walletBtn.contains(e.target)) {
    closeDropdown();
  }
});

if (phantom) {
  phantom.on("connect", onConnected);
  phantom.on("disconnect", onDisconnected);
  phantom.on("accountChanged", (pk) => (pk ? onConnected() : onDisconnected()));
  phantom.connect({ onlyIfTrusted: true }).catch(() => {});
}

// ── THEME ──────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
}

themeToggle.addEventListener("click", () => {
  const curr = document.documentElement.getAttribute("data-theme");
  const next = curr === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// ── DROPDOWN ───────────────────────────────────────────────────────────────
function toggleDropdown() {
  walletDropdown.classList.toggle("hidden");
}
function closeDropdown() {
  walletDropdown.classList.add("hidden");
}
function showPickerState() {
  walletPicker.classList.remove("hidden");
  walletAccount.classList.add("hidden");
}
function showAccountState() {
  walletPicker.classList.add("hidden");
  walletAccount.classList.remove("hidden");
}

// ── CONNECT / DISCONNECT ───────────────────────────────────────────────────
async function onConnected() {
  wallet = {
    publicKey: phantom.publicKey,
    signTransaction: (tx) => phantom.signTransaction(tx),
    signAllTransactions: (txs) => phantom.signAllTransactions(txs),
  };

  const connection = new Connection(RPC_URL, "confirmed");
  provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  program = new anchor.Program(idl, provider);

  userTasksPda = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("user-tasks"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  )[0];

  const addr = wallet.publicKey.toBase58();
  walletBtn.textContent = shorten(addr);
  walletBtn.classList.remove("btn-primary");
  walletBtn.classList.add("btn-connected");
  walletAddressFull.textContent = addr;
  showAccountState();
  connectPrompt.classList.add("hidden");

  await ensureFunded();
  await loadTasks();
}

function onDisconnected() {
  wallet = provider = program = userTasksPda = null;
  allTasks = [];
  walletBtn.textContent = "Connect Wallet";
  walletBtn.classList.add("btn-primary");
  walletBtn.classList.remove("btn-connected");
  showPickerState();
  addBtn.disabled = true;
  hideAllViews();
  noAccount.classList.add("hidden");
  overviewSec.classList.add("hidden");
  connectPrompt.classList.remove("hidden");
}

async function refreshBalance() {
  if (!wallet || !provider) return;
  try {
    const lamports = await provider.connection.getBalance(wallet.publicKey);
    walletBalance.textContent = (lamports / LAMPORTS_PER_SOL).toFixed(4) + " SOL";
    return lamports;
  } catch {
    walletBalance.textContent = "— SOL";
    return 0;
  }
}

async function ensureFunded() {
  const lamports = await refreshBalance();
  if (lamports === 0) {
    showStatus("Wallet has no SOL — airdropping 2 SOL for localnet…");
    try {
      const sig = await provider.connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
      await refreshBalance();
      showStatus("Airdrop successful! Wallet funded with 2 SOL.");
    } catch (err) {
      showStatus("Auto-airdrop failed: " + errString(err), true);
    }
  }
}

// ── LOAD TASKS ─────────────────────────────────────────────────────────────
async function loadTasks() {
  if (!program) return;
  showLoading(true);
  try {
    const state = await program.account.userTasks.fetchNullable(userTasksPda);
    if (!state) {
      allTasks = [];
      hideAllViews();
      noAccount.classList.remove("hidden");
      overviewSec.classList.add("hidden");
      addBtn.disabled = true;
      return;
    }
    noAccount.classList.add("hidden");
    addBtn.disabled = false;
    allTasks = state.tasks.map(normalizeTask);
    overviewSec.classList.remove("hidden");
    updateOverview();
    render();
  } catch (err) {
    showStatus("Failed to load tasks: " + errString(err), true);
  } finally {
    showLoading(false);
  }
}

function normalizeTask(t) {
  return {
    id: t.id.toNumber(),
    content: t.content,
    completed: t.completed,
    priority: t.priority,
    deadline: t.deadline.toNumber(),
    createdAt: t.createdAt.toNumber(),
  };
}

// ── INIT USER ACCOUNT ──────────────────────────────────────────────────────
initBtn.addEventListener("click", async () => {
  if (!program) return;
  initBtn.disabled = true;
  showStatus("Creating your task list account…");
  try {
    await program.methods
      .initializeUser()
      .accounts({
        userTasks: userTasksPda,
        user: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    showStatus("Task list created!");
    await loadTasks();
  } catch (err) {
    showStatus(await errStringAsync(err), true);
  } finally {
    initBtn.disabled = false;
  }
});

// ── OVERVIEW / STATS ───────────────────────────────────────────────────────
function updateOverview() {
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.completed).length;
  const overdue = allTasks.filter(isOverdue).length;
  const pending = total - done;
  statTotal.textContent = total;
  statDone.textContent = done;
  statOverdue.textContent = overdue;
  statPending.textContent = pending;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `${pct}% complete · ${done}/${total}`;
}

function isOverdue(t) {
  return !t.completed && t.deadline > 0 && t.deadline * 1000 < Date.now();
}

// ── FILTER + SORT ──────────────────────────────────────────────────────────
function visibleTasks() {
  let arr = allTasks.filter((t) => {
    if (currentFilter === "active" && t.completed) return false;
    if (currentFilter === "completed" && !t.completed) return false;
    if (searchQuery && !t.content.toLowerCase().includes(searchQuery)) return false;
    return true;
  });

  const sortFns = {
    priority: (a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.priority - a.priority;
    },
    deadline: (a, b) => {
      const ad = a.deadline || Infinity;
      const bd = b.deadline || Infinity;
      return ad - bd;
    },
    created: (a, b) => b.createdAt - a.createdAt,
    alpha: (a, b) => a.content.localeCompare(b.content),
  };
  arr.sort(sortFns[currentSort] || sortFns.priority);
  return arr;
}

// ── RENDER DISPATCH ────────────────────────────────────────────────────────
function render() {
  const tasks = visibleTasks();
  hideAllViews();

  if (currentView === "calendar") {
    calendarView.classList.remove("hidden");
    renderCalendar();
    return;
  }

  if (tasks.length === 0) {
    emptyTasks.classList.remove("hidden");
    return;
  }

  if (currentView === "table") {
    taskTableWrap.classList.remove("hidden");
    renderTable(tasks);
  } else {
    taskList.classList.remove("hidden");
    renderList(tasks);
  }
}

function hideAllViews() {
  taskList.classList.add("hidden");
  taskTableWrap.classList.add("hidden");
  calendarView.classList.add("hidden");
  emptyTasks.classList.add("hidden");
}

// ── LIST VIEW ──────────────────────────────────────────────────────────────
function renderList(tasks) {
  taskList.innerHTML = "";
  tasks.forEach((task) => {
    const clone = taskTemplate.content.cloneNode(true);
    const li = clone.querySelector(".task-item");
    const checkbox = clone.querySelector(".task-checkbox");
    const contentEl = clone.querySelector(".task-content");
    const priorityEl = clone.querySelector(".priority-badge");
    const deadlineEl = clone.querySelector(".task-deadline");
    const dateEl = clone.querySelector(".task-date");
    const deleteBtn = clone.querySelector(".btn-delete");

    li.dataset.id = task.id;
    if (task.completed) li.classList.add("completed");

    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => handleToggle(task.id));

    contentEl.textContent = task.content;

    const pLabel = priorityName(task.priority);
    priorityEl.textContent = cap(pLabel);
    priorityEl.classList.add(pLabel);

    if (task.deadline > 0) {
      deadlineEl.textContent = "Due: " + formatDateTime(task.deadline);
      if (isOverdue(task)) deadlineEl.classList.add("overdue");
    }
    dateEl.textContent = "Added: " + formatDate(task.createdAt);

    deleteBtn.addEventListener("click", () => handleDelete(task.id));
    taskList.appendChild(clone);
  });
}

// ── TABLE VIEW ─────────────────────────────────────────────────────────────
function renderTable(tasks) {
  taskTableBody.innerHTML = "";
  tasks.forEach((task) => {
    const tr = document.createElement("tr");
    if (task.completed) tr.classList.add("row-completed");
    if (isOverdue(task)) tr.classList.add("row-overdue");

    const status = task.completed ? "done" : isOverdue(task) ? "overdue" : "open";
    const statusText = task.completed ? "Done" : isOverdue(task) ? "Overdue" : "Open";
    const pLabel = priorityName(task.priority);

    tr.innerHTML = `
      <td class="cell-id">#${task.id}</td>
      <td class="cell-content">${escapeHtml(task.content)}</td>
      <td><span class="priority-badge ${pLabel}">${cap(pLabel)}</span></td>
      <td>${task.deadline > 0 ? formatDateTime(task.deadline) : "—"}</td>
      <td>${formatDate(task.createdAt)}</td>
      <td><span class="status-pill ${status}">${statusText}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn-toggle-row" title="Toggle complete">${task.completed ? "↺" : "✓"}</button>
          <button class="btn-del-row" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelector(".btn-toggle-row").addEventListener("click", () => handleToggle(task.id));
    tr.querySelector(".btn-del-row").addEventListener("click", () => handleDelete(task.id));
    taskTableBody.appendChild(tr);
  });
}

// ── CALENDAR VIEW ──────────────────────────────────────────────────────────
function renderCalendar() {
  calendarGrid.innerHTML = "";
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  calMonthLabel.textContent = calMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const todayKey = dayKey(new Date());

  const tasksByDay = {};
  allTasks.forEach((t) => {
    if (t.deadline <= 0) return;
    const d = new Date(t.deadline * 1000);
    const k = dayKey(d);
    (tasksByDay[k] ||= []).push(t);
  });

  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const date = new Date(year, month - 1, day);
    appendCalDay(date, tasksByDay, todayKey, true);
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    appendCalDay(date, tasksByDay, todayKey, false);
  }
  // Trailing days to fill grid (total cells = 42 for 6 rows)
  const filled = firstDow + daysInMonth;
  const trailing = (7 - (filled % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    const date = new Date(year, month + 1, d);
    appendCalDay(date, tasksByDay, todayKey, true);
  }

  if (selectedDayKey) renderSelectedDay(tasksByDay);
  else calDayTasks.classList.add("hidden");
}

function appendCalDay(date, tasksByDay, todayKey, outOfMonth) {
  const k = dayKey(date);
  const cell = document.createElement("div");
  cell.className = "cal-day";
  if (outOfMonth) cell.classList.add("out-of-month");
  if (k === todayKey) cell.classList.add("today");
  if (k === selectedDayKey) cell.classList.add("selected");
  cell.dataset.key = k;
  cell.dataset.ts = Math.floor(date.getTime() / 1000);

  const num = document.createElement("div");
  num.className = "cal-day-num";
  num.textContent = date.getDate();
  cell.appendChild(num);

  const dots = document.createElement("div");
  dots.className = "cal-dots";
  const dayTasks = tasksByDay[k] || [];
  dayTasks.slice(0, 6).forEach((t) => {
    const dot = document.createElement("span");
    const cls = t.completed
      ? "done"
      : isOverdue(t)
      ? "overdue"
      : priorityName(t.priority);
    dot.className = `cal-dot ${cls}`;
    dots.appendChild(dot);
  });
  cell.appendChild(dots);

  cell.addEventListener("click", () => {
    selectedDayKey = selectedDayKey === k ? null : k;
    renderCalendar();
  });
  calendarGrid.appendChild(cell);
}

function renderSelectedDay(tasksByDay) {
  const tasks = tasksByDay[selectedDayKey] || [];
  calDayTasks.classList.remove("hidden");
  const [y, m, d] = selectedDayKey.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (tasks.length === 0) {
    calDayTasks.innerHTML = `<h3>${label}</h3><p style="color:var(--text-muted); font-size:0.85rem">No tasks due.</p>`;
    return;
  }
  calDayTasks.innerHTML = `<h3>${label}</h3><ul></ul>`;
  const ul = calDayTasks.querySelector("ul");
  tasks
    .slice()
    .sort((a, b) => a.deadline - b.deadline)
    .forEach((t) => {
      const li = document.createElement("li");
      if (t.completed) li.classList.add("completed");
      const time = new Date(t.deadline * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      li.innerHTML = `
        <span>${escapeHtml(t.content)}</span>
        <span class="cal-task-time">${time}</span>
      `;
      ul.appendChild(li);
    });
}

calPrev.addEventListener("click", () => {
  calMonth.setMonth(calMonth.getMonth() - 1);
  renderCalendar();
});
calNext.addEventListener("click", () => {
  calMonth.setMonth(calMonth.getMonth() + 1);
  renderCalendar();
});

// ── ADD TASK ───────────────────────────────────────────────────────────────
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!program) return;
  const content = taskContent.value.trim();
  if (!content) return;

  const priority = parseInt(taskPriority.value);
  const deadlineVal = taskDeadline.value;
  const deadlineTs = deadlineVal ? Math.floor(new Date(deadlineVal).getTime() / 1000) : 0;

  addBtn.disabled = true;
  showStatus("Sending transaction… confirm in Phantom.");
  try {
    await program.methods
      .createTask(content, priority, new anchor.BN(deadlineTs))
      .accounts({ userTasks: userTasksPda, user: wallet.publicKey })
      .rpc();
    taskContent.value = "";
    taskDeadline.value = "";
    showStatus("Task added!");
    await loadTasks();
  } catch (err) {
    showStatus(await errStringAsync(err), true);
  } finally {
    addBtn.disabled = false;
  }
});

// ── TOGGLE / DELETE ────────────────────────────────────────────────────────
async function handleToggle(taskId) {
  if (!program) return;
  showStatus("Updating task… confirm in Phantom.");
  try {
    await program.methods
      .toggleComplete(new anchor.BN(taskId))
      .accounts({ userTasks: userTasksPda, user: wallet.publicKey })
      .rpc();
    showStatus("Task updated!");
    await loadTasks();
  } catch (err) {
    showStatus(await errStringAsync(err), true);
    await loadTasks();
  }
}

async function handleDelete(taskId) {
  if (!program) return;
  if (!confirm("Delete this task?")) return;
  showStatus("Deleting task… confirm in Phantom.");
  try {
    await program.methods
      .deleteTask(new anchor.BN(taskId))
      .accounts({ userTasks: userTasksPda, user: wallet.publicKey })
      .rpc();
    showStatus("Task deleted.");
    await loadTasks();
  } catch (err) {
    showStatus(await errStringAsync(err), true);
  }
}

// ── VIEW / FILTER / SEARCH / SORT ──────────────────────────────────────────
viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    viewTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentView = tab.dataset.view;
    if (program) render();
  });
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (program) render();
  });
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  if (program) render();
});

sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  if (program) render();
});

// ── HELPERS ────────────────────────────────────────────────────────────────
function showStatus(msg, isError = false) {
  statusBar.classList.remove("hidden", "error");
  if (isError) statusBar.classList.add("error");
  statusMsg.textContent = msg;
  clearTimeout(showStatus._timer);
  if (!isError) {
    showStatus._timer = setTimeout(() => statusBar.classList.add("hidden"), 4000);
  }
}

function showLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
  if (on) hideAllViews();
}

function shorten(addr) {
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

function priorityName(p) {
  return { 1: "low", 2: "medium", 3: "high" }[p] || "low";
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(unixSec) {
  return new Date(unixSec * 1000).toLocaleDateString();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function errStringAsync(err) {
  if (err?.error?.errorMessage) return err.error.errorMessage;
  if (typeof err?.getLogs === "function") {
    try {
      const logs = await err.getLogs(provider?.connection);
      if (Array.isArray(logs) && logs.length > 0) {
        console.error("Transaction logs:", logs);
        const programErr = logs.find((l) => l.includes("Error") || l.includes("failed"));
        if (programErr) return programErr;
      }
    } catch {
      /* ignore getLogs failure */
    }
  }
  // Strip the boilerplate SDK hint from the message
  const msg = err?.message ?? String(err);
  return msg.replace(/\s*Catch the `SendTransactionError`[^.]*.\.?/g, "").trim();
}

function errString(err) {
  if (err?.error?.errorMessage) return err.error.errorMessage;
  const msg = err?.message ?? String(err);
  return msg.replace(/\s*Catch the `SendTransactionError`[^.]*.\.?/g, "").trim();
}
