import { Search, Star, X } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function SearchFilters() {
  const { filters, setFilter, categories } = useStore()

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          placeholder="Buscar plataforma o usuario…"
          className="w-full rounded-lg bg-surface-input py-2 pl-9 pr-9 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-white/10 focus:ring-accent"
        />
        {filters.search && (
          <button
            onClick={() => setFilter('search', '')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category */}
      <select
        value={filters.categoryId ?? ''}
        onChange={e => setFilter('categoryId', e.target.value === '' ? null : Number(e.target.value))}
        className="rounded-lg bg-surface-input px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-accent"
      >
        <option value="">Todas las categorías</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* Favorites */}
      <button
        onClick={() => setFilter('favoritesOnly', !filters.favoritesOnly)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
          filters.favoritesOnly
            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
            : 'bg-surface-input text-slate-400 ring-1 ring-white/10 hover:text-amber-400'
        }`}
      >
        <Star className="h-4 w-4" fill={filters.favoritesOnly ? 'currentColor' : 'none'} />
        Favoritos
      </button>
    </div>
  )
}
