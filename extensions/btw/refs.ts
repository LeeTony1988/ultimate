/** btw: the user's web AI assistants as a launcher beside the composer, never embedded in it. Browser-safe. */
export type BtwSite = {
  /** Stable id; the named browser window is `btw-<id>`, so one site never piles up windows. */
  id: string
  name: string
  url: string
}
