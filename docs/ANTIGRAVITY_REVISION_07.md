# Revisión de la Orden 07 (`46d3454`)

Estado: **abierta por dos problemas de integridad de datos**. Pasaron `npm test` (28/28), `npm run lint` (sin advertencias) y `npm run build`. Las pruebas entregadas usan DOM simulado, no un navegador real. No se hizo push ni despliegue.

1. La identidad del override base es `base:modelo|nombre` (`src/data/store.js`). Al editar el nombre, `saveLocalProduct` calcula la identidad a partir del **nombre editado**: ya no coincide con la entrada base, crea un producto personalizado y deja visible el original. La prueba actual solo cambia `capacity`. Fijar una identidad estable e independiente de campos editables: por ejemplo, un `baseKey` derivado del índice/identificador canónico del JSON, almacenado con el override. Probar cambio de nombre de uno de los siete modelos `—` y de los dos `TRG1F`, recarga, reversión y conteo 42.
2. `getAllProducts()` migra con `[...legacy, ...loadArray('walkingpad_local_products')]` y, si `saveArray` responde `true`, borra la clave antigua. Si ambas claves ya contienen el mismo producto (por importación o migración interrumpida), duplica entradas en el nuevo array. Fusionar por identidad estable, conservar conflictos distintos sin sobrescribir y borrar la antigua solo tras confirmar la escritura y la lectura del resultado. Probar migración repetida y fallo de cuota.

La importación/exportación también usa una identidad distinta para productos locales (`id` o `modelo|nombre|categoría`), por lo que debe alinearse con la identidad estable de overrides antes de confiar en respaldos de productos editados.

Después de corregir, repetir pruebas, lint, build y abrir la app en un navegador real para alta, edición, recarga, reversión y respaldo. El servidor `localhost:3000` preexistente puede requerir reinicio para cargar `.env.local` y el código nuevo.
