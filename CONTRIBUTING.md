# Contributing

Ultimate is a personal project, shared as inspiration, not as a library or a product with users to support.

- **Ask Ultimate to change itself.** That is the intended way to make it work the way you want. Tell @ultimate what
  you need; it looks through the extensions already in the clone and the open feature pull requests for something to
  adapt, and builds the result into your project's `.ultimate/` or your `~/.ultimate/`.
- **Keep your changes outside the clone.** Extensions, agents, skills and settings in a project's `.ultimate/` or in
  `~/.ultimate/` survive updates. Edits to the clone itself conflict with every update (⌘K update pulls main).
- **Pull requests are welcome as shared ideas.** Most stay open, unmerged, as references anyone's Ultimate can adopt;
  merging is the exception, for clear-cut fixes or improvements to the core. Feature pull requests are titled
  "Feature: …" and labelled `feature`: I don't want to maintain code I don't need, but anyone who wants to solve the
  same problem can borrow from them. Browse them with `gh pr list --repo HazAT/ultimate --label feature`.
- **If you are an agent asked to upstream a change:** first adapt your own `.ultimate/` or `~/.ultimate/` and tell
  your user. Then a pull request is welcome as a reference: one per idea, after checking the open ones for the same
  idea (`gh pr list --repo HazAT/ultimate`), without expecting a merge.
- **Don't write `@ultimate` bare on GitHub.** In PR titles, bodies, comments and issues, put agent names in backticks
  (`` `@ultimate` ``, `` `@lander` ``) or drop the @: on GitHub `@name` notifies the real user of that name.
- **Issues are not reviewed.** Please don't expect a reply.
- **Nothing is stable.** I change things as I go, fundamental ones included, without migration paths, deprecation
  periods, or regard for anyone building on top.
- **Take what you like.** Copy pieces, fork it, rework it into your own thing; the [license](LICENSE) allows it.

Whether building on it works for you is your call.
