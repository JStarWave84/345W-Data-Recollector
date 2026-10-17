/**
 * ¿La app se está corriendo en un teléfono o en una tablet?
 *
 * La respuesta decide qué se ofrece. En el móvil el coordinador captura y lee;
 * la exportación 345W y la planilla en papel siguen siendo tareas de escritorio,
 * así que sus accesos se ocultan en lugar de dejarlos fallar al tocarlos.
 *
 * ## Por qué el user agent y no el plugin `os`
 *
 * Tauri 2 movió la detección de plataforma a `@tauri-apps/plugin-os`, que esta
 * app no tiene. Agregarlo por un booleano significa un crate de Rust nuevo, un
 * permiso en `capabilities/default.json` y recompilar el binario entero.
 *
 * El user agent contesta lo mismo que importa acá, que es "pantalla angosta y
 * dedo": el WebView de Android y el de iOS se anuncian como `Android`, `iPhone`,
 * `iPad` o `iPod`, y una ventana de Tauri en Windows o macOS nunca lo hacen.
 *
 * Un efecto útil de esto: al probar con el navegador del teléfono, esta función
 * devuelve `true`, así que lo que se ve en la URL del dev server es exactamente
 * lo que va a ver el usuario en la app y no una versión recortada.
 *
 * ## El caso que sí miente
 *
 * Abrir un navegador de escritorio desde un celular reports `Android` y se
 * muestra la versión móvil. Es el comportamiento correcto para probar, pero
 * significa que esta función no sirve para preguntar "qué sistema operativo
 * tengo": para eso hay que usar `platform()` del plugin `os`. Si algún día hace
 * falta, el cambio se concentra en este archivo.
 */

/** `true` si el runtime actual es un WebView de Android o iOS. */
export const ES_MOVIL =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '')