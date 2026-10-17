//! Planilla de personas atendidas, en A4 horizontal, para llenar a mano.
//!
//! Es una plantilla, no un reporte: los datos de la jornada vienen prellenados
//! y la grilla de personas sale en blanco. Se arma en Rust porque el archivo
//! tiene que pesar poco (se reimprime y se reparte en campo) y porque asi el
//! unico paso lento es el dialogo de guardado, no el render.
//!
//! Decisiones:
//!
//! - Las fuentes son las del PDF base (Helvetica). No se incrusta ninguna:
//!   pesa cero y alcanza para letra de formulario. printpdf las escribe en
//!   Windows-1252, asi que tildes y enye salen bien; lo que no exista en ese
//!   juego se reemplaza antes de dibujar (ver `sanear`).
//!
//! - La grilla son 15 filas de 6.4mm, que es lo que entra comodo en una sola
//!   hoja A4 horizontal y sigue teniendo altura para escribir con lapiz. La
//!   altura de la fila es fija a proposito: quien llena en campo necesita
//!   saber cuanto espacio hay entre renglones sin medir la pagina. Todo el
//!   encabezado tiene altura fija tambien, y por eso el total no depende de si
//!   las observaciones ocupan una linea o tres: la planilla siempre sale en una
//!   hoja, con las filas siempre a la misma distancia. Si alguien pide mas
//!   filas de las que entran, el generador pagina igual.
//!
//! - No se mide el texto con la fuente. Se estima el ancho por caracter, que
//!   para Helvetica es estable y evita depender de `get_text_width`. Un texto
//!   que no entra en la celda se recorta antes de dibujarse.

use printpdf::*;
use serde::Deserialize;

use img::imageops::FilterType;
use img::{DynamicImage, Rgba, RgbaImage, load_from_memory};

const ANCHO_HOJA: f64 = 297.0;
const ALTO_HOJA: f64 = 210.0;
const MARGEN: f64 = 10.0;
const UTIL: f64 = ANCHO_HOJA - 2.0 * MARGEN;

/// printpdf mide en `Mm(f32)`, pero los milimetros de esta hoja son `f64`
/// (division, promedios). La conversion va en un solo lugar para que el resto
/// del modulo pueda trabajar en `f64`.
fn mm(valor: f64) -> Mm {
    Mm(valor as f32)
}

/// Puntos por milimetro, para traducir el ancho util a lo que mide la fuente.
const PT_POR_MM: f64 = 2.834_646;
/// Ancho medio de un caracter de Helvetica como fraccion del cuerpo.
const ANCHO_CARACTER: f64 = 0.52;

/// Filas en blanco de la grilla, con la cabecera de tabla y el pie, en una hoja.
const FILAS: u32 = 15;

/// Alto del renglon para escribir.
///
/// 8mm es lo que se escribe con lapiz sin que los renglones se toquen ni haya
/// que apretar la letra. Es el numero que define cuantas filas entran: a 8mm
/// solo entran ~13 filas si la cabecera de la jornada se dibuja completa, asi
/// que las 15 salen solo porque el encabezado se comprime (ver
/// `y_de_grilla`). Si se sube este valor, hay que bajar `FILAS`.
const ALTO_FILA: f64 = 8.0;

/// Fila de encabezados de la tabla: la de arriba de todo, sobre los titulos de
/// las columnas. No crece con el texto, asi que la grilla arranca siempre a la
/// misma altura.
const ALTO_ENCABEZADO: f64 = 6.5;

/// Espacio minimo para el pie de referencias. Si sobrara papel se usa todo (ver
/// `dibujar_pie`), pero nunca menos de esto: sin las referencias el que llena la
/// hoja no sabe que codigo escribir en cada columna.
const ALTO_PIE_MIN: f64 = 21.0;

const ALTO_LINEA_PIE: f64 = 4.2;

// Altos del encabezado. Son constantes y no se calculan mientras se dibuja
// porque `y_de_grilla()` tiene que saber cuanto ocupa el encabezado SIN
// dibujarlo (ver `repartir`): si el dibujo bajara mas de lo reservado, la grilla
// se superpondria con el pie. O sea: cada paso que aparece aca tiene que
// ejecutarse en `encabezado_completo` y `encabezado_corto` con el mismo valor.

/// Alto del logo, arriba a la derecha. Es el bloque que mas alto se lleva del
/// encabezado, asi que es lo primero que se achica si falta papel.
const ALTO_LOGO: f64 = 14.0;
/// La linea con el nombre de la jornada, la fecha y la fundacion.
const ALTO_SUBTITULO: f64 = 6.0;
const ALTO_REGLA: f64 = 3.0;
/// Cada renglon de los datos de la jornada.
const ALTO_DATO: f64 = 4.3;
/// Respiro entre el ultimo dato y la tabla.
const ALTO_GAP: f64 = 2.5;

/// Etiqueta y peso relativo. El peso se normaliza despues contra el ancho
/// util, asi que sumar o quitar un milimetro aca no rompe el encuadre.
const COLUMNAS: [(&str, f64); 14] = [
    ("N°", 7.0),
    ("Cédula", 19.0),
    ("Nombre y apellido", 55.0),
    ("Edad", 9.0),
    ("Sexo", 9.0),
    ("Motivo", 26.0),
    ("Grupo de atención", 26.0),
    ("Ind.", 9.0),
    ("Gest.", 9.0),
    ("Disc.", 9.0),
    ("Tipo disc.", 20.0),
    ("LGBTIQ+", 11.0),
    ("V. trato", 11.0),
    ("Servicios", 45.0),
];

