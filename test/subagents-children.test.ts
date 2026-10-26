import { createModels } from '@earendil-works/pi-ai/models'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'
import { createRegistry, Harness, MemoryStorage } from '@earendil-works/pi-durable'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { expect, it } from 'vitest'
import { createChild } from '../extensions/subagents/children.ts'
import { shortTitle } from '../lib/title.ts'
import { context } from '../server/harness.ts'
import { Metadata } from '../server/metadata.ts'

it('leaves an identity-only child untitled', async () => {
  const models = createModels()
  models.setProvider(fauxProvider().provider)
  const storage = new MemoryStorage()
  storage.close = async () => {}
  const harness = await Harness.open(storage, { models, registry: createRegistry() }, context)
  try {
    const root = await harness.root(context, {
      agent: { model: { provider: 'faux', modelId: 'faux-1' } },
    })
    const parent = await (await harness.conversation(root.id, context))!.agent(context)
    const child = await harness.commit(
      (tx) =>
        createChild(
          {
            need: () => {
              throw new Error('Not used')
            },
          },
          tx,
          {
            owner: { kind: 'ownerless' },
            parentAgent: parent,
            modelRuntime: models as unknown as ModelRuntime,
            metadata: Metadata,
            label: 'scout',
            title: shortTitle('You are conversation #4654.'),
          },
        ),
      context,
    )
    expect(await harness.snapshot(Metadata, child.id, context)).toEqual({ label: 'scout' })
  } finally {
    await harness.close(context)
  }
})
