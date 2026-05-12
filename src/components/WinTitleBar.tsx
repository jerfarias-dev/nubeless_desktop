/**
 * Barra de título personalizada — solo se renderiza en Windows.
 * Reemplaza los controles nativos que desaparecen con titleBarStyle: 'hidden'.
 */
export default function WinTitleBar() {
  const minimize = () => window.electronAPI.win.minimize()
  const maximize = () => window.electronAPI.win.maximize()
  const close    = () => window.electronAPI.win.close()

  return (
    <div className="drag-region flex h-8 shrink-0 items-center justify-between bg-surface-card select-none border-b border-white/5">
      {/* Título de la app */}
      <span className="no-drag pl-4 text-xs font-medium text-slate-500">
        Password Manager
      </span>

      {/* Controles de ventana */}
      <div className="no-drag flex h-full">
        <button
          onClick={minimize}
          title="Minimizar"
          className="flex h-full w-11 items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={maximize}
          title="Maximizar"
          className="flex h-full w-11 items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button
          onClick={close}
          title="Cerrar"
          className="flex h-full w-11 items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