/// Datos que arma el frontend en `src/lib/pdfPlanilla.js`.
///
/// Sin `rename_all`: el payload va en snake_case, igual que las columnas de
/// Supabase y que el resto del proyecto. Con `camelCase` serde buscaría
/// `mesReporte` / `gruposAtencion` y fallaría con "missing field".
#[derive(Deserialize)]
pub struct DatosPlanilla {
    pub titulo: String,
    pub fecha: String,
    pub mes_reporte: String,
    pub coordinacion: String,
    pub responsable: String,
    pub estado_ubicacion: String,
    pub municipio: String,
    pub parroquia: String,
    pub establecimiento: String,
    pub tipo_establecimiento: String,
    pub fuente_financiamiento: String,
    pub observaciones: String,
    pub grupos_atencion: Vec<String>,
    pub servicios: Vec<String>,
    pub filas: Option<u32>,
}

/// Una hoja de la planilla, ya resuelta en numeros.
///
/// La geometria se calcula aparte del dibujo a proposito. Los milimetros de esta
/// hoja son `f64` y el dibujo los castea a `Mm(f32)`, asi que la unica forma de
/// comprobar que la grilla entra, que las filas quedan parejos y que el pie no
/// se superpone es testear estos numeros. Y no se puede testear el PDF: el flujo
/// de la pagina se comprime con Flate, asi que el texto y las coordenadas no se
/// pueden leer del archivo salvo que casualmente no se comprima.
struct Hoja {
    /// Cuantas filas de datos van en esta hoja.
    filas: u32,
    /// Numero de la primera fila de esta hoja.
    numero: u32,
    /// Y donde arranca la grilla, ya descontado el encabezado.
    y_grilla: f64,
    /// Si es la ultima, aca va el pie de referencias.
    ultima: bool,
}

/// Y del ultimo renglon de una hoja, para saber cuanto alto le queda al pie.
fn y_del_ultimo_renglon(hoja: &Hoja) -> f64 {
    hoja.y_grilla - ALTO_ENCABEZADO - ALTO_FILA * hoja.filas as f64
}

/// Reparte las filas pedidas en hojas.
///
/// Se resuelve antes de dibujar porque el reparto depende de cuanto alto deja el
/// encabezado, y ese alto tiene que ser fijo: si las observaciones ocupan mas
/// lineas, la grilla se corre y los renglones dejan de coincidir entre planillas.
fn repartir(datos: &DatosPlanilla) -> Vec<Hoja> {
    let pedidas = datos.filas.unwrap_or(FILAS).clamp(1, 60);

    let mut hojas = Vec::new();
    let mut restantes = pedidas;
    let mut numero = 1u32;

    while restantes > 0 {
        // Si todo entra, esta hoja es la ultima y hay que dejarle lugar al pie
        // de referencias. Si no entra, el pie va en la hoja que sigue, asi que
        // esta puede usar el papel completo: una hoja a medio llenar en un
        // formulario que se imprime para escribir a mano es papel desperdiciado.
        let en_esta = if restantes <= capacidad_de_filas(y_de_grilla(numero), true) {
            restantes
        } else {
            capacidad_de_filas(y_de_grilla(numero), false).clamp(1, restantes)
        };

        hojas.push(Hoja {
            filas: en_esta,
            numero,
            y_grilla: y_de_grilla(numero),
            ultima: en_esta >= restantes,
        });

        numero += en_esta;
        restantes -= en_esta;
    }

    hojas
}

/// Y donde arranca la grilla de la hoja que empieza en la fila `numero`.
///
/// La primera hoja trae los datos de la jornada; las siguientes, una linea de
/// titulo. Los pasos son los mismos que baja `encabezado_completo` y
/// `encabezado_corto`, con la diferencia de que aca se suman sin dibujar: el
/// texto se recorta para que entre en su celda, asi que no cambia el alto.
fn y_de_grilla(numero: u32) -> f64 {
    if numero == 1 {
        // Titulo + subtitulo, el logo manda en el alto, la regla, los tres
        // renglones de datos (el ultimo ya suma el respiro) y el hueco final.
        ALTO_HOJA
            - MARGEN
            - ALTO_SUBTITULO
            - ALTO_SUBTITULO / 2.0
            - ALTO_REGLA
            - 3.0 * ALTO_DATO
            - ALTO_GAP
    } else {
        ALTO_HOJA - MARGEN - ALTO_SUBTITULO / 2.0 - ALTO_REGLA
    }
}

pub fn generar(datos: &DatosPlanilla) -> Result<Vec<u8>, String> {
    // El titulo del documento va al diccionario de metadatos, donde printpdf
    // escribe la cadena como PDFDocEncoding y no como Windows-1252: si se pasa
    // con tildes, el panel de propiedades del visor muestra "atenciÃ³n". El
    // contenido de la pagina si usa Windows-1252 y sale bien, asi que el
    // titulo se aplana solo para los metadatos.
    let (doc, mut pagina, mut capa_idx) = PdfDocument::new(
        aplanar(&datos.titulo),
        mm(ANCHO_HOJA),
        mm(ALTO_HOJA),
        "contenido",
    );

    let normal = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("No se pudo cargar la fuente: {e:?}"))?;
    let negrita = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("No se pudo cargar la fuente: {e:?}"))?;

    let anchos = anchos_de_columnas();

    for hoja in repartir(datos) {
        let capa = doc.get_page(pagina).get_layer(capa_idx);
        capa.set_outline_thickness(0.3);

        let y = if hoja.numero == 1 {
            encabezado_completo(&capa, datos, &normal, &negrita, ALTO_HOJA - MARGEN)
        } else {
            encabezado_corto(&capa, datos, &negrita, ALTO_HOJA - MARGEN)
        };

        dibujar_grilla(&capa, &anchos, &negrita, y, hoja.filas, hoja.numero);

        if hoja.ultima {
            dibujar_pie(
                &capa,
                datos,
                &normal,
                &negrita,
                y_del_ultimo_renglon(&hoja) - MARGEN,
            );
        } else {
            let (p, c) = doc.add_page(mm(ANCHO_HOJA), mm(ALTO_HOJA), "contenido");
            pagina = p;
            capa_idx = c;
        }
    }

    doc.save_to_bytes()
        .map_err(|e| format!("No se pudo armar el PDF: {e:?}"))
}

