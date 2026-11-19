import { Archive, Pencil, Trash2 } from 'lucide-react'

export default function RecordActions({
  onEdit,
  onDelete,
  deleteLabel = 'Excluir',
  onToggle,
  toggleLabel,
  disabled = false,
}) {
  const DeleteIcon = deleteLabel === 'Arquivar' ? Archive : Trash2
  return (
    <div className="record-actions">
      <div className="record-actions-row">
        {onEdit && (
          <button
            type="button"
            disabled={disabled}
            onClick={onEdit}
            className="record-action"
          >
            <Pencil size={15} aria-hidden="true" />
            Editar
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="record-action record-action-danger"
          >
            <DeleteIcon size={15} aria-hidden="true" />
            {deleteLabel}
          </button>
        )}
      </div>
      {onToggle && (
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className="record-action w-full"
        >
          {toggleLabel}
        </button>
      )}
    </div>
  )
}
