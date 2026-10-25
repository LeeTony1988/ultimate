/** Agent definitions: parsing, discovery across the `agents/` folders, and the agent change a definition makes. */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { clampThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { Agent, AgentChange } from '@earendil-works/pi-durable'
import { parseFrontmatter, resolveCliModel } from '@earendil-works/pi-coding-agent'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Source } from '../server/project.ts'
// oxlint-disable-next-line no-restricted-imports -- agent discovery follows the core project trust decision
import { projectDecision, useProjectSetup } from '../server/project-setup.ts'

export interface AgentDefinition {
  name: string
  description: string
  path: string
  instructions: string
  model?: { provider: string; modelId: string }
  thinking?: ModelThinkingLevel
  tools?: string[]
  /** Tools overlays added to a definition without a `tools` list: it has every tool already, and deferred ones load. */
  addTools?: string[]
  denyTools?: string[]
  isolate?: 'none' | 'worktree'
  /** A standing agent: one conversation per project, started on first use. */
  resident?: boolean
  /** What the lander does when a submission fails: explain it, or fix it and land. Only the lander reads it. */
  onFailure?: 'diagnose' | 'fix'
  /** Requests on an `openai-codex/` or `openai/` model go on the priority (fast) tier; the fast extension reads it. */
  fast?: boolean
  /** `false`: its conversations get no automatic summaries (intent, title, reply activity, spawn refresh, abstract). */
  summaries?: boolean
  /** Overlay files whose settings, `addTools` and body discovery merged into this definition, in order. */
  overlays?: string[]
}
/**
 * The model a preview runs every agent on, from `ULTIMATE_MODEL` (`provider/id`), which the parent's `instance.model`
 * setting sets; undefined outside a preview or when the parent opted out.
 */
export function previewModel(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ULTIMATE_MODEL
  const slash = value?.indexOf('/') ?? -1
  if (!value || slash <= 0 || slash === value.length - 1) return undefined
  return { provider: value.slice(0, slash), modelId: value.slice(slash + 1) }
}

export function runtimeToolName(name: string, platform: NodeJS.Platform = process.platform) {
  if (name === 'bash' && platform === 'win32') return 'powershell'
  if (name === 'powershell' && platform !== 'win32') return 'bash'
  return name
}

export function runtimeToolNames(names: string[], platform: NodeJS.Platform = process.platform) {
  return [...new Set(names.map((name) => runtimeToolName(name, platform)))]
}

function portableToolNames(names: string[]) {
  return [...new Set(names.map((name) => (name === 'powershell' ? 'bash' : name)))]
}

export function runtimeDefinition(definition: AgentDefinition): AgentDefinition {
  return {
    ...definition,
    ...(definition.tools ? { tools: runtimeToolNames(definition.tools) } : {}),
    ...(definition.addTools ? { addTools: runtimeToolNames(definition.addTools) } : {}),
    ...(definition.denyTools ? { denyTools: runtimeToolNames(definition.denyTools) } : {}),
  }
}

/** The agent change a definition makes over `parent`; in a preview, its model replaces every other choice. */
export function definitionAgent(
  definition: AgentDefinition | undefined,
  parent: Agent,
  modelRuntime: ModelRuntime,
  {
    excludeTools: excluded = [],
    excludeExtensions = [],
    model: overrideModel,
    thinking: overrideThinking,
  }: {
    excludeTools?: string[]
    excludeExtensions?: string[]
    model?: { provider: string; modelId: string }
    thinking?: ModelThinkingLevel
  } = {},
): AgentChange {
  const effective = definition && runtimeDefinition(definition)
  const excludeTools = [...excluded, ...runtimeToolNames(effective?.denyTools ?? [])]
  const ref = previewModel() ?? overrideModel ?? effective?.model ?? parent.model
  const model = ref && modelRuntime.getModel(ref.provider, ref.modelId)
  const thinking = overrideThinking ?? effective?.thinking ?? parent.thinkingLevel
  const tools = [
    ...new Map([...parent.tools, ...parent.deferred].map((tool) => [tool.name, tool])).values(),
  ]
  const named = runtimeToolNames([...(effective?.tools ?? []), ...(effective?.addTools ?? [])])
  return {
    modelTools: {
      add: tools.filter(
        (tool) => tool.deferred && !excludeTools.includes(tool.name) && named.includes(tool.name),
      ),
    },
    tools: tools.filter(
      (tool) =>
        !excludeTools.includes(tool.name) &&
        (!effective?.tools || named.includes(tool.name)),
    ),
    extensions: parent.extensions.filter(
      (extension) => !excludeExtensions.includes(extension.name),
    ),
    instructions: effective?.instructions ?? parent.instructions ?? null,
    model: ref ?? null,
    thinkingLevel: thinking && model ? clampThinkingLevel(model, thinking) : (thinking ?? null),
  }
}

