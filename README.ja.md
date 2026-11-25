# pending-board

[English](README.md)

Claude Code の mod。会話中に出た「ユーザーに決めてほしいこと」と「流れると困る重要情報」を、プロンプト上の帯とダイアログに貯めておく。

- 帯: `◆ 決定待ち n  ● 情報 n` を常に表示。押すとダイアログが開く
- ダイアログ: Pending / Resolved のタブ。各項目に「議論する」（入力欄へ参照を差し込む）と「解決にする」
- 「決定待ち n 件を質問で答える」ボタン、または `/pending ask` で、Claude が AskUserQuestion で聞いて resolve する
- Claude は `mcp__pending-board__add` / `resolve` / `list` で項目を操作する
- 送信文の `#n`（全角 `＃ｎ` も可）は、その項目の内容を Claude 向けの context として添える
- パネルで「解決にする」を押した項目は、次の送信で Claude に知らせる（Claude が未解決のまま扱い続けないように）
- 項目は session ID ごとに保存され、`claude -r` で再開すると戻る。新しい session と `/clear` では空から始まる

## Install

```
/plugin install pending-board --marketplace nikuteresa/claude-pending-board
```

## 言語

`locale` オプション（`/config` → pending-board）で、ボードと Claude に送る文の言語を選ぶ。

| 値 | 言語 |
| --- | --- |
| `auto`（既定） | Claude Code の `language` 設定が日本語（`japanese`, `ja`, `ja-JP`, `日本語`）なら日本語、それ以外は英語 |
| `ja` | 日本語 |
| `en` | 英語 |

## 手動コマンド

```
/pending                       ダイアログを開く
/pending ask                   決定待ちを質問ダイアログで聞く
/pending add <text>            決定待ちを追加
/pending info <text>           情報を追加
/pending resolve <id> [決定内容]
```

## 開発

```
claude plugin validate .
claude plugin test .
tsc -p .
```
