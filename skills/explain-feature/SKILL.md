---
name: explain-feature
description: 'Explain how a feature works end to end for a learner who wants the whole picture first: an architecture and module map, a flow diagram, key steps, core code anchors and worked examples, written to docs/<topic>.md. Use when the user asks "how does X work", "walk me through X", "帮我理解/梳理这个功能", "从入口到...", "画一下架构/模块关系", or wants a whole-process document rather than a code review.'
---

# Explain a feature

The goal is a mental model the reader can keep, not a transcript of the code. This reader learns best in this order:

> architecture → whole flow → key steps → code anchors → a concrete example → edge cases → common confusions

Start with the architecture and shape, then zoom in. Do not start with a file list or a wall of code.

## 1. Frame the question

- Restate the feature in one sentence: **“<trigger> causes <feature> to <outcome>.”**
- State the scope in one line: which path you explain, and what you deliberately leave out.
- Define overloaded words before using them. Features often have several layers called “task”, “agent”, “session” or “job”; name the layers (UI, host/API, runtime, storage, domain layer) and say which one you mean.
- State an assumption instead of asking, unless the answer would change the whole explanation.

## 2. Draw the architecture and module map first

The architecture diagram answers **where the feature lives and who depends on whom**. The flow diagram answers **what happens in what order**. Draw both; one cannot replace the other.

- Draw one Mermaid `flowchart` (use `subgraph` for layers) or a component-style diagram. Keep it to 6–12 modules.
- Group modules by the boundaries that matter for this feature: user/UI, host/API, extension/registry, runtime/scheduler/task engine, storage, external services. Collapse a subsystem into one box when its internals are not the subject.
- For each module, state its one-line responsibility and the contract it exposes or consumes. Label edges with the real interface (`POST /api/...`, `conversation.submit()`, `tx.createTask()`), not “calls”.
- Make the relationships explicit:
  - `-->` = synchronous call;
  - `-.->` = durable/asynchronous handoff (queue, task, event);
  - mark which module owns the conversation, task, document, or source of truth.
- Add a module relationship table:

  | Module | Responsibility | Exposes / depends on | Owns |
  | ------ | -------------- | -------------------- | ---- |
  | ...    | ...            | ...                  | ...  |

- For each important boundary, say why it exists: replaceability, durability, ownership, or isolation. If two modules are tightly coupled, say so and name the contract between them.
- Add one short paragraph: what the entry point is, what is the source of truth, where the boundary between the host and its runtime is, and which modules are replaceable.
- If the feature lives in one module, a small context diagram is enough; do not invent boxes.

## 3. Draw the whole flow

- Place the flow **on top of the architecture**: each step should name the module from the architecture diagram that owns it.
- Draw one Mermaid `flowchart` from the trigger to the user-visible result.
- Include the hinge points:
  - entry point and validation;
  - durable commit / state write;
  - task or job creation;
  - scheduler or worker pickup;
  - decision points (busy vs idle, tool call vs final answer, success vs retry);
  - persistence and response projection.
- Make labels concrete: file, function, record or document names; not “process”, “handle” or “service”.
- Put the diagram before the prose. Add a second diagram only when it shows a different view: a time sequence, or a task-ownership chain.
- Walk the arrows in prose. Do not repeat the diagram as a bullet list.

## 4. Explain each key step

For every step, answer four questions in a compact block or table:

| Question | What to say                                                |
| -------- | ---------------------------------------------------------- |
| Trigger  | What causes this step to run?                              |
| Commit   | What is written, and is it atomic with the previous step?  |
| Owner    | Which layer owns it: UI, server, runtime, scheduler, task? |
| Next     | What does it hand to the next step?                        |

Mark the “hinge” step explicitly: the point where a string becomes a task, where a task becomes a loop, or where a commit becomes a UI event.

## 5. Anchor to code, do not dump it

