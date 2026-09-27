import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	defaultsFromSettings,
	describeDefaults,
	globalSettingsPath,
	projectSettingsPath,
	readSettings,
	writeSettings,
} from "./lib/settings.ts";
import {
	modelRef,
	parseModelRef,
	sortModels,
	supportedThinkingLevels,
	OTHER_OPTION,
	type ModelLike,
} from "./lib/models.ts";
import { buildPickerItems } from "./lib/picker.ts";
import { ModelPickerComponent } from "./lib/model-picker.ts";

type Target = "session" | "global" | "project";

const TARGET_LABEL: Record<Target, string> = {
	session: "this session (not saved)",
	global: "global settings",
	project: "project settings",
};

export default function defaultModelSwitcher(pi: ExtensionAPI) {
	pi.registerCommand("model-session", {
		description: "Switch model for this session only (not saved to settings)",
		handler: (args, ctx) => runSwitch(pi, "session", args, ctx),
	});

	pi.registerCommand("model-global", {
		description: "Change the global (agent directory) default startup model",
		handler: (args, ctx) => runSwitch(pi, "global", args, ctx),
	});

	pi.registerCommand("model-project", {
		description: "Change the default startup model for the current project (.pi/settings.json)",
		handler: (args, ctx) => runSwitch(pi, "project", args, ctx),
	});

	pi.registerCommand("model-show", {
		description: "Show the current session model plus global and project model defaults",
		handler: async (_args, ctx) => {
			const current = ctx.model as ModelLike | undefined;
			const thinking = ctx.thinkingLevel ?? (await safeThinkingLevel(pi));
			ctx.ui.notify(
				`Session: ${current ? `${modelRef(current)} (${current.name})` : "(none)"}  thinking=${thinking ?? "unset"}`,
				"info",
			);
			const global = await readSettings(globalSettingsPath());
			ctx.ui.notify(`Global  ${globalSettingsPath()}\n  ${describeDefaults(global)}`, "info");
			const projectFile = projectSettingsPath(ctx.cwd);
			const project = await readSettings(projectFile);
			ctx.ui.notify(`Project ${projectFile}\n  ${describeDefaults(project)}`, "info");
			const projectOverride = defaultsFromSettings(project);
			if (projectOverride.defaultModel) {
				ctx.ui.notify("Project settings take precedence over global settings in this directory.", "info");
			}
		},
	});
}

async function safeThinkingLevel(pi: ExtensionAPI): Promise<string | undefined> {
	try {
		return pi.getThinkingLevel();
	} catch {
		return undefined;
	}
}

