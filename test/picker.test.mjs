import { test } from "node:test";
import assert from "node:assert/strict";

import { fuzzyFilterItems, fuzzyScore } from "../lib/fuzzy.ts";
import {
	buildPickerItems,
	clampIndex,
	filterPickerItems,
	PICKER_CHROME_ROWS,
	PICKER_MAX_ROWS,
	pickerMaxVisible,
	visibleRange,
} from "../lib/picker.ts";

const models = [
	{ provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true },
	{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", reasoning: true },
	{ provider: "anthropic", id: "claude-haiku-4-5", name: "Claude Haiku 4.5", reasoning: false },
	{ provider: "openrouter", id: "~anthropic/claude-opus-latest", name: "Claude Opus (latest)", reasoning: true },
];

test("fuzzyScore matches subsequences and rejects misses", () => {
	assert.equal(fuzzyScore("", "anything"), 0);
	assert.equal(fuzzyScore("   ", "anything"), 0);
	assert.notEqual(fuzzyScore("sonnet", "claude sonnet 4.5"), undefined);
	assert.notEqual(fuzzyScore("claude sonnet", "claude sonnet 4.5"), undefined);
	assert.equal(fuzzyScore("zzz", "claude sonnet"), undefined);
	// tokens must appear in order
	assert.equal(fuzzyScore("sonnet claude", "claude sonnet"), undefined);
});

test("fuzzyScore prefers earlier and tighter matches", () => {
	assert.ok(fuzzyScore("sonnet", "claude sonnet 4.5") < fuzzyScore("sonnet", "claude haiku sonnet preview"));
});

test("fuzzyFilterItems keeps input order for an empty query and ranks matches otherwise", () => {
	const all = fuzzyFilterItems(models, "", (m) => m.id);
	assert.deepEqual(all, models);
	const ranked = fuzzyFilterItems(models, "opus", (m) => `${m.provider} ${m.id} ${m.name}`);
	assert.ok(ranked.length >= 1);
	assert.equal(ranked[0].id, "~anthropic/claude-opus-latest");
});

test("buildPickerItems sorts by provider and marks the current model", () => {
	const items = buildPickerItems(models, { provider: "openai", id: "gpt-5", name: "GPT-5" });
	assert.deepEqual(items.map((i) => i.value), [
		"anthropic/claude-haiku-4-5",
		"anthropic/claude-sonnet-4-5",
		"openai/gpt-5",
		"openrouter/~anthropic/claude-opus-latest",
	]);
	const current = items.find((i) => i.value === "openai/gpt-5");
	assert.match(current.description, /current/);
	assert.ok(!items[0].description.includes("current"));
	// search text covers provider, id and name
	assert.ok(items[0].searchText.includes("claude haiku"));
});

test("filterPickerItems matches on provider, id, and name", () => {
	const items = buildPickerItems(models);
	assert.equal(filterPickerItems(items, "gpt-5")[0].value, "openai/gpt-5");
	assert.equal(filterPickerItems(items, "haiku")[0].value, "anthropic/claude-haiku-4-5");
	assert.equal(filterPickerItems(items, "openrouter")[0].value, "openrouter/~anthropic/claude-opus-latest");
	assert.equal(filterPickerItems(items, "nothing-here").length, 0);
});

test("visibleRange keeps the selection inside the window", () => {
	assert.deepEqual(visibleRange(0, 0, 10), { start: 0, end: 0 });
	assert.deepEqual(visibleRange(5, 0, 10), { start: 0, end: 5 });
	assert.deepEqual(visibleRange(20, 0, 10), { start: 0, end: 10 });
	assert.deepEqual(visibleRange(20, 19, 10), { start: 10, end: 20 });
	assert.deepEqual(visibleRange(20, 10, 10), { start: 5, end: 15 });
});

test("pickerMaxVisible never exceeds the item count, the cap, or the terminal", () => {
	assert.equal(pickerMaxVisible(0, 40), 0);
	assert.equal(pickerMaxVisible(3, 40), 3);
	assert.equal(pickerMaxVisible(100, 200), PICKER_MAX_ROWS);
	// A short terminal clamps the window so the overlay still fits.
	assert.equal(pickerMaxVisible(100, PICKER_CHROME_ROWS + 4), 4);
	assert.equal(pickerMaxVisible(100, 4), 3, "minimum of three rows");
	assert.equal(pickerMaxVisible(100, 200, 8), 8);
});

test("clampIndex keeps the selection in range", () => {
	assert.equal(clampIndex(-5, 3), 0);
	assert.equal(clampIndex(9, 3), 2);
	assert.equal(clampIndex(1, 3), 1);
	assert.equal(clampIndex(4, 0), 0);
});
