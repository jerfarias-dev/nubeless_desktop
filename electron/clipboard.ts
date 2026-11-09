import { clipboard } from 'electron'

/** Segundos que un secreto copiado permanece en el portapapeles. */
export const CLIPBOARD_CLEAR_MS = 15_000

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Copia un secreto y lo borra a los `ms` milisegundos, solo si el portapapeles
 * sigue conteniendo ese mismo texto (si el usuario copió otra cosa, no la
 * pisamos). Vive en el proceso main para que el borrado no dependa de que la
 * ventana que copió siga abierta (p. ej. la búsqueda rápida se cierra al copiar).
 */
export function copySecret(text: string, ms: number = CLIPBOARD_CLEAR_MS): void {
  clipboard.writeText(text)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (clipboard.readText() === text) clipboard.clear()
    timer = null
  }, ms)
}

/** Vacía el portapapeles si contiene un secreto copiado por la app (al bloquear). */
export function clearSecretNow(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
    clipboard.clear()
  }
}
