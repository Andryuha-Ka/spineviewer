import type { SpineFile } from '@/core/types/FileSet'

export interface ImageResolverResult<T> {
  textureMap: Map<string, T>
  resolver: (path: string, callback: (tex: T | null) => void) => void
}

/**
 * Builds a texture map + resolver callback for TextureAtlas constructors.
 *
 * @param images        SpineFile[] with fileBody as DataURL
 * @param createTexture version-specific factory: (dataUrl) => PIXI.Texture (v7 or v8)
 */
export function buildImageResolver<T>(
  images: SpineFile[],
  createTexture: (dataUrl: string) => T,
): ImageResolverResult<T> {
  const textureMap = new Map<string, T>()

  for (const img of images) {
    textureMap.set(img.filename, createTexture(img.fileBody as string))
  }

  const resolver = (path: string, callback: (tex: T | null) => void): void => {
    const name = path.split('/').pop() ?? path
    const key = [...textureMap.keys()].find(
      k => k === name || k === path || k.endsWith('/' + name),
    )
    callback(key != null ? textureMap.get(key)! : null)
  }

  return { textureMap, resolver }
}

/**
 * Waits for all Pixi 7-style PIXI.Texture objects to finish loading.
 * Checks baseTexture.valid; if not yet loaded, listens for 'loaded'/'error' events.
 */
export function waitForPixi7Textures(textures: Iterable<unknown>): Promise<void> {
  const promises = [...textures].map(
    tex =>
      new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bt = (tex as any)?.baseTexture
        if (!bt || bt.valid) { resolve(); return }
        bt.once('loaded', resolve)
        bt.once('error', () => reject(new Error('Texture load failed')))
      }),
  )
  return Promise.all(promises).then(() => {})
}