async function runSwitch(pi: ExtensionAPI, target: Target, args: string, ctx: ExtensionCommandContext): Promise<void> {
	if (target === "project" && !ctx.isProjectTrusted()) {
		ctx.ui.notify(
			"This project is not trusted, so .pi/settings.json would be ignored. Trust the project first, or use /model-global.",
			"warning",
		);
		return;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify("No interactive UI available. Pass a model reference as an argument, e.g. /model-global anthropic/claude-sonnet-4-5", "warning");
	}

	const current = ctx.model as ModelLike | undefined;
	const models = sortModels(ctx.modelRegistry.getAvailable() as ModelLike[]);

	let chosen: ModelLike | undefined;
	let thinkingHint: string | undefined;

	if (args.trim() !== "") {
		const ref = parseModelRef(args);
		thinkingHint = ref?.thinkingLevel;
		chosen = models.find((m) => modelRef(m) === `${ref?.provider}/${ref?.id}`) ?? (ref ? matchById(models, ref.id, ref.provider) : undefined);
		if (!chosen) {
			ctx.ui.notify(`No configured model matches "${args.trim()}". Use provider/model, e.g. anthropic/claude-sonnet-4-5.`, "error");
			return;
		}
	} else {
		if (!ctx.hasUI) return;
		if (models.length === 0) {
			ctx.ui.notify("No models with configured credentials are available.", "error");
			return;
		}
		const selection = await pickModel(`Select model for ${TARGET_LABEL[target]}`, models, current, ctx);
		if (selection.kind === "cancel") return;
		if (selection.kind === "model") {
			chosen = models.find((m) => modelRef(m) === selection.value);
		} else {
			const ref = parseModelRef(selection.value);
			thinkingHint = ref?.thinkingLevel;
			chosen = ref ? matchById(models, ref.id, ref.provider) : undefined;
			if (!chosen) {
				ctx.ui.notify(
					`No configured model matches "${selection.value}". It must exist in your model registry with credentials.`,
					"error",
				);
				return;
			}
		}
	}

	if (!chosen) return;

	let thinkingLevel = thinkingHint;
	if (!thinkingLevel) {
		thinkingLevel = await pickThinkingLevel(chosen, ctx);
		if (thinkingLevel === undefined) return;
	}

	// Persist when a settings file backs this target.
	if (target !== "session") {
		const file = target === "global" ? globalSettingsPath() : projectSettingsPath(ctx.cwd);
		const patch: Record<string, unknown> = {
			defaultProvider: chosen.provider,
			defaultModel: chosen.id,
		};
		if (thinkingLevel) patch.defaultThinkingLevel = thinkingLevel;
		try {
			await withFileMutationQueue(file, async () => {
				await writeSettings(file, patch);
			});
		} catch (error) {
			ctx.ui.notify(`Failed to write ${file}: ${error instanceof Error ? error.message : String(error)}`, "error");
			return;
		}
	}

	// Apply to the running session.
	const switched = await pi.setModel(chosen as never);
	if (!switched) {
		ctx.ui.notify(`Pi refused to switch to ${modelRef(chosen)} in this session.`, "warning");
	}
	if (thinkingLevel) pi.setThinkingLevel(thinkingLevel as never);

	const where = target === "session" ? "this session only" : target === "global" ? globalSettingsPath() : projectSettingsPath(ctx.cwd);
	ctx.ui.notify(
		`Model set to ${modelRef(chosen)} (${chosen.name}), thinking=${thinkingLevel ?? "unchanged"} — ${where}.`,
		"info",
	);
	if (target === "project") {
		ctx.ui.notify("Project .pi/settings.json is read at startup; run /reload after switching projects.", "info");
	}
}

/**
 * Show the searchable, scrollable model picker.
 *
 * TUI sessions get the overlay component; other clients fall back to the plain
 * `ctx.ui.select` dialog.
 */
async function pickModel(
	title: string,
	models: ModelLike[],
	current: ModelLike | undefined,
	ctx: ExtensionCommandContext,
): Promise<{ kind: "model"; value: string } | { kind: "other"; value: string } | { kind: "cancel" }> {
	if (ctx.mode === "tui") {
		return ctx.ui.custom((tui, theme, _kb, done) => new ModelPickerComponent(tui, theme, title, buildPickerItems(models, current), done), {
			overlay: true,
			overlayOptions: { anchor: "center", width: "70%", minWidth: 50, maxHeight: "90%", margin: 1 },
		});
	}
	const options = [...models.map((m) => `${m.provider}  ${m.name}  [${m.id}]`), OTHER_OPTION];
	const picked = await ctx.ui.select(title, options);
	if (picked === undefined) return { kind: "cancel" };
	if (picked === OTHER_OPTION) {
		const typed = await ctx.ui.input("Model reference", "provider/model");
		if (typed === undefined) return { kind: "cancel" };
		return { kind: "other", value: typed.trim() };
	}
	const model = models[options.indexOf(picked)];
	return model ? { kind: "model", value: modelRef(model) } : { kind: "cancel" };
}

function matchById(models: ModelLike[], id: string, provider?: string): ModelLike | undefined {
	if (provider) return models.find((m) => m.provider === provider && m.id === id);
	const matches = models.filter((m) => m.id === id);
	return matches.length === 1 ? matches[0] : undefined;
}

async function pickThinkingLevel(model: ModelLike, ctx: ExtensionCommandContext): Promise<string | undefined> {
	const levels = supportedThinkingLevels(model);
	if (levels.length <= 1) return levels[0];
	if (!ctx.hasUI) return undefined;
	return ctx.ui.select(`Thinking level for ${modelRef(model)}`, levels);
}