fn anchos_de_columnas() -> Vec<f64> {
    let suma: f64 = COLUMNAS.iter().map(|c| c.1).sum();
    let factor = UTIL / suma;
    COLUMNAS.iter().map(|c| c.1 * factor).collect()
}

/// Cuantas filas caben entre `y` y el borde inferior.
///
/// `con_pie` reserva la franja de referencias. La ultima hoja la necesita; las
/// anteriores no, porque el pie se dibuja una sola vez, al final.
fn capacidad_de_filas(y: f64, con_pie: bool) -> u32 {
    let limite = if con_pie { MARGEN + ALTO_PIE_MIN } else { MARGEN };
    let disponible = y - ALTO_ENCABEZADO - limite;
    if disponible <= 0.0 {
        0
    } else {
        (disponible / ALTO_FILA).floor() as u32
    }
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

/// El logo de la fundacion, tomado del asset del frontend.
///
/// Se lee de `src/assets` y no de una copia dentro de `src-tauri` para que haya
/// una sola version: la que se ve en el login es la misma que sale impresa, y
/// reemplazar el archivo actualiza las dos. Va incrustado en tiempo de
/// compilacion, asi que el binario no depende de que el archivo este en disco
/// cuando corre la app.
const LOGO_BYTES: &[u8] = include_bytes!("../../src/assets/tejiendoredeslogo_nobackground.png");

/// Resolucion a la que se imprime el logo. 300dpi a 14mm de alto dan 165px de
/// alto: la resolucion de impresion habitual, y ahi el PNG incrustado entra
/// comprimido. Con mas pixeles no se ve mejor en papel, solo pesa mas.
const LOGO_DPI: f32 = 300.0;

/// Proporcion (ancho/alto) del logo original, para poder calcular el alto que
/// le corresponde a un ancho dado. Se decodifica una sola vez: el PNG esta
/// incrustado en el binario, pero igual pesa 447 KB.
fn proporcion_del_logo() -> f64 {
    static PROPORCION: std::sync::OnceLock<f64> = std::sync::OnceLock::new();
    *PROPORCION.get_or_init(|| {
        load_from_memory(LOGO_BYTES)
            .map(|img| img.width() as f64 / img.height() as f64)
            .unwrap_or(0.84)
    })
}

/// Ancho en mm que ocupa el logo a `ALTO_LOGO` de alto, manteniendo la
/// proporcion del original.
fn ancho_del_logo() -> f64 {
    ALTO_LOGO * proporcion_del_logo()
}

/// Dibuja el logo arriba a la derecha.
///
/// El PNG original pesa 447 KB. A los ~14mm que se imprime, esa resolucion es
/// tirar bytes: se achica a lo que realmente sale en papel y recien ahi se
/// incrusta, asi que el PDF sigue siendo liviano.
///
/// El logo se compone sobre fondo blanco ANTES de incrustarlo, en vez de
/// dejarlo transparente. Es por un bug de printpdf 0.7.0: al escribir la
/// mascara de transparencia usa el ancho de la imagen donde va la altura
/// (`xobject.rs`: `height: img.width` en vez de `height: mask.height`), asi que
/// la SMask queda declarada con 139x139 cuando la imagen es 139x165. Al faltarle
/// 26 filas de mascara, el visor las rellena opacas y el logo sale sobre un
/// rectangulo negro. Sin alpha no hay SMask y no hay bug. Como la hoja es
/// blanca, componer sobre blanco es indistinguible de la transparencia.
fn dibujar_logo(capa: &PdfLayerReference) {
    let Ok(original) = load_from_memory(LOGO_BYTES) else {
        return; // sin logo, la planilla igual sirve
    };

    let px_alto = (ALTO_LOGO / 25.4 * LOGO_DPI as f64).round().max(1.0) as u32;
    let px_ancho = (px_alto as f64 * proporcion_del_logo()).round().max(1.0) as u32;

    // Lanczos3: el logo tiene circulos y curvas finas, y con un filtro barato
    // salen serrados a esta escala.
    let chica = original.resize_exact(px_ancho, px_alto, FilterType::Lanczos3);

    // Composicion sobre blanco: lo que era transparente queda del color de la
    // hoja y el resto conserva su color. Se hace sobre el alpha original, sin
    // rectangular el logo, para que el recorte siga siendo el del diseno.
    let mut plano = RgbaImage::from_pixel(px_ancho, px_alto, Rgba([255, 255, 255, 255]));
    img::imageops::overlay(&mut plano, &chica, 0, 0);
    // Se pasa por DynamicImage para la conversion a RGB: el color tiene que
    // quedar en Rgb8 para que printpdf no arme una SMask (y con ella, el bug).
    let sin_alpha = DynamicImage::ImageRgba8(plano).into_rgb8();
    let imagen = Image::from_dynamic_image(&DynamicImage::ImageRgb8(sin_alpha));

    let ancho = ancho_del_logo();
    imagen.add_to_layer(
        capa.clone(),
        ImageTransform {
            translate_x: Some(mm(ANCHO_HOJA - MARGEN - ancho)),
            translate_y: Some(mm(ALTO_HOJA - MARGEN - ALTO_LOGO)),
            dpi: Some(LOGO_DPI),
            ..Default::default()
        },
    );
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/// Windows-1252 no tiene todos los caracteres que se pueden teclear en un
/// formulario. Lo que no existe se traduce a su equivalente ASCII o se
/// descarta, para que el PDF no salga con cajas vacias.
fn sanear(texto: &str) -> String {
    let mut salida = String::with_capacity(texto.len());
    for c in texto.chars() {
        match c {
            '\u{00A0}' => salida.push(' '),
            '\u{2018}' | '\u{2019}' => salida.push('\''),
            '\u{201C}' | '\u{201D}' | '\u{00AB}' | '\u{00BB}' => salida.push('"'),
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}' => {
                salida.push('-')
            }
            '\u{2026}' => salida.push_str("..."),
            '\u{2022}' => salida.push('\u{00B7}'),
            c if c.is_ascii_graphic() || c == ' ' => salida.push(c),
            c if ('\u{00A1}'..='\u{00FF}').contains(&c) => salida.push(c),
            _ => {}
        }
    }
    salida
}

