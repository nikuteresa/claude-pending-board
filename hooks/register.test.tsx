import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { localeFromLanguage } from './i18n/index'

const PANE = {
  plugin: 'pending-board',
  component: 'Pane',
  requestId: 'pending-board',
  props: {
    title: 'Pending board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'pending-board',
  component: 'AbovePrompt',
  props: { hasSurvey: false, bodyColumns: 80 },
} as const

type StandIn = {
  /** $.ui.open に渡された引数が溜まる */
  opened?: unknown[]
  /** session をまたいで残る保存先の代役 */
  store?: Map<string, unknown>
  sessionId?: string
  /** $.tool.register に渡された引数が溜まる */
  registeredTools?: { name: string; description: string; inputSchema?: unknown }[]
  /** Claude Code の settings の language。locale: auto はここから決まる */
  language?: string
}

const standInForEngine = (
  on: On,
  {
    opened = [],
    store = new Map<string, unknown>(),
    sessionId = 's1',
    registeredTools = [],
    language = 'japanese',
  }: StandIn = {},
) => {
  on('settings.read', () => ({ value: { language } }))
  on('session.id', () => ({ value: sessionId }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'pending' } }))
  on('tool.register', (_, e) => {
    registeredTools.push(e)
    return { value: { tool: `mcp__pending-board__${e.name}` } }
  })
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('clock.now', () => ({ value: 0 }))
}

const startSession = async ($: Engine, on: On) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as any)
}

const runPending = ($: Engine, args: string) =>
  $.command.run({
    command: 'pending',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })

// 項目の追加と解決は Claude が tool で行う。テストの下ごしらえもその経路を通す
const addByClaude = ($: Engine, kind: 'decision' | 'info', title: string) =>
  $.tool.call({ tool: 'mcp__pending-board__add', kind, title } as any)

const resolveByClaude = ($: Engine, id: string, resolution?: string) =>
  $.tool.call({ tool: 'mcp__pending-board__resolve', id, resolution } as any)

const listByClaude = ($: Engine) => $.tool.call({ tool: 'mcp__pending-board__list' } as any)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`items Claude added move from Pending to Resolved (${surface})`, async ($, on) => {
    standInForEngine(on)

    await addByClaude($, 'decision', 'DB は MySQL のままにするか')
    await addByClaude($, 'info', '本番データは触らない')

    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /MySQL/ }))?.text).toBe('DB は MySQL のままにするか')
    expect((await ui.find({ type: 'Text', text: /本番データ/ }))?.text).toBe('本番データは触らない')

    await ui.press({ key: 'resolve-#1' })
    expect(await ui.find({ type: 'Text', text: /MySQL/ })).toBeUndefined()

    await ui.press({ key: 'tab-resolved' })
    expect((await ui.find({ type: 'Text', text: /MySQL/ }))?.text).toBe('DB は MySQL のままにするか')
    expect(await ui.find({ type: 'Text', text: /本番データ/ })).toBeUndefined()

    await ui.unmount()
  })
}

test('/pending only opens the board, and says so when given arguments', async ($, on) => {
  const opened: unknown[] = []
  standInForEngine(on, { opened })

  await addByClaude($, 'decision', 'ブランチ名')

  const openedText = 'Pending board を開きました。'
  const ignoredReply = {
    text: `${openedText}\n引数は使いません。項目の追加と解決は Claude が行い、パネルからも解決にできます。`,
    isTextDisplayOnly: true,
  }
  expect(await runPending($, '')).toEqual({ text: openedText, isTextDisplayOnly: true })
  expect(await runPending($, 'add DB 名')).toMatchObject(ignoredReply)
  expect(await runPending($, 'resolve #1 feature/foo')).toMatchObject(ignoredReply)

  expect(opened).toHaveLength(3)
  expect(opened[0]).toMatchObject({ id: 'pending-board', focus: true, closeOnEscape: true })
  const listed = await listByClaude($)
  expect(listed.result).toBe('#1 [pending] [decision] ブランチ名')
})