export interface AgentDiscovery {
  definitions: (AgentDefinition & { source: Source })[]
  errors: { name: string; path: string; source: Source; error: string }[]
  /** User and project files that replace a built-in definition whole instead of extending it with `addTools`. */
  replaced: { name: string; path: string; source: Source }[]
  /** The user's choice on the project's `.ultimate/` setup; its definitions apply only once trusted. */
  projectSetup: 'trusted' | 'declined' | 'undecided'
}
// Pi's levels; `satisfies` fails the type check when Pi adds or drops one.
const levels = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
} satisfies Record<ModelThinkingLevel, true>
const fields = new Set([
  'name',
  'description',
  'model',
  'thinking',
  'tools',
  'denyTools',
  'isolate',
  'resident',
  'onFailure',
  'fast',
  'summaries',
])

/** The settings a definition or overlay may set; `denyTools` is additive when merged. */
function parseSettings(frontmatter: Record<string, unknown>): Partial<
  Pick<
    AgentDefinition,
    | 'description'
    | 'thinking'
    | 'isolate'
    | 'resident'
    | 'onFailure'
    | 'fast'
    | 'summaries'
    | 'denyTools'
  >
> & {
  model?: string
} {
  const { description, model, thinking, isolate, resident, onFailure, fast, summaries, denyTools } =
    frontmatter
  if (denyTools !== undefined && !isTools(denyTools))
    throw new Error('denyTools must be a list of tool names')
  if (description !== undefined && (typeof description !== 'string' || !description.trim()))
    throw new Error('description is required')
  if (thinking !== undefined && (typeof thinking !== 'string' || !Object.hasOwn(levels, thinking)))
    throw new Error(`thinking must be one of ${Object.keys(levels).join(', ')}`)
  if (model !== undefined && (typeof model !== 'string' || !model.trim()))
    throw new Error('model must be a nonempty string')
  if (isolate !== undefined && isolate !== 'none' && isolate !== 'worktree')
    throw new Error('isolate must be none or worktree')
  if (onFailure !== undefined && onFailure !== 'diagnose' && onFailure !== 'fix')
    throw new Error('onFailure must be diagnose or fix')
  if (resident !== undefined && typeof resident !== 'boolean')
    throw new Error('resident must be a boolean')
  if (fast !== undefined && typeof fast !== 'boolean') throw new Error('fast must be a boolean')
  if (summaries !== undefined && typeof summaries !== 'boolean')
    throw new Error('summaries must be a boolean')
  return {
    ...(description !== undefined ? { description: description.trim() } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(thinking ? { thinking: thinking as ModelThinkingLevel } : {}),
    ...(isolate ? { isolate: isolate } : {}),
    ...(resident !== undefined ? { resident: resident } : {}),
    ...(onFailure ? { onFailure: onFailure } : {}),
    ...(fast !== undefined ? { fast } : {}),
    ...(summaries !== undefined ? { summaries } : {}),
    ...(denyTools !== undefined ? { denyTools } : {}),
  }
}

const isTools = (tools: unknown): tools is string[] =>
  Array.isArray(tools) && tools.every((tool) => typeof tool === 'string')

/** A definition file: Pi's YAML frontmatter with Ultimate's fields, and the instructions as its body. */
export function parseDefinition(
  text: string,
  path: string,
): Omit<AgentDefinition, 'model'> & { model?: string } {
  const { frontmatter, body } = parseFrontmatter(text)
  // Without a frontmatter block Pi returns no fields; YAML may also parse to a list or a scalar.
  if (
    typeof frontmatter !== 'object' ||
    Array.isArray(frontmatter) ||
    !Object.keys(frontmatter).length
  )
    throw new Error('Expected frontmatter fields between --- lines')
  const { name, tools } = frontmatter
  const unknown = Object.keys(frontmatter).find((key) => !fields.has(key))
  if (unknown) throw new Error(`Unknown field: ${unknown}`)
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name))
    throw new Error('name must be a nonempty identifier')
  const { description, ...settings } = parseSettings(frontmatter)
  if (!description) throw new Error('description is required')
  if (tools !== undefined && !isTools(tools)) throw new Error('tools must be a list of tool names')
  if (!body) throw new Error('Instructions are required')
  return {
    name,
    description,
    path,
    instructions: body,
    ...settings,
    ...(tools ? { tools } : {}),
  }
}

