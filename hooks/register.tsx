import { atom, read, update } from 'claude-code'
import type { Hook, Register, RenderSurface } from 'claude-code'

import type { Item, ItemKind, ResolvedBy, Tab } from '../types'
import { MESSAGES, localeFromLanguage, parseLocaleSetting } from './i18n/index'
import type { Locale, LocaleSetting, Messages } from './i18n/index'

const PANE = 'pending-board'
const PANE_TITLE = 'Pending board'
// inline で開くときの高さの希望。項目数で伸び縮みさせると開くたびに高さが変わるので固定にする
const MODAL_ROWS = 20
// AskUserQuestion が 1 回で受け付ける質問数の上限
const ASK_BATCH_SIZE = 4

// 登録名と、tool.run の matcher。mod 自身が登録した tool は型の tool 名一覧に載らないため正規表現で当てる
const TOOL = {
  add: { name: 'add', matcher: /^mcp__pending-board__add$/ },
  resolve: { name: 'resolve', matcher: /^mcp__pending-board__resolve$/ },
  list: { name: 'list', matcher: /^mcp__pending-board__list$/ },
} as const

// Item のフィールドを変えたら shape のタグを上げる。古い形で保存された値を初期値として読み捨てるため。
// resolvedBy は省略可能なフィールドなので、items-1 で保存された値もそのまま読める
const items = atom({ plugin: 'pending-board', key: 'items' } as const, [] as Item[], {
  shape: 'items-1',
})
// $.state が claude -r の再開をまたぐ保証は無いので、session ID ごとに $.store へも書き、起動時に読み戻す
const STORE_SESSIONS_KEY = 'sessions'
const MAX_KEPT_SESSIONS = 30
const storeKeyFor = (sessionId: string) => `items:${sessionId}`

const tab = atom({ plugin: 'pending-board', key: 'tab' } as const, 'pending' as Tab)
// session.start で決めた表示言語。tool の説明文と揃えるため session の間は固定する
const locale = atom({ plugin: 'pending-board', key: 'locale' } as const, undefined as Locale | undefined)

// 帯とモーダルで共通の色と記号。決定待ち=黄、情報=青、解決済み=緑
const STYLE = {
  decision: { color: 'warning', glyph: '◆' },
  info: { color: 'suggestion', glyph: '●' },
  resolved: { color: 'success', glyph: '✓' },
} as const

// hook が受け取る $ の型。どの event でも同じ engine interface なので session.start から取る
type Engine = Parameters<Hook<'session.start'>>[0]

type AddInput = { kind: ItemKind; title: string; detail?: string }
type ResolveInput = { id: string; resolution?: string }
type ResolveOutcome = { kind: 'resolved' } | { kind: 'alreadyResolved'; item: Item } | { kind: 'notFound' }