test('the add tool returns the new id and the list tool shows it', async ($, on) => {
  standInForEngine(on)

  const added = await addByClaude($, 'decision', 'ブランチ名')
  expect(added.result).toBe('added #1')

  const listed = await listByClaude($)
  expect(listed.result).toBe('#1 [pending] [decision] ブランチ名')

  const missing = await resolveByClaude($, '#9')
  expect(missing.deny ?? missing.text).toBe('no pending item #9 (ids look like "#3"; call list to check)')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band keeps the pending count and opens the board as a modal (${surface})`, async ($, on) => {
    const opened: unknown[] = []
    standInForEngine(on, { opened })

    await addByClaude($, 'decision', 'ブランチ名')
    await addByClaude($, 'info', '本番データは触らない')
    await addByClaude($, 'decision', 'DB 名')
    await resolveByClaude($, '#3', 'app_db')

    const band = await $.ui.mount({ ...BAND, surface } as any)

    expect((await band.find({ type: 'Text', text: /決定待ち/ }))?.text).toBe('◆ 決定待ち 1')
    expect((await band.find({ type: 'Text', text: /情報/ }))?.text).toBe('● 情報 1')
    expect(opened).toHaveLength(0)

    await band.press({ key: 'open-board' })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ id: 'pending-board', focus: true, closeOnEscape: true })

    await band.unmount()
  })

  test(`the band says nothing is pending when every item is resolved (${surface})`, async ($, on) => {
    standInForEngine(on)

    await addByClaude($, 'decision', 'ブランチ名')
    await resolveByClaude($, '#1', 'feature/foo')

    const band = await $.ui.mount({ ...BAND, surface } as any)

    expect((await band.find({ type: 'Text', text: /未決/ }))?.text).toBe('✓ 未決なし')
    await band.unmount()
  })
}

test('discuss closes the board and inserts a reference to the item into the prompt', async ($, on) => {
  standInForEngine(on)
  const filled: unknown[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.fill', (_, e) => {
    filled.push(e)
    return { isFilled: true }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'discuss-#1' })

  expect(filled).toHaveLength(1)
  expect(filled[0]).toMatchObject({ text: '#1「ブランチ名」について、', mode: 'insert' })
  await ui.unmount()
})

test('discuss falls back to the clipboard when the prompt box cannot take the text', async ($, on) => {
  standInForEngine(on)
  const copied: unknown[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.fill', () => ({ isFilled: false, reason: 'no_composer' }))
  on('ui.copy', (_, e) => {
    copied.push(e)
    return { value: { isCopied: true } }
  })
  on('ui.toast', () => ({ value: undefined }))

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'discuss-#1' })

  expect(copied[0]).toMatchObject({ text: '#1「ブランチ名」について、' })
  await ui.unmount()
})

test('a prompt mentioning #n carries that item to the model as context', async ($, on) => {
  standInForEngine(on)
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  await addByClaude($, 'info', '本番データは触らない')
  await $.prompt.submit({ text: '#1 は feature/foo で', wait: false } as any)

  expect(submitted.at(-1)?.context).toEqual(['Pending board の項目: #1 [pending] [decision] ブランチ名'])
})

test('a full-width ＃n typed through an IME is recognized too', async ($, on) => {
  standInForEngine(on)
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  await addByClaude($, 'decision', 'DB 名')
  await $.prompt.submit({ text: '＃２ は app_db で', wait: false } as any)

  expect(submitted.at(-1)?.context).toEqual(['Pending board の項目: #2 [pending] [decision] DB 名'])
})

test('a resumed session gets back the items it stored under its id', async ($, on) => {
  const store = new Map<string, unknown>([
    ['items:s1', [{ id: '#1', kind: 'decision', title: 'ブランチ名', status: 'pending', createdAt: 0 }]],
  ])
  standInForEngine(on, { store, sessionId: 's1' })
  await startSession($, on)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await band.find({ type: 'Text', text: /決定待ち/ }))?.text).toBe('◆ 決定待ち 1')
  await band.unmount()
})

test('adding an item saves it under the session id', async ($, on) => {
  const store = new Map<string, unknown>()
  standInForEngine(on, { store, sessionId: 's9' })

  await addByClaude($, 'decision', 'ブランチ名')

  expect(store.get('items:s9')).toMatchObject([{ id: '#1', title: 'ブランチ名' }])
  expect(store.get('sessions')).toEqual(['s9'])
})

test('the ask button sends the pending decisions to Claude as the person\'s request', async ($, on) => {
  standInForEngine(on)
  const submitted: { text: string; asUser?: boolean }[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  await addByClaude($, 'info', '本番データは触らない')
  await addByClaude($, 'decision', 'DB 名')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'ask' } as any)).toBeDefined()
  await ui.press({ key: 'ask' })

  const request = submitted.at(-1)?.text ?? ''
  expect(submitted).toHaveLength(1)
  expect(request).toContain('#1, #3')
  expect(request).not.toContain('#2')
  expect(request).toContain('AskUserQuestion')
  await ui.unmount()
})

test('the ask button is hidden while no decision is pending', async ($, on) => {
  standInForEngine(on)

  await addByClaude($, 'info', '本番データは触らない')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'ask' } as any)).toBeUndefined()
  await ui.unmount()
})

test('resolving by hand in the panel is reported to Claude once, on the next message', async ($, on) => {
  standInForEngine(on)
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'resolve-#1' })
  await ui.unmount()

  await $.prompt.submit({ text: '次へ', wait: false } as any)
  await $.prompt.submit({ text: 'さらに次へ', wait: false } as any)

  expect(submitted[0]?.context).toEqual([
    'Pending board: ユーザーがパネルで手動で解決済みにした（決定内容の記録なし）。閉じたものとして扱い、resolve し直さないこと: ' +
      '#1 [resolved by user] [decision] ブランチ名',
  ])
  expect(submitted[1]?.context ?? []).toEqual([])
})

test('the resolve tool on an item the user already resolved says so instead of denying', async ($, on) => {
  standInForEngine(on)

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'resolve-#1' })
  await ui.unmount()

  const resolved = await resolveByClaude($, '#1')
  expect(resolved.result).toBe('already resolved, nothing to do: #1 [resolved by user] [decision] ブランチ名')

  const listed = await listByClaude($)
  expect(listed.result).toBe('#1 [resolved by user] [decision] ブランチ名')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an English language setting shows the board in English (${surface})`, async ($, on) => {
    standInForEngine(on, { language: 'english' })

    await addByClaude($, 'decision', 'Branch name')
    await addByClaude($, 'info', 'Do not touch production data')

    const band = await $.ui.mount({ ...BAND, surface } as any)
    expect((await band.find({ type: 'Text', text: /Decisions/ }))?.text).toBe('◆ Decisions 1')
    expect((await band.find({ type: 'Text', text: /Info/ }))?.text).toBe('● Info 1')
    await band.unmount()

    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', key: 'resolve-#1', label: 'Mark resolved' } as any)).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'ask', label: '◆ Answer 1 pending decision' } as any)).toBeDefined()
    await ui.unmount()
  })
}

