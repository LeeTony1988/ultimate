import { join, posix } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
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
  const stylesId = normalizePath(join(ultimateRoot, 'web/src/index.css'))
  const watchers = new WeakMap<object, () => void>()
  return {
    name: 'ultimate:extension-modules',
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
      if (id.split('?')[0] === stylesId)
        return (
          (await readFile(join(ultimateRoot, 'web/src/index.css'), 'utf8')) +
          '\n' +
          roots
            .filter((_, index) => index !== 2 || useProjectSetup(projectRoot, userHome))
            .map((root) => `@source ${JSON.stringify(root)};`)
            .join('\n')
        )
      if (id !== resolved) return undefined
      const facets = (await discoverExtensions(ultimateRoot, projectRoot, userHome)).filter(
        (entry) => entry.enabled && entry.files.includes('web.tsx'),
      )
      const entries = facets.map((entry) => {
        const file = normalizePath(join(entry.path, 'web.tsx'))
        return `${JSON.stringify(file)}: () => import(${JSON.stringify(posix.join('/@fs/', file))})`
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
      const styles = this.environment.moduleGraph.getModuleById(stylesId)
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
        for (const id of [resolved, ...(file === trustFile ? [stylesId] : [])]) {
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
}
