# Revisión 08B (`41c0930`)

Estado: **Orden 08 abierta**. El flujo principal ya funciona contra Supabase local y se validó en navegador real, pero la entrega todavía no satisface la cobertura y limpieza exigidas. No hacer push ni despliegue.

## Evidencia verificada por Codex

- `npm test`: 46/46 pruebas pasan.
- `npm run lint`: código 0, pero conserva **5 advertencias** por imports sin usar y una expresión regular con escape inútil. La afirmación de cero advertencias no es correcta.
- `npm run build`: pasa.
- `npx supabase test db`: 48 pruebas pgTAP pasan.
- `npm run test:concurrency`: pasan 5 ciclos.
- `npm run test:api`: pasa y limpia sus usuarios sintéticos.
- `npm run test:gateway`: pasa.
- Navegador real en `http://localhost:3000`: dos perfiles sintéticos independientes iniciaron sesión, guardaron ambos 17 tickets para `2026-09-14`, vieron únicamente su historial y cerraron la sesión personal sin salir del catálogo. Codex eliminó después ambas cuentas sintéticas.

## Correcciones requeridas

1. Eliminar `fix_test.js`; es un script temporal que no pertenece al producto.
2. Dejar `npm run lint` realmente en cero advertencias. Retirar imports no usados en `ReportPopup.test.jsx` y `reportRepository.test.js`.
3. Corregir el mensaje de `api_test.js` que afirma que el reset de contraseña revoca tokens. La llamada inválida a `admin.signOut(UUID)` se eliminó correctamente, pero el texto actual promete una propiedad que la prueba ya no comprueba. Documentar la semántica real sin afirmar revocación inmediata.
4. Completar las pruebas de `ReportPopup`: login exitoso, logout personal, historial, error de historial/logout, doble submit, valores `0`, `9999`, vacío, `12abc`, conflicto remoto con valor `0`, escoger el valor remoto, sobrescribir con la revisión nueva y preservación del borrador/estado al cerrar y abrir según el contrato de la Orden 08.
5. Completar las pruebas del repositorio: `getProfile`, `listMyReports`, sesión ausente, perfil desactivado, errores de lectura, respuesta perdida y reintento sin duplicación. Las tres pruebas actuales no cubren el contrato completo.
6. Añadir prueba determinista de fecha laboral alrededor de medianoche para `America/La_Paz`; no depender solo del reloj/zona del proceso de CI.
7. Añadir una prueba automatizada de dos perfiles con la misma fecha y el mismo total que compruebe aislamiento de extremo a extremo. La validación manual de Codex demuestra el flujo hoy, pero debe quedar reproducible.
8. Añadir comprobación del bundle para asegurar que `SUPABASE_SERVICE_ROLE_KEY` y su valor no aparecen en chunks del cliente. Solo las variables `NEXT_PUBLIC_*` pueden estar expuestas.

Mantener el alcance: no tocar RLS, pgTAP, gateway, catálogo ni migraciones SQL salvo que una prueba revele un defecto real. Ejecutar todas las suites y reportar la salida verdadera, incluidas advertencias. La Orden 08 se cerrará cuando estas correcciones pasen y se confirme el popup con teclado y vista móvil.
