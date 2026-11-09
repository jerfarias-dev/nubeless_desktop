import { useMemo, useState } from 'react'
import {
  AlertTriangle, Repeat, Clock, ShieldOff, Unlock, ChevronDown, ChevronRight, ShieldCheck
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { computeVaultReport, OLD_PASSWORD_DAYS, type IssueKind } from '../utils/passwordHealth'
import type { Account } from '../types/electron'

interface Props {
  onEdit(account: Account): void
}

const ISSUE_META: Record<IssueKind, { title: string; help: string; icon: typeof AlertTriangle; color: string }> = {
  weak: {
    title: 'Contraseñas débiles',
    help: 'Cortas o con poca variedad. Genera una nueva con el generador.',
    icon: AlertTriangle, color: 'text-amber-400',
  },
  reused: {
    title: 'Contraseñas repetidas',
    help: 'Si se filtra una, quedan expuestas todas las cuentas que la comparten.',
    icon: Repeat, color: 'text-red-400',
  },
  old: {
    title: 'Contraseñas viejas',
    help: `Sin cambios en más de ${OLD_PASSWORD_DAYS} días.`,
    icon: Clock, color: 'text-sky-400',
  },
  no2fa: {
    title: 'Sin verificación en dos pasos',
    help: 'Activa el 2FA en el sitio y guarda el código aquí para tenerlo a la mano.',
    icon: ShieldOff, color: 'text-violet-400',
  },
  insecureUrl: {
    title: 'Sitios sin HTTPS',
    help: 'La URL guardada usa http://. Revisa si el sitio ya tiene versión https://.',
    icon: Unlock, color: 'text-orange-400',
  },
}

const ORDER: IssueKind[] = ['weak', 'reused', 'old', 'no2fa', 'insecureUrl']

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

export default function SecurityDashboard({ onEdit }: Props) {
  const accounts = useStore(s => s.accounts)
  const report = useMemo(() => computeVaultReport(accounts), [accounts])
  const [open, setOpen] = useState<IssueKind | null>(null)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mb-6 flex items-center gap-5 rounded-xl bg-surface-card px-6 py-5">
        <div className={`text-5xl font-bold ${scoreColor(report.score)}`}>{report.score}</div>
        <div>
          <p className="text-base font-semibold text-primary">Puntuación de seguridad</p>
          <p className="text-sm text-muted">
            {report.total === 0
              ? 'Aún no hay cuentas guardadas.'
              : `Calculada sobre ${report.total} cuenta${report.total === 1 ? '' : 's'}. 100 = ningún problema.`}
          </p>
        </div>
      </div>

      {report.total > 0 && ORDER.every(k => report.issues[k].length === 0) && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-5 py-4 text-sm text-green-300">
          <ShieldCheck className="h-5 w-5" /> Todo en orden: no se encontraron problemas.
        </div>
      )}

      <div className="space-y-3">
        {ORDER.map(kind => {
          const list = report.issues[kind]
          const meta = ISSUE_META[kind]
          const Icon = meta.icon
          const isOpen = open === kind
          return (
            <div key={kind} className="rounded-xl bg-surface-card">
              <button
                onClick={() => setOpen(isOpen ? null : kind)}
                disabled={list.length === 0}
                className="flex w-full items-center justify-between px-5 py-4 text-left disabled:cursor-default"
              >
                <span className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${list.length ? meta.color : 'text-muted'}`} />
                  <span>
                    <span className="block text-sm font-medium text-primary">{meta.title}</span>
                    <span className="block text-xs text-muted">{meta.help}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`text-lg font-semibold ${list.length ? meta.color : 'text-muted'}`}>
                    {list.length}
                  </span>
                  {list.length > 0 && (isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted" />
                    : <ChevronRight className="h-4 w-4 text-muted" />)}
                </span>
              </button>
              {isOpen && (
                <ul className="border-t border-border px-2 py-2">
                  {list.map(a => (
                    <li key={a.id}>
                      <button
                        onClick={() => onEdit(a)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="text-primary">{a.platform}</span>
                        <span className="text-xs text-muted">{a.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
