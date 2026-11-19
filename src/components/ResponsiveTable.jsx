export default function ResponsiveTable({ columns, data, emptyMessage }) {
  return (
    <div className="responsive-records overflow-hidden rounded-2xl border border-zinc-800">
      <div className="records-table-view overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de registros">
        <table className="records-table w-full min-w-[760px] border-collapse">
          <thead className="bg-zinc-900">
            <tr className="text-left text-sm">
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-4 ${column.key === 'actions' ? 'record-actions-cell' : ''}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="bg-zinc-950 px-6 py-10 text-center text-zinc-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-zinc-800 bg-zinc-950 text-sm"
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-4 ${column.key === 'actions' ? 'record-actions-cell' : ''}`}>
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="record-cards space-y-3 p-4">
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            {emptyMessage}
          </p>
        ) : (
          data.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="space-y-3">
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className={`${column.key === 'actions' ? 'grid gap-2' : 'flex items-start justify-between gap-4'} border-b border-zinc-800 pb-3 last:border-none last:pb-0`}
                  >
                    <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                      {column.label}
                    </span>

                    <div className={`min-w-0 break-words text-sm leading-snug ${column.key === 'actions' ? 'w-full' : 'max-w-[65%] text-right'}`}>
                      {column.render(item)}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