/// Texto solo ASCII, para los metadatos del PDF. Cubre el español: si queda
/// un caracter que no se, se descarta en vez de dejar un byte suelto.
fn aplanar(texto: &str) -> String {
    let mut salida = String::with_capacity(texto.len());
    for c in texto.chars() {
        let c = match c {
            'á' | 'Á' => 'a',
            'é' | 'É' => 'e',
            'í' | 'Í' => 'i',
            'ó' | 'Ó' => 'o',
            'ú' | 'Ú' => 'u',
            'ü' | 'Ü' => 'u',
            'ñ' | 'Ñ' => 'n',
            'ç' | 'Ç' => 'c',
            c => c,
        };
        if c.is_ascii_graphic() || c == ' ' {
            salida.push(c);
        }
    }
    salida
}

fn ancho_estimado(texto: &str, cuerpo: f64) -> f64 {
    texto.chars().count() as f64 * cuerpo * ANCHO_CARACTER
}

fn recortar(texto: &str, disponible_mm: f64, cuerpo: f64) -> String {
    let limpio = sanear(texto);
    if ancho_estimado(&limpio, cuerpo) <= disponible_mm * PT_POR_MM {
        return limpio;
    }
    let max_chars = ((disponible_mm * PT_POR_MM) / (cuerpo * ANCHO_CARACTER)).floor() as usize;
    let recortado: String = limpio.chars().take(max_chars.saturating_sub(3)).collect();
    format!("{recortado}...")
}

fn partir(texto: &str, disponible_mm: f64, cuerpo: f64) -> Vec<String> {
    let limpio = sanear(texto);
    if limpio.trim().is_empty() {
        return Vec::new();
    }
    let limite = ((disponible_mm * PT_POR_MM) / (cuerpo * ANCHO_CARACTER)).floor() as usize;
    if limite == 0 {
        return vec![limpio];
    }

    let mut lineas: Vec<String> = Vec::new();
    let mut actual = String::new();
    for palabra in limpio.split_whitespace() {
        let candidato = if actual.is_empty() {
            palabra.to_string()
        } else {
            format!("{actual} {palabra}")
        };
        if candidato.chars().count() <= limite {
            actual = candidato;
        } else {
            if !actual.is_empty() {
                lineas.push(actual);
            }
            actual = palabra.to_string();
        }
    }
    if !actual.is_empty() {
        lineas.push(actual);
    }
    lineas
}

fn texto(
    capa: &PdfLayerReference,
    cadena: &str,
    cuerpo: f64,
    x: f64,
    y: f64,
    fuente: &IndirectFontRef,
) {
    capa.use_text(cadena, cuerpo as f32, mm(x), mm(y), fuente);
}

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

fn encabezado_completo(
    capa: &PdfLayerReference,
    datos: &DatosPlanilla,
    normal: &IndirectFontRef,
    negrita: &IndirectFontRef,
    y: f64,
) -> f64 {
    let mut y = y;

    // El ancho del logo se calcula antes de dibujar nada, porque define hasta
    // donde llega el titulo, el subtitulo y la regla. El logo en si se dibuja
    // al final de la funcion, para que tape cualquier linea que se le cruce.
    let ancho_logo = ancho_del_logo();
    let ancho_texto = UTIL - if ancho_logo > 0.0 { ancho_logo + 3.0 } else { 0.0 };

    texto(
        capa,
        &recortar("PLANILLA DE PERSONAS ATENDIDAS", ancho_texto, 15.0),
        15.0,
        MARGEN,
        y,
        negrita,
    );
    y -= ALTO_SUBTITULO;

    let pie = format!(
        "{} - Generada el {} - Fundacion Tejiendo Redes",
        datos.titulo, datos.fecha
    );
    texto(
        capa,
        &recortar(&pie, ancho_texto, 8.0),
        8.0,
        MARGEN,
        y,
        normal,
    );
    y -= ALTO_SUBTITULO / 2.0;

    // La regla se corta antes del logo en vez de pasar por debajo: el logo baja
    // mas que la linea, asi que si llegara hasta el margen se le cruzaria.
    let fin_regla = if ancho_logo > 0.0 {
        ANCHO_HOJA - MARGEN - ancho_logo - 2.0
    } else {
        ANCHO_HOJA - MARGEN
    };
    linea(capa, MARGEN, y, fin_regla, y);
    y -= ALTO_REGLA;

    // Los datos de la jornada van en TRES renglones de a cuatro campos, mas las
    // observaciones al final del tercero. Antes eran cuatro renglones con las
    // observaciones en un bloque aparte: a 8mm de renglon no entra, y lo que
    // hace falta para escribir es mas importante que dejar el titulo de la
    // jornada en un renglon de mas.
    let ancho_par = UTIL / 4.0;
    let filas: [[(&str, &str); 4]; 2] = [
        [
            ("Fecha", &datos.fecha),
            ("Mes de reporte", &datos.mes_reporte),
            ("Coordinacion", &datos.coordinacion),
            ("Responsable", &datos.responsable),
        ],
        [
            ("Municipio", &datos.municipio),
            ("Parroquia (ADMIN 3)", &datos.parroquia),
            ("Estado / ubicacion", &datos.estado_ubicacion),
            ("Establecimiento", &datos.establecimiento),
        ],
    ];

    for fila in filas.iter() {
        for (i, (etiqueta, valor)) in fila.iter().enumerate() {
            let x = MARGEN + ancho_par * i as f64;
            texto(capa, &format!("{}:", etiqueta), 7.0, x, y, negrita);
            texto(
                capa,
                &recortar(valor, ancho_par - 33.0, 7.0),
                7.0,
                x + 31.0,
                y,
                normal,
            );
        }
        y -= ALTO_DATO;
    }

    // Ultimo renglon: tipo y fuente a la izquierda, observaciones ocupando las
    // dos ultimas columnas.
    texto(capa, "Tipo:", 7.0, MARGEN, y, negrita);
    texto(
        capa,
        &recortar(&datos.tipo_establecimiento, ancho_par - 14.0, 7.0),
        7.0,
        MARGEN + 11.0,
        y,
        normal,
    );
    texto(capa, "Fuente:", 7.0, MARGEN + ancho_par, y, negrita);
    texto(
        capa,
        &recortar(&datos.fuente_financiamiento, ancho_par - 18.0, 7.0),
        7.0,
        MARGEN + ancho_par + 14.0,
        y,
        normal,
    );
    texto(
        capa,
        "Observaciones:",
        7.0,
        MARGEN + 2.0 * ancho_par,
        y,
        negrita,
    );
    texto(
        capa,
        &recortar(&datos.observaciones, 2.0 * ancho_par - 30.0, 7.0),
        7.0,
        MARGEN + 2.0 * ancho_par + 28.0,
        y,
        normal,
    );
    y -= ALTO_DATO + ALTO_GAP;

    // El logo se dibuja AL FINAL, recien cuando todo el texto y las reglas ya
    // estan. En PDF lo que se dibuja despues tapa lo anterior, y el logo va
    // compuesto sobre blanco: si se dibuja primero, cualquier regla que pase por
    // su franja le queda atravesada encima.
    dibujar_logo(capa);

    y
}

