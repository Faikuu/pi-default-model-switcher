export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

export interface ModelLike {
	id: string;
	name: string;
	provider: string;
	reasoning?: boolean;
	thinkingLevelMap?: Record<string, unknown> | null;
}

export const OTHER_OPTION = "Other… (enter provider/model manually)";

/** Format a model as `provider/id` (the settings-file format). */
export function modelRef(model: Pick<ModelLike, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

/** Parse `provider/id`, `id`, optionally with a `:thinking` suffix. */
export function parseModelRef(
	ref: string,
): { provider?: string; id: string; thinkingLevel?: string } | undefined {
	const trimmed = ref.trim();
	if (trimmed === "") return undefined;
	let body = trimmed;
	let thinkingLevel: string | undefined;
	const colon = body.lastIndexOf(":");
	if (colon > 0) {
		const suffix = body.slice(colon + 1);
		if ((THINKING_LEVELS as readonly string[]).includes(suffix)) {
			thinkingLevel = suffix;
			body = body.slice(0, colon);
		}
	}
	const slash = body.indexOf("/");
	if (slash > 0) {
		return { provider: body.slice(0, slash), id: body.slice(slash + 1), thinkingLevel };
	}
	return { id: body, thinkingLevel };
}

/** Sort models by provider, then by name. */
export function sortModels<T extends ModelLike>(models: readonly T[]): T[] {
	return [...models].sort((a, b) => {
		const byProvider = a.provider.localeCompare(b.provider);
		if (byProvider !== 0) return byProvider;
		return a.name.localeCompare(b.name);
	});
}

/** Thinking levels a model supports (all levels when the model declares no map). */
export function supportedThinkingLevels(model: ModelLike): ThinkingLevelName[] {
	if (!model.reasoning) return ["off"];
	const map = model.thinkingLevelMap as Record<string, unknown> | null | undefined;
	if (!map) return [...THINKING_LEVELS];
	return THINKING_LEVELS.filter((level) => map[level] !== null);
}

/** Label shown in the model picker. */
export function modelOptionLabel(model: ModelLike, current?: ModelLike): string {
	const currentMark = current && current.provider === model.provider && current.id === model.id ? " (current)" : "";
	return `${model.provider}  ${model.name}  [${model.id}]${currentMark}`;
}
