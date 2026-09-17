# Plan de acción UI/UX del frontend

## Estado

- **Fase actual:** auditoría UI/UX y preparación de órdenes de implementación.
- **Implementación:** iniciada por autorización del propietario; primera entrega de fundamentos visuales disponible localmente.
- **Backend:** cerrado, desplegado y validado según `docs/PREVIEW_READINESS.md`.
- **Auditoría y ruta:** aprobadas por el propietario del proyecto el 17 de septiembre de 2026.
- **Autorización vigente:** Codex diseña, implementa y verifica el frontend por etapas; Antigravity queda como apoyo opcional.
- **Restricción vigente:** conservar el backend y los contratos funcionales; commits, push y despliegues requieren autorización.
- **Estado Git al iniciar la fase:** `main`, con este documento sin seguimiento y sin otros cambios visibles.

## Mandato operativo de la fase UI/UX

- No modificar Supabase, migraciones, RLS, autenticación, gateway, variables de entorno, Vercel, scripts administrativos ni persistencia remota.
- No adaptar funciones existentes por una preferencia meramente visual.
- Mantener los 42 productos y todos los flujos funcionales actuales.
- No guardar reportes ni modificar usuarios durante las revisiones visuales.
- Codex actuará como responsable de diseño, implementación, criterios de aceptación y revisión.
- Antigravity podrá apoyar con tareas acotadas cuando el propietario lo solicite.
- No agregar este documento a Git, hacer commits, push o despliegues sin una orden posterior expresa.

## Dirección visual acordada

El frontend utilizará **Minimalismo Inmersivo** como lenguaje principal y **glassmorphism moderado** como recurso de profundidad para elementos elevados, popups y capas de enfoque.

El glassmorphism no se aplicará indiscriminadamente. Las superficies con contenido importante deberán conservar suficiente solidez y contraste para garantizar legibilidad, accesibilidad y una jerarquía visual clara.

### Principios visuales vinculantes

- **Minimalismo inmersivo:** jerarquía clara, espacios generosos, pocos elementos simultáneos y énfasis en la tarea activa.
- **Glassmorphism funcional:** transparencias, desenfoque y reflejos sutiles se reservarán para navegación, controles elevados, popups y estados de enfoque.
- **Contenido legible:** especificaciones, errores, formularios y reportes usarán superficies suficientemente sólidas; la estética nunca deberá competir con la lectura.
- **Profundidad coherente:** cada capa tendrá una función reconocible mediante elevación, borde, sombra, opacidad y desenfoque consistentes.
- **Belleza con propósito:** toda decisión ornamental deberá reforzar orientación, prioridad, estado o interacción.
- **Movimiento contenido:** las animaciones comunicarán continuidad y relación espacial, respetando `prefers-reduced-motion`.
- **Responsive real:** la composición se adaptará, no se limitará a reducir tamaños; móvil priorizará controles táctiles, lectura y popups de pantalla completa cuando corresponda.
- **Consistencia:** las mismas reglas se aplicarán al acceso, catálogo, cards, Guía, Mi Reporte, Ajustes y formularios.

### Límites estéticos

- No usar transparencias sobre texto técnico extenso si reducen el contraste.
- No acumular múltiples capas borrosas o sombras intensas.
- No convertir cada card en vidrio; las cards del catálogo deben conservar claridad y escaneabilidad.
- No ocultar acciones esenciales solo para lograr una apariencia más limpia.
- No introducir animaciones decorativas continuas ni efectos que distraigan.
- No sacrificar rendimiento, teclado, zoom o reducción de movimiento por efectos visuales.

## Objetivos principales

- Pulir la experiencia visual una vez finalizada la fase de backend.
- Construir un sistema coherente de componentes, capas y animaciones.
- Permitir que las cards de modelos se expandan más allá de su tamaño inicial.
- Presentar “Mi reporte” y “Guía” como popups enfocados.
- Desenfocar y atenuar el fondo mientras haya una experiencia superpuesta activa.
- Mantener una experiencia accesible, responsive y consistente.

## Fase 1 — Auditoría del frontend actual

- Revisar pantallas, navegación y componentes existentes.
- Identificar inconsistencias visuales y de interacción.
- Revisar responsive, accesibilidad y jerarquía de contenido.
- Inventariar cards, modales, botones, formularios y estados.
- Definir qué elementos se mantienen, rediseñan o simplifican.

**Entregable:** diagnóstico priorizado del frontend actual.

### Convalidación inicial — 17 de septiembre de 2026

