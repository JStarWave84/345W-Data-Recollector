mod planilla;

use std::fs;
use std::path::PathBuf;

/// Escribe un archivo binario en la ruta elegida por el dialogo de guardado.
///
/// En Tauri v2 el webview no puede escribir en disco, asi que el .xlsx se arma
/// en memoria en el frontend y se pasa aca. Los comandos propios de la app no
/// pasan por el ACL de capabilities (ese solo gobierna los comandos de los
/// plugins), por eso este no hay que declararlo en capabilities/default.json.
#[tauri::command]
fn escribir_archivo(ruta: String, contenido: Vec<u8>) -> Result<(), String> {
    let path = PathBuf::from(&ruta);
    fs::write(&path, contenido)
        .map_err(|e| format!("No se pudo escribir {}: {e}", path.display()))
}

/// Arma la planilla de personas atendidas en A4 horizontal y devuelve los bytes.
///
/// El PDF se genera entero en memoria y lo escribe el frontend con
/// `escribir_archivo`, igual que el 345W: asi el usuario elige donde guardar y
/// el comando no necesita permisos de disco.
#[tauri::command]
fn generar_pdf_planilla(datos: planilla::DatosPlanilla) -> Result<Vec<u8>, String> {
    planilla::generar(&datos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // El GPS es opcional: los campos de latitud/longitud siempre se pueden
        // tipear a mano, asi que si el plugin falla la app sigue funcionando.
        .plugin(tauri_plugin_geolocation::init())
        .invoke_handler(tauri::generate_handler![escribir_archivo, generar_pdf_planilla])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
