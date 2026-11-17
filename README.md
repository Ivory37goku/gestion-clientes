# Gestión Clientes

CRM y panel de operaciones para gestionar leads, clientes, instalaciones, presupuestos y facturas desde una sola aplicación. Está pensado para el trabajo diario de una empresa instaladora, con herramientas específicas para proyectos fotovoltaicos y la operativa fiscal de Canarias.

Gestión Clientes es un proyecto independiente de **Control Laboral**. Puede compartir el acceso a Supabase, pero guarda sus registros en `public.gestion_clientes`, separado de los datos de la otra aplicación.

## Vista general

### Identidad de empresa

Personaliza el nombre visible, la línea descriptiva, los colores, las iniciales y la forma del icono. Puedes subir el logo de tu empresa, revisar una vista previa y descargar un icono PNG de 512 × 512 px. La identidad se guarda en el dispositivo, se incluye en la copia JSON y se sincroniza con tu cuenta privada.

![Ajustes de marca, paletas e icono personalizado](screenshots/brand-settings.jpg)

### Presupuestos para tus clientes

Los nuevos enlaces de propuesta llevan un token aleatorio, caducan a los 90 días y se pueden revocar desde la ficha del presupuesto. La página abre sin cuenta y solo muestra las condiciones para el cliente; las notas internas y los costes quedan fuera. Para habilitar los enlaces hace falta aplicar el SQL y desplegar la Edge Function `quote-share` de la sección de sincronización.

Los enlaces antiguos con `#p=` llevan los datos dentro de la URL y no se pueden revocar. Si ya compartiste uno, deja de distribuirlo y crea un enlace nuevo cuando la función esté desplegada.

![Propuesta fotovoltaica de ejemplo con la identidad de empresa](screenshots/brand-proposal.jpg)

Las capturas usan datos ficticios para enseñar la interfaz.

## Funcionalidades

### CRM y clientes

- Embudo de leads con seguimiento, responsables, valor estimado e historial de llamadas, visitas, correos, WhatsApp y notas.
- Conversión guiada de lead a cliente y, si procede, creación de su primera obra vinculada.
- Fichas relacionadas de clientes, obras, presupuestos, facturas, documentos y tareas. Los cambios de contacto se propagan entre lead y cliente; las ubicaciones heredadas actualizan las obras y citas vinculadas, y los nombres generados se ajustan sin pisar títulos personalizados ni presupuestos aceptados.
- Al asociar una tarea, cita, documento o presupuesto a una obra, la app mantiene también el cliente correcto. Los cambios se guardan en el dispositivo y entran en la sincronización privada existente.
- Búsqueda global, filtros por isla y vistas de lista y tablero Kanban con movimiento de tarjetas.

### Obras y equipo

- Obras con estado, fechas, avance, responsable, presupuesto y ubicación.
- Dirección, isla y coordenadas heredadas entre el lead, el cliente y la obra para reducir la entrada repetida de datos. Si cambia la dirección o la isla, se descartan coordenadas antiguas no sustituidas para que el mapa y PVGIS localicen el sitio actualizado.
- Tareas, visitas, agenda, incidencias, mantenimiento y checklists conectados al trabajo.
- Acceso a la dirección y acciones rápidas para contactar al cliente.

### Instalaciones fotovoltaicas

- Estudio de producción solar por obra mediante PVGIS 5.3, con producción mensual y anual y rendimiento específico.
- Resultado solar incluido en el presupuesto y en la propuesta compartida cuando la obra tiene un estudio guardado.
- Catálogo de partidas fotovoltaicas con material, inversores, baterías, estructura, mano de obra, desplazamientos y legalización. Las cantidades y precios se pueden ajustar o guardar como tarifa propia.
- Lista interna de materiales por presupuesto y obra, agrupada por artículo, con cantidades, referencias y costes de compra disponibles; se descarga en CSV para preparar el material o hacer el pedido y no se muestra al cliente.
- Desglose de presupuesto con horas, trayectos, materiales, base imponible, IGIC y total. Se puede imprimir o guardar como PDF.
- Importación de la tarifa o factura de compra de Coelca en **Ajustes → Costes Coelca**. Los costes se guardan sin IGIC (la app puede descontarlo al importar), se reutilizan en partidas de presupuestos y permanecen separados del precio de venta.
- Cálculo visible por partida de venta, coste directo y beneficio bruto, además del resumen de margen del presupuesto. En Ajustes → Empresa puedes definir el coste horario real del oficial y ayudante; mientras esté vacío se usa la referencia CYPE indicada en pantalla. Los importes aceptan decimales; la app avisa si falta un coste y nunca incluye los costes internos en propuestas ni PDF para clientes.
- La tarifa profesional de Coelca depende de cada cuenta y no se inventa: importa el CSV de compra o usa la plantilla para cargarla una sola vez. Los precios públicos o referencias de mercado no sustituyen tu coste real negociado.

### Administración y marca

- Facturas, vencimientos, pagos parciales, cobros pendientes y gastos asociados a las obras.
- Informes separan base facturada, IGIC y total cobrado. La diferencia entre facturas y gastos se marca como orientativa, ya que el IGIC de gastos no se separa automáticamente.
- Exportación CSV secuencial para móvil, copias de seguridad JSON, restauración con validación y copia previa, y uso local sin conexión.
- Si dos dispositivos cambian el mismo registro, conserva las dos versiones y permite elegir cuál sincronizar.
- Modos oscuro y claro y personalización de la marca para la app, los documentos imprimibles y las propuestas de cliente.
- IGIC general de Canarias como tipo inicial; el porcentaje se puede modificar para cada operación.

## Descarga e instalación

