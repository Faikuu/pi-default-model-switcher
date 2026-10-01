import { fuzzyFilterItems } from "./fuzzy.ts";
import { modelRef, sortModels, type ModelLike } from "./models.ts";

export interface PickerItem {
	/** `provider/model`, the value written to settings. */
	value: string;
	/** Primary column text. */
	label: string;
	/** Secondary column text (provider, model id, markers). */
	description: string;
	/** Text the fuzzy search runs against. */
	searchText: string;
}

/** Build picker items, current model first, then sorted by provider and name. */
export function buildPickerItems(models: readonly ModelLike[], current?: ModelLike): PickerItem[] {
	const sorted = sortModels(models);
	return sorted.map((model) => {
		const isCurrent = !!current && current.provider === model.provider && current.id === model.id;
		const description = [model.provider, model.id, isCurrent ? "current" : undefined].filter(Boolean).join("  ");
		return {
			value: modelRef(model),
			label: model.name,
			description,
			searchText: `${model.provider} ${model.id} ${model.name}`.toLowerCase(),
		};
	});
}

/** Rank items against a search query. An empty query keeps the original order. */
export function filterPickerItems(items: readonly PickerItem[], query: string): PickerItem[] {
	return fuzzyFilterItems(items, query, (item) => item.searchText);
}

export interface VisibleRange {
	start: number;
	end: number;
}

/** Window of items to render so the selected item stays visible. */
export function visibleRange(total: number, selected: number, maxVisible: number): VisibleRange {
	if (total <= 0) return { start: 0, end: 0 };
	const size = Math.max(1, Math.min(maxVisible, total));
	const start = Math.max(0, Math.min(selected - Math.floor(size / 2), total - size));
	return { start, end: Math.min(start + size, total) };
}

/** Rows used by everything except the list itself (title, search, hints, borders). */
export const PICKER_CHROME_ROWS = 7;
/** Hard cap on visible model rows, regardless of terminal size. */
export const PICKER_MAX_ROWS = 15;

/**
 * How many model rows to show: the item count, capped, and never more than the
 * terminal can display without pushing the picker off screen.
 */
export function pickerMaxVisible(itemCount: number, terminalRows: number, maxRows = PICKER_MAX_ROWS): number {
	if (itemCount <= 0) return 0;
	const byHeight = Math.max(3, terminalRows - PICKER_CHROME_ROWS);
	return Math.max(1, Math.min(itemCount, maxRows, byHeight));
}

/** Clamp a selected index into the current item list. */
export function clampIndex(index: number, total: number): number {
	if (total <= 0) return 0;
	return Math.max(0, Math.min(index, total - 1));
}
