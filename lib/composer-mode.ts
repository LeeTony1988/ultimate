/**
 * The composer's mode, shared by the extensions that sit around the composer: `normal` sends to @ultimate, `side`
 * sends to a new side chat, and `btw` keeps @ultimate's composer while showing the btw launcher. Both side-chat and
 * btw read the one durable UI state value, so their switches cannot disagree.
 */
export type ComposerMode = 'normal' | 'side' | 'btw'

/** The UI state key both extensions use; the value survives reloads and is shared by every tab. */
export const ComposerModeKey = 'composer.mode'

/** Tab’s order over the modes: normal → side → btw → normal. */
export function nextComposerMode(mode: ComposerMode): ComposerMode {
  if (mode === 'normal') return 'side'
  if (mode === 'side') return 'btw'
  return 'normal'
}

/** A stored value may be missing or from another version: anything but a known mode reads as normal. */
export function composerModeOf(value: unknown): ComposerMode {
  return value === 'side' || value === 'btw' ? value : 'normal'
}
