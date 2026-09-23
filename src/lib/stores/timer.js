import dayjs from "dayjs";
import { derived, get, writable } from "svelte/store";
import { base } from "$app/paths";
import { send } from "./sync.js";

export const groupsStore = writable([]);

// fire-and-forget: google latency/errors must never block or break the timer
export function postCalendarEvent(habit, event, durationSeconds) {
	fetch(`${base}/api/calendar?action=timer`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ habit, event, durationSeconds }),
	}).catch(() => {});
}

export const habitsStore = derived(groupsStore, ($groups) => {
	return $groups.flatMap((g) => g.habits);
});

export const weekSummaryStore = writable("");

export const hideCompletedStore = writable(false);

export const weekDataStore = writable([]); // { habitId: [ { date, duration_seconds, value }, ... ] }


export const timerStore = writable({
	activeHabitId: null,
	mode: "stopwatch",
	elapsed: 0,
	running: false,
	startTime: null,
	elapsedBefore: 0,
});

timerStore.stop = async () => {
	const state = get(timerStore);
	if (!state?.running) return 0;

	const elapsed = state.startTime
		? Math.floor((Date.now() - state.startTime) / 1000) + state.elapsedBefore
		: state.elapsedBefore || 0;

	const habits = get(habitsStore);
	const habit = habits.find((h) => h.id === state.activeHabitId);
	if (habit) {
		try {
			await fetch(`${base}/api/sessions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					habitId: habit.id,
					date: dayjs().format("YYYY-MM-DD"),
					durationSeconds: elapsed,
				}),
			});
			postCalendarEvent({ id: habit.id, description: habit.description }, "stop", elapsed);
		} catch (e) {
			console.error("Failed to save session:", e);
		}
	}

	timerStore.set({
		activeHabitId: null,
		mode: state.mode,
		elapsed: 0,
		running: false,
		startTime: null,
		elapsedBefore: 0,
	});
	send({ type: "timer:update", data: get(timerStore) });
	send({ type: "sessions:update" });
	window.dispatchEvent(new CustomEvent("sync:sessions"));
	return elapsed;
};
