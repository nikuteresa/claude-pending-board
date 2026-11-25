import type { Messages } from './en'

export const ja: Messages = {
  'kind.decision': '決定',
  'kind.info': '情報',

  'band.decisions': count => `決定待ち ${count}`,
  'band.infos': count => `情報 ${count}`,
  'band.open': '▸ 開く',
  'band.nothingPending': '未決なし',

  'pane.close': '閉じる (Esc)',
  'pane.askDecisions': count => `決定待ち ${count} 件を質問で答える`,
  'pane.emptyPending': '未決事項はありません',
  'pane.emptyResolved': 'まだ解決した項目はありません',
  'pane.discuss': '議論する',
  'pane.resolve': '解決にする',
  'pane.resolvedByUser': '[ユーザーが解決]',

  'command.description': 'Pending board を開く',
  'command.opened': 'Pending board を開きました。',
  'command.argsIgnored': '引数は使いません。項目の追加と解決は Claude が行い、パネルからも解決にできます。',

  'tool.addDescription': [
    'ユーザーの横にある Pending board パネルに項目を追加し、id を返す。積極的に使うこと:',
    '- ユーザーに判断を委ねる論点が出たら、会話で尋ねるのと同時に kind: "decision" で add する。返答を問い（「〜しますか？」「どちらにします？」）で終えるときは必ず add する。',
    '- 後で流れると困る重要情報（制約、前提、注意点、ユーザーの方針）は kind: "info" で add する。返答に「未確認」「見込み」「注意」「大事」「断言できない」と書いたら、その内容を add する。',
    '- 1 項目 1 論点。複数の論点を 1 件に混ぜない。混ざっていたら分けて add し直す（片方の解決で項目ごと閉じると、もう片方が消えるため）。',
    '- 同じ論点を重複して add しない。id が分からなければ list で確かめる。',
    '- パネルが一覧の役を担うので、会話の最後に未決事項を列挙し直す必要はない。',
  ].join('\n'),
  'tool.addTitle': '一行で要点',
  'tool.addDetail': '背景・選択肢など（任意）',
  'tool.resolveDescription': [
    'Pending board の項目を resolved に移す。',
    '- ユーザーが decision に答えたら、決定内容を resolution に入れて resolve する。',
    '- info は、内容が反映済み・不要になったと判断できたときに resolve する。',
  ].join('\n'),
  'tool.resolveId': 'add / list が返す項目の id。例: "#3"',
  'tool.resolveResolution': '決まった内容（decision のとき）',
  'tool.listDescription': 'Pending board の全項目を返す。id の確認や重複チェックに使う。',

  'note.mention': formatted => `Pending board の項目: ${formatted}`,
  'note.manualResolution': formatted =>
    `Pending board: ユーザーがパネルで手動で解決済みにした（決定内容の記録なし）。閉じたものとして扱い、resolve し直さないこと: ${formatted}`,
  'ask.request': (ids, batchSize) =>
    `Pending board の決定待ち ${ids} を AskUserQuestion で質問して（1 回 ${batchSize} 件まで、選択肢は会話の文脈から作る）。` +
    '答えが出た項目は resolution を付けて resolve して。',

  'discuss.reference': item => `${item.id}「${item.title}」について、`,
  'discuss.copied': id => `${id} への参照をコピーしました`,
}