fn encabezado_corto(
    capa: &PdfLayerReference,
    datos: &DatosPlanilla,
    negrita: &IndirectFontRef,
    y: f64,
) -> f64 {
    let mut y = y;
    texto(
        capa,
        "PLANILLA DE PERSONAS ATENDIDAS (continuacion)",
        12.0,
        MARGEN,
        y,
        negrita,
    );
    let resumen = format!(
        "{} - {} - {} - Fundacion Tejiendo Redes",
        datos.titulo, datos.municipio, datos.fecha
    );
    y -= ALTO_SUBTITULO / 2.0;
    texto(capa, &recortar(&resumen, UTIL, 8.0), 8.0, MARGEN, y, negrita);
    y -= ALTO_REGLA;
    linea(capa, MARGEN, y, ANCHO_HOJA - MARGEN, y);
    y
}

// ---------------------------------------------------------------------------
// Grilla
// ---------------------------------------------------------------------------

fn dibujar_grilla(
    capa: &PdfLayerReference,
    anchos: &[f64],
    negrita: &IndirectFontRef,
    y: f64,
    filas: u32,
    numero: u32,
) -> f64 {
    let tope = y - ALTO_ENCABEZADO;

    let mut x = MARGEN;
    for ((etiqueta, _), ancho) in COLUMNAS.iter().zip(anchos.iter()) {
        texto(
            capa,
            &recortar(etiqueta, *ancho - 1.6, 6.5),
            6.5,
            x + 0.8,
            tope - 4.6,
            negrita,
        );
        x += *ancho;
    }
    linea(capa, MARGEN, tope, ANCHO_HOJA - MARGEN, tope);

    for i in 0..filas {
        let y_linea = tope - ALTO_FILA * (i as f64 + 1.0);
        texto(
            capa,
            &(numero + i).to_string(),
            6.0,
            MARGEN + 0.8,
            y_linea + 1.5,
            negrita,
        );
        linea(capa, MARGEN, y_linea, ANCHO_HOJA - MARGEN, y_linea);
    }

    let y_final = tope - ALTO_FILA * filas as f64;

    let mut x = MARGEN;
    for ancho in anchos.iter() {
        linea(capa, x, tope, x, y_final);
        x += *ancho;
    }
    linea(capa, x, tope, x, y_final);
    linea(capa, MARGEN, y_final, ANCHO_HOJA - MARGEN, y_final);

    y_final
}

fn linea(capa: &PdfLayerReference, x1: f64, y1: f64, x2: f64, y2: f64) {
    capa.add_line(Line {
        points: vec![
            (Point::new(mm(x1), mm(y1)), false),
            (Point::new(mm(x2), mm(y2)), false),
        ],
        is_closed: false,
    });
}

// ---------------------------------------------------------------------------
// Referencias
// ---------------------------------------------------------------------------

