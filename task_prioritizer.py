import heapq
import itertools
from dataclasses import dataclass
from datetime import datetime,timedelta
from typing import Optional,NamedTuple

EPS = 1e-9

@dataclass(frozen = True)
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

def priority_weight(task:Task) ->float:
    return task.urgency + task.importance + task.difficulty + (5-task.progress)


class State(NamedTuple):
    day: int
    hours_used_today: float
    scheduled: frozenset
    remaining: frozenset


