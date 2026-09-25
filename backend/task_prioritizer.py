import heapq
import itertools
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional, NamedTuple

EPS = 1e-9


@dataclass(frozen=True)
class Task:
    id: str
    name: str
    duration: float
    deadline: int
    prerequisite: Optional[str] = None
    urgency: float = 0
    importance: float = 0
    difficulty: float = 0
    progress: float = 0


def priority_weight(task: Task) -> float:
    return task.urgency + task.importance + task.difficulty + (5 - task.progress)


class State(NamedTuple):
    day: int
    hours_used_today: float
    scheduled: frozenset
    remaining: frozenset


def hours_done(state: State, tid: str) -> float:
    return sum(h for (t, _day, h) in state.scheduled if t == tid)


def g_cost(state: State, tasks_by_id: dict) -> float:
    total = 0.0
    for tid, day_scheduled, chunk_hours in state.scheduled:
        task = tasks_by_id[tid]
        fraction = chunk_hours / task.duration if task.duration else 1.0
        total += fraction * day_scheduled * priority_weight(task)
    return total / 10.0


def h_cost(state: State, tasks_by_id: dict) -> float:
    total = 0.0
    for tid in state.remaining:
        total += state.day * priority_weight(tasks_by_id[tid])
    return total / 10.0


def get_successors(state: State, tasks_by_id: dict, daily_budget: float):
    available_today = daily_budget - state.hours_used_today

    if available_today > EPS:
        for tid in sorted(state.remaining):
            task = tasks_by_id[tid]
            prereq_ok = task.prerequisite is None or task.prerequisite not in state.remaining
            within_deadline = state.day <= task.deadline
            if not (prereq_ok and within_deadline):
                continue

            done_so_far = hours_done(state, tid)
            remaining_hours = task.duration - done_so_far
            if remaining_hours <= EPS:
                continue

            chunk = min(remaining_hours, available_today)
            new_done = done_so_far + chunk
            new_remaining = (
                state.remaining - {tid}
                if new_done >= task.duration - EPS
                else state.remaining
            )

            new_state = State(
                day=state.day,
                hours_used_today=state.hours_used_today + chunk,
                scheduled=state.scheduled | {(tid, state.day, chunk)},
                remaining=new_remaining,
            )
            verb = "Finish" if new_done >= task.duration - EPS else "Work"
            yield new_state, f"{verb} {chunk:g}h on {task.name} (day {state.day})"

    if state.remaining:
        new_state = State(
            day=state.day + 1,
            hours_used_today=0.0,
            scheduled=state.scheduled,
            remaining=state.remaining,
        )
        yield new_state, f"Advance to day {state.day + 1}"


def _reconstruct_actions(goal_state, came_from):
    path = []
    state = goal_state
    while state in came_from:
        parent, action = came_from[state]
        path.append(action)
        state = parent
    path.reverse()
    return path


def _build_daily_plan(goal_state: State, tasks_by_id: dict, daily_budget: float,
                       start_date: date):
    by_day = {}
    for tid, day, chunk_hours in goal_state.scheduled:
        by_day.setdefault(day, []).append((tid, chunk_hours))

    totals_by_task = {}
    chunk_count_by_task = {}
    for tid, _day, h in goal_state.scheduled:
        totals_by_task[tid] = totals_by_task.get(tid, 0.0) + h
        chunk_count_by_task[tid] = chunk_count_by_task.get(tid, 0) + 1
    last_day_by_task = {}
    for tid, day, _h in goal_state.scheduled:
        last_day_by_task[tid] = max(last_day_by_task.get(tid, day), day)

    plan = []
    for day, chunks in sorted(by_day.items()):
        day_tasks = []
        for tid, chunk_hours in chunks:
            task = tasks_by_id[tid]
            day_tasks.append({
                "id": tid,
                "name": task.name,
                "chunk_hours": chunk_hours,
                "total_duration": task.duration,
                "is_final_chunk": last_day_by_task[tid] == day,
                "split_across_days": chunk_count_by_task[tid] > 1,
            })
        total_hours = sum(c for _tid, c in chunks)
        plan.append({
            "day": day,
            "date": (start_date + timedelta(days=day - 1)).isoformat(),
            "tasks": day_tasks,
            "total_hours": total_hours,
            "over_budget": total_hours > daily_budget + EPS,
        })
    return plan


def a_star_schedule(tasks: list, daily_budget: float, max_day: int = 30,
                     start_date: date = None):
    start_date = start_date or date.today()
    tasks_by_id = {t.id: t for t in tasks}
    start = State(
        day=1,
        hours_used_today=0.0,
        scheduled=frozenset(),
        remaining=frozenset(t.id for t in tasks),
    )

    counter = itertools.count()
    frontier = []
    f0 = g_cost(start, tasks_by_id) + h_cost(start, tasks_by_id)
    heapq.heappush(frontier, (f0, next(counter), start))

    best_g = {start: 0.0}
    came_from = {}

    while frontier:
        f, _, state = heapq.heappop(frontier)

        if not state.remaining:
            return {
                "daily_plan": _build_daily_plan(state, tasks_by_id, daily_budget, start_date),
                "actions": _reconstruct_actions(state, came_from),
                "cost": best_g[state],
            }

        if state.day > max_day:
            continue

        for new_state, action in get_successors(state, tasks_by_id, daily_budget):
            tentative_g = g_cost(new_state, tasks_by_id)
            if new_state not in best_g or tentative_g < best_g[new_state]:
                best_g[new_state] = tentative_g
                came_from[new_state] = (state, action)
                f_new = tentative_g + h_cost(new_state, tasks_by_id)
                heapq.heappush(frontier, (f_new, next(counter), new_state))

    return None