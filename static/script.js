const API = "/api";
const MAX_WEIGHT = 20; // 5 + 5 + 5 + (5 - 0)

const els = {
  form: document.getElementById("task-form"),
  name: document.getElementById("f-name"),
  duration: document.getElementById("f-duration"),
  deadline: document.getElementById("f-deadline"),
  prerequisite: document.getElementById("f-prerequisite"),
  urgency: document.getElementById("f-urgency"),
  importance: document.getElementById("f-importance"),
  difficulty: document.getElementById("f-difficulty"),
  progress: document.getElementById("f-progress"),
  weight: document.getElementById("f-weight"),
  weightFill: document.getElementById("f-weight-fill"),
  formMessage: document.getElementById("form-message"),
  taskTableBody: document.getElementById("task-table-body"),
  generateBtn: document.getElementById("generate-btn"),
  scheduleBoard: document.getElementById("schedule-board"),
  scheduleMessage: document.getElementById("schedule-message"),
  budget: document.getElementById("s-budget"),
  horizon: document.getElementById("s-horizon"),
  astarPanel: document.getElementById("astar-panel"),
  astarSteps: document.getElementById("astar-steps"),
  astarStatus: document.getElementById("astar-status"),
  astarPlay: document.getElementById("astar-play"),
  toast: document.getElementById("toast"),
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML.replace(/"/g, "&quot;");
}

function priorityWeight(t) {
  return t.urgency + t.importance + t.difficulty + (5 - t.progress);
}

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}


function updateWeightPreview() {
  const w = priorityWeight({
    urgency: Number(els.urgency.value),
    importance: Number(els.importance.value),
    difficulty: Number(els.difficulty.value),
    progress: Number(els.progress.value),
  });
  els.weight.textContent = w;
  els.weightFill.style.width = `${(w / MAX_WEIGHT) * 100}%`;
}

["urgency", "importance", "difficulty", "progress"].forEach((field) => {
  const input = els[field];
  const readout = document.getElementById(`f-${field}-val`);
  input.addEventListener("input", () => {
    readout.textContent = input.value;
    updateWeightPreview();
  });
});

function describeScheduleDay(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);

  let relative;
  if (diffDays === 0) relative = "Today";
  else if (diffDays === 1) relative = "Tomorrow";
  else relative = d.toLocaleDateString(undefined, { weekday: "long" });

  const monthDay = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { dayNum: d.getDate(), relative, monthDay };
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

els.deadline.min = toLocalInputValue(new Date());
const defaultDeadline = new Date();
defaultDeadline.setDate(defaultDeadline.getDate() + 3);
els.deadline.value = toLocalInputValue(defaultDeadline);

function formatDeadline(isoDatetime) {
  const d = new Date(isoDatetime);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}


let lastTasks = [];
const sortState = { key: null, dir: 1 };

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  const tasks = await res.json();
  lastTasks = tasks;
  renderTaskTable(tasks);
  renderPrerequisiteOptions(tasks);
  return tasks;
}

function sortedTasks(tasks) {
  if (!sortState.key) return tasks;
  const val = {
    name: (t) => t.name.toLowerCase(),
    duration: (t) => Number(t.duration),
    deadline: (t) => new Date(t.deadline_at).getTime(),
    weight: (t) => priorityWeight(t),
  }[sortState.key];
  return [...tasks].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sortState.dir;
  });
}