test('locale: en in the plugin options wins over a Japanese language setting', { options: { locale: 'en' } }, async ($, on) => {
  const registered: NonNullable<StandIn['registeredTools']> = []
  standInForEngine(on, { registeredTools: registered, language: 'japanese' })
  await startSession($, on)

  expect(registered.find(tool => tool.name === 'add')?.description).toStartWith('Add an item to the Pending board')
  expect(registered.find(tool => tool.name === 'resolve')?.inputSchema).toMatchObject({
    properties: { id: { description: 'Item id as shown by add/list, e.g. "#3"' } },
  })
  expect(await runPending($, '')).toMatchObject({ text: 'Opened the Pending board.' })
})

test('the language setting maps to ja only when it names Japanese', () => {
  expect(localeFromLanguage('japanese')).toBe('ja')
  expect(localeFromLanguage('Japanese')).toBe('ja')
  expect(localeFromLanguage('ja')).toBe('ja')
  expect(localeFromLanguage('日本語')).toBe('ja')
  expect(localeFromLanguage('ja-JP')).toBe('ja')
  expect(localeFromLanguage('english')).toBe('en')
  expect(localeFromLanguage('javanese')).toBe('en')
  expect(localeFromLanguage(undefined)).toBe('en')
})

test('a slash command line does not use up the manual-resolution notice', async ($, on) => {
  standInForEngine(on)
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'resolve-#1' })
  await ui.unmount()

  await $.prompt.submit({ text: '/pending', command: { name: 'pending', args: '' }, wait: false } as any)
  await $.prompt.submit({ text: '次へ', wait: false } as any)

  expect(submitted[0]?.context ?? []).toEqual([])
  expect(submitted[1]?.context?.[0]).toContain('#1 [resolved by user] [decision] ブランチ名')
})

test('the unreported mark is stored, so a resumed session still reports it, and is cleared once reported', async ($, on) => {
  const store = new Map<string, unknown>()
  standInForEngine(on, { store })
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'resolve-#1' })
  await ui.unmount()
  expect(store.get('items:s1')).toMatchObject([{ id: '#1', isUnreported: true }])

  await $.prompt.submit({ text: '次へ', wait: false } as any)
  expect((store.get('items:s1') as { isUnreported?: boolean }[])[0]?.isUnreported).toBeUndefined()
})

test('resolutions by Claude are not reported as manual ones, and resolving again is a no-op', async ($, on) => {
  standInForEngine(on)
  const submitted: { context?: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e)
    return { text: e.text }
  })

  await addByClaude($, 'decision', 'ブランチ名')
  expect((await resolveByClaude($, '#1', 'feature/foo')).result).toBe('resolved #1')
  expect((await resolveByClaude($, '#1')).result).toBe('already resolved, nothing to do: #1 [resolved] [decision] ブランチ名 → feature/foo')

  await $.prompt.submit({ text: '次へ', wait: false } as any)
  expect(submitted.at(-1)?.context ?? []).toEqual([])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the Resolved tab shows only a marker for items the user resolved (${surface})`, async ($, on) => {
    standInForEngine(on)

    await addByClaude($, 'decision', 'ブランチ名')
    await addByClaude($, 'decision', 'DB 名')
    await resolveByClaude($, '#1', 'feature/foo')

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'resolve-#2' })
    await ui.press({ key: 'tab-resolved' })

    expect((await ui.find({ type: 'Text', text: /feature\/foo/ }))?.text).toBe('✓ feature/foo')
    expect((await ui.findAll({ type: 'Text', text: /ユーザーが解決/ } as any)).map((node: { text: string }) => node.text)).toEqual([
      '✓ [ユーザーが解決]',
    ])
    await ui.unmount()
  })
}
