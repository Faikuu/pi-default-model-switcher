/**
 * Small fuzzy matcher used by the model picker.
 *
 * A query matches when every token (whitespace- or slash-separated) appears as a
 * subsequence of the candidate text, in order. Lower scores rank first.
 */

function tokenize(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[\s/]+/)
		.filter((token) => token.length > 0);
}

/** Score a query against text. Returns `undefined` when the query does not match. */
export function fuzzyScore(query: string, text: string): number | undefined {
	const tokens = tokenize(query);
	if (tokens.length === 0) return 0;
	const haystack = text.toLowerCase();
	let total = 0;
	let cursor = 0;
	for (const token of tokens) {
		let tokenIndex = 0;
		let first = -1;
		let found = -1;
		for (let i = cursor; i < haystack.length && tokenIndex < token.length; i++) {
			if (haystack[i] === token[tokenIndex]) {
				if (first < 0) first = i;
				found = i;
				tokenIndex++;
			}
		}
		if (tokenIndex < token.length) return undefined;
		// A literal substring hit always beats a scattered subsequence hit, then
		// earlier and tighter matches win.
		const literal = haystack.indexOf(token, cursor) >= 0;
		const gaps = found - first + 1 - token.length;
		total += (literal ? 0 : 200) + first + gaps * 2;
		cursor = found + 1;
	}
	return total;
}

/** Filter and rank items by fuzzy match quality against `getText(item)`. */
export function fuzzyFilterItems<T>(items: readonly T[], query: string, getText: (item: T) => string): T[] {
	const tokens = tokenize(query);
	if (tokens.length === 0) return [...items];
	const scored: Array<{ item: T; score: number; index: number }> = [];
	items.forEach((item, index) => {
		const score = fuzzyScore(query, getText(item));
		if (score !== undefined) scored.push({ item, score, index });
	});
	scored.sort((a, b) => (a.score === b.score ? a.index - b.index : a.score - b.score));
	return scored.map((entry) => entry.item);
}