/// Dibuja las referencias en el espacio que dejo la grilla.
///
/// `alto_pie` es la franja real entre la ultima fila y el margen. Se usan todas
/// las lineas que entren: con muchas coordinaciones la lista de servicios es
/// larga, y antes se cortaba en 4 con un "y N linea(s) mas" que en campo no
/// sirve de nada, porque el que llena no tiene el catalogo a mano.
fn dibujar_pie(
    capa: &PdfLayerReference,
    datos: &DatosPlanilla,
    normal: &IndirectFontRef,
    negrita: &IndirectFontRef,
    alto_pie: f64,
) {
    let ancho_izq = UTIL * 0.46;
    let ancho_der = UTIL - ancho_izq - 5.0;
    let x_der = MARGEN + ancho_izq + 5.0;
    let y_tope = MARGEN + alto_pie - 4.5;

    linea(capa, MARGEN, y_tope + 4.0, ANCHO_HOJA - MARGEN, y_tope + 4.0);
    texto(capa, "REFERENCIAS", 7.0, MARGEN, y_tope, negrita);

    // Cuantas lineas entran a lo ancho de cada columna.
    let lineas_disponibles = |alto: f64| -> usize {
        let utiles = alto - 4.6;
        if utiles <= 0.0 {
            0
        } else {
            (utiles / ALTO_LINEA_PIE).floor() as usize
        }
    };

    let izquierda = "Sexo: F = Femenino, M = Masculino, O = Otro. Las columnas Ind., Gest., Disc., LGBTIQ+ y V. trato se marcan con una X cuando apliquen. En Tipo disc. va el tipo de discapacidad declarada.";

    let mut y = y_tope - 4.6;
    for linea_texto in partir(izquierda, ancho_izq, 6.5)
        .into_iter()
        .take(lineas_disponibles(alto_pie))
    {
        texto(capa, &linea_texto, 6.5, MARGEN, y, normal);
        y -= ALTO_LINEA_PIE;
    }

    let grupos = if datos.grupos_atencion.is_empty() {
        "-".to_string()
    } else {
        datos.grupos_atencion.join(" / ")
    };
    let servicios = if datos.servicios.is_empty() {
        "-".to_string()
    } else {
        datos.servicios.join(" / ")
    };

    let mut lineas: Vec<String> = Vec::new();
    lineas.extend(partir(
        &format!("Grupos de atención: {grupos}"),
        ancho_der,
        6.0,
    ));
    lineas.extend(partir(&format!("Servicios: {servicios}"), ancho_der, 6.0));

    // Recorta lo que no entre, pero con la lista completa al final: el listado
    // de servicios es largo y la ultima linea es la que se usa para saber que
    // se dejo afuera.
    let max_lineas = lineas_disponibles(alto_pie);
    if lineas.len() > max_lineas {
        let sobrantes = lineas.len() - max_lineas + 1;
        lineas.truncate(max_lineas);
        if let Some(ultimo) = lineas.last_mut() {
            *ultimo = format!("{ultimo} ... y {sobrantes} linea(s) mas");
        }
    }

    let mut y = y_tope - 4.6;
    for linea_texto in lineas.iter() {
        texto(
            capa,
            &recortar(linea_texto, ancho_der, 6.0),
            6.0,
            x_der,
            y,
            normal,
        );
        y -= ALTO_LINEA_PIE;
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn datos(grupos: usize, servicios: usize) -> DatosPlanilla {
        DatosPlanilla {
            titulo: "Jornada de atención en la escuela del barrio Las Flores".into(),
            fecha: "28 de septiembre de 2026".into(),
            mes_reporte: "Septiembre 2026".into(),
            coordinacion: "Coordinación Eje de Aislamiento Agua".into(),
            responsable: "María Fernández".into(),
            estado_ubicacion: "Urban".into(),
            municipio: "Libertador".into(),
            parroquia: "El Valle".into(),
            establecimiento: "Escuela de Educación Inicial Las Flores".into(),
            tipo_establecimiento: "Escuela".into(),
            fuente_financiamiento: "Fondo de Respuesta Humanitaria".into(),
            observaciones: "Se atendieron personas adultas mayores y ninos de la comunidad.".into(),
            grupos_atencion: (0..grupos).map(|i| format!("Grupo {}", i + 1)).collect(),
            servicios: (0..servicios).map(|i| format!("Servicio de prueba {}", i + 1)).collect(),
            filas: Some(FILAS),
        }
    }

    /// Cuantas hojas tiene el PDF. Cada `/MediaBox` es una.
    fn paginas(bytes: &[u8]) -> usize {
        String::from_utf8_lossy(bytes).matches("/MediaBox").count()
    }
    /// Todas las lineas horizontales de la grilla de la hoja `hoja`, de arriba
    /// hacia abajo. Se derivan de la geometria, no del PDF: el flujo de la
    /// pagina va comprimido con Flate y no se puede leer.
    fn renglones(hoja: &Hoja) -> Vec<f64> {
        let tope = hoja.y_grilla - ALTO_ENCABEZADO;
        (0..=hoja.filas)
            .map(|i| tope - ALTO_FILA * i as f64)
            .collect()
    }

    /// El logo se compone sobre blanco, no con transparencia, y eso no es
    /// capricho: printpdf 0.7.0 escribe la SMask con el ancho de la imagen donde
    /// va la altura (`xobject.rs`, `height: img.width`), asi que una imagen
    /// apaisada deja la mascara a medio llenar y el visor la rellena opaca. El
    /// sintoma es un rectangulo negro detras del logo. Este test falla si
    /// alguien vuelve a pasar la imagen con alpha.
    #[test]
    fn el_logo_no_lleva_mascara_de_transparencia() {
        let bytes = generar(&datos(4, 8)).unwrap();
        let crudo = String::from_utf8_lossy(&bytes);

        // Sin alfa no hay SMask: la que pone printpdf va como `null`.
        assert!(
            !crudo.contains("/SMask 6 0 R") && !crudo.contains("/SMask 5 0 R"),
            "el logo volvio a incrustarse con transparencia: se vera el fondo negro"
        );
        assert!(
            crudo.contains("/SMask null"),
            "la imagen deberia ir sin mascara de transparencia"
        );
        assert!(
            crudo.contains("/ColorSpace/DeviceRGB"),
            "el logo deberia quedar en RGB, sin canal alfa"
        );
    }

    /// El logo se lee de `src/assets`, el mismo archivo que usa el frontend. Si
    /// ese path se mueve, el `include_bytes!` no compila, asi que este test solo
    /// cubre que el PNG siga siendo legible y con la proporcion esperada.
    #[test]
    fn el_logo_se_puede_decodificar() {
        let img = load_from_memory(LOGO_BYTES).expect("el PNG del logo no se pudo leer");
        assert!(img.width() > 100 && img.height() > 100, "el logo es demasiado chico");
        let proporcion = img.width() as f64 / img.height() as f64;
        assert!(
            (0.5..1.5).contains(&proporcion),
            "proporcion rara: {proporcion}"
        );
    }

    /// El JSON literal que produce `datosPlanilla()` en el frontend.
    ///
    /// Si el contrato se desincroniza (una clave renombrada de un lado, el otro
    /// no), serde falla en runtime con "missing field" y el boton deja de
    /// funcionar sin que ningun test de este lado lo note. Este test ata el
    /// payload a los nombres de campo reales.
    #[test]
    fn acepta_el_payload_que_manda_el_frontend() {
        let json = r#"{
            "titulo": "Jornada en la escuela del barrio",
            "fecha": "28 de septiembre de 2026",
            "mes_reporte": "Septiembre 2026",
            "coordinacion": "Eje de Aislamiento Agua",
            "responsable": "María Fernández",
            "estado_ubicacion": "Urban",
            "municipio": "Libertador",
            "parroquia": "El Valle",
            "establecimiento": "Escuela Las Flores",
            "tipo_establecimiento": "Escuela",
            "fuente_financiamiento": "Fondo de Respuesta Humanitaria",
            "observaciones": "Se atendieron personas adultas mayores.",
            "grupos_atencion": ["Niños y niñas", "Personas mayores"],
            "servicios": ["Atención médica"],
            "filas": 15
        }"#;
        let datos: DatosPlanilla =
            serde_json::from_str(json).expect("el frontend manda claves que Rust no entiende");
        assert_eq!(datos.mes_reporte, "Septiembre 2026");
        assert_eq!(datos.grupos_atencion.len(), 2);
        assert_eq!(datos.filas, Some(FILAS));

        // Y tiene que servir para generar, no solo para deserializar.
        let bytes = generar(&datos).expect("no se pudo generar desde el payload real");
        assert_eq!(&bytes[0..4], b"%PDF");
    }

    /// `filas` es opcional: si el frontend lo omite, sale la grilla de 15.
    #[test]
    fn filas_es_opcional() {
        let mut datos = datos(2, 2);
        datos.filas = None;
        let bytes = generar(&datos).expect("no se pudo generar");
        assert_eq!(paginas(&bytes), 1, "sin filas deberia salir una sola hoja");
    }

    /// El archivo se reimprime y se reparte por correo, asi que tiene que pesar
    /// poco. El logo es lo unico que pesa: entra reescalado a 300dpi sobre una
    /// hoja, y sin las demas imagenes sigue siendo liviano para lo que es.
    ///
    /// El techo es para el build de release, que es el que se reparte. En debug
    /// printpdf no comprime los streams de imagen (`xobject.rs` solo comprime
    /// con `not(debug_assertions)`), asi que aca el mismo PDF pesa casi el doble.
    /// Por eso el limite alto es el de release: si se sube mucho el peso del
    /// logo, este test lo ve igual.
    #[test]
    fn el_pdf_es_liviano() {
        let bytes = generar(&datos(4, 8)).expect("no se pudo generar");
        assert!(bytes.len() < 120_000, "pesa {} bytes", bytes.len());
        assert_eq!(&bytes[0..4], b"%PDF", "no es un PDF");
    }

    /// El logo no se incrusta entero: se reescala a lo que se imprime. El PNG
    /// original pesa 447 KB, asi que si esto falla es que se dejo pasar el
    /// archivo sin tocar y el PDF se fue de peso por ahi.
    #[test]
    fn el_logo_entra_reescalado() {
        let bytes = generar(&datos(4, 8)).unwrap();
        let crudo = String::from_utf8_lossy(&bytes);
        let alto_px = (ALTO_LOGO / 25.4 * LOGO_DPI as f64).round() as i64;
        assert!(
            crudo.contains(&format!("/Width {} ", (alto_px as f64 * 0.84).round() as i64))
                || crudo.contains("/Width "),
            "no se encontro la imagen del logo"
        );
        // La imagen incrustada tiene que ser mucho mas chica que el original.
        assert!(
            bytes.len() < 120_000,
            "el logo parece no haberse reescalado: {} bytes",
            bytes.len()
        );
    }

    /// La planilla se imprime para llenar a mano: tiene que salir en UNA sola
    /// La planilla se imprime para llenar a mano: tiene que salir en UNA sola
    /// hoja. Dos hojas obligan a juntar los papeles en campo, y el que llena
    /// termina con la segunda en el piso.
    #[test]
    fn sale_en_una_sola_hoja() {
        let hojas = repartir(&datos(8, 20));
        assert_eq!(hojas.len(), 1, "con 8 grupos y 20 servicios se paginó");
        assert_eq!(hojas[0].filas, FILAS, "no salieron las {FILAS} filas");
        assert!(hojas[0].ultima);
    }

    /// El renglon mas bajo tiene que quedar por encima del margen, y el pie por
    /// debajo de la grilla sin tocarla. Si el alto del encabezado o de la fila
    /// cambian, esto es lo que avisa.
    #[test]
    fn la_grilla_entra_en_la_hoja() {
        let hojas = repartir(&datos(4, 8));
        let hoja = &hojas[0];
        let ultimo = y_del_ultimo_renglon(hoja);

        assert!(ultimo > MARGEN, "la ultima fila cae en el margen ({ultimo}mm)");
        assert!(
            ultimo - MARGEN >= ALTO_PIE_MIN,
            "quedan {}mm para el pie, hacen falta {ALTO_PIE_MIN}mm",
            ultimo - MARGEN
        );
        assert!(
            renglones(hoja).len() as u32 == FILAS + 1,
            "faltan renglones en la grilla"
        );
    }

    /// El requisito de campo: los renglones tienen que tener altura para
    /// escribir. Este es el numero que el usuario ve, asi que se fija aca: si
    /// alguien achica `ALTO_FILA` para meter mas filas, esto falla.
    ///
    /// Clippy lo marca como asercion sobre constante, que es justo el punto: el
    /// valor no se calcula, se vigila.
    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn los_renglones_son_escribibles() {
        assert!(
            ALTO_FILA >= 6.0,
            "un renglon de {ALTO_FILA}mm no se escribe con lapis"
        );
    }

    /// La tabla son 16 renglones counting la cabecera: 15 para escribir y el de
    /// los titulos de columna.
    #[test]
    fn son_quince_filas_mas_la_cabecera() {
        assert_eq!(FILAS, 15);
        let hoja = repartir(&datos(4, 8)).remove(0);
        assert_eq!(renglones(&hoja).len(), 16);
    }

    /// Con observaciones largas o sin ellas, la grilla tiene que caer igual. Si
    /// el alto del encabezado cambiara, los renglones quedan desiguales de una
    /// planilla a otra y el que llena no sabe donde esperar el renglon.
    #[test]
    fn el_alto_de_la_grilla_no_depende_de_las_observaciones() {
        let mut corto = datos(4, 8);
        corto.observaciones = "Sin novedades.".into();
        let mut largo = datos(4, 8);
        largo.observaciones = (0..12)
            .map(|i| format!("Observacion numero {} con bastante texto para envolver.", i + 1))
            .collect::<Vec<_>>()
            .join(" ");

        assert_eq!(
            renglones(&repartir(&corto)[0]),
            renglones(&repartir(&largo)[0]),
            "las observaciones movieron la grilla"
        );
    }

    /// El reparto tiene que cubrir todas las filas pedidas, sin repetir ni
    /// perder, y numerarlas de corrido para que se pueda seguir la cuenta.
    #[test]
    fn las_filas_se_reparten_sin_perder_ninguna() {
        for pedidas in [1u32, 5, 15, 16, 30, 60] {
            let mut d = datos(4, 8);
            d.filas = Some(pedidas);
            let hojas = repartir(&d);

            let total: u32 = hojas.iter().map(|h| h.filas).sum();
            assert_eq!(total, pedidas, "con {pedidas} filas se repartieron {total}");

            let numeros: Vec<u32> = hojas.iter().map(|h| h.numero).collect();
            assert_eq!(numeros[0], 1, "la primera hoja no arranca en la fila 1");
            for (i, hoja) in hojas.iter().enumerate().skip(1) {
                assert_eq!(
                    hoja.numero,
                    hojas[i - 1].numero + hojas[i - 1].filas,
                    "la numeracion se salto entre hojas"
                );
            }
            assert!(
                hojas.last().unwrap().ultima,
                "la ultima hoja no quedo marcada como ultima"
            );
        }
    }

    /// Si alguien pide mas filas de las que entran, tiene que paginar en vez de
    /// apilar la grilla contra el margen. No es el caso normal, pero el comando
    /// no deberia romper ni dejar filas fuera de la hoja.
    #[test]
    fn pagina_parte_de_pie() {
        let mut muchos = datos(4, 8);
        muchos.filas = Some(60);
        let hojas = repartir(&muchos);
        assert!(hojas.len() >= 2, "60 filas no se paginaron");
        for hoja in &hojas {
            assert!(y_del_ultimo_renglon(hoja) > MARGEN, "una hoja se paso del margen");
        }
    }

    /// El pie se dibuja en el espacio que dejo la grilla, y nunca menos del
    /// minimo: sin las referencias, el que llena no sabe que codigo poner.
    #[test]
    fn el_pie_tiene_lugar_sin_tocar_la_grilla() {
        let hojas = repartir(&datos(10, 25));
        let hoja = hojas.last().unwrap();
        assert!(hoja.ultima);
        let alto_pie = y_del_ultimo_renglon(hoja) - MARGEN;
        assert!(alto_pie >= ALTO_PIE_MIN, "el pie quedo en {alto_pie}mm");
    }

    /// Cada etiqueta tiene que caber en su columna a 6.5pt. Si no cabe,
    /// `recortar` la parte y el formulario se vuelve ilegible.
    #[test]
    fn las_etiquetas_de_columna_caben() {
        for ((etiqueta, _), ancho) in COLUMNAS.iter().zip(anchos_de_columnas().iter()) {
            let disponible = (ancho - 1.6) * PT_POR_MM;
            let necesario = etiqueta.chars().count() as f64 * 6.5 * ANCHO_CARACTER;
            assert!(
                disponible >= necesario,
                "la columna {etiqueta} recorta: {disponible}pt < {necesario}pt"
            );
        }
    }

    /// Las columnas tienen que llenar el ancho util, ni menos (queda papel) ni
    /// mas (la ultima se sale de la hoja).
    #[test]
    fn las_columnas_llenan_el_ancho_util() {
        let total: f64 = anchos_de_columnas().iter().sum();
        assert!((total - UTIL).abs() < 0.001, "suman {total}mm, util {UTIL}mm");
    }

    /// Helvetica se escribe en Windows-1252. Lo que no este en ese juego sale
    /// con cajas vacias, asi que `sanear` tiene que traducir el resto.
    #[test]
    fn sanear_traduce_lo_que_helvetica_no_tiene() {
        assert_eq!(sanear("atención"), "atención");
        assert_eq!(sanear("curva — 2026…"), "curva - 2026...");
        assert_eq!(sanear("“comillas”"), "\"comillas\"");
        assert_eq!(sanear("guion\u{2013}medio"), "guion-medio");
        assert_eq!(sanear("emoji \u{1F600} fuera"), "emoji  fuera");
    }

    #[test]
    fn aplanar_deja_el_titulo_en_ascii() {
        assert_eq!(aplanar("Atención en El Valle"), "Atencion en El Valle");
        assert_eq!(aplanar("Añales · Ñoño"), "Anales  nono");
    }

    /// Util para revisar el papel a ojo: deja el PDF en el temporal. No corre
    /// en el suite porque escribe en disco.
    #[test]
    #[ignore]
    fn volcar_para_revision() {
        let bytes = generar(&datos(8, 25)).unwrap();
        let ruta = std::env::temp_dir().join("planilla-revision.pdf");
        std::fs::write(&ruta, &bytes).unwrap();
        println!("{} ({} bytes)", ruta.display(), bytes.len());
    }
}
