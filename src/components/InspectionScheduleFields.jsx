import { INSPECTION_DAYS, INSPECTION_PERIODS, toggleInspectionSlot } from '../features/inspections/inspectionSchedule'

export default function InspectionScheduleFields({ value, onChange, usedSlots = [], disabled = false }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 border-t border-zinc-800 pt-5">
      <legend className="px-1 text-base font-semibold">Dias e horários das inspeções</legend>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] text-sm">
          <thead><tr><th scope="col" className="py-2 text-left">Dia</th>{INSPECTION_PERIODS.map(period => <th scope="col" className="px-2 py-2 text-center" key={period}>{period}</th>)}</tr></thead>
          <tbody>{INSPECTION_DAYS.map(day => (
            <tr className="border-t border-zinc-800" key={day.value}>
              <th scope="row" className="py-3 text-left text-zinc-300">{day.label}</th>
              {INSPECTION_PERIODS.map(period => {
                const used = usedSlots.some(slot => slot.day === day.value && slot.period === period)
                return <td className="px-2 py-3 text-center" key={period}><input
                  type="checkbox" aria-label={`${day.label} / ${period}`} title={used ? 'Turno com inspeções registradas' : `${day.label} / ${period}`}
                  className="h-5 w-5" disabled={used}
                  checked={value.some(slot => slot.day === day.value && slot.period === period)}
                  onChange={() => onChange(toggleInspectionSlot(value, day.value, period))}
                /></td>
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </fieldset>
  )
}
