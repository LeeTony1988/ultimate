btw keeps the user's web AI assistants one click away in a small launcher beside the composer: pick a tab, press Open, and the site opens in the user's real browser and real session.

## A launcher, not a viewer

The sites cannot be embedded in Ultimate. Verified on this host: `chat.deepseek.com` sends `Content-Security-Policy: frame-ancestors 'none'`, and `www.tongyi.com` sends `X-Frame-Options: SAMEORIGIN`. The first is an unconditional refusal, no front-end trick bypasses it, and Ultimate has no desktop shell (no electron/tauri, so no `<webview>`). btw therefore does not use an iframe, and it deliberately does not proxy a site to strip `X-Frame-Options`: that would break logins (third-party cookies, service workers, websockets) and would intercept a logged-in session.

`openSite` in `web.tsx` is the only place that opens a site. A future embedded viewer replaces that one function and the tab model, panel and persistence stay as they are.

The panel is honest about this: the **Open** button is the primary element, the card says **opens in a new window**, and it never renders a fake browser frame.

## UI (`web.tsx`)

- **Third composer mode.** `normal | side | btw` lives in one durable UI state value, `composer.mode` (`lib/composer-mode.ts`), read by both `side-chat` and `btw`. `side-chat`'s switch has three segments (Normal / Side chat / btw), and a bare Tab in @ultimate's composer cycles Normal → Side chat → btw → Normal. Shift+Tab stays the thinking level; modified Tab, IME composition and an open mention popup leave the key alone; a side chat's own composer never cycles (one level only).
- **Panel.** Above @ultimate's composer, styled as a sibling of the plan card (`border-border/80`, `bg-popover`, `shadow-lg`, 13 px names, 11 px mono metadata). One tab per site; pressing a tab makes it active and opens it. The active site's name and URL sit under the tabs, with an Open button (also a tab press) and add (`+`) / remove (trash) controls. Long names truncate; add takes an optional name and an http(s) URL (`https://` is assumed), and invalid URLs are refused.
- **Composer behaviour.** btw only adds the panel: @ultimate's own composer stays intact, Enter still sends to @ultimate, and its draft, attachments and model controls are untouched. This is the difference from side chat, which swaps the composer target while its mode is on. The README calls it out because both modes share the same switch.

## Persistence

The site list is durable UI state `ext.btw.sites`; the active tab is `ext.btw.active`. Both are `useUiState` values, stored with the root conversation: they survive reloads and restarts, apply at once, and are shared by every tab and device. Settings would also persist, but settings are machine/project configuration with a different write path; a per-user launcher list that changes while the user is looking at it belongs in UI state, next to `plan.panel` and `plan.place`. There is no `server.ts`: btw needs no storage of its own.

Defaults are DeepSeek `https://chat.deepseek.com/`, 豆包 `https://www.doubao.com/chat/`, and 通义千问 `https://www.tongyi.com/`. Removing a site is local to this list; it never changes the site or its login.

## Window reuse

Each site opens with `window.open(url, 'btw-<id>', 'width=460,height=760')`: one named window per site, so pressing its tab again focuses the existing window instead of stacking another one. The `noopener` feature cannot be used in that feature string: Chrome treats a named target with `noopener` as `_blank`, returns null and piles up windows. btw severs `opener` immediately after opening instead, which keeps the window isolated and the name reusable.
