# APK Android · Gestión Clientes

Proyecto Android independiente con su propio applicationId,
com.ivory37.gestionclientes. Abre esta carpeta en Android Studio y selecciona
Build → Build APK(s), o ejecuta .\gradlew.bat assembleDebug desde esta carpeta.

El APK de depuración aparece en
app/build/outputs/apk/debug/app-debug.apk. La acción de GitHub Android APK lo
genera también como artifact del repositorio.

La app mantiene los assets locales como respaldo offline y abre la PWA de
GitHub Pages cuando puede conectarse. Los backups JSON y CSV se guardan con el
selector de archivos de Android.
