/**
 * Interfaz/Contrato para el repositorio de reportes diarios.
 * Por ahora no conecta con Supabase, solo define la estructura.
 */

/**
 * @typedef {Object} DailyReport
 * @property {string} userId
 * @property {string} workDate
 * @property {number} resolvedCount
 * @property {number} revision
 */

/**
 * @typedef {Object} RepositoryResult
 * @property {boolean} success - true si la operación fue exitosa
 * @property {DailyReport} [data] - Datos devueltos (si success es true)
 * @property {string} [error] - Mensaje de error (si success es false)
 * @property {boolean} [conflict] - true si hubo un conflicto de revisión
 */

/**
 * Obtiene el reporte del día para el usuario autenticado.
 * @param {string} workDate - La fecha de trabajo (YYYY-MM-DD).
 * @returns {Promise<RepositoryResult>} El resultado con el reporte, o nulo si no existe.
 */
export async function getTodayReport(_workDate) {
  return {
    success: false,
    error: 'Not implemented yet: backend integration pending'
  };
}

/**
 * Guarda el conteo de tickets resueltos, detectando conflictos de revisión.
 * @param {string} _workDate - La fecha de trabajo.
 * @param {number} _resolvedCount - El nuevo conteo validado.
 * @param {number|null} _currentRevision - La revisión actual conocida por el cliente.
 * @returns {Promise<RepositoryResult>} Resultado de la operación.
 */
export async function setResolvedCount(_workDate, _resolvedCount, _currentRevision) {
  return {
    success: false,
    error: 'Not implemented yet: backend integration pending'
  };
}

/**
 * Lista los reportes del usuario autenticado (historial).
 * @returns {Promise<RepositoryResult>} Resultado con la lista de reportes.
 */
export async function listMyReports() {
  return {
    success: false,
    error: 'Not implemented yet: backend integration pending'
  };
}
