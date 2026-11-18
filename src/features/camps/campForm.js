import { getSlugValidationError } from '../../utils/slug.js'
import { isValidInspectionSchedule } from '../inspections/inspectionSchedule.js'

export const initialNewCampForm = {
  name: '',
  church_name: '',
  slug: '',
  theme: '',
  start_date: '',
  end_date: '',
  inspection_schedule: [],
}

export function validateNewCamp(form) {
  if (!form.name.trim()) return 'Informe o nome do acampamento.'
  if (!form.church_name.trim()) return 'Informe a igreja ou organização.'
  if (!form.slug.trim()) return 'Informe a URL do acampamento.'
  const slugError = getSlugValidationError(form.slug.trim())
  if (slugError) return slugError
  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    return 'A data de fim não pode ser anterior à data de início.'
  }
  if (!isValidInspectionSchedule(form.inspection_schedule ?? [])) return 'Confira os dias e horários das inspeções.'
  return ''
}

export function buildNewCampPayload(form, userId) {
  if (!userId) throw new Error('Sessão necessária para criar um acampamento.')
  const validationError = validateNewCamp(form)
  if (validationError) throw new Error(validationError)

  return {
    name: form.name.trim(),
    church_name: form.church_name.trim(),
    slug: form.slug.trim(),
    theme: form.theme.trim() || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    status: 'draft',
    public_ranking_enabled: true,
    organization_id: null,
    created_by: userId,
    inspection_schedule: (form.inspection_schedule ?? []).map(slot => ({ ...slot })),
  }
}
