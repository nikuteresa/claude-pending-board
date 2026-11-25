import type { Locale } from '../../types'
import { en } from './en'
import type { Messages } from './en'
import { ja } from './ja'

export type { Locale, Messages }
/** userConfig の locale。auto は Claude Code の settings の language から決める */
export type LocaleSetting = Locale | 'auto'

export const MESSAGES: Record<Locale, Messages> = { ja, en }

/** userConfig の値を検証して LocaleSetting に寄せる。想定外の値は auto 扱い */
export function parseLocaleSetting(value: unknown): LocaleSetting {
  return value === 'ja' || value === 'en' ? value : 'auto'
}

/** settings の language（"japanese" / "ja" / "ja-JP" / "日本語" など自由記述）を Locale に寄せる。日本語以外と未設定は en */
export function localeFromLanguage(language: unknown): Locale {
  if (typeof language !== 'string') return 'en'
  return /^(ja([-_][a-z]+)?|japanese|日本語)$/i.test(language.trim()) ? 'ja' : 'en'
}
