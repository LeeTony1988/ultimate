import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent } from 'react'
import { ToolImage } from '@/components/ai/tool'
import { imageMimeTypes, maxImageBytes, maxImages } from '../../../shared/protocol.ts'
import { errorMessage } from '../sdk/format.ts'

export type PastedImage = { data: string; mimeType: string }

export function useImagePaste({
  images,
  setImages,
  setError,
  disabled,
}: {
  images: PastedImage[]
  setImages: (change: (images: PastedImage[]) => PastedImage[]) => void
  setError: (message: string | undefined) => void
  disabled: () => boolean
}) {
  const [reading, setReading] = useState(false)
  const pending = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (disabled()) {
      event.preventDefault()
      return
    }
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .flatMap((item) => {
        const file = item.getAsFile()
        return file ? [file] : []
      })
    if (!files.length) return
    event.preventDefault()
    await add(files)
  }

  /** Attach the images dropped on the editor; the page itself never navigates to a dropped file (`main.tsx`). */
  async function drop(event: DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/'),
    )
    if (files.length) await add(files)
  }

  async function add(files: readonly File[]) {
    if (pending.current || disabled()) return
    if (
      images.length + files.length > maxImages ||
      files.some((file) => file.size > maxImageBytes || !imageMimeTypes.includes(file.type))
    ) {
      setError('Paste up to 4 PNG, JPEG, WebP or GIF images, at most 2 MiB each.')
      return
    }
    pending.current = true
    setReading(true)
    setError(undefined)
    try {
      const added = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
              const reader = new FileReader()
              reader.addEventListener('load', () => {
                if (typeof reader.result !== 'string')
                  return reject(new Error('Could not read pasted image'))
                resolve({ data: reader.result.split(',')[1], mimeType: file.type })
              })
              reader.addEventListener('error', () =>
                reject(new Error('Could not read pasted image')),
              )
              reader.readAsDataURL(file)
            }),
        ),
      )
      if (alive.current) setImages((current) => [...current, ...added])
    } catch (failure) {
      if (alive.current) setError(errorMessage(failure))
    } finally {
      pending.current = false
      if (alive.current) setReading(false)
    }
  }

  return { paste, drop, reading, pending }
}

export function ImagePreviews({
  images,
  remove,
  disabled,
  className,
}: {
  images: PastedImage[]
  remove: (index: number) => void
  disabled: boolean
  className?: string
}) {
  return images.length > 0 ? (
    <div className={cn('flex flex-wrap gap-2 px-3 pt-3', className)}>
      {images.map((image, index) => (
        <div className="relative" key={index}>
          <ToolImage
            alt={`Pasted image ${index + 1}`}
            className="max-w-36 [&_img]:max-h-24"
            image={image}
          />
          <button
            aria-label={`Remove image ${index + 1}`}
            className="absolute -top-2 -right-2 flex size-5 cursor-pointer items-center justify-center rounded-full border bg-background hover:bg-accent"
            disabled={disabled}
            onClick={() => remove(index)}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  ) : null
}