function renderTaskTable(tasks) {
  els.taskTableBody.innerHTML = "";

  if (tasks.length === 0) {
    els.taskTableBody.innerHTML =
      '<tr class="empty-row"><td colspan="7">No tasks yet — add one on the left.</td></tr>';
    return;
  }

  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

  sortedTasks(tasks).forEach((t) => {
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;
    if (t.completed) tr.classList.add("completed");

    const prereqName = t.prerequisite && byId[t.prerequisite]
      ? byId[t.prerequisite].name
      : "—";

    const overdue = !t.completed && t.is_overdue;
    const dueSoon = !t.completed && !t.is_overdue && t.days_left === 0 && t.hours_left < 6;

    tr.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td>${t.duration}h</td>
      <td>${formatDeadline(t.deadline_at)}</td>
      <td class="countdown${overdue ? " overdue" : ""}${dueSoon ? " due-soon" : ""}">${escapeHtml(t.countdown_label)}</td>
      <td>${escapeHtml(prereqName)}</td>
      <td class="weight-value">${priorityWeight(t)}</td>
      <td>
        <div class="row-actions">
          ${t.completed ? "" : `<button class="complete-btn" data-id="${t.id}">Done</button>`}
          <button class="delete-btn" data-id="${t.id}">Delete</button>
        </div>
      </td>
    `;
    els.taskTableBody.appendChild(tr);
  });

  els.taskTableBody.querySelectorAll(".complete-btn").forEach((btn) => {
    btn.addEventListener("click", () => completeTask(btn.dataset.id));
  });
  els.taskTableBody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteTask(btn.dataset.id));
  });
}


document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.sort;
    sortState.dir = sortState.key === key ? -sortState.dir : (key === "weight" ? -1 : 1);
    sortState.key = key;
    document.querySelectorAll(".sort-btn").forEach((b) => {
      const th = b.closest("th");
      if (b === btn) th.setAttribute("aria-sort", sortState.dir === 1 ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });
    renderTaskTable(lastTasks);
  });
});

function renderPrerequisiteOptions(tasks) {
  const current = els.prerequisite.value;
  els.prerequisite.innerHTML = '<option value="">None</option>';
  tasks.filter((t) => !t.completed).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    els.prerequisite.appendChild(opt);
  });
  els.prerequisite.value = current;
}


function setLinked(id, on) {
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((el) => {
    if (el.matches("tr, .day-task")) el.classList.toggle("linked", on);
  });
}

function bindLinkHover(container, selector) {
  container.addEventListener("mouseover", (e) => {
    const el = e.target.closest(selector);
    if (el && el.dataset.id) setLinked(el.dataset.id, true);
  });
  container.addEventListener("mouseout", (e) => {
    const el = e.target.closest(selector);
    if (el && el.dataset.id) setLinked(el.dataset.id, false);
  });
}

bindLinkHover(els.taskTableBody, "tr");
bindLinkHover(els.scheduleBoard, ".day-task");


els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formMessage.textContent = "";

  const payload = {
    name: els.name.value.trim(),
    duration: parseFloat(els.duration.value),
    deadline_at: els.deadline.value,
    prerequisite: els.prerequisite.value || null,
    urgency: parseFloat(els.urgency.value),
    importance: parseFloat(els.importance.value),
    difficulty: parseFloat(els.difficulty.value),
    progress: parseFloat(els.progress.value),
  };

  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    els.formMessage.textContent = err.error || "Could not add task.";
    return;
  }

  els.form.reset();
  ["urgency", "importance", "difficulty"].forEach((f) => {
    document.getElementById(`f-${f}-val`).textContent = "3";
  });
  document.getElementById("f-progress-val").textContent = "0";
  els.deadline.value = toLocalInputValue(defaultDeadline);
  updateWeightPreview();
  els.name.focus();

  toast(`Added "${payload.name}"`);
  await loadTasks();
  refreshScheduleIfShown();
});

async function deleteTask(id) {
  const t = lastTasks.find((x) => x.id === id);
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
  toast(`Deleted "${t ? t.name : "task"}"`);
  await loadTasks();
  refreshScheduleIfShown();
}

async function completeTask(id) {
  const t = lastTasks.find((x) => x.id === id);
  await fetch(`${API}/tasks/${id}/complete`, { method: "POST" });
  toast(`Marked "${t ? t.name : "task"}" done`);
  await loadTasks();
  refreshScheduleIfShown();
}


let scheduleShown = false;

async function generateSchedule() {
  els.scheduleMessage.textContent = "";
  const budget = parseFloat(els.budget.value);
  const horizon = parseInt(els.horizon.value, 10);

  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "Running A* search…";

  try {
    const res = await fetch(`${API}/schedule?daily_budget=${budget}&max_day=${horizon}`);
    const data = await res.json();

    if (data.message) els.scheduleMessage.textContent = data.message;
    if (data.error) els.scheduleMessage.textContent = data.error;

    renderSchedule(data.daily_plan, data.cost);
    setupAstar(data.actions || [], data.daily_plan || [], data.cost || 0);
    scheduleShown = Boolean(data.daily_plan && data.daily_plan.length);
  } catch {
    els.scheduleMessage.textContent = "Could not reach the server. Is app.py running?";
  } finally {
    els.generateBtn.disabled = false;
    els.generateBtn.textContent = "Generate schedule";
  }
}

els.generateBtn.addEventListener("click", generateSchedule);

function refreshScheduleIfShown() {
  if (scheduleShown) generateSchedule();
}


let settingsTimer;
[els.budget, els.horizon].forEach((input) => {
  input.addEventListener("input", () => {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(refreshScheduleIfShown, 400);
  });
});

function renderSchedule(dailyPlan, cost) {
  els.scheduleBoard.innerHTML = "";

  if (!dailyPlan || dailyPlan.length === 0) {
    els.scheduleBoard.innerHTML =
      '<p class="empty-hint">No schedule to show yet.</p>';
    return;
  }

  dailyPlan.forEach((block) => {
    const page = document.createElement("div");
    page.className = "day-page" + (block.over_budget ? " over-budget" : "");
    page.dataset.day = block.day;

    const { dayNum, relative, monthDay } = describeScheduleDay(block.date);

    const tasksHtml = block.tasks.map((t) => {
      const chunkLabel = t.split_across_days
        ? `${t.chunk_hours}h of ${t.total_duration}h total${t.is_final_chunk ? " — final part" : ""}`
        : `${t.chunk_hours}h`;
      return `
        <div class="day-task" data-id="${t.id}" data-day="${block.day}" data-name="${escapeHtml(t.name)}" data-hours="${t.chunk_hours}">
          <div class="name">${escapeHtml(t.name)}${t.split_across_days ? ' <span class="split-badge">split</span>' : ""}</div>
          <div class="duration">${chunkLabel}</div>
        </div>
      `;
    }).join("");

    const warningHtml = block.over_budget
      ? `<div class="budget-warning">Over daily budget (${block.total_hours}h) — an oversized task took the whole day</div>`
      : "";

    page.innerHTML = `
      <div class="day-number">${String(dayNum).padStart(2, "0")}</div>
      <div class="day-label">${relative} · ${monthDay}</div>
      ${tasksHtml}
      ${warningHtml}
    `;
    els.scheduleBoard.appendChild(page);
  });

  const costEl = document.createElement("div");
  costEl.className = "cost-line";
  costEl.textContent = `Path cost g(n) = ${cost.toFixed(2)}`;
  els.scheduleBoard.appendChild(costEl);
}


const astar = { steps: [], index: 0, timer: null };

const ACTION_RE = /^(Work|Finish) ([\d.]+)h on (.+) \(day (\d+)\)$/;
const ADVANCE_RE = /^Advance to day (\d+)$/;

function setupAstar(actions, dailyPlan, cost) {
  stopPlay();
  if (!actions.length || !dailyPlan.length) {
    els.astarPanel.hidden = true;
    astar.steps = [];
    return;
  }

  const weightById = Object.fromEntries(
    lastTasks.filter((t) => !t.completed).map((t) => [t.id, priorityWeight(t)]));
  const durationById = {};
  dailyPlan.forEach((d) => d.tasks.forEach((t) => { durationById[t.id] = t.total_duration; }));

  // Tie each Work/Finish action to its block on the board, in order.
  const blocks = [...els.scheduleBoard.querySelectorAll(".day-task")];
  const used = new Set();

  let day = 1;
  let g = 0;
  const remaining = new Set(Object.keys(durationById));
  const h = () => [...remaining].reduce((s, id) => s + day * (weightById[id] || 0), 0) / 10;

  const steps = [{ text: "Start: day 1, nothing scheduled yet", kind: "start", g: 0, h: h(), day }];

  actions.forEach((text, i) => {
    const adv = text.match(ADVANCE_RE);
    if (adv) {
      day = Number(adv[1]);
      steps.push({ text, kind: "advance", g, h: h(), day });
      return;
    }

    const m = text.match(ACTION_RE);
    if (!m) { steps.push({ text, kind: "other", g, h: h(), day }); return; }

    const [, verb, hoursStr, name, dayStr] = m;
    const hours = Number(hoursStr);
    const block = blocks.find((b) => !used.has(b) &&
      b.dataset.day === dayStr && b.dataset.name === name &&
      Math.abs(Number(b.dataset.hours) - hours) < 1e-6) ||
      blocks.find((b) => !used.has(b) && b.dataset.day === dayStr && b.textContent.includes(name));
    if (block) {
      used.add(block);
      block.dataset.step = i + 1;
    }

    const id = block ? block.dataset.id : null;
    if (id && durationById[id]) {
      g += (hours / durationById[id]) * day * (weightById[id] || 0) / 10;
    }
    if (verb === "Finish" && id) remaining.delete(id);

    steps.push({ text, kind: verb.toLowerCase(), g, h: h(), day });
  });


  steps[steps.length - 1].g = cost;

  astar.steps = steps;
  renderAstarSteps();
  els.astarPanel.hidden = false;
  goToStep(steps.length - 1);
}

function renderAstarSteps() {
  els.astarSteps.innerHTML = astar.steps.map((s, i) => `
    <tr class="step step-${s.kind}" data-step="${i}" tabindex="0">
      <td>${i}</td>
      <td>${escapeHtml(s.text)}</td>
      <td class="num">${s.g.toFixed(2)}</td>
      <td class="num">${s.h.toFixed(2)}</td>
      <td class="num f-val">${(s.g + s.h).toFixed(2)}</td>
    </tr>`).join("");
}

function goToStep(i) {
  const last = astar.steps.length - 1;
  astar.index = Math.max(0, Math.min(last, i));
  const step = astar.steps[astar.index];

  els.astarSteps.querySelectorAll(".step").forEach((row) => {
    const n = Number(row.dataset.step);
    row.classList.toggle("current", n === astar.index);
    row.classList.toggle("future", n > astar.index);
  });
  const currentRow = els.astarSteps.querySelector(".step.current");
  if (currentRow && astar.timer) currentRow.scrollIntoView({ block: "nearest" });

  els.scheduleBoard.querySelectorAll(".day-task").forEach((b) => {
    const n = Number(b.dataset.step || 0);
    b.classList.toggle("future", n > astar.index);
    b.classList.toggle("just-placed", n === astar.index);
  });
  els.scheduleBoard.querySelectorAll(".day-page").forEach((p) => {
    p.classList.toggle("active-day", Number(p.dataset.day) === step.day && astar.index < last);
  });

  const done = astar.index === last;
  els.astarStatus.innerHTML = done
    ? `Goal reached in ${last} steps. Final path cost g(n) = <strong>${step.g.toFixed(2)}</strong>.`
    : `Step ${astar.index} of ${last} · day ${step.day} · f(n) = <strong>${(step.g + step.h).toFixed(2)}</strong>`;

  document.getElementById("astar-prev").disabled = astar.index === 0;
  document.getElementById("astar-reset").disabled = astar.index === 0;
  document.getElementById("astar-next").disabled = done;
  document.getElementById("astar-end").disabled = done;
}

function play() {
  if (astar.index >= astar.steps.length - 1) goToStep(0);
  els.astarPlay.textContent = "Pause";
  astar.timer = setInterval(() => {
    if (astar.index >= astar.steps.length - 1) { stopPlay(); return; }
    goToStep(astar.index + 1);
  }, 800);
}

function stopPlay() {
  clearInterval(astar.timer);
  astar.timer = null;
  els.astarPlay.textContent = "Play";
}

els.astarPlay.addEventListener("click", () => (astar.timer ? stopPlay() : play()));
document.getElementById("astar-next").addEventListener("click", () => { stopPlay(); goToStep(astar.index + 1); });
document.getElementById("astar-prev").addEventListener("click", () => { stopPlay(); goToStep(astar.index - 1); });
document.getElementById("astar-reset").addEventListener("click", () => { stopPlay(); goToStep(0); });
document.getElementById("astar-end").addEventListener("click", () => { stopPlay(); goToStep(astar.steps.length - 1); });

els.astarSteps.addEventListener("click", (e) => {
  const row = e.target.closest(".step");
  if (row) { stopPlay(); goToStep(Number(row.dataset.step)); }
});
els.astarSteps.addEventListener("keydown", (e) => {
  const row = e.target.closest(".step");
  if (row && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault(); stopPlay(); goToStep(Number(row.dataset.step));
  }
});


const themeBtn = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  themeBtn.setAttribute("aria-pressed", String(dark));
  themeLabel.textContent = dark ? "Light mode" : "Dark mode";
}

applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

themeBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("tp-theme", next); } catch { /* storage unavailable */ }
});

updateWeightPreview();
loadTasks();

setInterval(loadTasks, 30 * 1000);