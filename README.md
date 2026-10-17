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
X% available until Ddd HH:MM, Y% per hour to reset (read HH:MM)
```

The weekly-usage pane opens when a session starts. It refreshes every 5 minutes and shows:

```
🟢 160.0% available until Fri 17:00
📅 Weekly: 20% used, 80% left. Resets Tue 17:00 (119 h)
⏱️ Hourly: 112.7% per hour to reset (base 100% per hour)
⏳ 5-hour: 3% used. Resets in 3 h 55 m
💲 This session: $4.12 · running 1 h 12 m
🕘 Recent sessions
   Fri 14:05 · $4.12 · about 3% of the weekly limit
   Thu 09:30 · $1.80 · about 1% of the weekly limit
   Wed 16:45 · $0.95
```

How to read the figures:

- **Day scale:** 100% is one day's share of the weekly limit. Above 100% means you are under pace. Below 0% means you are over pace.
- **Hour scale:** 100% per hour is one hour's share of a day. The hourly figure is the balance left until the weekly reset, spread over the hours left.
- **Day boundary:** a day ends at the weekly reset's time of day. The headline shows that boundary (`available until Ddd HH:MM`).
- **Headline icon:** 🟢 50% or more of a day's share left, 🟡 15% to under 50%, 🔴 under 15%.
- **5-hour line:** usage of the rolling 5-hour limit and the time until it resets. It is hidden when there is no 5-hour reading.
- **This session:** what this chat has cost so far, not your account total, and how long it has run. The run time counts from the session's first launch; /clear starts it over. The pane refreshes every 5 minutes, so the run time updates at that interval. It is hidden when there is no usage reading.
- **Recent sessions:** start time, cost and the rise in the weekly limit for up to 3 previous sessions, to compare them. Other sessions running at the same time also count, so the share is approximate.

### How the dollar figures are calculated

The mod does not calculate cost itself. It shows the figure that Claude Code reports through its plugin API (`$.session.usage().cost.usd`). Claude Code describes this figure as US dollars summed over every priced API response in the session, the same total that `/cost` shows.

- **It is an estimate, not a bill.** On a Claude subscription (Pro or Max), you pay a fixed price. The figure is what the same usage would cost at API prices. It does not change what you pay.
- **It covers one session only.** It is not your account total. A resumed session counts from its first launch. `/clear` starts the count again.
- **Recent sessions show the last saved value.** The mod saves each session's cost at start, when usage changes, and every 5 minutes. A session that ends between saves can show a slightly lower cost than its final total.
- **The mod cannot check the figure.** If Claude Code leaves out some usage, the mod leaves it out too. For example, the mod cannot confirm whether subagent usage is included.

Use the dollar figures to compare sessions, not as an exact cost.

The pane needs a weekly limit reading from a Claude subscription. Without one, it shows: `No weekly limit reading. This needs a Claude subscription.`

## Notes

- weekly-usage uses the Claude Code plugin API. It does not run in Codex or Antigravity.