export const register: Register = (on, options) => {
  const localeSetting = parseLocaleSetting(options.locale)

  // prompt.compose は他の plugin の hook に先を越されて届かないことがあるため、使い方は tool の説明文で伝える
  on('session.start', async ($, e, next) => {
    const detected = await detectLocale($, localeSetting)
    await update($, locale, () => detected)
    const t = MESSAGES[detected]
    await restoreItems($)
    await $.tool.register({
      name: TOOL.add.name,
      description: t['tool.addDescription'],
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['decision', 'info'] },
          title: { type: 'string', description: t['tool.addTitle'] },
          detail: { type: 'string', description: t['tool.addDetail'] },
        },
        required: ['kind', 'title'],
      },
    })
    await $.tool.register({
      name: TOOL.resolve.name,
      description: t['tool.resolveDescription'],
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: t['tool.resolveId'] },
          resolution: { type: 'string', description: t['tool.resolveResolution'] },
        },
        required: ['id'],
      },
    })
    await $.tool.register({
      name: TOOL.list.name,
      description: t['tool.listDescription'],
      isDeferred: false,
      inputSchema: { type: 'object', properties: {} },
    })
    await $.command.register({
      name: 'pending',
      description: t['command.description'],
    })

    return next(e)
  })

  // tool の引数は e に展開されて届く（schema で検証済み）
  on('tool.run', { tool: TOOL.add.matcher }, async ($, e) => {
    const { kind, title, detail } = e as unknown as AddInput
    const item = await addItem($, { kind, title, detail })

    return { result: `added ${item.id}` }
  })

  // ユーザーがパネルで先に解決していた項目は deny にせず、その旨を返して Claude の再試行を止める
  on('tool.run', { tool: TOOL.resolve.matcher }, async ($, e) => {
    const { id, resolution } = e as unknown as ResolveInput
    const outcome = await resolveItem($, id, { resolution, by: 'model' })

    switch (outcome.kind) {
      case 'resolved':
        return { result: `resolved ${id}` }
      case 'alreadyResolved':
        return { result: `already resolved, nothing to do: ${formatItem(outcome.item)}` }
      case 'notFound':
        return { deny: `no pending item ${id} (ids look like "#3"; call list to check)` }
    }
  })

  on('tool.run', { tool: TOOL.list.matcher }, async $ => {
    return { result: formatList(await read($, items)) }
  })

  // ボードを開くだけ。項目の追加と解決は Claude が tool で行うので、以前の /pending add なども使い方エラーにせず開く
  // 引数が付いていたら、何も追加・解決していないと分かるよう一行添える
  on('command.run', { command: 'pending' }, async ($, e) => {
    const t = await messagesFor($, localeSetting)
    await openModal($)
    const hasArgs = e.args.trim() !== ''
    const text = hasArgs ? `${t['command.opened']}\n${t['command.argsIgnored']}` : t['command.opened']
    return { text, isTextDisplayOnly: true }
  })

  // 送信のたびに、手動解決の知らせと、送信文中の #n が指す項目を Claude だけが読む context として添える
  // 手動解決の知らせは、slash command の行や drop された送信では Claude に届かないので、届く送信を待って印を外す
  on('prompt.submit', async ($, e, next) => {
    const all = await read($, items)
    const manuallyResolved = e.command ? [] : all.filter(item => item.isUnreported)
    const mentioned = findMentionedItems(all, e.text)
    if (manuallyResolved.length === 0 && mentioned.length === 0) return next(e)

    const t = await messagesFor($, localeSetting)
    const notes = [
      ...manuallyResolved.map(item => t['note.manualResolution'](formatItem(item))),
      ...mentioned.map(item => t['note.mention'](formatItem(item))),
    ]

    const result = await next({ ...e, context: [...(e.context ?? []), ...notes] })
    if (manuallyResolved.length > 0 && !('drop' in result)) {
      await markReported($, manuallyResolved.map(item => item.id))
    }
    return result
  })

  // プロンプト上の帯に pending の件数を出し続ける。押すとモーダルが開く
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const t = await messagesFor($, localeSetting)
    const { Button, Text } = $.ui.resolve(e)
    const pending = (await read($, items)).filter(item => item.status === 'pending')
    const decisionCount = pending.filter(item => item.kind === 'decision').length
    const infoCount = pending.length - decisionCount

    if (pending.length === 0) {
      return (
        <Button key="open-board" plain onPress={() => openModal($)}>
          <Text color={STYLE.resolved.color}>
            {STYLE.resolved.glyph} {t['band.nothingPending']}
          </Text>
        </Button>
      )
    }

    return (
      <Button key="open-board" plain onPress={() => openModal($)}>
        <Text color={STYLE.decision.color} bold={decisionCount > 0} dimColor={decisionCount === 0}>
          {STYLE.decision.glyph} {t['band.decisions'](decisionCount)}
        </Text>
        <Text dimColor>  </Text>
        <Text color={STYLE.info.color} dimColor={infoCount === 0}>
          {STYLE.info.glyph} {t['band.infos'](infoCount)}
        </Text>
        <Text dimColor>  {t['band.open']}</Text>
      </Button>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const t = await messagesFor($, localeSetting)
    const { Box, Button, Text } = $.ui.resolve(e)
    const all = await read($, items)
    const current = await read($, tab)
    const shown = sortForTab(all.filter(item => item.status === current), current)
    const count = (status: Tab) => all.filter(item => item.status === status).length

    const tabButton = (target: Tab, label: string) => (
      <Button
        key={`tab-${target}`}
        label={`${label} ${count(target)}`}
        variant={current === target ? 'primary' : 'secondary'}
        onPress={() => update($, tab, () => target)}
      />
    )

    const pendingDecisionCount = all.filter(item => item.status === 'pending' && item.kind === 'decision').length

    const emptyMessage =
      current === 'pending' ? (
        <Text color={STYLE.resolved.color}>
          {STYLE.resolved.glyph} {t['pane.emptyPending']}
        </Text>
      ) : (
        <Text dimColor>{t['pane.emptyResolved']}</Text>
      )

    return (
      <Box flexDirection="column">
        <Box>
          {tabButton('pending', 'Pending')}
          <Text> </Text>
          {tabButton('resolved', 'Resolved')}
          <Text> </Text>
          <Button key="close" label={t['pane.close']} role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {current === 'pending' && pendingDecisionCount > 0 && (
          <Box marginTop={1}>
            <Button
              key="ask"
              label={`${STYLE.decision.glyph} ${t['pane.askDecisions'](pendingDecisionCount)}`}
              variant="primary"
              onPress={() => askPendingDecisions($, t)}
            />
          </Box>
        )}
        {shown.length === 0 && <Box marginTop={1}>{emptyMessage}</Box>}
        {shown.map(item => {
          const isResolved = item.status === 'resolved'
          const style = isResolved ? STYLE.resolved : STYLE[item.kind]
          const resolution = resolutionLine(item, t)

          return (
            <Box
              key={item.id}
              flexDirection="column"
              marginTop={1}
              paddingX={1}
              borderStyle="round"
              borderColor={style.color}
              borderDimColor={isResolved}
            >
              <Box>
                {/* 見出しが長いとき、色付きの種別ラベルと id が縮んで折り返し、背景の形が崩れないようにする */}
                <Box flexShrink={0}>
                  <Text backgroundColor={STYLE[item.kind].color} color="inverseText" bold>
                    {` ${t[`kind.${item.kind}`]} `}
                  </Text>
                  <Text bold dimColor={isResolved}> {item.id} </Text>
                </Box>
                <Text dimColor={isResolved}>{item.title}</Text>
              </Box>
              {item.detail && <Text dimColor>{item.detail}</Text>}
              {resolution && (
                <Text color={STYLE.resolved.color}>
                  {STYLE.resolved.glyph} {resolution}
                </Text>
              )}
              {!isResolved && (
                <Box>
                  <Button
                    key={`discuss-${item.id}`}
                    label={t['pane.discuss']}
                    plain
                    onPress={() => discussItem($, t, item, e.surface)}
                  />
                  <Text dimColor>  ·  </Text>
                  <Button
                    key={`resolve-${item.id}`}
                    label={t['pane.resolve']}
                    plain
                    onPress={() => resolveByHand($, item.id)}
                  />
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}

async function detectLocale($: Engine, setting: LocaleSetting): Promise<Locale> {
  if (setting !== 'auto') return setting
  return localeFromLanguage(await $.settings.read({ key: 'language' }))
}

// session.start で決めた言語を使う。/config で locale を変えると module ごと読み直され、session.start も走り直す
async function messagesFor($: Engine, setting: LocaleSetting): Promise<Messages> {
  return MESSAGES[(await read($, locale)) ?? (await detectLocale($, setting))]
}

// ダイアログとして開く: キーを奪い、Esc で閉じ、開いている間はトーストを待たせる
async function openModal($: Engine) {
  await $.ui.open({
    id: PANE,
    title: PANE_TITLE,
    focus: true,
    closeOnEscape: true,
    holdToasts: true,
    rows: MODAL_ROWS,
  })
}

// モーダルを閉じて、入力欄のカーソル位置に項目への参照を差し込む。入らなければクリップボードへ
async function discussItem($: Engine, t: Messages, item: Item, surface: RenderSurface) {
  const reference = t['discuss.reference'](item)
  await $.ui.close({ id: PANE })
  const filled = await $.prompt.fill({ text: reference, mode: 'insert' })
  if (filled.isFilled) return

  await $.ui.copy({ text: reference, surface })
  $.ui.toast(t['discuss.copied'](item.id))
}

// 決定待ちを AskUserQuestion で聞くよう、ユーザー自身の依頼として Claude に送る。選択肢は会話の文脈を持つ Claude が作る
async function askPendingDecisions($: Engine, t: Messages) {
  const decisions = (await read($, items)).filter(item => item.status === 'pending' && item.kind === 'decision')
  if (decisions.length === 0) return

  const ids = decisions.map(item => item.id).join(', ')
  await $.ui.close({ id: PANE })
  await $.prompt.submit({ text: t['ask.request'](ids, ASK_BATCH_SIZE), asUser: true })
}

function findMentionedItems(all: readonly Item[], text: string): Item[] {
  // 日本語入力の全角「＃２」も拾えるよう NFKC で半角へ寄せてから探す
  const ids = new Set(text.normalize('NFKC').match(/#\d+/g) ?? [])
  if (ids.size === 0) return []

  return all.filter(item => ids.has(item.id))
}

// hot reload では state が残っているので読み戻さない。空のとき（claude -r で再開した直後など）だけ戻す
async function restoreItems($: Engine) {
  if ((await read($, items)).length > 0) return

  const saved = await $.store.get(storeKeyFor(await $.session.id()))
  if (Array.isArray(saved) && saved.length > 0) {
    await update($, items, () => saved as Item[])
  }
}

// 今の session の項目を保存し、古い session の分は MAX_KEPT_SESSIONS 件を超えたら消す
async function persistItems($: Engine) {
  const sessionId = await $.session.id()
  await $.store.set(storeKeyFor(sessionId), await read($, items))

  const known = ((await $.store.get(STORE_SESSIONS_KEY)) as string[] | undefined) ?? []
  const recent = [...known.filter(id => id !== sessionId), sessionId]
  for (const expired of recent.slice(0, -MAX_KEPT_SESSIONS)) {
    await $.store.delete(storeKeyFor(expired))
  }
  await $.store.set(STORE_SESSIONS_KEY, recent.slice(-MAX_KEPT_SESSIONS))
}

async function addItem($: Engine, input: AddInput): Promise<Item> {
  const now = await $.clock.now()
  let added: Item | undefined
  await update($, items, list => {
    added = {
      id: `#${list.length + 1}`,
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      status: 'pending',
      createdAt: now,
    }
    return [...list, added]
  })
  await persistItems($)
  return added!
}

async function resolveItem(
  $: Engine,
  id: string,
  { resolution, by }: { resolution?: string; by: ResolvedBy },
): Promise<ResolveOutcome> {
  const target = (await read($, items)).find(item => item.id === id)
  if (!target) return { kind: 'notFound' }
  if (target.status === 'resolved') return { kind: 'alreadyResolved', item: target }

  const now = await $.clock.now()
  await update($, items, list =>
    list.map(item =>
      item.id === id
        ? {
            ...item,
            status: 'resolved' as const,
            resolution: resolution ?? item.resolution,
            resolvedAt: now,
            resolvedBy: by,
          }
        : item,
    ),
  )
  await persistItems($)
  return { kind: 'resolved' }
}

// パネルのボタンでの解決は Claude の目に入らないので、次の送信で伝えるまで印を付けておく
async function resolveByHand($: Engine, id: string) {
  const outcome = await resolveItem($, id, { by: 'user' })
  if (outcome.kind !== 'resolved') return

  await update($, items, list => list.map(item => (item.id === id ? { ...item, isUnreported: true } : item)))
  await persistItems($)
}

// Claude に伝えた手動解決の印を外す
async function markReported($: Engine, ids: readonly string[]) {
  await update($, items, list =>
    list.map(item => {
      if (!ids.includes(item.id)) return item
      const { isUnreported: _, ...reported } = item
      return reported
    }),
  )
  await persistItems($)
}

// pending は決定待ちを先に（同種は古い順）、resolved は新しく解決したものを先に並べる
function sortForTab(list: readonly Item[], current: Tab): Item[] {
  if (current === 'resolved') {
    return [...list].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
  }
  const decisionsFirst = (item: Item) => (item.kind === 'decision' ? 0 : 1)
  return [...list].sort((a, b) => decisionsFirst(a) - decisionsFirst(b) || a.createdAt - b.createdAt)
}

// 解決済みの欄に出す文: ユーザーが解決したならその印だけ、Claude が解決したなら決定内容
function resolutionLine(item: Item, t: Messages): string {
  if (item.resolvedBy === 'user') return t['pane.resolvedByUser']
  return item.resolution ?? ''
}

// Claude 向けの行。locale に関わらず同じ形にして、list と #n の注記で読み方を揃える
function formatItem(item: Item): string {
  const status = item.resolvedBy === 'user' ? `${item.status} by user` : item.status
  const head = `${item.id} [${status}] [${item.kind}] ${item.title}`
  const detail = item.detail ? ` / ${item.detail}` : ''
  const resolution = item.resolution ? ` → ${item.resolution}` : ''
  return head + detail + resolution
}

function formatList(list: readonly Item[]): string {
  if (list.length === 0) return '(empty)'
  return list.map(formatItem).join('\n')
}
