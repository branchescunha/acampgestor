export function formSnapshot(form) {
  return JSON.stringify(
    [...form.elements]
      .filter(
        (field) =>
          !field.disabled && !['submit', 'button', 'reset'].includes(field.type)
      )
      .map((field, index) => [
        field.name || field.id || index,
        field.type === 'password'
          ? Boolean(field.value)
          : ['checkbox', 'radio'].includes(field.type)
            ? field.checked
            : field.multiple
              ? [...field.selectedOptions].map((option) => option.value)
              : field.value,
      ])
  )
}

export function hasUnsavedForms(baselines) {
  return [...baselines].some(
    ([form, baseline]) =>
      form.isConnected &&
      ([...form.elements].some(
        (field) =>
          field.type === 'password' && !field.disabled && Boolean(field.value)
      ) ||
        formSnapshot(form) !== baseline)
  )
}

export function resetRouteScroll(targetWindow, targetDocument) {
  const options = { top: 0, left: 0, behavior: 'instant' }
  targetWindow.scrollTo(options)
  targetDocument
    .querySelectorAll(
      '[data-route-scroll], .app-sidebar, #panel-content, #main-content'
    )
    .forEach((element) => element.scrollTo(options))
}

export function markFormSaved(form) {
  requestAnimationFrame(() => {
    if (form?.isConnected)
      form.dispatchEvent(new Event('acampgestor:form-saved', { bubbles: true }))
  })
}
