# Revisión de la Orden 08 (`53dfa37`)

Estado: **Orden 08 abierta**. La estructura inicial del popup y repositorio existe, pero la integración no está validada ni completa. No se hizo push ni despliegue.

## Evidencia ejecutada

- `npm test`: 38/38, pero son las mismas tres suites anteriores; no hay pruebas de `ReportPopup` ni `reportRepository`.
- `npm run lint`: código 0 con dos advertencias en `ReportPopup.jsx` (`react/immutability` y `react/set-state-in-effect`). La afirmación de cero advertencias es incorrecta.
- `npm run build`: pasa.
- `npx supabase test db`: 48 pgTAP, pasa; valida el SQL ya existente.
- `npm run test:concurrency`: pasa cinco iteraciones.
- `npm run test:api`: **falla** en el reset de contraseña. `auth.admin.signOut` recibe un UUID, pero el SDK exige el JWT del usuario; por eso responde `token contains an invalid number of segments`. Las cuentas sintéticas de esta ejecución sí quedaron eliminadas; se comprobó `auth.users` después.
- Navegador real: Mi Reporte abre como diálogo, Escape lo cierra y el foco vuelve al botón “Mi Reporte”. No se pudo probar login/guardado porque no existen dos cuentas administradas compatibles con el usuario sintético.

## Bloqueos funcionales

1. El login transforma el usuario a `${username}@walkingweb.internal`, pero `createManagedUser` sigue recibiendo un email arbitrario y no existe validación/normalización común ni procedimiento probado que cree cuentas con esa convención. La UI puede no autenticar ninguna cuenta creada con la herramienta actual. Crear una única función compartida para normalizar el usuario (formato permitido, minúsculas, longitud) y derivar el email interno; usarla en alta y login. Probar mayúsculas, espacios, caracteres inválidos y duplicados sin enumerar usuarios.
2. `@supabase/supabase-js` continúa en `devDependencies`; moverlo a `dependencies` porque lo importa el runtime cliente.
3. La validación usa `parseInt`: acepta `5.5` y `12abc`, guardándolos como 5 y 12. Usar conversión estricta y `Number.isInteger`, manteniendo el texto escrito ante error. Probar 0, 9999, negativos, fracciones, sufijos y vacío.
4. Si el valor remoto del conflicto es 0, `!serverConflictCount` renderiza también el botón normal de guardar. Comprobar `serverConflictCount === null`.
5. No se implementaron los tests obligatorios de UI/repositorio: login, cuenta desactivada, dos perfiles, validaciones, red, respuesta perdida, conflicto, reintento, fecha, foco y aislamiento. El mock global solo evita que los tests anteriores fallen; no valida el nuevo módulo.
6. `resetManagedUserPassword` y `disableManagedUser` usan `adminClient.auth.admin.signOut(userId, 'global')`, pero esa API espera un access token JWT. Corregir el contrato o eliminar la afirmación de revocación inmediata; mantener la protección de cuentas desactivadas por RLS/estado y probar la semántica real.
7. `resetRateLimit`/otros temas de gateway no forman parte de esta corrección. Mantener el alcance en perfil y reporte.

## Calidad del popup y repositorio

- Añadir estado de envío al login para impedir doble submit y mostrar errores de cierre de sesión/carga de historial.
- Añadir nombre accesible al botón de cierre (no solo “X”).
- Resolver las advertencias de hooks sin ocultarlas con temporizadores.
- Usar el validador de fecha del dominio existente o probar explícitamente la salida `YYYY-MM-DD` y el cambio alrededor de medianoche en `America/La_Paz`.
- Verificar que los chunks no contengan `SUPABASE_SERVICE_ROLE_KEY`. Solo las variables publicables deben llegar al navegador.

Después de corregir, ejecutar todas las suites exigidas. La Orden no se cierra hasta probar en navegador dos usuarios sintéticos compatibles, guardado, aislamiento, conflicto y logout personal.