La auditoría se realizó sobre el código actual y `http://localhost:3000`. Producción redirige a una pantalla de acceso protegida; se revisó esa pantalla sin introducir credenciales. La interfaz interna de producción no se manipuló y no se modificaron datos remotos.

#### Aspectos ya existentes y aprovechables

- El catálogo renderiza los 42 productos y conserva búsqueda y filtros por categoría.
- “Guía”, “Mi Reporte”, “Ajustes” y el formulario de producto ya utilizan un componente compartido basado en `dialog` nativo.
- El modal actual bloquea el scroll del fondo, permite cierre con `Esc` y devuelve el foco al activador.
- Los controles principales tienen etiquetas accesibles y los estados de carga, error, éxito y conflicto de “Mi Reporte” ya están representados funcionalmente.
- Los detalles y problemas usan elementos desplegables nativos, una buena base para teclado y lectores de pantalla.

#### Hallazgos prioritarios

1. **Las cards no cumplen todavía la interacción objetivo.** Se expanden dentro de su columna original; la columna queda muy alta y estrecha mientras el resto de la cuadrícula permanece igual. Deben convertirse en un panel contextual amplio o popup, conservando el origen visual de la card.
2. **No existe sistema visual.** La interfaz depende de Arial, blanco, negro y gris con medidas dispersas. No hay tokens de color, tipografía, espaciado, elevación, radios o movimiento.
3. **Los popups son funcionales pero no inmersivos.** Comparten un máximo de 500 px, no usan desenfoque de fondo, no tienen animación y aplican la misma geometría a contenidos muy diferentes.
4. **“Guía” necesita más espacio y mejor navegación interna.** Su volumen de contenido queda comprimido en un modal angosto. Conviene conservar buscador y acordeones, añadir índice o navegación por secciones y evitar imponer un flujo secuencial obligatorio.
5. **“Mi Reporte” requiere una geometría propia.** El acceso puede ser compacto, pero el reporte autenticado necesita un modal más amplio, una jerarquía clara entre captura e historial y estados visuales consistentes.
6. **El responsive actual es parcial.** Hay reglas puntuales para enlaces, tabs y conflictos, pero no una estrategia completa para navegación, cards expandidas, modales, encabezados, formularios y áreas táctiles.
7. **La pantalla de acceso está desconectada del producto.** Usa estilos inline, no comparte lenguaje visual con el catálogo y ofrece poco contexto o retroalimentación visible.
8. **Los estilos globales son demasiado amplios.** Selectores como `header`, `details`, `label`, `button` y `.active` pueden producir efectos cruzados en popups y componentes internos.
9. **Faltan estados visuales completos.** Hay hover básico, pero no un sistema uniforme para `focus-visible`, pressed, disabled, loading, empty, success, warning y error.
10. **La nomenclatura y el contenido mezclan idiomas.** Existen categorías, especificaciones y errores en inglés dentro de una interfaz principalmente española; debe definirse qué se traduce y qué permanece como término técnico.

#### Riesgos que deben preservarse durante el rediseño

- No alterar búsqueda, filtros, identidad de productos ni los 42 registros base.
- No romper creación, edición, reversión, eliminación e importación/exportación local.
- No modificar autenticación, sesión, guardado remoto, historial ni resolución de conflictos del reporte.
- Mantener navegación por teclado, cierre con `Esc`, bloqueo de scroll y retorno de foco.
- Evitar que el glassmorphism reduzca contraste o legibilidad en contenido técnico extenso.

## Fase 2 — Fundamentos visuales

Definir:

- Paleta y niveles de contraste.
- Tipografía y jerarquías.
- Escala de espaciado.
- Bordes, radios y sombras.
- Superficies sólidas y translúcidas.
- Intensidad de desenfoque.
- Estados de reposo, hover, foco, activo y deshabilitado.

**Entregable:** dirección visual y reglas iniciales del sistema de diseño.

## Fase 3 — Sistema de capas y profundidad

La jerarquía compartida será:

`Interfaz base → fondo atenuado y desenfocado → popup → contenido y acciones`

Se definirán:

- Intensidad del oscurecimiento y desenfoque.
- Separación visual entre fondo y popup.
- Márgenes de seguridad respecto a la pantalla.
- Scroll interno y bloqueo del scroll exterior.
- Orden de superposición.
- Comportamiento cuando ya existe otro popup abierto.
- Adaptación para escritorio, tablet y móvil.

Solo deberá existir una capa principal abierta a la vez. Si una acción requiere confirmación, se utilizará un diálogo secundario pequeño y controlado, evitando cadenas profundas de modales.

**Entregable:** patrón único para las experiencias superpuestas.

