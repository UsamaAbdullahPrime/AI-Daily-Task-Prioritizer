# PERSON 2 — Successor generation (state transitions)
from models import EPS, State, hours_done


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