/** A model reference resolved as Pi's CLI resolves it; a `provider/id:level` model also sets the thinking level. */
function resolveModel(
  cliModel: string | undefined,
  cliThinking: ModelThinkingLevel | undefined,
  modelRuntime: ModelRuntime,
) {
  const resolved = resolveCliModel({ cliModel, cliThinking, modelRuntime })
  if (resolved.error || resolved.warning)
    throw new Error(`model: ${resolved.error || resolved.warning}`)
  const thinking = cliThinking ?? resolved.thinkingLevel
  return {
    ...(resolved.model
      ? { model: { provider: resolved.model.provider, modelId: resolved.model.id } }
      : {}),
    ...(thinking ? { thinking } : {}),
  }
}

/**
 * An overlay, marked by `addTools` (empty when it only changes settings): it extends the definition of the same name
 * an earlier folder holds. Its settings replace that definition's, its `addTools` join its tool list, its `denyTools`
 * join its deny list, and its body is appended to its instructions, so the earlier file stays the instructions' source.
 */
export function parseOverlay(text: string, path: string, modelRuntime: ModelRuntime) {
  const { frontmatter, body } = parseFrontmatter(text)
  const { name, addTools } = frontmatter
  if ('tools' in frontmatter) throw new Error('An overlay adds tools with addTools, not tools')
  const unknown = Object.keys(frontmatter).find((key) => key !== 'addTools' && !fields.has(key))
  if (unknown) throw new Error(`Unknown field: ${unknown}`)
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name))
    throw new Error('name must be a nonempty identifier')
  if (!isTools(addTools)) throw new Error('addTools must be a list of tool names')
  const { model, thinking, ...settings } = parseSettings(frontmatter)
  return {
    name,
    path,
    addTools,
    settings: { ...settings, ...resolveModel(model, thinking, modelRuntime) },
    instructions: body.trim(),
  }
}

const isOverlay = (text: string) => {
  const { frontmatter } = parseFrontmatter(text)
  return typeof frontmatter === 'object' && !Array.isArray(frontmatter) && 'addTools' in frontmatter
}

/** A definition file read and its model resolved, as discovery and saving accept it. */
function readDefinition(text: string, path: string, modelRuntime: ModelRuntime): AgentDefinition {
  const { model, thinking, ...definition } = parseDefinition(text, path)
  return { ...definition, ...resolveModel(model, thinking, modelRuntime) }
}

/** The `agents/` folders discovery reads, in order; the project's only once its setup is chosen as local. */
export function agentRoots(ultimateRoot: string, projectRoot: string, userHome: string) {
  return [
    { source: 'builtin' as const, path: join(ultimateRoot, 'agents') },
    { source: 'user' as const, path: join(userHome, '.ultimate/agents') },
    ...(useProjectSetup(projectRoot, userHome)
      ? [{ source: 'project' as const, path: join(projectRoot, '.ultimate/agents') }]
      : []),
  ]
}

