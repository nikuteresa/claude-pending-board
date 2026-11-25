import type { Item } from '../../types'

const USAGE = 'Usage: /pending'
const ARGUMENT_HINT = '[ask] [add|info <text>] [resolve <id> [decision]]'

// 文言の key と値の型はこの表から決まる（ja.ts は同じ形で書く）
export const en = {
  'kind.decision': 'Decision',
  'kind.info': 'Info',

  'band.decisions': (count: number) => `Decisions ${count}`,
  'band.infos': (count: number) => `Info ${count}`,
  'band.open': '▸ Open',
  'band.nothingPending': 'Nothing pending',

  'pane.close': 'Close (Esc)',
  'pane.askDecisions': (count: number) => `Answer ${count} pending ${count === 1 ? 'decision' : 'decisions'}`,
  'pane.emptyPending': 'Nothing is pending',
  'pane.emptyResolved': 'No resolved items yet',
  'pane.discuss': 'Discuss',
  'pane.resolve': 'Mark resolved',
  'pane.resolvedByUser': '[resolved by user]',

  'command.description': 'Open the Pending board / add or resolve items by hand',
  'command.argumentHint': ARGUMENT_HINT,
  'command.opened': 'Opened the Pending board.',
  'command.usage': `${USAGE} ${ARGUMENT_HINT}`,
  'command.usageOf': (verb: string) => `${USAGE} ${verb} <text>`,
  'command.added': (id: string, text: string) => `Added ${id}: ${text}`,
  'command.resolved': (id: string) => `Marked ${id} as resolved.`,
  'command.alreadyResolved': (id: string) => `${id} is already resolved.`,
  'command.notFound': (id: string) => `No pending item ${id}.`,
  'command.askRequested': 'Asked Claude to put the pending decisions to you as questions.',
  'command.noDecisions': 'No decisions are pending.',

  'tool.addDescription': [
    'Add an item to the Pending board panel shown beside the user, and return its id. Use it proactively:',
    '- When a question comes up that the user has to decide, add it with kind: "decision" at the same time as asking in the conversation. Always add one when your reply ends with a question ("Should I…?", "Which one…?").',
    '- Add important information that must not get lost later (constraints, assumptions, caveats, the user\'s policies) with kind: "info". When your reply says "unverified", "expected", "note", "important" or "can\'t say for sure", add that content.',
    '- One item, one question. Do not mix several questions into one item; if they are mixed, add them again separately (resolving one would otherwise close the other too).',
    '- Do not add the same question twice. If you do not know the id, check with list.',
    '- The panel serves as the list, so there is no need to repeat open items at the end of the conversation.',
  ].join('\n'),
  'tool.addTitle': 'The point, in one line',
  'tool.addDetail': 'Background, options, etc. (optional)',
  'tool.resolveDescription': [
    'Move a Pending board item to resolved.',
    '- When the user answers a decision, resolve it with the decision in resolution.',
    '- Resolve an info item once its content has been applied or is no longer needed.',
  ].join('\n'),
  'tool.resolveResolution': 'What was decided (for a decision)',
  'tool.listDescription': 'Return every Pending board item. Use it to look up ids or check for duplicates.',

  // Claude だけが読む注記と、ユーザーの発言として送る依頼
  'note.mention': (formatted: string) => `Pending board item: ${formatted}`,
  'note.manualResolution': (formatted: string) =>
    `Pending board: the user marked this item as resolved by hand in the panel (no decision recorded). Treat it as closed and do not resolve it again: ${formatted}`,
  'ask.request': (ids: string, batchSize: number) =>
    `Ask me about the pending decisions ${ids} on the Pending board with AskUserQuestion ` +
    `(up to ${batchSize} per call, with options drawn from the conversation). ` +
    'Resolve each answered item with its resolution.',

  'discuss.reference': (item: Item) => `About ${item.id} "${item.title}": `,
  'discuss.copied': (id: string) => `Copied a reference to ${id}`,
}

export type Messages = typeof en
