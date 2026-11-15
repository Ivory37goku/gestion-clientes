# Gestión Clientes

Aplicación independiente para organizar la actividad comercial, las operaciones
y la postventa de una empresa. Este repositorio tiene su propia PWA, APK Android
y aplicación para Windows. Puede usar la misma cuenta de Supabase que Control
Laboral, pero conserva sus registros en una tabla separada.

## Qué incluye

- Leads con embudo comercial, importe estimado, responsable y seguimiento.
- Tableros Kanban para leads, tareas y obras, con cambio de fase desde cada tarjeta y alternativa en lista.
- Segmentación de leads, clientes y obras por isla canaria, heredada automáticamente al convertir contactos o crear visitas y proyectos relacionados.
- Flujo guiado de lead a cliente, obra, presupuesto y factura; acciones rápidas con el cliente y la obra ya vinculados.
- Clientes convertibles desde un lead y con varias obras asociadas.
- Obras con fechas, presupuesto, estado, avance y responsable.
- Tareas por obra o cliente, con prioridades y vencimientos.
- Mi día con navegación por fecha y resumen de tareas, visitas y seguimientos; incidencias, mantenimiento y checklists organizados sobre las tareas existentes.
- Agenda de visitas, citas, tareas y seguimientos.
- Panel operativo con alertas, actividad reciente, pipeline y accesos rápidos.
- Presupuestos detallados con horas, tarifas, desplazamientos y materiales; cálculo e impresión/PDF con IGIC.
- Facturas, vencimientos, pagos parciales y saldo pendiente.
- Gastos por obra, enlaces a documentos, equipo e informes.
- Copias JSON, exportación CSV, impresión/PDF y trabajo sin conexión.
- Sincronización opcional con `public.gestion_clientes`, una tabla propia y privada en el proyecto Supabase compartido.
- Buscador global con acceso directo a cada ficha, vista de prioridades y modos oscuro y claro.
- Identidad visual independiente con tonos verdes naturales y crema.

## PWA y GitHub Pages

El workflow de Pages publica la PWA en:

https://ivory37goku.github.io/gestion-clientes/

En GitHub, activa Pages en Settings → Pages y selecciona GitHub Actions como
fuente. Después de la primera publicación, abre esa dirección y añade la app a
la pantalla de inicio. La PWA guarda su interfaz para usarla sin conexión.

## APK Android

Abre android-app en Android Studio y compila con Build → Build APK(s), o ejecuta
el wrapper desde esa carpeta con .\gradlew.bat assembleDebug. Cada compilación
sincroniza primero los recursos web actuales con Android. El APK de depuración
queda en android-app/app/build/outputs/apk/debug/app-debug.apk. El workflow de
Android también publica ese APK como artifact en cada actualización de main.

El APK tiene su propio identificador Android y carga Gestión Clientes. Puede
abrir la versión publicada cuando está disponible y conserva los archivos locales
para seguir trabajando sin conexión.

## Windows

Con Node.js instalado, ejecuta npm install y npm run dist:win desde la raíz del
repositorio. Se generan un instalador y una versión portable en desktop-dist.
El workflow de Windows adjunta ambos EXE como artifacts de GitHub Actions.

## Sincronización en la nube

En Ajustes → Datos y nube, usa el mismo correo y contraseña que en Control
Laboral. Descarga el SQL de Gestión Clientes desde esa pantalla y ejecútalo una
vez en el Editor SQL del proyecto Supabase. Crea solamente
`public.gestion_clientes`, con acceso privado por usuario, y solicita recargar la
caché del esquema. No modifica `public.ivory37_sync` ni los datos de Control
Laboral. Las dos apps comparten el acceso y mantienen sus registros separados;
también siguen guardando cambios localmente si no hay conexión.

Las invitaciones y confirmaciones de correo de Supabase dependen de las URL
permitidas en Authentication → URL Configuration. Añade la dirección de esta
PWA si quieres que esos correos vuelvan directamente a Gestión Clientes.