/**
 * Definitions from `agents/` in Ultimate's clone, `~/.ultimate/`, and the project's `.ultimate/`; a later file wins
 * by name, unless it is an overlay (marked by `addTools`), which extends the earlier one.
 */
export async function discoverAgents(
  ultimateRoot: string,
  projectRoot: string,
  userHome: string,
  modelRuntime: ModelRuntime,
  /** A file read as if absent: saving an overlay diffs against what applies without it. */
  skip?: string,
): Promise<AgentDiscovery> {
  const definitions = new Map<string, AgentDefinition & { source: Source }>()
  const errors: AgentDiscovery['errors'] = []
  const builtins = new Set<string>()
  const replaced: AgentDiscovery['replaced'] = []
  for (const { source, path: directory } of agentRoots(ultimateRoot, projectRoot, userHome)) {
    let files: string[]
    try {
      files = await readdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        errors.push({ name: directory, path: directory, source, error: String(error) })
      continue
    }
    for (const file of files.filter((entry) => entry.endsWith('.md')).toSorted()) {
      const path = join(directory, file)
      if (path === skip) continue
      try {
        const text = await readFile(path, 'utf8')
        if (isOverlay(text)) {
          const overlay = parseOverlay(text, path, modelRuntime)
          const base = definitions.get(overlay.name)
          if (!base) throw new Error(`addTools needs an earlier definition named ${overlay.name}`)
          const heading = source === 'user' ? 'User additions' : 'Project additions'
          definitions.set(overlay.name, {
            ...base,
            ...overlay.settings,
            ...(overlay.settings.denyTools
              ? {
                  denyTools: [
                    ...new Set([...(base.denyTools ?? []), ...overlay.settings.denyTools]),
                  ],
                }
              : {}),
            // A list grows; a base that inherits every tool keeps the names, so deferred ones load.
            ...(base.tools
              ? { tools: [...new Set([...base.tools, ...overlay.addTools])] }
              : overlay.addTools.length
                ? { addTools: [...new Set([...(base.addTools ?? []), ...overlay.addTools])] }
                : {}),
            instructions: overlay.instructions
              ? `${base.instructions}\n\n## ${heading}\n\n${overlay.instructions}`
              : base.instructions,
            overlays: [...(base.overlays ?? []), path],
          })
          continue
        }
        const definition = readDefinition(text, path, modelRuntime)
        if (source === 'builtin') builtins.add(definition.name)
        else if (builtins.has(definition.name))
          replaced.push({ name: definition.name, path, source })
        definitions.set(definition.name, { ...definition, source })
      } catch (error) {
        errors.push({ name: file.slice(0, -3), path, source, error: String(error) })
      }
    }
  }
  const decision = projectDecision(projectRoot, userHome)
  return {
    definitions: [...definitions.values()],
    errors,
    replaced,
    projectSetup: decision === true ? 'trusted' : decision === false ? 'declined' : 'undecided',
  }
}

/** The fields a definition file's frontmatter may carry besides its name; `model` is `provider/id`. */
export interface DefinitionFields {
  description: string
  model?: string
  thinking?: string
  tools?: string[]
  denyTools?: string[]
  isolate?: 'none' | 'worktree'
  resident?: boolean
  onFailure?: 'diagnose' | 'fix'
  fast?: boolean
  summaries?: boolean
}

/** A flow list of tool names; in a flow list, commas and brackets end an item too. */
const toolList = (tools: string[]) =>
  `[${tools.map((tool) => (/^[\w.-]+$/.test(tool) ? scalar(tool) : JSON.stringify(tool))).join(', ')}]`

/** A YAML scalar: plain when it reads back as the same string, else JSON, which YAML reads as a quoted string. */
function scalar(value: string) {
  try {
    if (parseFrontmatter(`---\nvalue: ${value}\n---\n`).frontmatter.value === value) return value
  } catch {
    // Invalid plain YAML is serialized as a quoted JSON string below.
  }
  return JSON.stringify(value)
}

