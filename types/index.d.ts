/** decision: ユーザーに決めてほしいこと / info: 流れると困る重要情報 */
export type ItemKind = 'decision' | 'info'

export type ItemStatus = 'pending' | 'resolved'

/** model: Claude が resolve tool で解決 / user: ユーザーがパネルのボタンで解決 */
export type ResolvedBy = 'model' | 'user'

export type Item = {
  id: string
  kind: ItemKind
  title: string
  detail?: string
  status: ItemStatus
  /** decision を解決したときの決定内容 */
  resolution?: string
  createdAt: number
  resolvedAt?: number
  /** 誰が解決したか。この項目が入る前に保存された値には無い */
  resolvedBy?: ResolvedBy
  /** パネルで手動解決し、まだ Claude に伝えていない */
  isUnreported?: boolean
}

export type Tab = ItemStatus

/** 帯・パネル・Claude に送る文の言語 */
export type Locale = 'ja' | 'en'

declare module 'claude-code' {
  interface PluginState {
    'pending-board': {
      items: Shaped<Item[]>
      tab: Tab
      /** session.start で決めた表示言語 */
      locale: Locale | undefined
    }
  }
}
