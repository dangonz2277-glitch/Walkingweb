/**
 * Valida que el conteo de tickets resueltos sea un entero entre 0 y 9999.
 * @param {number} count - El valor a validar.
 * @throws {Error} Si el valor no es un entero o está fuera de rango.
 * @returns {number} El conteo validado.
 */
export function validateResolvedCount(count) {
  if (typeof count !== 'number' || !Number.isInteger(count)) {
    throw new Error('resolvedCount debe ser un número entero');
  }
  if (count < 0 || count > 9999) {
    throw new Error('resolvedCount debe estar entre 0 y 9999');
  }
  return count;
}

/**
 * Obtiene la fecha de trabajo actual (o la proporcionada) en la zona horaria America/La_Paz.
 * El formato devuelto es YYYY-MM-DD.
 * @param {Date} [date] - La fecha a convertir. Por defecto usa la fecha actual.
 * @returns {string} La fecha en formato YYYY-MM-DD.
 */
export function getWorkDate(date) {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA produce el formato YYYY-MM-DD
  return formatter.format(d);
}

/**
 * Genera la clave de identificación única para un reporte diario.
 * @param {string} userId - El identificador del usuario.
 * @param {string} workDate - La fecha de trabajo (YYYY-MM-DD).
 * @returns {string} Clave combinada (userId, workDate).
 */
export function getReportId(userId, workDate) {
  if (!userId || !workDate) {
    throw new Error('userId y workDate son requeridos');
  }
  return `${userId}_${workDate}`;
}

/**
 * Determina si hay un conflicto de revisión entre el cliente y el servidor.
 * @param {number|null|undefined} currentRevision - La revisión que conoce el cliente (null o 0 si es nuevo).
 * @param {number|null|undefined} serverRevision - La revisión actual en el servidor.
 * @returns {boolean} true si hay conflicto, false en caso contrario.
 */
export function hasRevisionConflict(currentRevision, serverRevision) {
  const clientRev = currentRevision || 0;
  const serverRev = serverRevision || 0;
  return clientRev !== serverRev;
}
