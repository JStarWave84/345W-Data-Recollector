# Sistema Telar — Manual de uso

Este manual es para quien **carga las jornadas en el campo**: coordinadores y
administradores. No hace falta saber nada de computación para seguirlo.

Si estás buscando cómo se instala la aplicación, cómo se compila o cómo está
armada por dentro, eso está en el [README](README.md).

---

## Índice

- [1. Qué es Sistema Telar](#1-qué-es-sistema-telar)
- [2. Tu cuenta](#2-tu-cuenta)
- [3. Entrar y salir](#3-entrar-y-salir)
- [4. El menú](#4-el-menú)
- [5. Crear una jornada](#5-crear-una-jornada)
- [6. Completar los datos de la jornada](#6-completar-los-datos-de-la-jornada)
- [7. Poner la ubicación con el GPS](#7-poner-la-ubicación-con-el-gps)
- [8. Cargar personas atendidas](#8-cargar-personas-atendidas)
- [9. Mirar los conteos](#9-mirar-los-conteos)
- [10. Enviar a revisión](#10-enviar-a-revisión)
- [11. Si te equivocaste](#11-si-te-equivocaste)
- [12. La planilla en papel](#12-la-planilla-en-papel)
- [13. Mis servicios](#13-mis-servicios)
- [14. Mi perfil](#14-mi-perfil)
- [15. En el teléfono: qué cambia](#15-en-el-teléfono-qué-cambia)
- [16. Problemas frecuentes](#16-problemas-frecuentes)

---

## 1. Qué es Sistema Telar

Sirve para **registrar las jornadas de campo de la organización**: dónde fue,
cuándo, y a qué personas se atendió.

Con esa información la organización arma un archivo que se reporta a la ONU. Ese
reporte lo prepara un administrador una vez por mes; vos no tenés que preocuparte
por eso.

Lo que sí hacés vos es cargar la jornada y las personas. El resto sale solo.

> **El sistema no reemplaza la planilla de papel.** Si en el campo se llena todo
> en papel y después se pasa al sistema, perfecto. Si se carga directo en el
> teléfono o la computadora, también.

---

## 2. Tu cuenta

Para entrar hace falta un usuario. **No te registrás vos mismo**: le pedís a un
administrador de la organización que te cree una cuenta.

Te van a pedir:

- **Tu correo**, que va a ser tu nombre de usuario.
- **Una contraseña** de al menos 6 caracteres.
- **Tu nombre.**
- **Tu rol**: *Coordinador* o *Administrador*.
- **Tu coordinación**, si sos coordinador. Es obligatorio en ese caso.

Tu rol define qué podés hacer:

| | Coordinador | Administrador |
|---|---|---|
| Ver jornadas | solo de tu coordinación | de todas |
| Crear jornadas | sí | sí |
| Cargar y editar | sí, mientras estén en borrador | sí, en cualquier estado |
| Enviar a revisión | sí | sí |
| **Validar** | no | sí |
| Gestionar servicios | los de tu coordinación | todos |
| Gestionar usuarios y catálogos | no | sí |
| Preparar el Excel del mes | sí (lo suyo) | sí (todo) |

> **Si sos administrador**, la barra superior dice "Todas las coordinaciones".
> Si sos coordinador, dice el nombre de tu coordinación. Fijate ahí cuando
> cargues algo: es el error más fácil de cometer y el más difícil de arreglar.

---

## 3. Entrar y salir

**Para entrar**: escribís tu correo y tu contraseña, y tocás **Ingresar**.

**Para salir**: tocás el ícono de salir, arriba a la derecha.

Tu sesión se mantiene abierta aunque cierres la aplicación, así que la mayoría
de las veces no vas a necesitar volver a entrar.

> Si ves *"Correo o contraseña incorrectos"*, revisá que no haya espacios
> escondidos al pegar. Si el error sigue, no es tu cuenta: avisale a tu
> administrador.

---

## 4. El menú

El menú lateral (o el botón ☰ en el teléfono) tiene las secciones:

| Sección | Qué es | Quién la ve |
|---|---|---|
| **Actividades** | La lista de jornadas. Acá empezás siempre. | Todos |
| **Exportar a Excel** | Prepara el archivo del mes. | Todos, **solo en computadora** |
| **Servicios** | Los servicios que presta tu coordinación. | Coordinadores |
| **Usuarios** | Crea y edita las cuentas. | Administradores |
| **Catálogos** | Tipos de establecimiento, grupos de atención, fuentes de financiamiento y coordinaciones. | Administradores |
| **Perfil** | Tu nombre y tu contraseña. | Todos |

Si una sección no te aparece, es por tu rol. No es que esté escondida.

En la barra superior, a la derecha, tenés tu rol y el botón de salir.

---

## 5. Crear una jornada

Una **jornada** es un evento: una visita, una jornada de atención, lo que sea.

1. Entrá a **Actividades**.
2. Tocá **Nueva jornada**.

   La aplicación crea la jornada y te lleva directo a cargarla. Se abre con el
   mes de reporte del mes actual.

3. Completá los datos (es el paso siguiente).
4. Cargá las personas que se atendieron.
5. Cuando esté todo, **Enviar a revisión**.

En la lista, cada fila muestra el título, el mes, la coordinación y en qué
estado está. **Tocá la fila para abrirla.**

Si todavía no cargaste ninguna, la pantalla te lo dice y te ofrece un botón para
crear la primera.

El filtro de arriba sirve para ver solo un estado: **Todas**, **Borradores**,
**Enviadas** o **Validadas**. Debajo dice cuántas hay.

### Los dos íconos de cada fila

- 📋 **Duplicar**: crea una jornada nueva copiando los datos de esta. Sirve
  cuando hacés la misma visita todos los meses.
- 🗑️ **Borrar**: elimina la jornada y todas las personas que cargaste en ella.
  **No se puede deshacer.**

> **Cuidado con borrar**: si la jornada tiene 40 personas cargadas y tocás
> equivocada la papelera, se pierden las 40. Revisá el estado antes de borrar.

---

## 6. Completar los datos de la jornada

La pantalla de carga tiene tres bloques. **Los campos se guardan solos** cuando
salís de ellos: no hay que apretar un botón para guardar cada campo.

Abajo a la izquierda vas a ver el estado: *Guardando…*, *Cambios sin guardar*,
*Guardado*, o *No se pudo guardar* con el motivo.

Si preferís guardar a mano, hay un botón **Guardar ahora**.

### Bloque 1: Jornada

| Campo | Obligatorio | Notas |
|---|---|---|
| **Título de la jornada** | **Sí** | Poné algo que te sirva después: *"Atención en la escuela Las Flores"*, no *"jornada 1"* |
| **Mes de reporte** | **Sí** | El mes al que se reporta. Casi siempre es el mes de la jornada |
| **Fecha de la jornada** | No | El día exacto. Si no te acordás, dejalo vacío |
| **Coordinación** | **Sí** | **No lo podés cambiar** si sos coordinador: es la tuya |
| **Responsable** | No | Quién estuvo a cargo |

> **Ojo con el mes de reporte.** Es distinto del día. Una jornada del 31 de
> enero que se reporta en febrero tiene mes de reporte *febrero*. El archivo
> mensual se arma por mes de reporte, no por fecha.

### Bloque 2: Ubicación

| Campo | Obligatorio | Notas |
|---|---|---|
| **Estado** | **Sí** | Primero elegí el estado |
| **Municipio** | **Sí** | Solo aparecen los del estado que elegiste |
| **Parroquia (ADMIN 3)** | **Sí** | Solo aparecen las del municipio |
| **Ubicación** | No | Texto libre: *"Barrio La Cruz, casa 12"* |
| **Tipo de establecimiento** | No | Escuela, centro de salud, casa… |
| **Latitud** / **Longitud** | No | Ver la sección siguiente |

> **Municipio y parroquia se llenan en cascada.** Si no te aparece el municipio,
> es porque todavía no elegiste el estado. Si no te aparece la parroquia, es
> porque no elegiste el municipio. Es normal, no es un error.

### Bloque 3: Financiamiento y notas

| Campo | Obligatorio | Notas |
|---|---|---|
| **Fuente de financiamiento** | No | De dónde salió lo que se gastó |
| **Observaciones** | No | Cualquier cosa que convenga recordar |

### Si falta un campo obligatorio

Te aparece un aviso amarillo:

> *Falta completar: título, mes de reporte, coordinación, estado, municipio,
> parroquia.*

**Podés guardar la jornada igual.** Solo no va a entrar en el archivo del mes
hasta que completes esos campos.

---

## 7. Poner la ubicación con el GPS

Si tocás **Usar mi ubicación**, el teléfono te pide permiso y escribe sola la
latitud y la longitud en los campos.

**El GPS es opcional.** Si no podés o no querés usarlo, escribí las
coordenadas a mano y seguí como si nada.

Si el GPS no funciona, la aplicación te avisa y no te deja trabado:

- *"No se concedió el permiso de ubicación. Escribí las coordenadas a mano."* →
  Escribí las coordenadas a mano.
- *"La ubicación está apagada en el teléfono. Activala en los ajustes y probá de
  nuevo."* → El GPS del teléfono está apagado. Buscá el ícono de ubicación en la
  barra de notifications y activalo.
- *"No se pudo leer la ubicación. Escribí las coordenadas a mano, o probá de
  nuevo afuera."* → A veces falla adentro de un edificio. Probá de nuevo afuera.

Ninguno de los tres casos te impide seguir cargando.

> **El botón solo aparece en el teléfono.** En la computadora no está, porque el
> GPS de la app no funciona ahí. Las coordenadas se escriben a mano en los dos
> casos.

---

## 8. Cargar personas atendidas

Acá está la parte más importante del manual. **Hay dos formas de hacerlo** y
sirven para cosas distintas.

### Las dos formas, comparadas

|  | **Carga rápida** | **Con detalle** |
|---|---|---|
| Dónde | La tarjeta *"Agregar varias personas de una vez"* | Botón **Cargar una persona con detalle** |
| Cuántas a la vez | **Varias, de una** | Una |
| **Servicios** con cantidad | ❌ no tiene | ✅ sí |
| **Motivo** de la atención | ❌ no tiene | ✅ sí |
| **Tipo** de discapacidad | ❌ solo la casilla | ✅ con el tipo |
| Para qué sirve | Cargar rápido en el campo | Cuando necesitás detalle o servicios |

### Cómo elegir

**Usá Carga rápida** cuando estés en el campo y necesites registrar muchas
personas que se atendieron con lo mismo. Es la forma rápida: escribís el nombre,
pásás al siguiente campo con **Enter**, y seguís.

**Usá Con detalle** cuando la persona recibió servicios, o cuando necesitás
anotar el motivo de la atención o el tipo de discapacidad.

**Si dudás: usá Con detalle.** Podés cargar rápido y después editar a la
persona para agregar los servicios. Al revés no se puede: si cargaste en la
grilla, los servicios hay que cargarlos aparte.

### Carga rápida, paso a paso

1. Andá a la pestaña **Personas atendidas**.
2. Tocá **Agregar persona**. Aparece una fila con campos vacíos.
3. Escribí el **nombre y apellido** (es el único obligatorio).
4. Completá lo que sepas: cédula, edad, sexo, grupo de atención.
5. Marcá las condiciones si corresponde: **Ind**, **Ges**, **Dis**, **LGB**,
   **VT**. Cada botón tiene un nombre corto; el nombre completo aparece al
   mantener el dedo encima.
6. Pasá al siguiente campo con **Enter**. En el último, Enter agrega otra fila.
7. Cuando termines, tocá **Guardar N personas**.

Detalles que conviene saber:

- Solo se guardan las filas que tengan **nombre**. Las que dejaste vacías se
  ignoran.
- Si algo falla, la aplicación te dice a quién: *"«Juan Pérez»: el motivo"*.
- Si se guardaron algunas y otras no: *"Se guardaron 5 de 7. Revisá el error y
  volvé a guardar las que quedaron en la grilla."* Las que se guardaron ya
  están arriba; las que faltan siguen en la grilla para reintentar.
- La **X** al final de la fila saca esa persona de la grilla sin guardarla.

### Con detalle, paso a paso

Tocás **Cargar una persona con detalle** y se abre un formulario:

| Campo | Notas |
|---|---|
| **Nombre y apellido** | Obligatorio |
| **Cédula** | |
| **Edad** | Un número. Si no la sabés, **dejala en blanco** — no pongas un número inventado |
| **Sexo** | F, M u O |
| **Grupo de atención** | |
| **Motivo de la atención** | Por qué se atendió a esta persona |

**Condiciones** (interruptores): Indígena · Gestante o lactancia ·
Discapacidad · LGBTIQ+ · Víctima de trata. Si marcás *Discapacidad*, se
habilita **Tipo de discapacidad**.

**Servicios recibidos**: tocás **Agregar** y elegís uno de los servicios de tu
coordinación, con la cantidad. Podés cargar varios.

### Dos cosas que la aplicación te va a avisar

- Si elegís sexo **O**: la persona cuenta en el total de personas, pero **no**
  suma en los cuatro desgloses de mujeres y hombres. No es un error, es
  cómo funciona el reporte.
- Si guardaste un tipo de discapacidad y después desmarcás *Discapacidad*, te
  avisa que el tipo se va a borrar.

### Para editar o borrar una persona ya cargada

Tocá la fila en la lista, o el ícono de editar. Se abre el mismo formulario de
**Con detalle**.

Para **borrar**: tocá **Borrar** y después **Confirmar borrado**. Son dos pasos a
propósito.

---

## 9. Mirar los conteos

Sobre la jornada hay una tira de números: Girls, Boys, Female, Male, Elderly F,
Elderly M, Indígenas, Discapacidad, Gestantes, LGBTIQ+, Víctimas.

Se calculan solos a medida que cargás personas.

**Ojo con los Elderly**: son un *subtotal* de Female y Male, no están aparte.
Una mujer de 65 años cuenta en *Female* **y** en *Elderly F*. No los sumes.

---

## 10. Enviar a revisión

Cuando terminaste, tocás **Enviar a revisión**. Te pide confirmación y te dice
cuántas personas incluye.

Después de enviar:

- La jornada queda **Enviada** y ya **no podés modificarla**.
- No podés volver a editarla hasta que alguien la revierta.
- Si te equivocaste, pedile a un administrador que la revierta (ver la sección
  siguiente).

Solo un administrador puede pasar una jornada de *Enviada* a **Validada**. Cuando
la valida, entra en el archivo del mes.

---

## 11. Si te equivocaste

Hay dos caminos y no son lo mismo:

### Revertir a borrador — recuperás el control

Te deja **editar la jornada de nuevo**, con las personas que ya habías cargado.
No se pierde nada.

Solo funciona si la jornada está **Enviada**. Estando Validada, hay que
revertirla dos veces.

Quién puede revertir: el coordinador, la suya; el administrador, cualquiera.

### Borrar — se pierde todo

Elimina la jornada **y todas las personas y servicios cargados en ella**. **No
se puede deshacer.**

Solo se puede borrar una jornada que esté en **Borrador**.

> **Si dudás entre borrar y revertir, revertí.** Revertir no cuesta nada
> irreversible; borrar sí.

### Pedir una corrección cuando ya está validada

Si el error es de datos, pedile a un administrador que la revierta a borrador,
lo corrijas y la vuelvas a enviar. El administrador puede editar incluso
validada.

---

## 12. La planilla en papel

El ícono de **impresora**, arriba en la jornada, genera una hoja A4 horizontal en
blanco para llenar a mano, con el encabezado ya completo y una grilla para
anotar las personas.

**Solo está en la computadora**, no en el teléfono. Se guarda como PDF donde
elijas.

> Solo necesita la cabecera de la jornada completa. **No hace falta que haya
> personas cargadas** — justamente sirve para pasarlas a mano y después
> digitarlas.

---

## 13. Mis servicios

Sección **Servicios**, solo para coordinadores.

Es la lista de los servicios que presta tu coordinación: atención médica,
entrega de insumos, apoyo psicosocial.

- **Agregar servicio** para crear uno nuevo.
- El ícono de **editar** para cambiarle el nombre.
- **Desactivar** para dejar de ofrecerlo sin borrarlo.

> Los servicios se desactivan, no se borran. Si un servicio ya se usó en alguna
> jornada pasada, desactivarlo es mejor que borrarlo: las jornadas viejas
> siguen mostrando qué se les dio.

---

## 14. Mi perfil

Sección **Perfil**. Dos cosas se pueden cambiar:

- **Guardar nombre** — escribí tu nombre y tocá el botón.
- **Cambiar contraseña** — escribila dos veces y tocá **Cambiar contraseña**.
  Mínimo 6 caracteres y las dos tienen que coincidir.

> **Tu rol y tu coordinación no se cambian desde acá.** Si necesitás que cambien,
  pedíselo a un administrador.

---

## 15. En el teléfono: qué cambia

La aplicación de Android hace **exactamente lo mismo**, con estas diferencias:

**No está:**

- **Exportar a Excel** — es un archivo de 21 columnas pensado para la ONU. Se
  prepara en la computadora.
- **La planilla en papel** — es para imprimir.

**Sí está:** todo lo demás. Crear jornadas, cargar personas de las dos
formas, los conteos, enviar a revisión, tus servicios, tu perfil.

**Cambios de forma:**

- El menú lateral se abre con el botón **☰** de arriba a la izquierda.
- La **carga rápida** se muestra apilada en vez de en columnas, con el nombre de
  cada campo arriba. Se usa igual: escribís, pasás al campo siguiente con
  **Enter**.
- Las tablas anchas se pueden deslizar con el dedo hacia los lados.

---

## 16. Problemas frecuentes

### "Para poder enviarla falta: ..."

Te faltan campos obligatorios. La lista aparece arriba: *Para poder enviarla
falta:*. Lo más común es **municipio** o **parroquia**. Andá al bloque
**Ubicación** y completalos.

### No me aparece el municipio

Elegí primero el **estado**. Los municipios se filtran por estado.

### No me aparece la parroquia

Elegí primero el **municipio**. Las parroquias se filtran por municipio.

### El GPS no me funciona

Aceptá el permiso de ubicación cuando te lo pidan. Si lo denegaste, hay que
volver a activarlo desde los ajustes del teléfono. Si el mensaje dice que la
ubicación está apagada, activá el GPS del teléfono. Si no hay señal, probá
afuera. En cualquier caso: **escribí las coordenadas a mano** y seguí.

Los mensajes que aparecen son los tres del punto 7. Ninguno te impide seguir
cargando.

### El botón "Guardar" dice que no pudo guardar

Puede ser que se haya cortado internet. La jornada se guarda en cuanto vuelva
la conexión; no se pierde lo que ya estaba guardado.

### Cargué con la grilla rápida y ahora necesito los servicios

Abrí la persona desde la lista (tocá la fila) y cargá los servicios desde el
formulario de detalle. La grilla no los maneja.

### "Se guardaron 5 de 7"

Cinco se guardaron. Las dos que faltaron siguen en la grilla con el motivo del
error al lado. Revisá el error, corregí y tocá **Guardar** otra vez.

### No me aparece la sección Servicios / Usuarios / Catálogos

Es por tu rol. Solo los coordinators ven *Servicios*; solo los administradores
ven *Usuarios* y *Catálogos*.

### No me aparece "Exportar a Excel"

Es solo de computadora. En el teléfono no aparece por decisión, no es un
problema.

### No puedo editar la jornada

Está **Enviada** o **Validada**. Solo se edita en **Borrador**. Pedí que la
reviertan.

### Eliminé una jornada sin querer

Si estaba en **Borrador**, no hay forma de recuperarla. Si estaba Enviada o
Validada, un administrador la puede revertir, pero **no recuperar lo que
borraste** — los datos de las personas no se conservan.

### ¿Dónde queda lo que cargo?

En la base de datos de la organización, no en tu teléfono. Si borrás la
aplicación, no se pierde nada.

---

## Para soporte

Cuando pidas ayuda, es útil decir:

- Si sos coordinador o administrador.
- En qué **estado** está la jornada (*Borrador*, *Enviada* o *Validada*).
- Qué mensaje aparece en pantalla, **copiado tal cual**.
- Si lo pasa en el teléfono o en la computadora.