# pending-board

[日本語](README.ja.md)

A Claude Code mod that keeps the things you need to decide, and the information that must not get lost, in a band above the prompt and a dialog.

- Band: always shows `◆ Decisions n  ● Info n`. Press it to open the dialog
- Dialog: Pending / Resolved tabs. Each item has "Discuss" (inserts a reference into the prompt) and "Mark resolved"
- "Answer n pending decisions" button, or `/pending ask`: Claude asks them with AskUserQuestion and resolves them
- Claude manages items with `mcp__pending-board__add` / `resolve` / `list`
- `#n` in a message (full-width `＃ｎ` too) attaches that item to the message as context for Claude
- An item you mark resolved in the panel is reported to Claude with your next message, so Claude does not keep treating it as open
- Items are stored per session ID and come back with `claude -r`. A new session or `/clear` starts empty

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

## Commands

```
/pending                       open the dialog
/pending ask                   ask the pending decisions in a question dialog
/pending add <text>            add a decision
/pending info <text>           add an info item
/pending resolve <id> [decision]
```

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .
```

## License

[MIT](LICENSE)
