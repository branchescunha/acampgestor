export function filterCampsByArchive(camps, showArchived) {
  return camps.filter((camp) => (camp.status === 'archived') === showArchived)
}