/** The Markdown file of a definition, in the shape of the built-in ones. */
export function serializeDefinition(
  name: string,
  frontmatter: DefinitionFields,
  instructions: string,
) {
  const lines = [
    `name: ${scalar(name)}`,
    `description: ${scalar(frontmatter.description.trim())}`,
    ...(frontmatter.model ? [`model: ${scalar(frontmatter.model)}`] : []),
    ...(frontmatter.thinking ? [`thinking: ${scalar(frontmatter.thinking)}`] : []),
    ...(frontmatter.tools
      ? [`tools: ${toolList(portableToolNames(frontmatter.tools))}`]
      : []),
    ...(frontmatter.denyTools?.length
      ? [`denyTools: ${toolList(portableToolNames(frontmatter.denyTools))}`]
      : []),
    ...(frontmatter.isolate === 'worktree' ? ['isolate: worktree'] : []),
    ...(frontmatter.resident !== undefined ? [`resident: ${frontmatter.resident}`] : []),
    ...(frontmatter.onFailure ? [`onFailure: ${frontmatter.onFailure}`] : []),
    ...(frontmatter.fast ? ['fast: true'] : []),
    ...(frontmatter.summaries === false ? ['summaries: false'] : []),
  ]
  return `---\n${lines.join('\n')}\n---\n\n${instructions.trim()}\n`
}

/** The folder a user or project definition is written to; the project's only once its setup is chosen as local. */
function scopeRoot(scope: 'user' | 'project', projectRoot: string, userHome: string) {
  if (scope === 'user') return join(userHome, '.ultimate/agents')
  if (!useProjectSetup(projectRoot, userHome))
    throw new Error("Choose this project's local setup before saving project definitions")
  return join(projectRoot, '.ultimate/agents')
}

/**
 * Write `<scope>/agents/<name>.md` atomically, after it reads back as discovery reads it; an invalid definition
 * throws and writes nothing. A built-in is never changed: saving one writes an override into the scope.
 */
export async function saveDefinition(
  roots: { projectRoot: string; userHome: string },
  modelRuntime: ModelRuntime,
  scope: 'user' | 'project',
  name: string,
  frontmatter: DefinitionFields,
  instructions: string,
) {
  const directory = scopeRoot(scope, roots.projectRoot, roots.userHome)
  const text = serializeDefinition(name, frontmatter, instructions)
  // Reading it back checks the name before it becomes a path.
  const definition = readDefinition(text, join(directory, `${name}.md`), modelRuntime)
  await writeAtomically(definition.path, text)
  return { ...definition, source: scope }
}

