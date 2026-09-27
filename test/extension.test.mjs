import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	agentDir,
	describeDefaults,
	globalSettingsPath,
	projectSettingsPath,
	readSettings,
	writeSettings,
} from "../lib/settings.ts";
import {
	modelOptionLabel,
	modelRef,
	parseModelRef,
	sortModels,
	supportedThinkingLevels,
	OTHER_OPTION,
} from "../lib/models.ts";

async function tmp() {
	return mkdtemp(join(tmpdir(), "dms-test-"));
}

test("agentDir honors PI_CODING_AGENT_DIR", () => {
	assert.equal(agentDir({ PI_CODING_AGENT_DIR: "/tmp/agent" }), "/tmp/agent");
});

test("agentDir falls back to ~/.pi/agent", () => {
	assert.equal(agentDir({}), join(process.env.HOME ?? "", ".pi", "agent"));
});

test("settings paths are derived from agent dir and cwd", () => {
	assert.equal(projectSettingsPath("/work/repo"), "/work/repo/.pi/settings.json");
	assert.equal(globalSettingsPath({ PI_CODING_AGENT_DIR: "/tmp/agent" }), "/tmp/agent/settings.json");
});

test("writeSettings creates the file, merges, and keeps unrelated keys", async () => {
	const dir = await tmp();
	const file = join(dir, "nested", "settings.json");
	const merged = await writeSettings(file, { defaultModel: "m1", defaultProvider: "p1" });
	assert.deepEqual(merged, { defaultModel: "m1", defaultProvider: "p1" });

	await writeSettings(file, { defaultThinkingLevel: "high" });
	assert.deepEqual(await readSettings(file), {
		defaultModel: "m1",
		defaultProvider: "p1",
		defaultThinkingLevel: "high",
	});
	const text = await readFile(file, "utf8");
	assert.ok(text.endsWith("\n"));
	assert.ok(text.includes('  "defaultModel": "m1"'));
});

test("readSettings tolerates missing and malformed files", async () => {
	const dir = await tmp();
	assert.deepEqual(await readSettings(join(dir, "missing.json")), {});
	const bad = join(dir, "bad.json");
	await writeSettings(bad, {});
	const { writeFile } = await import("node:fs/promises");
	await writeFile(bad, "{not json", "utf8");
	assert.deepEqual(await readSettings(bad), {});
});

test("describeDefaults reports set and unset defaults", () => {
	assert.equal(describeDefaults({}), "(not set)");
	assert.equal(
		describeDefaults({ defaultProvider: "anthropic", defaultModel: "sonnet", defaultThinkingLevel: "low" }),
		"defaultProvider=anthropic  defaultModel=sonnet  defaultThinkingLevel=low",
	);
});

test("parseModelRef handles provider/id, bare id, and thinking suffix", () => {
	assert.deepEqual(parseModelRef(" anthropic/claude-sonnet-4-5 "), { provider: "anthropic", id: "claude-sonnet-4-5", thinkingLevel: undefined });
	assert.deepEqual(parseModelRef("gpt-5"), { id: "gpt-5", thinkingLevel: undefined });
	assert.deepEqual(parseModelRef("openai/gpt-5:high"), { provider: "openai", id: "gpt-5", thinkingLevel: "high" });
	assert.equal(parseModelRef("   "), undefined);
});

test("parseModelRef keeps colons that are part of the model id", () => {
	assert.deepEqual(parseModelRef("openrouter/some-model:exacto"), { provider: "openrouter", id: "some-model:exacto", thinkingLevel: undefined });
});

test("modelRef joins provider and id", () => {
	assert.equal(modelRef({ provider: "anthropic", id: "claude-sonnet-4-5" }), "anthropic/claude-sonnet-4-5");
});

test("sortModels orders by provider then name", () => {
	const sorted = sortModels([
		{ provider: "openai", id: "b", name: "B" },
		{ provider: "anthropic", id: "a2", name: "Zeta" },
		{ provider: "anthropic", id: "a1", name: "Alpha" },
	]);
	assert.deepEqual(sorted.map((m) => `${m.provider}/${m.id}`), ["anthropic/a1", "anthropic/a2", "openai/b"]);
});

test("supportedThinkingLevels respects reasoning and the level map", () => {
	assert.deepEqual(supportedThinkingLevels({ id: "m", name: "m", provider: "p" }), ["off"]);
	assert.deepEqual(
		supportedThinkingLevels({ id: "m", name: "m", provider: "p", reasoning: true }),
		["off", "minimal", "low", "medium", "high", "xhigh", "max"],
	);
	assert.deepEqual(
		supportedThinkingLevels({ id: "m", name: "m", provider: "p", reasoning: true, thinkingLevelMap: { off: 0, minimal: null, low: 1, medium: null, high: null, xhigh: null, max: null } }),
		["off", "low"],
	);
});

test("modelOptionLabel marks the current model", () => {
	const current = { provider: "anthropic", id: "sonnet", name: "Sonnet" };
	const label = modelOptionLabel(current, current);
	assert.match(label, /\(current\)$/);
	assert.match(label, /\[sonnet\]/);
	assert.doesNotMatch(modelOptionLabel({ provider: "openai", id: "gpt", name: "GPT" }, current), /current/);
	assert.notEqual(OTHER_OPTION, "");
});
