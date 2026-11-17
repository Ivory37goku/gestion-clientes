# Auditoría local · Gestión Clientes 1.0.24

**Fecha:** 17 de noviembre de 2026
**Estado:** versión 1.0.24 aprobada para publicación en GitHub. La migración y las Edge Functions de Supabase siguen sin desplegarse.

## Trabajo revisado

- CRM de leads, clientes, obras, tareas y datos relacionados.
- Presupuestos, desglose fotovoltaico, costes internos, IGIC y exportación de materiales.
- Copias JSON, validación de restauraciones y sincronización con detección de conflictos.
- Aplicaciones Android y Windows y recursos web incluidos en ambos paquetes.
- Configuración local de Supabase y nueva función para enlaces revocables de presupuestos.

## Correcciones y comprobaciones

- La lista CSV de materiales y el informe ahora esperan el resultado real del guardado antes de confirmar que se descargaron.
- La restauración de copias valida la estructura y los identificadores, informa cuántos registros reemplazará y exige guardar una copia previa.
- Los cambios simultáneos del mismo registro conservan las dos versiones para que se pueda elegir cuál queda; también se detecta ese conflicto al vincular por primera vez la nube.
- Los totales financieros separan base, IGIC, total facturado, cobros y gastos registrados. La diferencia con gastos se marca como orientativa.
- La importación de costes de proveedor interpreta el IGIC por fila y evita descontarlo de nuevo cuando el archivo indica que el precio ya es neto.
- El catálogo contiene **111 partidas base**; admite partidas propias y artículos importados. Incluye cuadros AC fotovoltaicos premontados monofásicos y trifásicos, con referencias de 25 A y 32 A.
- La ubicación parte de la dirección y evita inventar el centro de una isla cuando no encuentra una coincidencia. Las coincidencias aproximadas se identifican para revisión.
- El nuevo enlace seguro de presupuesto expone campos permitidos, excluye notas internas y costes, almacena el hash del token y permite caducar o revocar el enlace.
- El proceso de guardado de la app de Windows recupera el almacenamiento válido si detecta que el dato principal local está dañado.
- El README se actualizó con capturas de marca y propuesta, instalación, compilación y límites de funcionamiento.

## Resultados de validación local

- `npm test`: **8 pruebas aprobadas, 0 fallidas**.
- `npm audit`: **0 vulnerabilidades**.
- `node --check`: `app.js`, `core.js` y `desktop/preload.cjs` sin errores de sintaxis.
- La Edge Function se empaquetó con esbuild para comprobar sintaxis; el entorno no tiene Deno para una comprobación de tipos nativa.
- Android `assembleDebug`: correcto. El APK está firmado para depuración y verificado con `apksigner`; declara versión 1.0.24 y contiene los recursos web actualizados.
- Windows portable x64: empaquetado correcto; el archivo ASAR contiene `app.js`, `core.js`, `index.html` y `cliente.html`.
- `git diff --check`: correcto. Solo muestra avisos de conversión de finales de línea de Git en Windows.

## Pendiente antes de publicar

1. **Sincronización y enlaces compartidos:** el SQL y la Edge Function están preparados en el repositorio, pero no se ejecutaron ni desplegaron en Supabase. El enlace revocable requiere aplicar la migración y desplegar `quote-share`.
2. **PVGIS automático:** la geolocalización intenta resolver la dirección sin pedir coordenadas manuales, pero el navegador no puede leer directamente la API de PVGIS por CORS. El cálculo sigue necesitando importar el resultado hasta disponer de un intermediario desplegado.
3. **Coste real de Coelca:** los precios negociados de cada empresa no están disponibles públicamente. El catálogo base incluye referencias de precio de venta y coste de mano de obra de referencia; el coste de compra real se incorpora al importar la tarifa o factura de Coelca. Los precios de tiendas públicas no se presentan como coste Coelca.
4. **Prueba integrada:** no se probó la sincronización contra la instancia real ni un recorrido manual completo en Android y Windows; esta auditoría no altera datos de la nube.
5. **Firma de distribución:** el APK es de depuración; el ejecutable de Windows no se firmó con certificado de publicación.

## Artefactos locales de revisión

- APK de depuración: `android-app/app/build/outputs/apk/debug/app-debug.apk`.
- Aplicación portable Windows: `tmp/audit-dist-1.0.24/Gestión Clientes 1.0.24.exe`.

La APK se incluye en `downloads/` para descarga directa desde GitHub Pages. El instalador portable de Windows se genera mediante el workflow y queda disponible como artefacto de GitHub Actions. No se aplicaron cambios en la base de datos ni se desplegaron funciones en Supabase.