- Cite every non-obvious claim as `path:line` or a symbol name.
- Show short, simplified snippets (about 3–15 lines) only at hinge points: entry, atomic commit, task creation, loop handoff, finalization.
- Label every snippet **simplified**; never paste a whole function or file.
- Separate **what the code does** from **why it is designed that way**. The “why” is what the reader remembers.

Good snippet targets:

- HTTP entry and request validation;
- the transaction that writes the first record;
- the task creation call;
- the loop handoff;
- the final settlement or response write.

## 6. Make the model concrete

When two concepts are easy to confuse, do not just define them again. Add:

1. **A worked record example** with IDs: entry `#101`, submission `#7`, task `#501`, document `pi.live`, etc.
2. **A counterexample**: “If we put X in Y instead, then … would break.”
3. **A where-state-lives table**:

   | Data            | Lives in                | Why                                          |
   | --------------- | ----------------------- | -------------------------------------------- |
   | user text       | `pi.user` entry         | transcript, fork, rewind, compaction         |
   | input lifecycle | submission              | queued / placed / done                       |
   | run membership  | `pi.live.run`           | ties submissions to a generation chain       |
   | task parameters | `task.input`            | fixed input for the task’s own state machine |
   | progress        | `task.state.checkpoint` | resumable execution                          |

4. **An analogy last**, after the concrete example. Not instead of it.

If the reader says “I still don’t understand”, do not restate the same explanation. Add a smaller example, a counterexample and an analogy, and update the confusing section of the document in place.

## 7. Write the document

When the user asks for a document, write `docs/<feature>.md`; do not leave the explanation only in chat.

Use this shape:

```text
# <Feature>: end to end

> Scope: ...
> Terms: ...

## 1. Architecture and modules
[component-style diagram + module table: responsibility / exposes / depends on / owns]

## 2. Flow
[Mermaid flowchart, each step naming its owning module]

## 3. Key steps
[table or numbered steps: trigger / commit / owner / next]

## 4. Core code
[3–5 simplified snippets with path:line]

## 5. Where state lives
[table]

## 6. Worked example
[records with IDs; one normal case]

## 7. Edge cases
[busy / queued / retry / crash / resume, only if relevant]

## 8. Responsibility boundary
[who owns what]

## 9. Code index
[path:line → purpose]

## 10. Common misunderstandings
[short, concrete corrections]
```

Rules for the document:

- Use the user’s language; keep identifiers, paths and protocol names exact.
- Prefer Mermaid diagrams for flows; keep a plain-text diagram for a task chain if it is clearer.
- Link existing docs for deep details instead of duplicating them.
- If a section already exists and confuses the reader, edit that section in place. Do not append a second explanation at the end.
- Verify every path, line reference and behavioural claim against the current source before finishing.

## 8. Finish

End with a 3–5 line recap of the architecture and flow shape, name the part most likely to be confused, and point to the worked example that resolves it. Offer one next deep-dive, not a catalogue.

## Checklist

- [ ] one-sentence definition
- [ ] scope and overloaded terms defined
- [ ] architecture diagram with module boundaries and dependency/ownership edges
- [ ] module table: responsibility / exposes / depends on / owns
- [ ] end-to-end flowchart mapped to those modules before detail
- [ ] 5–9 key steps with trigger / commit / owner / next
- [ ] 3–5 core snippets with `path:line`
- [ ] worked example with record IDs
- [ ] counterexample for the confusing distinction
- [ ] where-state-lives table
- [ ] busy / retry / crash branches when relevant
- [ ] responsibility boundary
- [ ] code index
- [ ] common misunderstandings
- [ ] document updated in place if it already existed

## Anti-patterns

- Starting with a directory tree or a full function.
- Drawing only a flow diagram with no module map: the reader sees motion but not where anything lives.
- Drawing every file as its own box, or generic boxes with no contracts.
- Explaining “what” without “why”.
- Calling every layer “task” without defining the layer.
- Repeating the same prose when the reader asks for an example.
- Writing a chat-only answer when the user asked for a document.
- Guessing line numbers or describing code you did not read.
