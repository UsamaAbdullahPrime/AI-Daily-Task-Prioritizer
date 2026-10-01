const API = "/api";

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
  taskTableBody: document.getElementById("task-table-body"),
  generateBtn: document.getElementById("generate-btn"),
  scheduleBoard: document.getElementById("schedule-board"),
  scheduleMessage: document.getElementById("schedule-message"),
  budget: document.getElementById("s-budget"),
  horizon: document.getElementById("s-horizon"),
};


["urgency", "importance", "difficulty", "progress"].forEach((field) => {
  const input = els[field];
  const readout = document.getElementById(`f-${field}-val`);
  input.addEventListener("input", () => { readout.textContent = input.value; });
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

function priorityWeight(t) {
  return t.urgency + t.importance + t.difficulty + (5 - t.progress);
}



let lastTasks = [];  

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  const tasks = await res.json();
  lastTasks = tasks;
  renderTaskTable(tasks);
  renderPrerequisiteOptions(tasks);
  return tasks;
}

function renderTaskTable(tasks) {
  els.taskTableBody.innerHTML = "";

  if (tasks.length === 0) {
    els.taskTableBody.innerHTML =
      '<tr class="empty-row"><td colspan="7">No tasks yet — add one on the left.</td></tr>';
    return;
  }

  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

  tasks.forEach((t) => {
    const tr = document.createElement("tr");
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}



els.form.addEventListener("submit", async (e) => {
  e.preventDefault();

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
    const err = await res.json();
    alert(err.error || "Could not add task.");
    return;
  }

  els.form.reset();
  ["urgency", "importance", "difficulty"].forEach((f) => {
    document.getElementById(`f-${f}-val`).textContent = "3";
  });
  document.getElementById("f-progress-val").textContent = "0";
  els.deadline.value = toLocalInputValue(defaultDeadline);

  await loadTasks();
});

async function deleteTask(id) {
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
  await loadTasks();
}

async function completeTask(id) {
  await fetch(`${API}/tasks/${id}/complete`, { method: "POST" });
  await loadTasks();
}


els.generateBtn.addEventListener("click", async () => {
  els.scheduleMessage.textContent = "";
  const budget = parseFloat(els.budget.value);
  const horizon = parseInt(els.horizon.value, 10);

  const res = await fetch(`${API}/schedule?daily_budget=${budget}&max_day=${horizon}`);
  const data = await res.json();

  if (data.message) {
    els.scheduleMessage.textContent = data.message;
  }

  renderSchedule(data.daily_plan, data.cost);
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

  const { dayNum, relative, monthDay } = describeScheduleDay(block.date);

  const tasksHtml = block.tasks.map((t) => {
    const chunkLabel = t.split_across_days
      ? `${t.chunk_hours}h of ${t.total_duration}h total${t.is_final_chunk ? " — final part" : ""}`
      : `${t.chunk_hours}h`;
    return `
      <div class="day-task">
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



loadTasks();

setInterval(loadTasks, 30 * 1000);