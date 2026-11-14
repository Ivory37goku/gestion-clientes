# Gestión Clientes

Aplicación independiente para organizar la actividad comercial y operativa de
una empresa. Este repositorio tiene su propia PWA, APK Android y aplicación para
Windows; no modifica ni comparte los datos de Control Laboral.

## Qué incluye

- Leads con embudo comercial, importe estimado, responsable y seguimiento.
- Clientes convertibles desde un lead y con varias obras asociadas.
- Obras con fechas, presupuesto, estado, avance y responsable.
- Tareas por obra o cliente, con prioridades y vencimientos.
- Agenda de visitas, citas, tareas y seguimientos.
- Presupuestos con IGIC que se pueden convertir en facturas.
- Facturas, vencimientos, pagos parciales y saldo pendiente.
- Gastos por obra, enlaces a documentos, equipo e informes.
- Copias JSON, exportación CSV, impresión/PDF y trabajo sin conexión.
- Sincronización opcional con una tabla propia de Supabase.

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

En Ajustes y equipo → Datos y nube, inicia sesión con una cuenta. Antes, ejecuta
supabase-setup.sql en SQL Editor de tu proyecto Supabase. La app utiliza
supabase-config.js y guarda todo en la tabla gestion_clientes, protegida por RLS.
La tabla, la clave de sesión y el almacenamiento local de Gestión Clientes son
independientes de Control Laboral.

Las invitaciones y confirmaciones de correo de Supabase dependen de las URL
permitidas en Authentication → URL Configuration. Añade la dirección de esta
PWA si quieres que esos correos vuelvan directamente a Gestión Clientes.
