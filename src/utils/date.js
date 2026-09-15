export function getWorkDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}
