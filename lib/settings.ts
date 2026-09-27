import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ModelDefaults {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: string;
}

/** Resolve the pi agent directory (`PI_CODING_AGENT_DIR` or `~/.pi/agent`). */
export function agentDir(env: NodeJS.ProcessEnv = process.env): string {
	const configured = env.PI_CODING_AGENT_DIR;
	if (configured && configured.trim() !== "") {
		return expandHome(configured.trim(), env);
	}
	return join(homedir(), ".pi", "agent");
}

export function expandHome(path: string, env: NodeJS.ProcessEnv = process.env): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	const home = env.HOME ?? env.USERPROFILE;
	if (path.startsWith("~") && home) return join(home, path.slice(1));
	return path;
}

export function globalSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
	return join(agentDir(env), "settings.json");
}

export function projectSettingsPath(cwd: string): string {
	return join(cwd, ".pi", "settings.json");
}

/** Read a settings file, returning `{}` when it is missing or malformed. */
export async function readSettings(file: string): Promise<Record<string, unknown>> {
	let text: string;
	try {
		text = await readFile(file, "utf8");
	} catch {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
}

/** Merge `patch` into a settings file, preserving unrelated keys. Returns the merged object. */
export async function writeSettings(file: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
	const current = await readSettings(file);
	const next = { ...current, ...patch };
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	return next;
}

/** Human-readable summary of the model-related keys in a settings object. */
export function describeDefaults(settings: Record<string, unknown>): string {
	const provider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined;
	const model = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined;
	if (!provider && !model) return "(not set)";
	const parts: string[] = [];
	if (provider) parts.push(`defaultProvider=${provider}`);
	if (model) parts.push(`defaultModel=${model}`);
	if (typeof settings.defaultThinkingLevel === "string") parts.push(`defaultThinkingLevel=${settings.defaultThinkingLevel}`);
	return parts.join("  ");
}

export function defaultsFromSettings(settings: Record<string, unknown>): ModelDefaults {
	const out: ModelDefaults = {};
	if (typeof settings.defaultProvider === "string") out.defaultProvider = settings.defaultProvider;
	if (typeof settings.defaultModel === "string") out.defaultModel = settings.defaultModel;
	if (typeof settings.defaultThinkingLevel === "string") out.defaultThinkingLevel = settings.defaultThinkingLevel;
	return out;
}
