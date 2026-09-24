import { json } from "@sveltejs/kit";
import {
	getActiveHabits,
	getMonthlyMinutes,
	getMonthlyCompletions,
	getStreak,
	getMonthlyDailyData,
	getNotesForDates,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export async function GET({ url, request }) {
	const user = await requireUser(request);
	const month = url.searchParams.get("month");
	if (!month) {
		return json({ error: "Missing month" }, { status: 400 });
	}

	const habits = getActiveHabits(user.id);
	const daysInMonth = new Date(
		parseInt(month.split("-")[0]),
		parseInt(month.split("-")[1]),
		0,
	).getDate();

	let totalMinutes = 0;
	let totalCompletions = 0;
	let bestStreak = 0;

	const habitStats = habits.map((habit) => {
		const daily = getMonthlyDailyData(habit.id, user.id, month, daysInMonth, habit.habit_type);
		const minutes = getMonthlyMinutes(habit.id, user.id, month);
		const completions = getMonthlyCompletions(habit.id, user.id, month);
		const streak = getStreak(habit.id, user.id);

		if (habit.habit_type === "timer") {
			totalMinutes += minutes;
			totalCompletions += daily.filter((d) => d > 0).length;
		} else {
			totalCompletions += completions;
		}
		bestStreak = Math.max(bestStreak, streak);

		let total: number;
		if (habit.habit_type === "timer") {
			total = minutes;
		} else if (habit.habit_type === "boolean") {
			total = completions;
		} else {
			const avg = completions > 0 ? daily.reduce((a, b) => a + b, 0) / completions : 0;
			total = parseFloat(avg.toFixed(1));
		}

		return {
			id: habit.id,
			description: habit.description,
			type: habit.habit_type,
			total,
			streak,
			daily,
		};
	});

	// Compute daily aggregate completion counts
	const dailyCompletions = [];
	const dates = [];
	for (let day = 1; day <= daysInMonth; day++) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		dates.push(date);
		let count = 0;
		for (const habit of habits) {
			const daily = habitStats.find((h) => h.id === habit.id)?.daily || [];
			const value = daily[day - 1] || 0;
			if (habit.habit_type === "boolean") {
				if (value > 0) count++;
			} else if (habit.habit_type === "timer") {
				if (value > 0) count++;
			} else {
				if (value >= (habit.min_value || 0)) count++;
			}
		}
		dailyCompletions.push(count);
	}

	const notes = getNotesForDates(user.id, dates);
	const notesMap = new Map(notes.map((n) => [n.date, n]));

	return json({
		month,
		summary: {
			totalMinutes,
			totalCompletions,
			bestStreak,
		},
		habits: habitStats,
		dailyCompletions,
		notes: Array.from(notesMap.entries()).map(([date, note]) => ({ date, content: note.content })),
	});
}
