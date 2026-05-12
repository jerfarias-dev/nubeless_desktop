import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Category, CategoryInput } from '../types/electron'

interface Props {
  onClose(): void
}

const PRESET_COLORS = [
  '#E91E63', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0',
  '#FF5722', '#607D8B', '#00BCD4', '#FF9800', '#795548'
]

interface FormState {
  name: string
  description: string
  color: string
  icon: string
}

const emptyForm: FormState = { name: '', description: '', color: '#607D8B', icon: 'folder' }

export default function CategoryManager({ onClose }: Props) {
  const { categories, createCategory, updateCategory, deleteCategory, setStatus } = useStore()
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm]       = useState<FormState>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [error, setError]     = useState('')

  const startCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  const startEdit   = (cat: Category) => {
    setEditing(cat)
    setForm({ name: cat.name, description: cat.description, color: cat.color, icon: cat.icon })
    setShowForm(true)
    setError('')
  }
  const cancelForm  = () => { setShowForm(false); setEditing(null); setForm(emptyForm) }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setError('')
    try {
      if (editing) {
        await updateCategory({ ...editing, ...form })
      } else {
        const input: CategoryInput = { ...form }
        await createCategory(input)
      }
      cancelForm()
      setStatus({ text: editing ? 'Categoría actualizada' : 'Categoría creada', type: 'success' })
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Error')
    }
  }

  const handleDelete = async (cat: Category) => {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"? Las cuentas pasarán a "Sin categoría".`)) return
    try {
      await deleteCategory(cat.id)
      setStatus({ text: 'Categoría eliminada', type: 'info' })
    } catch (ex) {
      setStatus({ text: ex instanceof Error ? ex.message : 'Error al eliminar', type: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-surface-card shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Gestionar Categorías</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* List */}
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <button
              onClick={startCreate}
              className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2 text-sm text-slate-400 hover:border-accent/50 hover:text-accent"
            >
              <Plus className="h-4 w-4" /> Nueva categoría
            </button>

            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5"
              >
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 text-sm text-white">{cat.name}</span>
                {cat.description && (
                  <span className="text-xs text-slate-500">{cat.description}</span>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(cat)}
                    className="rounded p-1 text-slate-500 hover:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!cat.is_default && (
                    <button
                      onClick={() => handleDelete(cat)}
                      className="rounded p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Form panel */}
          {showForm && (
            <div className="w-60 border-l border-white/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                {editing ? 'Editar categoría' : 'Nueva categoría'}
              </h3>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Nombre *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg bg-surface-input px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Descripción</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg bg-surface-input px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="h-6 w-6 rounded-full transition hover:scale-110"
                      style={{ backgroundColor: c }}
                    >
                      {form.color === c && <Check className="h-4 w-4 mx-auto text-white" />}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: form.color }} />
                  <input
                    type="text"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    placeholder="#607D8B"
                    className="w-full rounded bg-surface-input px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  Guardar
                </button>
                <button
                  onClick={cancelForm}
                  className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400 hover:bg-white/10"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
