# weekly-usage-codex

Codex version of the `weekly-usage` display, packaged separately from the Claude Code plugin.

The `$weekly-usage` skill reads Codex account rate limits through the built-in desktop usage tool when available and reports how much of today's share remains based on the weekly limit and reset time. It falls back to `codex app-server` elsewhere. It does not show session cost. Codex does not expose Claude Code's custom live pane API, so this reports on demand.

From a Codex session, add the repository as a marketplace and install the plugin:

```powershell
codex plugin marketplace add C:\_DEV\odesuk-agent-toolkit\weekly-usage-codex
codex plugin add weekly-usage-codex@weekly-usage-codex
```

The app-server protocol is experimental and may change.
