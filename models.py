# PERSON 1 — Data models & cost functions
from dataclasses import dataclass
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