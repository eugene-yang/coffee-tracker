// One toast at a time; actions offer Undo instead of asking for confirmation.
export const toast = $state({ message: '', undo: null as (() => void) | null, key: 0 })

let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string, undo: (() => void) | null = null, ms = 5000): void {
  clearTimeout(timer)
  toast.message = message
  toast.undo = undo
  toast.key++
  timer = setTimeout(dismissToast, ms)
}

export function dismissToast(): void {
  toast.message = ''
  toast.undo = null
}
