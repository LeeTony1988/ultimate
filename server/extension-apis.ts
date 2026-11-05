import type { Api, Catalogue } from '../shared/extension-api.ts'
import type { CallTrace } from './trace.ts'

type Provider = { extension: string; value: unknown }

/** Tarjan's strongly connected components with more than one member: each sorted, sorted by first member. */
export function cycles(edges: Map<string, Set<string>>) {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const found: string[][] = []
  const visit = (node: string) => {
    index.set(node, index.size)
    low.set(node, index.get(node)!)
    stack.push(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (stack.includes(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!))
    }
    if (low.get(node) !== index.get(node)) return
    const component = stack.splice(stack.indexOf(node))
    if (component.length > 1) found.push(component.toSorted())
  }
  for (const node of edges.keys()) if (!index.has(node)) visit(node)
  return found.toSorted((a, b) => a[0].localeCompare(b[0]))
}
const absent = (caller: string, verb: string, name: string) =>
  new Error(`${caller} ${verb} ${name}, which no enabled extension provides`)

/**
 * Typed service handles and the catalogue behind `host.implement`, `host.need` and `host.want`. Providers live in the
 * extension host's provider table; this records who consumes what, per facet host.
 */
export function extensionApis(
  /** The installed provider of a service name. */
  lookup: (name: string) => Provider | undefined,
  /** Every installed service name with its providing extension. */
  provided: () => Iterable<[name: string, extension: string]>,
  /** Whether a facet host is installed; staged and failed facets do not count. */
  installed: (owner: object) => boolean,
  /** Runs every service call, so each is traced. */
  trace: CallTrace['run'],
) {
  const uses = new Map<object, { extension: string; needs: Set<string>; wants: Set<string> }>()
  const call = (caller: string, api: Api<string, unknown>, method: string, args: unknown[]) => {
    const provider = lookup(api.name)
    if (!provider) throw absent(caller, 'needs', api.name)
    const value = provider.value as Record<string, (...args: unknown[]) => unknown>
    return trace(
      { kind: 'service', caller, callee: provider.extension, name: `${api.name}.${method}`, args },
      () => Reflect.apply(value[method], value, args),
    )
  }
  // Resolves the provider on every member access, so a handle held since setup sees provider reloads.
  const handle = <S>(caller: string, api: Api<string, S>, verb: string) =>
    new Proxy(
      {},
      {
        get: (_, key) => {
          // Handles are not thenable, so returning one from an async function stays safe.
          if (typeof key === 'symbol' || key === 'then') return undefined
          const provider = lookup(api.name)
          if (!provider) throw absent(caller, verb, api.name)
          const member = (provider.value as Record<string, unknown>)[key]
          return typeof member === 'function'
            ? (...args: unknown[]) => call(caller, api, key, args)
            : member
        },
      },
    ) as S
  const record = (owner: object, extension: string) => {
    let entry = uses.get(owner)
    if (!entry) uses.set(owner, (entry = { extension, needs: new Set(), wants: new Set() }))
    return entry
  }
  function catalogue(): Catalogue {
    const rows = new Map<string, Catalogue['apis'][number]>()
    const row = (name: string) => {
      let entry = rows.get(name)
      // An extension point `<owner>.<point>` is a contract its owner declares and wants; another extension provides it.
      const owner = name.includes('.') ? { owner: name.split('.')[0] } : {}
      if (!entry) rows.set(name, (entry = { name, ...owner, needs: [], wants: [] }))
      return entry
    }
    for (const [name, extension] of provided()) row(name).provider = extension
    for (const [owner, { extension, needs, wants }] of uses) {
      if (!installed(owner)) continue
      for (const name of needs) row(name).needs.push(extension)
      for (const name of wants) row(name).wants.push(extension)
    }
    const apis = [...rows.values()]
      .map((entry) => ({ ...entry, needs: entry.needs.toSorted(), wants: entry.wants.toSorted() }))
      .toSorted((a, b) => a.name.localeCompare(b.name))
    // Dependencies point at the contract's owner: a service's provider, or a point's declaring extension, which its
    // provider then depends on too (dependency inversion), so a lower extension can call up without a cycle.
    const edges = new Map<string, Set<string>>()
    for (const { owner, provider, needs, wants } of apis) {
      const contract = owner ?? provider
      for (const user of [...needs, ...wants, ...(owner && provider ? [provider] : [])])
        if (contract && contract !== user)
          edges.set(user, (edges.get(user) ?? new Set()).add(contract))
    }
    return {
      apis,
      missing: apis.filter((entry) => !entry.provider && entry.needs.length).map((e) => e.name),
      cycles: cycles(edges),
    }
  }
  return {
    /** A hard dependency; throws while missing, except during facet setup where the provider may load later. */
    need<S>(owner: object, extension: string, api: Api<string, S>, setup: boolean): S {
      record(owner, extension).needs.add(api.name)
      if (!setup && !lookup(api.name)) throw absent(extension, 'needs', api.name)
      return handle(extension, api, 'needs')
    },
    /** An optional dependency: undefined while no enabled extension provides it. */
    want<S>(owner: object, extension: string, api: Api<string, S>): S | undefined {
      record(owner, extension).wants.add(api.name)
      return lookup(api.name) ? handle(extension, api, 'wants') : undefined
    },
    dispose: (owner: object) => uses.delete(owner),
    catalogue,
    /** One diagnostic per installed extension and needed API that nothing provides. */
    missing: () =>
      catalogue().apis.flatMap((entry) =>
        entry.provider
          ? []
          : entry.needs.map((extension) => absent(extension, 'needs', entry.name).message),
      ),
  }
}
