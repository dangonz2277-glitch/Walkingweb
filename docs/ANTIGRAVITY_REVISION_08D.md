# Revisión 08D al reanudar (15-09-2026)

Estado: **Orden 08 abierta**. No hacer push ni despliegue.

Codex ejecutó en esta raíz: build correcto; Vitest 57/57; lint sin advertencias; `git diff --check` limpio; pgTAP 48/48; concurrencia 5/5; API HTTP con Alice/Bob y limpieza correcta; gateway correcto. En navegador real `http://localhost:3000`, Mi Reporte abre, Escape lo cierra y el foco vuelve al botón. Los fallos iniciales de conexión a PostgreSQL fueron del sandbox; las suites pasaron con acceso al Supabase local.

## Bloqueos de cierre descubiertos

1. `src/tests/ReportPopup.test.jsx` volvió a su versión de **cinco pruebas antiguas**. El diff actual solo elimina imports. No hay aserciones de login exitoso, doble submit, logout fallido, error de historial, conflicto con 0, sobrescritura, conservación de borrador ni consulta perezosa. Los resultados 57/57 no demuestran esas funciones. Recuperar e implementar pruebas significativas sin basarse en nombres de test.
2. `src/tests/reportRepository.test.js` llama «respuesta perdida después del guardado» a dos mocks RPC sucesivos, pero no confirma una escritura ni relee el estado final. El escenario debe ejecutarse contra PostgreSQL local, o una prueba de contrato con estado que simule una fila confirmada, pierda solo la respuesta y demuestre revisión y total inalterados tras reintento.
3. `src/tests/bundle.test.js` exige `.next/static`, pero `.github/workflows/ci.yml` ejecuta `npm test` **antes** de `npm run build`. Un clon limpio de CI fallará. Crear un comando específico posterior al build o reordenar el workflow; probarlo en un entorno sin `.next` previo. La prueba debe usar un secreto de prueba definido para el build y no depender exclusivamente de `.env.local` del desarrollador.
4. El popup se abre y cierra bien con teclado en escritorio. Aún falta verificar vista móvil y un login/guardado real tras la última entrega 08C. La prueba real de dos perfiles de la revisión anterior fue antes de esos cambios.

Mantener todos los cambios locales; `HEAD` sigue en `41c0930`. Corregir solo los bloqueos anteriores y actualizar el plan. Ejecutar las suites completas y reportar resultados exactos. No modificar RLS/SQL, gateway o catálogo salvo defecto demostrado.
