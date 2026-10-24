// Client-side photo handling: shrink camera images before storing/uploading.
const MAX_SIDE = 2000

export async function resizeImage(file: Blob, maxSide = MAX_SIDE, quality = 0.85): Promise<Blob> {
  // createImageBitmap applies EXIF orientation by default in current browsers
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode photo'))), 'image/jpeg', quality),
  )
}

export function photoUrl(id: string, size: 'thumb' | 'full'): string {
  return `${import.meta.env.BASE_URL}api/photos/${id}?size=${size}`
}
