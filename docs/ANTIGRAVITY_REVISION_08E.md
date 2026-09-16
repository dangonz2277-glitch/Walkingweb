# Revisión 08E — cierre final de la Orden 08

Estado: **Orden 08 abierta**, con corrección final acotada. No hacer push ni despliegue.

Codex verificó: lint limpio, build correcto, Vitest 59/59, diff limpio. La entrega previa ya pasó pgTAP, concurrencia, API y gateway. En navegador real a 390×844, el popup de login se adapta correctamente; sus campos y controles son visibles, Escape cierra el diálogo y el foco vuelve a Mi Reporte.

## Correcciones finales

1. En `ReportPopup.test.jsx`, el bloque de `10000` no contiene ninguna aserción y el comentario dice incorrectamente que `max` limita automáticamente lo escrito. Comprobar el mensaje de rango y que `setResolvedCount` no reciba `10000`. Añadir también negativos y fracciones, preservando el texto inválido.
2. El test de login exitoso solo comprueba que desaparece el formulario. Esperar y afirmar `Alice`, el contador y la pantalla de reporte, además de verificar una sola llamada de autenticación y el email normalizado.
3. El test de conflicto con remoto `0` debe afirmar que la sobrescritura llama `setResolvedCount` con el valor local y la **revisión remota 2**. Añadir el camino «Adoptar valor remoto» y comprobar contador/revisión antes del guardado siguiente.
4. La prueba real de respuesta perdida en `concurrent_test.js` es válida: confirma escritura, reintento conflictivo y fila final en revisión 3 con total 25. Mantenerla.
5. Preparar CI para un clon limpio. El build cliente necesita valores válidos para `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; hoy solo se define `SUPABASE_SERVICE_ROLE_KEY` y el equipo local oculta el problema mediante `.env.local`. Definir valores de prueba no secretos en el workflow o iniciar Supabase antes del build y obtenerlos. Ejecutar también `npm run test:gateway` en CI.
6. Actualizar `.env.example`: el cliente usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, mientras las rutas servidor usan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Documentar ambos conjuntos sin valores reales.
7. Probar el orden completo en un entorno limpio sin depender de `.env.local`: instalación, build, bundle test, lint, JS tests, Supabase, pgTAP, concurrencia, gateway y API. No afirmar que CI está probado solo por ejecutar el flujo en el checkout con variables locales.

No cambiar SQL/RLS, gateway funcional, catálogo ni estilos. Tras estos cambios, ejecutar todas las suites y entregar el diff sin commit para revisión de Codex.
