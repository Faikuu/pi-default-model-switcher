import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Input, type Component, type TuiMouseEvent, type TuiMouseEventResult, type TUI, Text, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { clampIndex, filterPickerItems, pickerMaxVisible, visibleRange, type PickerItem } from "./picker.ts";

const OTHER_LABEL = "Other…";
const OTHER_DESCRIPTION = "use provider/model typed above";

type PickerResult = { kind: "model"; value: string } | { kind: "other"; value: string } | { kind: "cancel" };

/**
 * Scrollable, searchable model picker rendered as a centered overlay.
 *
 * The list shows at most `pickerMaxVisible` rows for the current terminal size, so
 * navigation never runs the selection past the bottom of the screen.
 */
export class ModelPickerComponent implements Component {
	private readonly container = new Container();
	private readonly input: Input;
	private readonly listContainer = new Container();
	private items: PickerItem[];
	private selectedIndex = 0;
	private listStartRow = 0;
	private _focused = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly title: string,
		items: PickerItem[],
		private readonly done: (result: PickerResult) => void,
	) {
		this.items = items;
		this.selectedIndex = 0;

		this.container.addChild(new DynamicBorder((str) => this.theme.fg("accent", str)));
		this.container.addChild(new Text(this.theme.fg("accent", this.theme.bold(this.title)), 1, 0));
		this.container.addChild(new Text(this.theme.fg("muted", "type to search · ↑↓ move · enter select · esc cancel"), 1, 0));

		this.input = new Input({ prompt: this.theme.fg("accent", "> ") });
		this.input.onSubmit = () => this.select();
		this.container.addChild(this.input);
		this.container.addChild(this.listContainer);
		this.container.addChild(new Text(this.theme.fg("muted", "  "), 1, 0));
		this.container.addChild(new DynamicBorder((str) => this.theme.fg("accent", str)));

		this.updateList();
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	/** Filtered items plus the manual-entry row when the query is not an exact match. */
	private visibleItems(): PickerItem[] {
		const query = this.input.getValue();
		const filtered = filterPickerItems(this.items, query);
		const exact = filtered.some((item) => item.value.toLowerCase() === query.trim().toLowerCase());
		if (exact) return filtered;
		return [
			...filtered,
			{
				value: OTHER_LABEL,
				label: OTHER_LABEL,
				description: query.trim() === "" ? OTHER_DESCRIPTION : `use "${query.trim()}" as provider/model`,
				searchText: OTHER_LABEL,
			},
		];
	}

	private updateList(): void {
		const items = this.visibleItems();
		const maxVisible = pickerMaxVisible(items.length, this.tui.terminal.rows);
		this.selectedIndex = clampIndex(this.selectedIndex, items.length);
		const { start, end } = visibleRange(items.length, this.selectedIndex, maxVisible);

		this.listContainer.clear();
		for (let i = start; i < end; i++) {
			const item = items[i];
			if (!item) continue;
			const selected = i === this.selectedIndex;
			const prefix = selected ? this.theme.fg("accent", "→ ") : "  ";
			const label = selected ? this.theme.fg("accent", this.theme.bold(item.label)) : this.theme.fg("text", item.label);
			const description = this.theme.fg("muted", `  ${item.description}`);
			this.listContainer.addChild(new Text(prefix + label + description, 1, 0));
		}
		if (items.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("warning", "  No matching models"), 1, 0));
		}

		this.listStartRow = PICKER_LIST_ROW;
		const position = items.length === 0 ? "(0/0)" : `(${this.selectedIndex + 1}/${items.length})`;
		this.listContainer.addChild(new Text(this.theme.fg("dim", `  ${position}`), 1, 0));
	}

	private move(delta: number): void {
		const items = this.visibleItems();
		if (items.length === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + items.length) % items.length;
		this.updateList();
		this.tui.requestRender();
	}

	private select(): void {
		const items = this.visibleItems();
		const item = items[this.selectedIndex];
		if (!item) return;
		if (item.value === OTHER_LABEL) {
			const typed = this.input.getValue().trim();
			if (typed === "") return;
			this.done({ kind: "other", value: typed });
			return;
		}
		this.done({ kind: "model", value: item.value });
	}

	render(width: number): string[] {
		return this.container.render(width).map((line) => truncateToWidth(line, width, "…"));
	}

	invalidate(): void {
		this.container.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "up")) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.move(1);
			return;
		}
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done({ kind: "cancel" });
			return;
		}
		this.input.handleInput(data);
		// A new query re-ranks the list, so the best match is selected.
		if (this.input.getValue() !== this.lastQuery) {
			this.lastQuery = this.input.getValue();
			this.selectedIndex = 0;
		}
		this.updateList();
		this.tui.requestRender();
	}

	private lastQuery = "";

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		const items = this.visibleItems();
		if (items.length === 0) return undefined;
		if (event.type === "wheel" && event.wheelDelta) {
			this.move(event.wheelDelta < 0 ? -1 : 1);
			return { handled: true, render: true };
		}
		if (event.button === "left" && (event.type === "press" || event.type === "click")) {
			const index = this.listStartRow + event.y;
			if (index < 0 || index >= items.length) return undefined;
			this.selectedIndex = index;
			if (event.type === "click") {
				this.select();
			} else {
				this.updateList();
				this.tui.requestRender();
			}
			return { handled: true, focus: true };
		}
		return undefined;
	}
}

/** Row index of the first list entry (border, title, hint, search input). */
const PICKER_LIST_ROW = 4;
