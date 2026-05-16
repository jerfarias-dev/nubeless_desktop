import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Preferencias de la app — persistidas en localStorage del renderer.
 *
 * Separado de `useStore` (que maneja datos del vault) porque las preferencias
 * son una responsabilidad distinta: no son sensibles, no requieren cifrado y
 * sobreviven entre sesiones sin pasar por el proceso main.
 */
interface SettingsState {
  // --- Seguridad ---
  /** Minutos de inactividad antes del auto-bloqueo. 0 = desactivado. */
  autoLockMinutes: number

  // --- Acciones ---
  setAutoLockMinutes(minutes: number): void
}

/** Opciones disponibles para el auto-bloqueo (en minutos; 0 = desactivado). */
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 10, 15, 30] as const

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      autoLockMinutes: 10,
      setAutoLockMinutes: (minutes) => set({ autoLockMinutes: minutes }),
    }),
    { name: 'pm-settings' }
  )
)
