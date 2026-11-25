# pending-board

[English](README.md)

Claude Code の mod。会話中に出た「ユーザーに決めてほしいこと」と「流れると困る重要情報」を、プロンプト上の帯とダイアログに貯めておく。

ボードは Claude が自分で管理する。論点が出たら項目を追加し、片付いたら解決にする（決定待ちにユーザーが答えると、決定内容を記録して解決済みにする）。ユーザーが手でボードを更新する必要はない。

- 帯: `◆ 決定待ち n  ● 情報 n` を常に表示。押すか `/pending` でダイアログが開く
- ダイアログ: Pending / Resolved のタブ。各項目に「議論する」（入力欄へ参照を差し込む）と、自分で閉じたいとき用の「解決にする」
- 「決定待ち n 件を質問で答える」ボタンで、Claude が AskUserQuestion で聞いて resolve する
- Claude は `mcp__pending-board__add` / `resolve` / `list` で項目を操作する
- 送信文の `#n`（全角 `＃ｎ` も可）は、その項目の内容を Claude 向けの context として添える
- パネルで「解決にする」を押した項目は、次の送信で Claude に知らせる（Claude が未解決のまま扱い続けないように）
- 項目は session ID ごとに保存され、`claude -r` で再開すると戻る。新しい session と `/clear` では空から始まり、id も `#1` から振り直す。session をまたいでボードを引き継がないのは意図した仕様

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

## 開発

```
claude plugin validate .
claude plugin test .
tsc -p .
```
