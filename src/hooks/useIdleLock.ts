import { useEffect, useRef, useState } from 'react'

/**
 * Hook de bloqueo automático por inactividad.
 *
 * Escucha eventos de actividad del usuario (mouse, teclado, scroll, touch) y
 * resetea un timer. Si pasa el tiempo configurado sin actividad, dispara
 * el callback `onIdle`.
 *
 * Adicionalmente expone `secondsUntilLock` que cuenta hacia atrás en el
 * último minuto, útil para mostrar un aviso visual antes del bloqueo.
 *
 * @param timeoutMs   tiempo total de inactividad antes de bloquear (ms)
 * @param onIdle      callback que se ejecuta al cumplirse el timeout
 * @param enabled     si está activo (típicamente: solo cuando el usuario está autenticado)
 * @param warnAtMs    tiempo restante a partir del cual exponer el countdown (default 60s)
 */
export function useIdleLock(
  timeoutMs: number,
  onIdle: () => void,
  enabled: boolean,
  warnAtMs = 60_000
): { secondsUntilLock: number | null; resetTimer: () => void } {
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActivity = useRef<number>(Date.now())

  // null = no mostrar aviso; número = segundos restantes
  const [secondsUntilLock, setSecondsUntilLock] = useState<number | null>(null)

  const clearAll = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
    lockTimerRef.current = null
    warnTimerRef.current = null
    tickRef.current = null
  }

  const startTimers = () => {
    clearAll()
    setSecondsUntilLock(null)

    // Timer para el bloqueo total
    lockTimerRef.current = setTimeout(() => {
      onIdle()
    }, timeoutMs)

    // Timer que arranca el aviso visual (countdown del último minuto)
    const warnDelay = Math.max(0, timeoutMs - warnAtMs)
    warnTimerRef.current = setTimeout(() => {
      const expiresAt = lastActivity.current + timeoutMs
      const remaining = Math.ceil((expiresAt - Date.now()) / 1000)
      setSecondsUntilLock(remaining)
      tickRef.current = setInterval(() => {
        const r = Math.max(0, Math.ceil((lastActivity.current + timeoutMs - Date.now()) / 1000))
        setSecondsUntilLock(r)
        if (r === 0 && tickRef.current) clearInterval(tickRef.current)
      }, 1000)
    }, warnDelay)
  }

  const resetTimer = () => {
    lastActivity.current = Date.now()
    if (enabled) startTimers()
  }

  useEffect(() => {
    if (!enabled) {
      clearAll()
      setSecondsUntilLock(null)
      return
    }

    // Throttle: máximo un reset cada 500ms, para no recrear timers en cada pixel del mouse
    let throttle: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (throttle) return
      throttle = setTimeout(() => { throttle = null }, 500)
      resetTimer()
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))

    // Inicializa los timers al montar
    resetTimer()

    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (throttle) clearTimeout(throttle)
      clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs])

  return { secondsUntilLock, resetTimer }
}
