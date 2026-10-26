/** The identity note every conversation starts with; it names the conversation, not its task. */
const CONVERSATION_IDENTITY = /^You are conversation #\d+\.$/

/**
 * A prompt's title in one short line: its first meaningful line without Markdown markers, cut to `max` characters.
 * A one-word line such as `## Goal` or `Task:` is a section name, not a title, so it is skipped.
 */
export function shortTitle(prompt: string, max = 60) {
  const lines = prompt
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, '')
        .replace(/\*\*|__/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
  // A child started with a forwarded prompt starts with the parent's identity note; the task follows it.
  if (CONVERSATION_IDENTITY.test(lines[0] ?? '')) lines.shift()
  const text = lines.find((line) => /\s/.test(line)) ?? lines[0] ?? ''
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
