import { filterCampsByArchive } from '../features/camps/campList'

export default function CampStatusFilter({ camps, showArchived, onChange }) {
  return (
    <div
      className="mb-4 flex flex-wrap gap-2"
      role="group"
      aria-label="Status dos acampamentos"
    >
      {[false, true].map((archived) => (
        <button
          key={String(archived)}
          type="button"
          aria-pressed={showArchived === archived}
          onClick={() => onChange(archived)}
          className={`record-action ${showArchived === archived ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'text-zinc-400'}`}
        >
          {archived ? 'Arquivados' : 'Ativos'} (
          {filterCampsByArchive(camps, archived).length})
        </button>
      ))}
    </div>
  )
}
