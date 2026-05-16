import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, RefreshCw, Lock, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import PasswordStrength from './PasswordStrength'
import type { Account, AccountInput, PasswordStrength as PWStrength } from '../types/electron'

interface Props {
  account?: Account
  onClose(): void
}

interface FormState {
  platform:    string
  username:    string
  password:    string
  url:         string
  category_id: number
  is_favorite: boolean
  notes:       string
  totp_secret: string
}

export default function AccountDialog({ account, onClose }: Props) {
  const { categories, createAccount, updateAccount, setStatus } = useStore()
  const isEdit = !!account

  const defaultCatId = categories[0]?.id ?? 1

  const [form, setForm] = useState<FormState>({
    platform:    account?.platform    ?? '',
    username:    account?.username    ?? '',
    password:    account?.password    ?? '',
    url:         account?.url         ?? '',
    category_id: account?.category_id ?? defaultCatId,
    is_favorite: account?.is_favorite ?? false,
    notes:       account?.notes       ?? '',
    totp_secret: account?.totp_secret ?? ''
  })

  const [showPwd, setShowPwd]       = useState(false)
  const [showTotp, setShowTotp]     = useState(false)
  const [strength, setStrength]     = useState<PWStrength | null>(null)
  const [genLength, setGenLength]   = useState(16)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  // null = sin evaluar; true/false = resultado de looksLikeBase32
  const [totpValid, setTotpValid]   = useState<boolean | null>(null)

  useEffect(() => {
    if (!form.password) { setStrength(null); return }
    const t = setTimeout(async () => {
      const s = await window.electronAPI.generator.evaluate(form.password)
      setStrength(s as PWStrength)
    }, 200)
    return () => clearTimeout(t)
  }, [form.password])

  // Validación ligera del secreto TOTP (formato base32) con debounce
  useEffect(() => {
    if (!form.totp_secret.trim()) { setTotpValid(null); return }
    const t = setTimeout(async () => {
      const ok = await window.electronAPI.totp.validate(form.totp_secret)
      setTotpValid(ok)
    }, 300)
    return () => clearTimeout(t)
  }, [form.totp_secret])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleGenerate = async () => {
    const pwd = await window.electronAPI.generator.generate(genLength)
    set('password', pwd)
  }

  const validate = (): string | null => {
    if (!form.platform.trim()) return 'La plataforma es obligatoria'
    if (!form.username.trim()) return 'El usuario es obligatorio'
    if (!form.password)        return 'La contraseña es obligatoria'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      if (isEdit) {
        await updateAccount({ ...account!, ...form })
        setStatus({ text: 'Cuenta actualizada', type: 'success' })
      } else {
        const input: AccountInput = { ...form }
        await createAccount(input)
        setStatus({ text: 'Cuenta creada', type: 'success' })
      }
      onClose()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-card shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Editar cuenta' : 'Nueva cuenta'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Platform + URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Plataforma *</label>
              <input
                value={form.platform}
                onChange={e => set('platform', e.target.value)}
                placeholder="Google, GitHub…"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">URL</label>
              <input
                value={form.url}
                onChange={e => set('url', e.target.value)}
                placeholder="https://…"
                className="field-input"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="field-label">Usuario / Email *</label>
            <input
              value={form.username}
              onChange={e => set('username', e.target.value)}
              placeholder="usuario@email.com"
              className="field-input"
            />
          </div>

          {/* Password */}
          <div>
            <label className="field-label">Contraseña *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="••••••••"
                  className="field-input pl-10 pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Generator */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={48}
                value={genLength}
                onChange={e => setGenLength(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="w-8 text-center text-xs text-slate-400">{genLength}</span>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex items-center gap-1.5 rounded-lg bg-surface-input px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-hover hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Generar
              </button>
            </div>

            {/* Strength */}
            {strength && (
              <div className="mt-2">
                <PasswordStrength strength={strength} />
              </div>
            )}
          </div>

          {/* Category + Favorite */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Categoría</label>
              <select
                value={form.category_id}
                onChange={e => set('category_id', Number(e.target.value))}
                className="field-input"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.is_favorite}
                  onChange={e => set('is_favorite', e.target.checked)}
                  className="h-4 w-4 rounded accent-amber-400"
                />
                Marcar como favorito
              </label>
            </div>
          </div>

          {/* TOTP / 2FA secret */}
          <div>
            <label className="field-label flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Secreto 2FA (TOTP) — opcional
            </label>
            <div className="relative">
              <input
                type={showTotp ? 'text' : 'password'}
                value={form.totp_secret}
                onChange={e => set('totp_secret', e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP…  (pega el secreto base32 que te dio el servicio)"
                className="field-input pr-10 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowTotp(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showTotp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.totp_secret && totpValid !== null && (
              <p className={`mt-1 flex items-center gap-1 text-xs ${totpValid ? 'text-green-400' : 'text-amber-400'}`}>
                {totpValid
                  ? <><CheckCircle2 className="h-3 w-3" /> Formato base32 válido</>
                  : <><AlertCircle className="h-3 w-3" /> Esto no parece base32 — revisa que copiaste bien</>}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notas</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Notas adicionales…"
              className="field-input resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-400 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
