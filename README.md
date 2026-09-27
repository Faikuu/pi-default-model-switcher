# @faiku/pi-default-model-switcher

A [pi](https://github.com/earendil-works/pi) extension that adds commands for changing the **default startup model**, globally or per project, and for switching the model of the running session.

## Commands

| Command | Effect |
|---|---|
| `/model-session` | Switch the model for this session only. Nothing is written to disk. |
| `/model-global` | Switch the model and write `defaultProvider` / `defaultModel` / `defaultThinkingLevel` to `<agent-dir>/settings.json` (default `~/.pi/agent/settings.json`). |
| `/model-project` | Same, but writes to `<cwd>/.pi/settings.json`, so the default applies only in this project directory. |
| `/model-show` | Print the current session model plus the effective global and project defaults. |

All model commands accept an optional argument to skip the pickers:

```
/model-global anthropic/claude-sonnet-4-5
/model-project openai/gpt-5:high        # ":high" also sets the thinking level
/model-session opus                     # bare model id works when unambiguous
```

## Behavior

- The model picker is a centered overlay with a search box. Typing fuzzy-matches provider, model id, and name (`sonnet`, `openai gpt`, `1m`); `↑↓`/`j`/`k` move, `enter` selects, `esc` cancels, mouse wheel and click work in fullscreen mode.
- The list is scrollable and clamped: it shows at most 15 rows and never more than the terminal height allows (`min(15, rows - 7)`), with a `(3/87)` position indicator, so navigation cannot push the selection off screen.
- A trailing `Other…` row appears whenever the search text is not an exact model match, so any `provider/model` in your registry can be entered by hand.
- Models without extended thinking are stored with `defaultThinkingLevel: "off"`; reasoning models prompt for a level limited to what the model supports.
- The chosen model is applied to the running session immediately (`pi.setModel` + `pi.setThinkingLevel`), and persisted when the command is `/model-global` or `/model-project`.
- Settings files are merged, never rewritten: unrelated keys, formatting-free but stable 2-space JSON, and a trailing newline are preserved. Writes go through pi's file mutation queue.
- `/model-project` refuses to write when the project is not trusted, because pi would ignore `.pi/settings.json`.
- Project settings override global settings, so a project default wins over your user default in that directory.
- Non-TUI clients (RPC, print mode) fall back to the plain `ctx.ui.select` dialog.

## Install

From npm (recommended):

```bash
pi install npm:@faiku/pi-default-model-switcher
```

Try it for a single run without installing:

```bash
pi -e npm:@faiku/pi-default-model-switcher
```

From a local checkout:

```bash
ln -s "$PWD" ~/.pi/agent/extensions/pi-default-model-switcher
```

Per project, or for one run:

```bash
pi --extension ./index.ts
```

```bash
# add to <project>/.pi/settings.json
{ "extensions": ["/absolute/path/to/pi-default-model-switcher"] }
```

Startup defaults are read when a session starts, so run `/reload` or start a new pi session for the persisted default to take effect everywhere; the current session already uses the new model.

## Development

```bash
npm install          # dev-only: types for typechecking
npm test             # unit tests for settings, model refs, fuzzy search, layout
npm run typecheck    # tsc --noEmit
```

Layout: `index.ts` (commands), `lib/settings.ts` (settings paths + merge/write), `lib/models.ts` (model refs, thinking levels), `lib/fuzzy.ts` (search ranking), `lib/picker.ts` (pure item/window math), `lib/model-picker.ts` (overlay component).

The extension ships as TypeScript source — pi loads `.ts` entry points directly, so there is no build step.

## License

MIT
