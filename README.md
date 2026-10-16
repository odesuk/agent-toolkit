# agent-toolkit

Mods and skills for AI coding agents.

## Plugins

| Name | Works with | What it does |
| --- | --- | --- |
| weekly-usage | Claude Code | Shows the share of the weekly usage limit left for today, and the hourly budget until the reset. |

## Install (Claude Code)

At the prompt of a terminal session:

```
/plugin install weekly-usage --marketplace odesuk/agent-toolkit
```

From a shell:

```
claude plugin install weekly-usage --marketplace odesuk/agent-toolkit
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace, enter `odesuk/agent-toolkit`, then Add plugin.

## weekly-usage: usage

Run `/weekly-usage` to print one line:

```
X% available for today, Y% per hour to reset (read HH:MM)
```

The weekly-usage pane opens when a session starts. It refreshes every 5 minutes and shows:

```
X% available for today
Weekly: P% used, L% left. Resets in N h
Hourly: H% per hour to reset (base 100% per hour)
On pace to today's end at HH:MM: A% of the weekly limit
```

How to read the figures:

- **Day scale:** 100% is one day's share of the weekly limit. Above 100% means you are under pace. Below 0% means you are over pace.
- **Hour scale:** 100% per hour is one hour's share of a day. The hourly figure is the balance left until the weekly reset, spread over the hours left.
- **Day boundary:** a day ends at the weekly reset's time of day. The pane shows that time on the `On pace` line.

The pane needs a weekly limit reading from a Claude subscription. Without one, it shows: `No weekly limit reading. This needs a Claude subscription.`

## Notes

- weekly-usage uses the Claude Code plugin API. It does not run in Codex or Antigravity.