La paleta, el icono y el logo están a mano en **Administración → Marca** (también en la pestaña **Marca** de Ajustes). El icono compacto se muestra en la barra lateral; el logo completo se conserva para presupuestos, facturas y propuestas.

| Plataforma | Descarga o acceso |
| --- | --- |
| Web / PWA | [Abrir Gestión Clientes](https://ivory37goku.github.io/gestion-clientes/) |
| Android | [Descargar APK Gestión Clientes 1.0.24](https://ivory37goku.github.io/gestion-clientes/downloads/gestion-clientes-1.0.24.apk) |
| Windows | [Abrir las compilaciones de Windows](https://github.com/Ivory37goku/gestion-clientes/actions/workflows/windows.yml) |

En Android, descarga el APK e instálalo desde el dispositivo. En Windows, abre la última ejecución correcta del workflow y descarga el artefacto `gestion-clientes-windows`, que contiene el instalador y la versión portable. La PWA también se puede añadir a la pantalla de inicio desde el navegador.

La app busca actualizaciones automáticamente y las aplica cuando no hay cambios pendientes en los formularios.

## Sincronización privada

En **Ajustes → Datos y nube**, inicia sesión con la misma cuenta que usas en Control Laboral. Ejecuta una vez el archivo SQL que proporciona la app para crear la tabla privada `public.gestion_clientes` en tu proyecto Supabase.

La tabla pertenece solo a Gestión Clientes. No sustituye ni modifica `public.ivory37_sync`. Si no hay conexión o no usas una cuenta, los datos siguen guardándose localmente y puedes moverlos mediante una copia JSON.

Para que las invitaciones y confirmaciones de Supabase regresen a la app, añade la dirección de GitHub Pages a **Authentication → URL Configuration** del proyecto.

### Enlaces de propuesta revocables

El archivo `supabase-setup.sql` y la migración `supabase/migrations/` crean `public.gestion_clientes_quote_shares` con RLS activado y sin permisos para `anon` ni `authenticated`. Solo la Edge Function utiliza `service_role`; el secreto se queda en Supabase y no está en la aplicación web. La función devuelve un presupuesto concreto solo si el token existe, no ha caducado y no se ha revocado. Las acciones de crear y revocar verifican la sesión del usuario y limitan a 30 enlaces activos por presupuesto.

Estos pasos son de despliegue y no se ejecutaron durante la auditoría local:

```powershell
npx supabase login
npx supabase link --project-ref <referencia-del-proyecto>
npx supabase db push
npx supabase functions deploy quote-share --project-ref <referencia-del-proyecto>
```

Usa el archivo SQL de **Ajustes → Datos y nube** o aplica la migración; no hace falta ejecutar ambos. Revisa los cambios y el proyecto destino antes de correr `db push`. La función se configura con `verify_jwt = false` para permitir la lectura pública por token, pero valida por sí misma el JWT de cualquier solicitud de administración.

### Alcance de cifras y ubicación

Los informes no sustituyen a una contabilidad: los gastos no guardan por separado su IGIC. Los precios de compra y la tarifa Coelca deben venir del CSV/factura de la empresa. PVGIS usa la dirección mediante los geocodificadores disponibles; si la búsqueda no devuelve un punto, la app ya no inventa el centro de la isla. Las coincidencias aproximadas quedan marcadas en el presupuesto y deben revisarse en GRAFCAN. El servicio PVGIS responde con JSON, pero no permite lectura directa desde el navegador por CORS; por eso la importación del resultado sigue siendo manual hasta contar con un intermediario desplegado.

## Compilar desde el código

### PWA

Abre `index.html` con un servidor estático para desarrollo. El workflow de GitHub Pages publica la aplicación en [ivory37goku.github.io/gestion-clientes](https://ivory37goku.github.io/gestion-clientes/).

### APK Android

Con Java 17 y Android SDK disponibles, ejecuta desde `android-app`:

```powershell
.\gradlew.bat assembleDebug
```

Antes de compilar, Gradle sincroniza la versión web actual con los recursos de Android. El APK se genera en `android-app/app/build/outputs/apk/debug/app-debug.apk`.

### Windows

Con Node.js instalado, ejecuta desde la raíz:

```powershell
npm ci
npm run dist:win
```

El instalador NSIS y la aplicación portable se crean en `desktop-dist`. El workflow de Windows los publica como artefactos de cada compilación de `main`.

Las pruebas de regresión locales se ejecutan con `npm test`. `npm audit` comprueba también las dependencias de compilación; la dependencia vulnerable de `minimatch` se fija en una versión corregida mediante overrides limitados a Electron Builder.

## Estructura del proyecto

| Ruta | Contenido |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | Aplicación web y PWA |
| `core.js` | Validación de copias, fechas, importación fiscal y sincronización |
| `cliente.html` | Página pública de las propuestas compartidas |
| `supabase-config.js` | Configuración de conexión a Supabase; no contiene contraseñas de usuarios |
| `android-app/` | Contenedor Android y proceso de sincronización de recursos web |
| `desktop/` | Aplicación Windows con Electron |
| `supabase/functions/quote-share/` | Backend de enlaces revocables para presupuestos |
| `supabase/migrations/` | Migración aditiva de la tabla de enlaces |
| `downloads/` | APK Android de descarga directa |
| `screenshots/` | Capturas reales de la interfaz incluidas en este README |
| `.github/workflows/` | Publicación de Pages y compilaciones Android y Windows |

## Tecnologías

PWA con HTML, CSS y JavaScript, almacenamiento local, service worker y sincronización opcional mediante Supabase. Android se empaqueta con WebView y la aplicación de escritorio con Electron.
