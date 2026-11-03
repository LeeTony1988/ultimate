import { existsSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { normalizePath } from 'vite-plus'
import type { Plugin } from 'vite-plus'
import { discoverExtensions } from './discovery.ts'
import { discoveryRoots } from './project.ts'
import { watchRoots } from './watch-roots.ts'
import { extensionSettingsFiles } from './extension-settings.ts'
import { useProjectSetup } from './project-setup.ts'

const virtual = 'virtual:ultimate/web-facets'
const resolved = '\0' + virtual
export function extensionModules(
  ultimateRoot: string,
  projectRoot: string,
  userHome: string,
): Plugin {
  const roots = discoveryRoots(ultimateRoot, projectRoot, userHome).map((root) =>
    normalizePath(join(root.path, 'extensions')),
  )
  const trustFile = normalizePath(join(userHome, '.ultimate/trust.json'))
  const settingsFiles = [...extensionSettingsFiles(projectRoot, userHome), trustFile].map(
    normalizePath,
  )
  const stylesFile = normalizePath(join(ultimateRoot, 'web/src/index.css'))
  const watchers = new WeakMap<object, () => void>()
  let sourcesFile = ''
  return {
    name: 'ultimate:extension-modules',
    configResolved(config) {
      sourcesFile = normalizePath(join(config.cacheDir, 'extension-sources.css'))
    },
    closeBundle() {
      watchers.get(this.environment)?.()
      watchers.delete(this.environment)
    },
    enforce: 'pre',
    async config() {
      const modules = join(ultimateRoot, 'node_modules')
      const entries = await readdir(modules)
      const packages = (
        await Promise.all(
          entries
            .filter((name) => !name.startsWith('.'))
            .map(async (name) =>
              name.startsWith('@')
                ? (await readdir(join(modules, name))).map((child) => `${name}/${child}`)
                : [name],
            ),
        )
      ).flat()
      return { resolve: { dedupe: packages } }
    },
    async resolveId(id, importer, options) {
      if (id === virtual) return resolved
      const importerFile = importer && normalizePath(importer).split('?')[0]
      if (
        !importerFile ||
        options.ssr ||
        !roots.slice(1).some((root) => importerFile.startsWith(root + '/')) ||
        id.startsWith('.') ||
        id.startsWith('/') ||
        id.startsWith('\0')
      )
        return undefined
      if (id.startsWith('@/'))
        return this.resolve(join(ultimateRoot, 'web/src', id.slice(2)), importer, {
          ...options,
          skipSelf: true,
        })
      if (id.startsWith('node:')) return undefined
      const dependency = await this.resolve(id, join(ultimateRoot, 'package.json'), {
        ...options,
        skipSelf: true,
      })
      return dependency
    },
    async load(id) {
      if (id.split('?')[0] === stylesFile) {
        // Tailwind skips a git-ignored symlinked extension inside a root, so its target is a source of its own.
        const linked = (await discoverExtensions(ultimateRoot, projectRoot, userHome))
          .filter(
            (entry) => entry.source !== 'builtin' && !entry.error && entry.target !== entry.path,
          )
          .map((entry) => normalizePath(entry.target))
        const sources = [
          ...roots.filter(
            (root, index) =>
              existsSync(root) && (index !== 2 || useProjectSetup(projectRoot, userHome)),
          ),
          ...linked,
        ]
          .map((root) => `@source ${JSON.stringify(root)};\n`)
          .join('')
        // Tailwind keeps its compiler, and so its sources, until an imported file's mtime changes: the sources live in
        // their own file, rewritten when a root appears, a link is added or the project's trust changes. A scanner
        // never picks up a source folder that was missing when it started, so only existing roots are listed.
        const current = await readFile(sourcesFile, 'utf8').catch(() => undefined) // Missing until the first write.
        if (current !== sources) {
          await mkdir(dirname(sourcesFile), { recursive: true })
          await writeFile(sourcesFile, sources)
        }
        return (
          `@import ${JSON.stringify(sourcesPath())};\n` +
          (await readFile(stylesFile, 'utf8')) +
          '\n'
        )
      }
      if (id !== resolved) return undefined
      const facets = (await discoverExtensions(ultimateRoot, projectRoot, userHome)).filter(
        (entry) => entry.enabled && entry.files.includes('web.tsx'),
      )
      const entries = facets.map((entry) => {
        // By target, as the server facet loads: Vite keeps a URL bound to the file it first resolved to.
        const file = normalizePath(join(entry.path, 'web.tsx'))
        const target = normalizePath(join(entry.target, 'web.tsx'))
        return `${JSON.stringify(file)}: () => import(${JSON.stringify(posix.join('/@fs/', target))})`
      })
      return `export const loaders = {${entries.join(',')}};`
    },
    hotUpdate({ file: eventFile, modules, type }) {
      const file = normalizePath(eventFile)
      if (
        this.environment.name !== 'client' ||
        type !== 'create' ||
        !roots.some((root) => file.startsWith(root + '/'))
      )
        return undefined
      const styles = this.environment.moduleGraph.getModuleById(stylesFile)
      return styles && !modules.includes(styles) ? [...modules, styles] : undefined
    },
    configureServer(server) {
      server.watcher.add([...roots, ...settingsFiles])
      const structure = (eventFile: string) => {
        const file = normalizePath(eventFile)
        if (
          !settingsFiles.includes(file) &&
          !roots.some((root) => file === root || file.startsWith(root + '/'))
        )
          return
        for (const id of [resolved, stylesFile]) {
          const module = server.moduleGraph.getModuleById(id)
          if (module) {
            server.moduleGraph.invalidateModule(module)
            void server
              .reloadModule(module)
              .catch((error: unknown) => console.error(`Reloading ${id} failed:`, error))
          }
        }
      }
      const stopRoots = watchRoots([...roots, ...settingsFiles], (root) => {
        server.watcher.add(root)
        structure(root)
      })
      const settingsChanged = (file: string) => {
        const normalized = normalizePath(file)
        if (settingsFiles.includes(normalized)) structure(normalized)
      }
      server.watcher.on('change', settingsChanged)
      for (const event of ['add', 'unlink', 'addDir', 'unlinkDir'] as const)
        server.watcher.on(event, structure)
      const stopWatching = () => {
        stopRoots()
        server.watcher.off('change', settingsChanged)
        for (const event of ['add', 'unlink', 'addDir', 'unlinkDir'] as const)
          server.watcher.off(event, structure)
      }
      // During restart the replacement configures before the old environments close.
      watchers.set(server.environments.client, stopWatching)
      server.httpServer?.once('close', stopWatching)
    },
  }
  /** The generated sources file as index.css imports it: relative, with forward slashes, because Lightning CSS and
   * Tailwind's resolver expect them. */
  function sourcesPath() {
    const path = normalizePath(relative(dirname(stylesFile), sourcesFile))
    // Another Windows drive has no relative form, and CSS reads its drive letter as a URL scheme: `/@fs/` resolves
    // across drives, as it does for web facets.
    return path.startsWith('.') ? path : posix.join('/@fs/', sourcesFile)
  }
}