## Fase 4 — Cards expandibles de modelos

Flujo esperado:

1. El usuario selecciona una card.
2. La card se eleva y se expande desde su posición original.
3. Aumenta su ancho y altura sin perder continuidad visual.
4. El fondo se desenfoca y atenúa.
5. Se muestran la información detallada y las acciones del modelo.
6. Al cerrar, el panel regresa visualmente a su card de origen.

Se contemplarán:

- Transición aproximada de 250–350 ms.
- Cierre mediante botón, clic exterior y tecla `Esc`.
- Scroll interno para contenido extenso.
- Indicadores claros de selección y apertura.
- Estados de carga, vacío y error.
- Vista casi completa o completa en móvil.
- Traslado del foco al panel abierto y retorno a la card original al cerrar.

**Entregable:** especificación funcional y visual de la card expandible.

## Fase 5 — Popup de “Mi reporte”

Se diseñará como un modal amplio orientado a lectura y análisis:

- Encabezado con título, contexto y cierre.
- Área central desplazable.
- Acciones principales claramente separadas.
- Encabezado o pie fijo si las acciones deben permanecer visibles.
- Presentación adecuada de secciones, métricas y resultados.
- Estados de generación, carga, error y reporte vacío.
- Formato de pantalla completa en dispositivos pequeños cuando sea necesario.

**Entregable:** estructura y comportamiento del popup de reporte.

## Fase 6 — Popup de “Guía”

Se diseñará como una base de conocimiento enfocada y fácil de consultar:

- Buscador siempre visible y fácil de alcanzar.
- Organización por secciones y acordeones.
- Índice o navegación interna para saltar entre temas.
- Resaltado y estado vacío al buscar.
- Posibilidad de cerrar sin perder el contexto del catálogo.
- Modal amplio en escritorio y pantalla completa en móvil.
- Un recorrido secuencial será opcional y solo se añadirá si responde a una necesidad de capacitación validada.

**Entregable:** flujo completo de ayuda y orientación.

## Fase 7 — Movimiento e interacción

Crear reglas compartidas para:

- Apertura y cierre.
- Expansión y contracción.
- Opacidad y desenfoque.
- Estados hover y pulsación.
- Duración y curvas de animación.
- Prevención de saltos visuales.
- Preferencia del sistema para reducir movimiento.

Las animaciones deberán comunicar continuidad y jerarquía sin ralentizar las tareas.

**Entregable:** guía de movimiento aplicable a cards y modales.

## Fase 8 — Accesibilidad y responsive

Validar:

- Contraste suficiente detrás de transparencias.
- Navegación completa mediante teclado.
- Foco visible y contenido dentro del popup.
- Etiquetas comprensibles para lectores de pantalla.
- Objetivos táctiles adecuados.
- Cierre predecible.
- Lectura correcta con zoom.
- Bloqueo de la interacción con el fondo.
- Comportamiento en pantallas pequeñas y con contenido extenso.

**Entregable:** criterios de aceptación accesibles y multidispositivo.

## Fase 9 — Prototipo y validación

Prototipar los recorridos prioritarios:

- Abrir y cerrar una card de modelo.
- Consultar “Mi reporte”.
- Recorrer la “Guía”.
- Cambiar entre tamaños de pantalla.
- Probar teclado, scroll y reducción de movimiento.

Después se ajustarán dimensiones, ritmo, jerarquía y claridad según los resultados.

**Entregable:** prototipo validado antes de implementar.

## Orden sugerido de implementación

1. Corregir la base responsive, aislar estilos globales y establecer tokens visuales mínimos.
2. Rediseñar la estructura general: encabezado, navegación, búsqueda, filtros y estados de foco.
3. Construir el sistema compartido de fondo, capas y popup sin alterar la lógica funcional.
4. Implementar la card expandible de modelos sobre ese sistema.
5. Adaptar “Guía”, “Mi Reporte”, “Ajustes” y el formulario de producto con variantes apropiadas.
6. Integrar movimiento, reducción de movimiento y refinamiento de profundidad.
7. Validar responsive, teclado, lectores de pantalla, contraste y regresiones funcionales.
8. Revisar localmente, comparar con producción y preparar el despliegue solo cuando sea autorizado.

## Criterio para proceder con la primera implementación

La condición del backend ya está satisfecha. La primera implementación comenzará únicamente después de:

1. ~~Aprobar esta auditoría y el orden revisado.~~ Completado el 17 de septiembre de 2026.
2. Resolver las decisiones visuales mínimas de la primera etapa.
3. Aprobar la primera orden acotada para Antigravity.