async function writeAtomically(path: string, text: string) {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  try {
    await writeFile(temporary, text)
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/**
 * Save the form of a definition overlays extend as the overlay `<scope>/agents/<name>.md`: only what differs from
 * the definition that applies without that file, so the base stays the source of its instructions and tool list.
 * A change an overlay cannot express (removing a base tool, rewriting the base instructions) throws and writes nothing.
 */
export async function saveOverlay(
  roots: { ultimateRoot: string; projectRoot: string; userHome: string },
  modelRuntime: ModelRuntime,
  scope: 'user' | 'project',
  name: string,
  form: DefinitionFields,
  instructions: string,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('name must be a nonempty identifier')
  const path = join(scopeRoot(scope, roots.projectRoot, roots.userHome), `${name}.md`)
  const { ultimateRoot, projectRoot, userHome } = roots
  const { definitions } = await discoverAgents(
    ultimateRoot,
    projectRoot,
    userHome,
    modelRuntime,
    path,
  )
  const base = definitions.find((definition) => definition.name === name)
  if (!base) throw new Error(`No definition named ${name} for an overlay to extend`)
  // A project file applies over a user overlay, so the form shows it; saving it to the user file would copy it there.
  const later = agentRoots(ultimateRoot, projectRoot, userHome)
    .slice(scope === 'user' ? 2 : 3)
    .map((root) => root.path)
  const shadowing = [base.path, ...(base.overlays ?? [])].find((file) =>
    later.includes(dirname(file)),
  )
  if (shadowing) throw new Error(`${shadowing} applies over the ${scope} file: save to project`)

  const cannot = (what: string) =>
    new Error(`An overlay cannot ${what}: edit ${base.path}, or Duplicate ${name}`)
  const settings: string[] = []
  if (form.description.trim() !== base.description)
    settings.push(`description: ${scalar(form.description.trim())}`)
  const baseModel = base.model && `${base.model.provider}/${base.model.modelId}`
  if (form.model !== baseModel) {
    if (!form.model) throw cannot('clear the model')
    settings.push(`model: ${scalar(form.model)}`)
  }
  if (form.thinking !== base.thinking) {
    if (!form.thinking) throw cannot('clear thinking')
    settings.push(`thinking: ${scalar(form.thinking)}`)
  }
  if ((form.isolate ?? 'none') !== (base.isolate ?? 'none'))
    settings.push(`isolate: ${form.isolate ?? 'none'}`)
  if ((form.resident ?? false) !== (base.resident ?? false))
    settings.push(`resident: ${form.resident ?? false}`)
  if (form.onFailure !== base.onFailure) {
    if (!form.onFailure) throw cannot('clear onFailure')
    settings.push(`onFailure: ${form.onFailure}`)
  }
  if ((form.fast ?? false) !== (base.fast ?? false)) settings.push(`fast: ${form.fast ?? false}`)
  if ((form.summaries ?? true) !== (base.summaries ?? true))
    settings.push(`summaries: ${form.summaries ?? true}`)

  const baseTools = base.tools ? portableToolNames(base.tools) : undefined
  const formTools = form.tools ? portableToolNames(form.tools) : undefined
  if (!base.tools && form.tools) throw cannot('limit the tools of a definition that inherits all')
  if (base.tools && !form.tools) throw cannot('make it inherit every tool')
  const removed = baseTools?.filter((tool) => !formTools?.includes(tool)) ?? []
  if (removed.length) throw cannot(`remove ${removed.join(', ')}`)
  // A base that inherits every tool shows no list in the form, so the file keeps the names it adds (deferred ones).
  const addTools =
    formTools?.filter((tool) => !baseTools?.includes(tool)) ??
    (await readFile(path, 'utf8').then(
      (text) => {
        const kept = parseFrontmatter(text).frontmatter.addTools
        return isTools(kept) ? portableToolNames(kept) : []
      },
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      },
    ))
  const baseDeny = portableToolNames(base.denyTools ?? [])
  const formDeny = portableToolNames(form.denyTools ?? [])
  const undenied = baseDeny.filter((tool) => !formDeny.includes(tool))
  if (undenied.length) throw cannot(`allow ${undenied.join(', ')} again`)
  const denyTools = formDeny.filter((tool) => !baseDeny.includes(tool))
  if (denyTools.length) settings.push(`denyTools: ${toolList(denyTools)}`)

  const start = base.instructions.trim()
  const text = instructions.trim()
  if (!text.startsWith(start)) throw cannot('change the instructions it starts with')
  const heading = `## ${scope === 'user' ? 'User' : 'Project'} additions`
  let body = text.slice(start.length).trim()
  if (body.startsWith(heading)) body = body.slice(heading.length).trim()

  const overlay = `---\n${[`name: ${scalar(name)}`, `addTools: ${toolList(addTools)}`, ...settings].join('\n')}\n---\n${body ? `\n${body}\n` : ''}`
  // Reading it back resolves the model, so an unknown one writes nothing.
  parseOverlay(overlay, path, modelRuntime)
  await writeAtomically(path, overlay)
  return { path }
}

/** Remove a user or project definition file; a built-in of the same name applies again. */
export async function deleteDefinition(
  roots: { projectRoot: string; userHome: string },
  scope: 'user' | 'project',
  name: string,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('name must be a nonempty identifier')
  const path = join(scopeRoot(scope, roots.projectRoot, roots.userHome), `${name}.md`)
  try {
    await rm(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`No ${scope} definition named ${name}`, { cause: error })
    throw error
  }
  return { path }
}
