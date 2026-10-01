import json
import os
import uuid
from datetime import date, datetime

from flask import Flask, jsonify, request, send_from_directory

from task_prioritizer import Task, a_star_schedule

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "tasks.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")


# --------------------------------------------------------------------------
# Storage helpers
# --------------------------------------------------------------------------

def load_tasks():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_tasks(tasks):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(tasks, f, indent=2)


def time_left(deadline_at_str: str, now: datetime = None):
    """Real elapsed time between now and the task's deadline (date + time).
    Negative means the deadline has already passed."""
    now = now or datetime.now()
    deadline_at = datetime.fromisoformat(deadline_at_str)
    return deadline_at - now


def format_countdown(delta) -> str:
    """'2d 3h 15m left' / '45m left' / 'Overdue by 1h 10m' / 'Due now'."""
    total_seconds = int(delta.total_seconds())
    overdue = total_seconds < 0
    total_seconds = abs(total_seconds)

    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60

    parts = []
    if days:
        parts.append(f"{days}d")
    if hours or days:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    label = " ".join(parts)

    if overdue:
        return f"Overdue by {label}"
    if total_seconds == 0:
        return "Due now"
    return f"{label} left"


def to_task_object(t: dict) -> Task:
    """Convert a stored task dict into the Task dataclass the engine expects.

    The engine only understands an integer planning day (1 = today), so the
    real `deadline_at` datetime is converted here, at read time, based on
    the actual current date -- always freshly recomputed against "now".
    """
    deadline_at = datetime.fromisoformat(t["deadline_at"])
    remaining_days = (deadline_at.date() - date.today()).days
    relative_deadline = max(1, remaining_days + 1)  # day 1 = today
    return Task(
        id=t["id"],
        name=t["name"],
        duration=float(t["duration"]),
        deadline=relative_deadline,
        prerequisite=t.get("prerequisite") or None,
        urgency=float(t.get("urgency", 0)),
        importance=float(t.get("importance", 0)),
        difficulty=float(t.get("difficulty", 0)),
        progress=float(t.get("progress", 0)),
    )


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


# --------------------------------------------------------------------------
# API: tasks CRUD
# --------------------------------------------------------------------------

def with_countdown(t: dict) -> dict:
    """Attach a freshly-computed countdown to a task dict for display.
    Computed on every read (never stored), so it always reflects the real
    current moment -- no polling/cron job required to keep it accurate."""
    delta = time_left(t["deadline_at"])
    total_minutes = int(delta.total_seconds() // 60)
    return {
        **t,
        "days_left": total_minutes // 1440,       # whole days remaining (negative if overdue)
        "hours_left": (abs(total_minutes) % 1440) // 60,
        "minutes_left": abs(total_minutes) % 60,
        "is_overdue": total_minutes < 0,
        "countdown_label": format_countdown(delta),
    }


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    return jsonify([with_countdown(t) for t in load_tasks()])


@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = request.get_json(force=True) or {}

    for field in ("name", "duration", "deadline_at"):
        if field not in data or data[field] in ("", None):
            return jsonify({"error": f"Missing required field: {field}"}), 400

    try:
        datetime.fromisoformat(data["deadline_at"])  # validate format early
    except ValueError:
        return jsonify({"error": "deadline_at must be an ISO datetime, e.g. 2026-10-01T18:30"}), 400

    try:
        task = {
            "id": uuid.uuid4().hex[:8],
            "name": str(data["name"]).strip(),
            "duration": float(data["duration"]),
            "deadline_at": data["deadline_at"],
            "prerequisite": data.get("prerequisite") or None,
            "urgency": float(data.get("urgency", 0)),
            "importance": float(data.get("importance", 0)),
            "difficulty": float(data.get("difficulty", 0)),
            "progress": float(data.get("progress", 0)),
            "completed": False,
        }
    except (TypeError, ValueError) as e:
        return jsonify({"error": f"Invalid field value: {e}"}), 400

    tasks = load_tasks()
    tasks.append(task)
    save_tasks(tasks)
    return jsonify(with_countdown(task)), 201


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    tasks = load_tasks()
    remaining = [t for t in tasks if t["id"] != task_id]
    if len(remaining) == len(tasks):
        return jsonify({"error": "Task not found"}), 404
    save_tasks(remaining)
    return jsonify({"deleted": task_id})


@app.route("/api/tasks/<task_id>/complete", methods=["POST"])
def complete_task(task_id):
    tasks = load_tasks()
    found = False
    for t in tasks:
        if t["id"] == task_id:
            t["completed"] = True
            t["progress"] = 5
            found = True
            break
    if not found:
        return jsonify({"error": "Task not found"}), 404
    save_tasks(tasks)
    return jsonify({"completed": task_id})


# --------------------------------------------------------------------------
# API: schedule generation
# --------------------------------------------------------------------------

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    try:
        daily_budget = float(request.args.get("daily_budget", 3))
        max_day = int(request.args.get("max_day", 14))
    except ValueError:
        return jsonify({"error": "daily_budget and max_day must be numbers"}), 400

    all_tasks = load_tasks()
    pending = [t for t in all_tasks if not t.get("completed")]

    if not pending:
        return jsonify({"daily_plan": [], "cost": 0, "message": "No pending tasks."})

    task_objects = [to_task_object(t) for t in pending]

    result = a_star_schedule(task_objects, daily_budget=daily_budget, max_day=max_day)

    if result is None:
        return jsonify({
            "daily_plan": None,
            "message": (
                "No feasible schedule found within the planning horizon. "
                "Try increasing the daily budget or the planning horizon."
            ),
        })

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)