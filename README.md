# pending-board

[日本語](README.ja.md)

A Claude Code mod that keeps the things you need to decide, and the information that must not get lost, in a band above the prompt and a dialog.

Claude manages the board by itself: it adds items as they come up and resolves them when they are settled (when you answer a decision, Claude marks it resolved with the decision recorded). You do not have to keep the board up to date by hand.

- Band: always shows `◆ Decisions n  ● Info n`. Press it, or run `/pending`, to open the dialog
- Dialog: Pending / Resolved tabs. Each item has "Discuss" (inserts a reference into the prompt) and "Mark resolved", for when you want to close an item yourself
- "Answer n pending decisions" button: Claude asks them with AskUserQuestion and resolves them
- Claude uses `mcp__pending-board__add` / `resolve` / `list`
- `#n` in a message (full-width `＃ｎ` too) attaches that item to the message as context for Claude
- An item you mark resolved in the panel is reported to Claude with your next message, so Claude does not keep treating it as open
- Items are stored per session ID and come back with `claude -r`. A new session or `/clear` starts empty, and its ids start again at `#1`; the board does not carry over between sessions (by design)

## Install

```
/plugin install pending-board --marketplace nikuteresa/claude-pending-board
```

## Language

The `locale` option (`/config` → pending-board) picks the language of the board and of the text sent to Claude.

| value | language |
| --- | --- |
| `auto` (default) | Japanese when Claude Code's `language` setting is Japanese (`japanese`, `ja`, `ja-JP`, `日本語`), English otherwise |
| `ja` | Japanese |
| `en` | English |

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .
```
