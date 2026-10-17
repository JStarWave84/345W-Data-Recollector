# Sistema Telar — App de llenado de la planilla 345W

App para el registro de jornadas de campo de una ONG humanitaria, y el backend que
la sostiene. Sirve para capturar las personas atendidas en cada jornada y armar el
archivo que la organización reporta a la ONU dentro del formato **345W** (HRP).

Hay **dos clientes y un solo backend**:

- **Escritorio** — Windows, macOS y Linux, con Tauri 2.
- **Android** — la **misma aplicación**, compilada para el teléfono. No hay una
  segunda base de código: mismo Vue, mismos componentes, mismos comandos Rust.

> **¿Querés usarla?** El manual para coordinadores y administradores está en
> **[MANUAL.md](MANUAL.md)**. Este README es la referencia técnica: cómo está
> armada, cómo se compila y por qué cada cosa es como es.

- **Proyecto Supabase:** `data-recollection-ftr` (ref `sgyekoxqbfvhovkiulny`)
- **PostgreSQL:** 17.6 · **Auth:** Supabase Auth (email + contraseña)
- **RLS:** activada en las 9 tablas
- **Migraciones aplicadas:** `20260927120001` … `20260929000015`

---

## Índice

<!-- Los enlaces se mantienen a mano. Ojo: hay comentarios de shell que empiezan
     con # dentro de bloques de codigo (ver "Aplicar las migraciones"), asi que un
     indice generado automaticamente los tomaria como titulos. -->

### Para empezar

- [Vista general](#vista-general)
- [Modelo](#modelo) — el circuito de una jornada
- [App móvil (Android)](#app-móvil-android)

### Base de datos

- [Aplicar las migraciones](#aplicar-las-migraciones) · [Datos iniciales](#datos-iniciales) · [Crear el primer admin](#crear-el-primer-admin)
- [Edge Function: crear-usuario](#edge-function-crear-usuario)

### Contrato de los datos

- [Contrato de exportación 345W](#contrato-de-exportación-345w)
- [Cómo llega el archivo a disco](#cómo-llega-el-archivo-a-disco)
- [Semántica de los agregados](#semántica-de-los-agregados)
- [Rangos de edad](#rangos-de-edad)

### La aplicación cliente

- [Estructura del frontend](#estructura-del-frontend)
- [Navegación](#navegación)
- [El lado Rust](#el-lado-rust)
- [Design system](#design-system)

### Operación

- [Desarrollo local](#desarrollo-local)
- [Índice de scripts](#índice-de-scripts)
- [Compilar y probar](#compilar-y-probar) — el APK
- [Distribución](#distribución) — cómo llega a un teléfono y cómo se actualiza
- [Seguridad](#seguridad)
- [Variables de entorno](#variables-de-entorno)
- [Troubleshooting](#troubleshooting)

---

## Vista general

### Stack

| Capa | Tecnología |
|---|---|
| Interfaz | Vue 3.5 · Vuetify 4 · Pinia 4 · Vue Router 5 (historial por hash) |
| Build | Vite 8 · `vite-plugin-vuetify` con auto-import |
| Shell | Tauri 2 (escritorio **y** Android) |
| Nativo | Rust · `printpdf` 0.7 · `image` 0.24 |
| Backend | Supabase: PostgreSQL 17.6, Auth, RLS, Edge Functions |
| Datos geográficos | `src/lib/venezuela.js` (estático) + scripts de construcción |

### Las tres piezas y cómo se hablan

```
   Interfaz (Vue + Pinia)
   src/ — 8 vistas · 9 componentes · 12 módulos de datos
        │
        │
        ├── supabase-js, REST + JWT ─────►  Supabase
        │                                   PostgreSQL 17.6
        │                                   9 tablas · 3 vistas
        │                                   RLS + 9 triggers
        │                                   5 funciones RPC
        │                                   1 Edge Function
        │
        └── invoke(), IPC ──────────────►  Rust — src-tauri/
                                            2 comandos propios
                                            3 plugins
                                            planilla (A4 horizontal)
```

**El frontend habla con Supabase y con Rust, nunca con el disco.** Todo lo que
terminar en un archivo — el `.xlsx` de 345W y el PDF de la planilla — se arma en
memoria en el navegador o en Rust y después se escribe a través de un comando.
Es lo que hace posible que la misma app funcione en el teléfono: no depende de
rutas del sistema de archivos.

### Por qué el `.xlsx` se arma en el cliente

La decisión más contraintiva del proyecto, y vale explicarla antes de las
tablas.

El 345W define 21 columnas en un orden exacto. Armar ese archivo en el servidor
obligaría a que el servidor supiera el formato de un reporte externo que la ONU
puede cambiar, y a tener una versión de `exceljs` o equivalente corriendo en
Postgres. Se armó en el cliente porque:

- El **formato es del cliente final**, no del dominio. Es una transcripción de
  algo que un humano ya calculó.
- Permite regenerar el archivo sin volver a consultar la base.
- El orden de columnas queda **verificable por tests** (`scripts/verify-export.mjs`),
  cosa que desde el servidor no se puede afirmar igual.

El costo: si el formato del 345W cambia, hay que actualizar el cliente, no una
migración.

### Qué hay que mirar primero

| Si querés… | Andá a |
|---|---|
| Entender el flujo de una jornada | [El circuito de una jornada](#el-circuito-de-una-jornada) |
| Saber qué puede tocar cada rol | [Roles](#roles) |
| Compilar la app de escritorio | [Desarrollo local](#desarrollo-local) |
| Compilar el APK | [Compilar y probar](#compilar-y-probar) |
| Cambiar un color o una tipografía | [Design system](#design-system) |
| Correr los tests | [Índice de scripts](#índice-de-scripts) |

---

## Modelo

El flujo es: un **coordinador** captura una **actividad** (jornada de campo) y
carga **atenciones** (personas atendidas). A partir de esas atenciones,
`v_agregados_actividad` calcula los indicadores 345W, y el admin los transcribe
a la web de la ONU. **El .xlsx se arma en el cliente (Tauri/Vue), no en el
servidor** — ver [Contrato de exportación](#contrato-de-exportación-345w).

### Roles

| | `coordinador` | `admin` |
|---|---|---|
| Ve actividades | solo su coordinación | todas |
| Crea actividades | sí, en su coordinación | sí, en cualquier coordinación |
| Edita actividades | solo si están en `borrador` | sí, en cualquier estado |
| **Envía** (`borrador`→`enviada`) | **sí** | sí |
| Valida (`enviada`→`validada`) | no | sí |
| Revierte (`enviada`→`borrador`) | sí, la suya | sí, cualquiera |
| Borra actividades | **sí, solo las suyas en `borrador`** | sí, cualquiera |
| Edita morbilidad | solo si la actividad está en `borrador` | sí, incluso post-envío |
| Modifica catálogos | no | sí |
| Gestiona servicios | **sí, los de su coordinación** (012) | sí, todos |
| Crea usuarios | no | sí (Edge Function) |
| Exporta el Excel | sí (solo su coordinación) | sí (todas) |

### El circuito de una jornada

```
   coordinador                 admin
   -----------                 ----
   crea actividad  ──> borrador
   carga morbilidad        (sigue editable)
   envía           ──> enviada ──┬──> (revierte) ──> borrador
   borra borrador              │        ↑
                               │        │
                               └── valida ──> validada
```

El coordinador **cierra su jornada** y el admin **valida**. Antes de la
migración `010_allow_coordinator_submit` el coordinador quedaba trabado: podía
llenar la actividad pero no podía enviarla, porque la política de UPDATE usaba
el mismo predicado en `USING` y `WITH CHECK` y, al pasar a `enviada`, la fila
resultante ya no cumplía "estado = borrador".

La `010` separa las dos mitades —`USING` mira el estado **anterior**,
`WITH CHECK` permite el **nuevo**— y además envuelve cada transición en una
función para que el timestamp y el estado se escriban en la misma sentencia:

| Función | Quién | Efecto |
|---|---|---|
| `enviar_actividad(id)` | coordinador (su coord.) o admin | `borrador` → `enviada`, setea `enviada_at` |
| `validar_actividad(id)` | **solo admin** | `enviada` → `validada`, setea `validada_at` y `validada_por` |
| `revertir_actividad(id)` | coordinador (su coord.) o admin | `enviada` → `borrador` (011) |

Son `SECURITY INVOKER`, no `SECURITY DEFINER`: la RLS y los triggers de bloqueo
siguen aplicando. El coordinador puede enviar y revertir, pero **no puede
validar** —`WITH CHECK` no contempla ese estado de destino— ni **deshacer una
validación**, porque revertir exige que la actividad esté en `enviada`.

Una vez en `enviada`, el trigger `bloquear_atencion_si_enviada` congela la
morbilidad: ni INSERT, ni UPDATE, ni DELETE de `atenciones` ni del pivote. Solo
un admin puede corregirla, o el coordinador después de revertir.

#### Por qué la reversibilidad está partida en dos capas

La `011` habilita revertir, y el detalle importante es que la puerta es
angosta. Cambiar la política de UPDATE alcanza para que la fila sea alcanzable,
pero entonces el coordinador podría **editar una actividad enviada** con una
sola sentencia, porque el trigger `bloquear_edicion_actividad` hoy levanta
excepción ante cualquier UPDATE con `estado` anterior distinto de `borrador`.

Así que el permiso se reparte:

| Capa | Decide |
|---|---|
| RLS | Qué filas alcanza un UPDATE: el coordinador llega a `borrador` y `enviada` de su coordinación. |
| Trigger | Qué cambios son legales sobre esas filas: en `enviada`, **nada**, salvo el retorno a `borrador` sin tocar ningún otro campo. |

La excepción del trigger compara la fila entera con
`to_jsonb(new) - 'estado' - 'updated_at'`. Comparar la fila completa, y no un
par de columnas, es a propósito: si mañana se agrega una columna al 345W la
comparación la cubre sola, y `revertir + cambiar el municipio` en la misma
sentencia se rechaza con `42501`.

`enviada_at` no se toca al revertir: queda registrado el momento del último envío
y se sobreescribe la próxima vez que se envíe. Deshacer una validación, en
cambio, no está expuesto: un admin puede corregir los *datos* de una validada,
pero moverla de estado hacia atrás es otra decisión que no se toma desde la app.

> `scripts/verify-revertir.mjs` cubre justamente el caso cerrado: que revertir
> funcione, y que esa misma puerta **no** sirva para editar.

> PostgREST no avisa cuando una policy filtra la fila en silencio: un UPDATE
> bloqueado devuelve `{ data: null, error: null }`, sin excepción. La app tiene
> que comprobar el valor, no el `error`, para distinguir "no se guardó" de "no
> había nada que cambiar".

### Tablas

**Catálogos**

| Tabla | Notas |
|---|---|
| `coordinaciones` | `nombre` unique. Es el eje de aislamiento entre coordinadores. |
| `servicios` | Pertenece a una coordinación. `unique (nombre, coordinacion_id)` |
| `tipos_establecimiento` | `nombre` unique |
| `grupos_atencion` | `nombre` unique |
| `fuentes_financiamiento` | `nombre` unique |

**Operativas**

| Tabla | Notas |
|---|---|
| `actividades` | Jornada de campo. `coordinacion_id` NOT NULL (FK, nunca texto). `estado` ∈ `borrador` / `enviada` / `validada`. `mes_reporte` es `date` (primer día del mes). |
| `atenciones` | Persona atendida. `ON DELETE CASCADE` desde la actividad. `edad` 0–120, `sexo` ∈ `F` / `M` / `O`. |
| `atencion_servicios` | N:M con cantidad. PK compuesta `(atencion_id, servicio_id)`. |

**Usuarios**

| Tabla | Notas |
|---|---|
| `profiles` | `id` = `auth.users.id` (CASCADE). `rol` CHECK. `coordinacion_id` SET NULL. `email` unique (índice sobre `lower(email)`). |

Todas con `id uuid` (gen_random_uuid) y `timestamptz`. Todos los FK tienen
`ON DELETE` explícito.

### Vista

`v_agregados_actividad` — **una fila por actividad** (LEFT JOIN, así que
incluye las que no tienen atenciones, con los agregados en 0) con la cabecera
completa más los 12 agregados 345W y los 14 del desglose por rango de edad
(migración 015).

Está creada con **`security_invoker = true`** a propósito. Sin eso, una vista en
PostgreSQL se ejecuta con los privilegios de su owner y **saltaría la RLS**:
un coordinador de Psicología leería por PostgREST las actividades de todas las
coordinaciones.

Las migraciones 007, 014 y 015 la reconstruyen con `DROP` + `CREATE`, porque
`CREATE OR REPLACE` no permite cambiar el orden de las columnas ni agregar
columnas en el medio. Cada una arrastra la definición completa de la vista: si se
toca la vista, hay que actualizarlas las tres, o la próxima que se corra pisa a
las anteriores.

### Validación de los formularios

Los formularios se validan con **Zod**, en `src/lib/esquemas.js`: un schema por
pantalla, más `validar()` para el guardado y `validarCampo()` para las reglas en
vivo de Vuetify. Los schemas son **puros** —no importan Vue, Supabase ni Vite— y
por eso se verifican con `node scripts/verify-esquemas.mjs`.

Que validen los schemas y no solo la base es una decisión de momento, no de
estilo. La base tiene los CHECK (`edad between 0 and 120`, `sexo in (F,M,O)`),
pero a esa altura el error llega después del viaje de red y la persona ya escribió
ocho personas más.

Dos cosas que se arreglaron al unificar:

- **La edad vacía se guardaba como 0.** `Number('')` y `Number(null)` son `0` en
  JavaScript, así que una persona de la que no se registró la edad terminaba con 0
  años. Con los rangos del 345W eso la contaba en el rango 0-5.
- **El diálogo y la grilla validaban distinto.** La grilla exigía edad entera y el
  diálogo no: el mismo dato se aceptaba en una pantalla y en la otra. Postgres lo
  rechazaba con `22P02` al guardar.

El schema es el mismo en los dos puntos de entrada a propósito. Antes cada
componente tenía su propia versión de la regla, que es la forma fácil de que
vuelvan a divergir.

> **El `null` de `edad` es un caso de primera clase**, no un olvido: la columna es
> nullable y hay gente de la que no se registra la edad. `''` se transforma en
> `null` antes de validar, nunca en `0`.

### Contrato de datos para clientes

Esta sección es la referencia que consume **cualquier** cliente —el de escritorio
y el móvil—, no solo el código de este repo. Está escrita para que alguien pueda
desarrollar contra la base sin leer los `.vue`.

Obtenida de la base con `information_schema`, no del código: si cambia una
migración, hay que volver a sacarla.

**`actividades`** — 23 columnas. La jornada.

| Columna | Tipo | Notas para el cliente |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `titulo` | `text` | NOT NULL |
| `fecha` | `date` | nullable. Es la que va a `REPORTING MONTH` del 345W |
| `mes_reporte` | `date` | NOT NULL. **Primer día del mes.** Es por esto que los filtros de rango pasan `YYYY-MM-01`, no el día que se exporta |
| `coordinacion_id` | `uuid` | NOT NULL, FK a `coordinaciones`. Nunca texto: es el eje de aislamiento |
| `responsable` | `text` | |
| `estado` | `text` | NOT NULL, CHECK ∈ `borrador` / `enviada` / `validada`. **Es el estado del flujo, no el geográfica** |
| `estado_ve` | `text` | libre. Estado de verificación de la VE. No se exporta |
| `estado_ubicacion` | `text` | Estado **geográfico** de Venezuela. Va a `DEPARTMENT`. Agregado en la 014 |
| `municipio`, `parroquia`, `establecimiento` | `text` | `parroquia` es el ADMIN 3 |
| `tipo_establecimiento_id` | `uuid` | FK `ON DELETE SET NULL` |
| `latitud`, `longitud` | `numeric` | Vienen como **número JSON**, no string |
| `fuente_financiamiento_id` | `uuid` | FK `ON DELETE SET NULL`. Ojo el nombre: `fuente_`, no `fuentes_` |
| `observaciones` | `text` | |
| `created_by` | `uuid` | FK `profiles`, `SET NULL` |
| `enviada_at`, `validada_at` | `timestamptz` | Los pone el RPC, no el cliente |
| `validada_por` | `uuid` | |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` lo mantiene un trigger |

**`atenciones`** — 17 columnas. Una persona atendida.

| Columna | Tipo | Notas para el cliente |
|---|---|---|
| `id` | `uuid` | PK |
| `actividad_id` | `uuid` | NOT NULL, FK `ON DELETE CASCADE` |
| `cedula` | `text` | nullable, **no unique**. Puede repetirse |
| `nombre_apellido` | `text` | nullable |
| `edad` | `integer` | **nullable**, CHECK 0–120. Sin default: si no se manda, queda `NULL` |
| `sexo` | `char(1)` | **nullable**, CHECK ∈ `F` / `M` / `O` |
| `motivo` | `text` | |
| `grupo_atencion_id` | `uuid` | FK `SET NULL` |
| `indigena`, `gestante`, `discapacidad`, `lgbtiq`, `victima_trata` | `boolean` | **NOT NULL `default false`**. Se mandan solo si son `true` |
| `tipo_discapacidad` | `text` | nullable. Vaciarlo si `discapacidad` es `false` |
| `created_by`, `created_at`, `updated_at` | | |

> **Dos trampas de `edad` y `sexo`, que son nullable.** En SQL, comparar con
> `NULL` da `NULL` y no cuenta, así que una atención sin edad o sin sexoLoaded
> **suma en `total_atenciones` pero en ningún desglose**. Y `Number(null)` en
> JavaScript es `0`: si un cliente clasifica con `Number(a.edad) < 18`, esa
> persona aparece como de 0 a 5 años. Hay que tratar el `null` explícitamente
> antes de clasificar. `src/lib/edades.js` lo hace y devuelve `null`.

**`atencion_servicios`** — 3 columnas, PK compuesta `(atencion_id, servicio_id)`,
`cantidad` integer `CHECK (cantidad > 0)`.

**`v_agregados_actividad`** — 42 columnas, una fila por actividad.

| Bloque | Columnas |
|---|---|
| Identificación | `actividad_id`, `titulo`, `fecha`, `mes_reporte`, `coordinacion`, `responsable`, `estado`, `estado_ubicacion`, `municipio`, `parroquia`, `establecimiento`, `tipo_establecimiento`, `fuente_financiamiento`, `observaciones` |
| Coordenadas | `latitud`, `longitud` |
| Agregados 345W | `total_atenciones`, `girls`, `boys`, `female`, `male`, `elderly_female`, `elderly_male`, `indigenas`, `discapacidad`, `gestantes`, `lgbtiq`, `victimas_trata` |
| Rangos de edad | `edad_0_5_f` … `edad_80_mas_m` (14) |

Las de identificación traen los **nombres ya resueltos** por los `LEFT JOIN` con
los catálogos: `coordinacion` es `coordinaciones.nombre`, no el id. Por eso el
cliente que arma el Excel no necesita joins extra para esas columnas.

**Catálogos** — todos con `id uuid`, `nombre text`, `activo boolean`:
`coordinaciones` (además `descripcion`, `activa`), `tipos_establecimiento`,
`grupos_atencion`, `fuentes_financiamiento`, `servicios` (además
`coordinacion_id`).

Datos iniciales: 6 coordinaciones, 10 tipos de establecimiento, 4 grupos de
atención, 6 fuentes de financiamiento, 7 servicios. Ver la nota de
[Datos iniciales](#datos-iniciales) sobre por qué el seed siembra 6.

**`profiles`** — `id` (= `auth.users.id`), `email`, `nombre`, `rol`, `coordinacion_id`,
`activo`, timestamps. El `INSERT` lo hace el trigger `handle_new_user()` al
registrarse, **no el cliente**.

**Funciones RPC** — se llaman por `supabase.rpc('nombre', { arg })`:

| Función | Argumento | Qué hace |
|---|---|---|
| `enviar_actividad` | `p_actividad_id` | `borrador` → `enviada`. Congela la morbilidad |
| `validar_actividad` | `p_actividad_id` | `enviada` → `validada`. Solo admin |
| `revertir_actividad` | `p_actividad_id` | `enviada` → `borrador` |
| `current_rol()` | — | `SECURITY DEFINER`. El rol del JWT. No llamarla: la usan las políticas |
| `current_coordinacion()` | — | `SECURITY DEFINER`. La coordinación del JWT. Tampoco |

**No** son RPC, son triggers: `set_updated_at`, `handle_new_user`,
`bloquear_atencion_si_enviada`, `bloquear_atencion_servicio_si_enviada`,
`bloquear_edicion_actividad`. Un cliente nunca los invoca; su efecto es que una
`UPDATE` sobre una actividad enviada **falla con error de RLS**, no se ignora en
silencio.

> **Las transiciones de estado se hacen por RPC, no con un `UPDATE`.** Un
> `UPDATE` directo de `estado` choca con los triggers y con la RLS. Es lo que
> garantiza que un coordinador no pueda auto-validarse.

---

## Aplicar las migraciones

Las migraciones viven en `supabase/migrations/` y ya están aplicadas en el
proyecto remoto. Para reaplicarlas o agregarlas en otro entorno:

```bash
# 1. linkear el proyecto (una sola vez)
supabase link --project-ref sgyekoxqbfvhovkiulny

# 2. ver qué se aplicaría, sin tocar nada
supabase db push --linked --dry-run

# 3. aplicar
supabase db push --linked
```

Orden de aplicación:

| # | Archivo | Qué hace |
|---|---|---|
| 001 | `extensions_y_helpers.sql` | pgcrypto · `set_updated_at()` · `current_rol()` · `current_coordinacion()` |
| 002 | `catalogos.sql` | 5 tablas de catálogo |
| 003 | `profiles.sql` | `profiles` |
| 004 | `operativas.sql` | `actividades` · `atenciones` · `atencion_servicios` |
| 005 | `triggers.sql` | `updated_at` · `handle_new_user()` · `bloquear_*` |
| 006 | `indices.sql` | 5 índices de apoyo (+ 1 `if not exists` de idempotencia) |
| 007 | `vista_agregados.sql` | `v_agregados_actividad` |
| 008 | `rls.sql` | RLS en las 9 tablas + 24 políticas + grants (base; 012 y 013 suman 4 más) |
| 009 | `009_seed.sql` | Catálogos iniciales (idempotente) |
| 010 | `allow_coordinator_submit.sql` | El coordinador puede enviar · `enviar_actividad()` · `validar_actividad()` |
| 011 | `borrar_y_reverter.sql` | Revertir `enviada`→`borrador` · borrar el propio borrador · `revertir_actividad()` |
| 012 | `servicios_por_coordinacion.sql` | El coordinador hace CRUD de los servicios de **su** coordinación |
| 013 | `perfil_self_update.sql` | Cada usuario edita su propio `nombre` en `profiles` |

La 010, 011, 012 y 013 son idempotentes: empiezan con
`drop policy if exists` y usan `create or replace function`, así que se pueden
reaplicar sin efectos raros.

> Ojo con el versionado: los archivos se nombran `<timestamp>_<nombre>.sql` y el
> timestamp es la versión. Dos archivos con el mismo timestamp **no** se
> aplican: el CLI los corre los dos y el segundo falla con
> `policy ... already exists` a mitad de camino. Si agregás una migración,
> revisá que el timestamp sea único.

### Alternativa: SQL Editor

Ejecutar los archivos **en orden numérico** en el SQL Editor del dashboard.
Los archivos 001–008 no son idempotentes (usan `create table`, no
`create table if not exists`) porque `supabase db push` los ejecuta una sola vez
registrándolos en `supabase_migrations.schema_migrations`. Si los corrés a mano,
correlos **una única vez y en orden**.

El 009 sí es idempotente (`ON CONFLICT DO NOTHING`) y se puede repetir.

---

## Datos iniciales

`supabase/seed.sql` incluye la migración 009 con `\ir`, de modo que hay una sola
fuente de verdad. Carga 6 coordinaciones, 6 servicios, 10 tipos de establecimiento,
4 grupos de atención y 6 fuentes de financiamiento.

> **El seed y la base pueden diferir, y hoy diferir en servicios.** El seed
> siembra 6 servicios; la base tiene 7, porque "Taller comunitario" (Psicología)
> se agregó desde la pantalla de servicios y no llegó al seed. Todos los inserts
> son `ON CONFLICT DO NOTHING`, así que volver a correr el seed no rompe nada,
> pero un entorno nuevo arranca con 6.
>
> Si querés que el entorno nuevo nazca igual que producción, hay que agregar el
> servicio al `insert into public.servicios` de la migración 009. No lo hice
> porque es una migración ya aplicada: cambiarla rompe la trazabilidad de lo que
> se corrió y en qué orden. Lo correcto sería una migración 016 que lo inserte.

```bash
# aplicar el seed a mano
psql "$DB_URL" -f supabase/seed.sql
```

En desarrollo local, `supabase db reset` ya lo corre solo (`[db.seed]` en
`config.toml`).

---

## Crear el primer admin

**El rol se fuerza siempre a `coordinador` al registrarse.** El trigger
`handle_new_user()` ignora a propósito el campo `rol` de los metadatos del
usuario: si lo honrara, cualquiera que se registrara desde el cliente podría
auto-asignarse admin. La promoción es siempre una decisión explícita:

```sql
-- 1. crear el usuario (Dashboard → Authentication → Add user, o signup desde la app)
-- 2. promoverlo:
update public.profiles
   set rol = 'admin'
 where email = 'admin@organizacion.org';
```

Y asignarle una coordinación a cada coordinador:

```sql
update public.profiles
   set coordinacion_id = (select id from public.coordinaciones where nombre = 'Psicología')
 where email = 'coordinador@organizacion.org';
```

Los admins pueden tener `coordinacion_id` NULL: la RLS les da acceso a todo de
todos modos.

---

## Edge Function: crear-usuario

Crear un usuario de Supabase Auth exige la **API admin**, que necesita la
`service_role`. Esa clave no puede ir en el frontend (viaja en el binario de Tauri
y es extraíble), así que la creación de usuarios pasa por una Edge Function:

```
POST /functions/v1/crear-usuario
{ "email", "password", "nombre", "rol", "coordinacion_id" }
```

La función verifica que quien llama es admin (con su propio JWT, no con la
`service_role`) y después crea el usuario con la `service_role`. El rol y la
coordinación se aplican sobre `public.profiles`, que es donde la app los lee.

**Deployar** (desde la raíz del proyecto):

```bash
npx supabase functions deploy crear-usuario --project-ref sgyekoxqbfvhovkiulny
```

Detalles del implementation que importan:

- El cliente de la función va con la **anon key**, pero tiene que mandar el JWT del
  usuario en el header `Authorization` de **cada** request. Sin eso la RLS ve
  `auth.uid()` como `NULL` y la query de `profiles` no devuelve nada.
- El `apikey` también es obligatorio: sin él la plataforma responde `401` antes de
  correr la función.
- El rol y la coordinación se aplican con un `UPDATE` sobre `profiles` después de
  crear el usuario, porque el trigger `handle_new_user()` ya creó el perfil con rol
  `coordinador`.

---

## Contrato de exportación 345W

El .xlsx se genera en el cliente con **`exceljs`**, que
se carga por `import()` dinámico para que sus ~925 KB solo entren a la memoria
cuando se exporta. El backend solo garantiza que la vista devuelva los datos
correctos y que la RLS limite quién puede ver qué.

> **La única Edge Function es `crear-usuario`**, y existe por una razón precisa:
> crear usuarios exige la API admin de Auth, que necesita la `service_role`, y esa
> clave no puede ir en el frontend. Ver [Edge Function: crear-usuario](#edge-function-crear-usuario).

> **Por qué `exceljs` y no `xlsx`.** El `latest` de npm para `xlsx` es `0.18.5`,
> congelado: SheetJS dejó de publicar en npm y distribuye desde su propio CDN.
> Esa versión arrastra CVEs conocidos (prototype pollution CVE-2023-30533,
> ReDoS CVE-2024-22363) que solo están parcheados en 0.19.3+/0.20.x, y que en
> npm no existen. Para una app que maneja datos personales de personas atendidas,
> no conviene embeberla.

### Hojas del archivo

La exportación produce un .xlsx con **tres hojas**:

| Hoja | Contenido | Notas |
|---|---|---|
| `345W` | Las 21 columnas, una fila por jornada | El contrato con la ONU. No se toca. |
| `Edades` | 9 de identificación + 7 rangos × 2 sexos | Encabezado de dos filas, con el rango fusionado sobre su par |
| `Personas` | Una fila por persona atendida | Opcional. Sale con cédula y nombre: son datos personales identificables |

Las dos hojas nuevas van aparte a propósito: agregar columnas a la del 345W
rompería la validación de la ONU, que espera ese orden exacto.

### Consulta

```ts
const { data, error } = await supabase
  .from('v_agregados_actividad')
  .select('*')
  .gte('mes_reporte', desde)   // YYYY-MM-DD
  .lte('mes_reporte', hasta)
  .in('estado', ['enviada', 'validada'])
  .in('actividad_id', seleccionadas)   // opcional: el checklist
  .order('mes_reporte')
```

- `mes_reporte` se filtra por rango, no por `fecha`.
- Por defecto entran solo `enviada` y `validada`: el 345W se alimenta de lo ya
  enviado, no de borradores. Para revisar borradores, quitar el `.in('estado', …)`.
- `seleccionadas` viene del checklist de la pantalla: se acota lo que el rango ya
  trajo. Sin ese `.in()`, el comportamiento es el de antes, exportar el rango.
- La consulta usa la sesión del usuario (`authenticated`), **no** la
  `service_role`: así un coordinador solo puede exportar su propia coordinación
  y un admin todas.
- El detalle por persona va en lotes de 100 ids: un `.in()` con 200 uuids supera
  el largo de URL que acepta PostgREST.

### Orden exacto de columnas del Excel

El orden importa, la ONU lo valida. Este es el mapeo desde la vista:

| # | Columna del Excel | Origen |
|---|---|---|
| 1 | `REPORTING MONTH` | `fecha` → `YYYY-MM-DD` |
| 2 | `Coordinacion` | `coordinacion` |
| 3 | `DEPARTMENT` | `estado_ubicacion` |
| 4 | `MUNICIPALITY` | `municipio` |
| 5 | `ADMIN 3` | `parroquia` |
| 6 | `ESTABLISHMENT NAME` | `establecimiento` |
| 7 | `ESTABLISHMENT TYPE` | `tipo_establecimiento` |
| 8 | `Latitud` | `latitud` |
| 9 | `Longitud` | `longitud` |
| 10 | `Total of people reached` | `total_atenciones` |
| 11 | `Girls` | `girls` |
| 12 | `Boys` | `boys` |
| 13 | `Female` | `female` |
| 14 | `Male` | `male` |
| 15 | `Elderly Female` | `elderly_female` |
| 16 | `Elderly Male` | `elderly_male` |
| 17 | `Número de población indígena` | `indigenas` |
| 18 | `Número de personas con discapacidad` | `discapacidad` |
| 19 | `Número de personas embarazadas o en lactancia` | `gestantes` |
| 20 | `Número de personas LGBTIQ+` | `lgbtiq` |
| 21 | `Número de víctimas de Trata de Personas` | `victimas_trata` |

> **DEPARTMENT** se llama así por el formato de la ONU, pero su origen es
> `estado_ubicacion`, el estado geográfico de Venezuela (la migración 014 lo
> agregó). Antes salía vacío a propósito porque no había provincia en el modelo.

El mapeo vive en **`src/lib/columnas345w.js`**, en un solo arreglo sin
dependencias: de ahí salen tanto la cabecera del Excel como el valor de cada
celda, y las hojas `Edades` y `Personas` arman sus columnas de identificación a
partir de las mismas entradas. Tener la lista de cabeceras y la de fórmulas en
dos arreglos separados es la forma fácil de que se desincronicen y el .xlsx salga
con columnas corridas.

> Está en su propio archivo, y no en `export345w.js`, para que
> `scripts/verify-edades.mjs` pueda importarlo con node pelado: el módulo de
> exportación arrastra el cliente de Supabase, que lee `import.meta.env` y solo
> existe bajo Vite. El orden de las 21 columnas es justo lo que hay que poder
> verificar sin levantar la app.

```js
export const COLUMNAS = [
  { excel: 'REPORTING MONTH', origen: 'fecha', formato: 'YYYY-MM-DD', grupo: 'identificacion' },
  { excel: 'Coordinacion', origen: 'coordinacion', grupo: 'identificacion' },
  { excel: 'DEPARTMENT', origen: 'estado_ubicacion', grupo: 'identificacion' },
  // ...las 21 columnas, en el orden de la tabla de arriba
]

export const IDENTIFICACION = COLUMNAS.filter((c) => c.grupo === 'identificacion')
```

El `formato: 'YYYY-MM-DD'` recorta `fecha` a `YYYY-MM-DD` por slicing de texto, así
que la columna queda como texto y no como fecha serial de Excel.

Cada fila que vuelve de la vista se valida con **Zod** antes de exportarse: los
agregados son `NOT NULL` por construcción (`count()::int`), así que si alguno
llegara `null` es que el contrato cambió y preferimos que falle en la app y no
con un número faltante en el archivo de la ONU.

### Rangos de edad

La vista (migración 015) agrega 14 columnas, una por par rango × sexo:

| Rango | SQL | Columnas |
|---|---|---|
| 0-5 | `edad between 0 and 5` | `edad_0_5_f`, `edad_0_5_m` |
| 6-19 | `edad between 6 and 19` | `edad_6_19_f`, `edad_6_19_m` |
| 20-49 | `edad between 20 and 49` | `edad_20_49_f`, `edad_20_49_m` |
| 50-59 | `edad between 50 and 59` | `edad_50_59_f`, `edad_50_59_m` |
| 60-69 | `edad between 60 and 69` | `edad_60_69_f`, `edad_60_69_m` |
| 70-79 | `edad between 70 and 79` | `edad_70_79_f`, `edad_70_79_m` |
| 80+ | `edad >= 80` | `edad_80_mas_f`, `edad_80_mas_m` |

`src/lib/edades.js` define los rangos una sola vez y de ahí salen las columnas,
la columna "Rango de edad" de la hoja de detalle y las verificaciones.

> **Las 14 columnas no suman `total_atenciones`, y no es un error.** Quedan
> afuera quienes tienen sexo `O` o sin sexo cargado (misma convención que
> `girls`/`boys`/`female`/`male` desde la migración 007: meterlos en una columna
> binaria falsearía el dato) y quienes tienen `edad IS NULL`, porque en SQL una
> comparación con `NULL` da `NULL` y no cuenta.

El sufijo de la clave va en **minúscula** (`edad_0_5_f`). Postgres devuelve los
nombres tal como están escritos en la vista, así que con mayúscula el mapeo no
encuentra el valor y la celda sale vacía.

### Cómo llega el archivo a disco

En Tauri v2 el webview **no puede escribir en disco**: un `<a download>` o una
blob URL no disparan un guardado. El camino es en dos pasos:

1. `save()` de `@tauri-apps/plugin-dialog` le pregunta al usuario la ruta.
2. Un comando propio de Rust la escribe.

```js
const ruta = await save({ defaultPath: nombreArchivo345W(desde, hasta), /* … */ })
if (!ruta) return null            // el usuario canceló

await invoke('escribir_archivo', { ruta, contenido: Array.from(new Uint8Array(buffer)) })
```

`escribir_archivo` está en `src-tauri/src/lib.rs` y es un comando **de la app**,
no de un plugin: por eso no aparece en `capabilities/default.json`, porque el ACL
solo gobierna los comandos de los plugins. Lo que sí necesita permiso es el
diálogo, y para eso está `dialog:default`, que expande a
`["allow-message", "allow-save", "allow-open"]`.

> Si alguna vez hace falta **leer** archivos (importar un .xlsx previo, por
> ejemplo), ahí sí conviene agregar `tauri-plugin-fs`: su API tiene permisos con
> scope y hay que declarar el alcance en la capability.

### Semántica de los agregados

| Indicador | Regla |
|---|---|
| `Total of people reached` | cantidad de **atenciones** (personas), no de servicios |
| `Girls` | `edad < 18` y sexo `F` |
| `Boys` | `edad < 18` y sexo `M` |
| `Female` | `edad >= 18` y sexo `F` |
| `Male` | `edad >= 18` y sexo `M` |
| `Elderly Female` / `Elderly Male` | `edad >= 60`, **subconjunto** de Female/Male |
| Resto | suma de los flags `indigena`, `discapacidad`, `gestante`, `lgbtiq`, `victima_trata` |

Dos consecuencias que conviene conocer antes de reportar los números:

- Girls/Boys y Female/Male son excluyentes, pero **los elderly se solapan** con
  Female/Male: una mujer de 65 cuenta en `female` y en `elderly_female`. Es lo
  que pide el 345W, no un error.
- Quien tiene sexo `O` **no** se suma a `Female` ni a `Male`, así que
  `total` puede no ser igual a `girls + boys + female + male`. Forzar esas
  personas dentro de una categoría binaria falsearía el dato.

---

## Seguridad

La RLS filtra **qué filas** puede ver cada quien, pero no impide que un `UPDATE`
cambie la columna que decide la visibilidad. Por eso hay **dos capas**:

- **RLS** — quién accede a qué fila.
- **Triggers** — congelan `estado` y la morbilidad una vez que la actividad sale
  de `borrador`, para que nadie lo esquive desde dentro de un `UPDATE`.

| Trigger | Tabla | Momento | Qué hace |
|---|---|---|---|
| `*_set_updated_at` (5) | coordinaciones, servicios, profiles, actividades, atenciones | BEFORE UPDATE | refresca `updated_at` |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | crea `profiles` (rol forzado a `coordinador`) |
| `trg_bloquear_edicion_actividad` | actividades | BEFORE UPDATE | solo admin edita fuera de `borrador` |
| `trg_bloquear_atencion_si_enviada` | atenciones | BEFORE INSERT/UPDATE/DELETE | idem, sobre la morbilidad |
| `trg_bloquear_atencion_servicio_si_enviada` | atencion_servicios | BEFORE INSERT/UPDATE/DELETE | idem, sobre el pivote de servicios |

Los tres triggers de bloqueo hacen `if auth.uid() is null then return` — sin JWT
no hay sesión que sea un cliente (es `service_role` o el SQL Editor), y bloquearlo
haría imposible el mantenimiento legítimo.

`anon` no tiene ningún permiso: son datos personales de personas atendidas.

---

## Variables de entorno

**Las `VITE_` las necesita la app cliente (Tauri/Vue).** La Edge Function corre en
el servidor de Supabase y lee las suyas propias (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), que el platform inyecta: no
hace falta declararlas en ningún `.env`.

| Variable | Dónde | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | cliente | `https://sgyekoxqbfvhovkiulny.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | cliente | la **clave publicable** (`sb_publishable_…`). Dashboard → Project Settings → API Keys |

El prefijo `VITE_` no es opcional: Vite solo expone al bundle las variables que
lo llevan, y sin eso `import.meta.env.VITE_*` llega `undefined`. Se leen en
`src/lib/supabase.js`, que falla con un mensaje explícito si faltan.

`.env` está en `.gitignore`; `.env.example` es la plantilla que sí se versiona.

> **Nunca empaquetar la `service_role` ni la `sb_secret_` dentro de la app de
> Tauri.** El binario va firmado y distribuido: cualquiera podría extraerla y
> saltarse la RLS para leer los datos de todas las coordinaciones. Todo lo que
> la app necesita ya está permitido por la RLS con la sesión del usuario.
>
> La clave publicable **sí** va en el bundle, y eso es lo esperado: equivale al
> rol `anon`, que no tiene ningún permiso. Lo que protege los datos es la RLS,
> no la ocultación de la clave.

---

## App móvil (Android)

Segundo cliente, mismo backend. La idea es que un coordinador capture jornadas
desde el teléfono, sin escritorio y sin buena conexión.

**No hace falta cambiar nada del servidor.** El esquema, la RLS y los RPC ya
sirven: son la misma API que consume el cliente de escritorio.

El cliente móvil es **la misma app Tauri**, no una reimplementación. Se compila
para Android con `pnpm tauri android build` y el resultado es el mismo código
Vue, los mismos componentes Vuetify y los mismos comandos Rust que en
escritorio. Por eso no hay una capa visual duplicada que mantener.

> **Alcance: capturar y leer.** El coordinador registra jornadas y personas
> desde el teléfono. La exportación 345W y la planilla en papel siguen siendo
> tareas de escritorio y sus accesos se ocultan en móvil (ver
> [`src/lib/plataforma.js`](src/lib/plataforma.js)). No es una limitación
> técnica: el `.xlsx` son 21 columnas que en un celular no se pueden leer, y la
> planilla existe para imprimir.

### Qué se reusa y qué no

| Pieza | ¿Se porta? | Nota |
|---|---|---|
| Esquema, RLS, RPC | ✅ | sin cambios, es la misma API |
| Todo `src/lib/*` | ✅ | puro JS, sin dependencias de escritorio |
| `stores/actividades.js` y `stores/auth.js` | ✅ | `localStorage` existe en WebView y en WKWebView, así que no hace falta adaptador de storage |
| Componentes de UI (Vuetify) | ✅ | corren igual; el trabajo fue de layout, no de reescritura |
| `tauri-plugin-dialog` / `opener` | ✅ | los dos soportan Android |
| `tauri-plugin-geolocation` | ⚠️ | soporta Android, pero en escritorio es un stub que devuelve 0,0 — por eso su botón es solo de móvil |
| Planilla PDF (`printpdf` en Rust) | ✅ | `printpdf`, `lopdf`, `owned_ttf_parser` y `time` cross-compilan a `aarch64-linux-android` |
| `exceljs` (~925 KB) | ⚠️ | funciona, pero la función se oculta. Es un `import()` dinámico, así que queda en un chunk aparte que en móvil nunca se descarga |

### Autenticación y sesión

`src/lib/supabase.js` no cambia: `persistSession: true` guarda el refresh token
en `localStorage`, y tanto el WebView de Android como el WKWebView de iOS lo
tienen. No hace falta adaptador de storage, que era el problema principal del
runtime de Lynx que se evaluó antes de elegir Tauri.

Dos cosas que sí importan en móvil:

**1. Nunca la `service_role`.** Igual que en escritorio, pero acá pesa más: un
APK se puede descompilar. Con la clave publicable (`sb_publishable_…`) y la
sesión del usuario, la RLS ya limita todo. Va en el bundle sin culpa.

**2. La sesión sobrevive al cierre.** El `refresh token` queda en el
`localStorage` del WebView. Al reabrir, `supabase.auth.getSession()` lo
rehidrata solo, y `stores/auth.js` lo llama en `init()` desde el guard del
router, antes de cualquier consulta. Si la app pidiera datos sin sesión
recuperada, PostgREST respondería 401 y la UI mostraría "sin permisos" en vez de
"cargando".

### La trampa de `edad` y `sexo`

Este bug no es de móvil, pero en el campo es más probable que ocurra: se captura
en el campo, a veces sin edad y sin sexo.

```js
// MAL: Number(null) es 0, la persona entra como de 0 a 5 años
const rango = Number(a.edad) < 6 ? '0-5' : '...'

// BIEN: el null se trata antes de clasificar
const rango = a.edad === null ? null : clasificarEdad(a.edad)
```

`src/lib/edades.js` ya devuelve `null` para ese caso y `morbilidad.js` tiene el
problema (`Number(a.edad)` en la línea 19). Si algún día el móvil usa
`morbilidad.js` para mostrar conteos en vivo, hay que arreglarlo antes.

### Exportación en móvil

`exceljs` mide ~925 KB pero **funciona** en el WebView: es JavaScript puro y
corre en el mismo motor que el resto de la app. No hay una razón técnica para
sacarlo.

Lo que sí hay es una razón de producto, y por eso `guardarXlsx` no se ejecuta en
el móvil: el enlace del sidebar se oculta con `v-if="!ES_MOVIL"` y la ruta
`/exportar` se bloquea en el guard del router con `meta: { soloEscritorio: true }`.
Sin lo segundo, ocultar el enlace no alcanzaría: la ruta seguiría entrando por
URL o por el historial.

> **Por qué ocultarla y no deshabilitarla.** Un botón que está visible y al
> tocarlo dice "no disponible" es peor que un botón que no está. El `.xlsx` de
> 21 columnas es un documento para la ONU, no algo que se cargue en el campo.

### Planilla en papel en móvil

La planilla **funciona en móvil**: el comando `generar_pdf_planilla` es puro
cálculo en Rust y ya se verificó que `printpdf`, `lopdf`, `owned_ttf_parser`,
`time` e `image` cross-compilan a `aarch64-linux-android`. El PDF sale idéntico
al de escritorio.

El botón también se oculta, pero por lo mismo que la exportación: la planilla es
una plantilla para imprimir y llenar a mano. En el campo se usa el formulario de
la app, no el papel.

> **Ojo con el guardado.** `escribir_archivo` usa `std::fs::write` sobre la ruta
> que devuelve `save()` del plugin `dialog`. En móvil eso **no funciona**: el
> diálogo no devuelve una ruta del sistema de archivos sino un URI —`content://`
> en Android, `file://` en iOS— y `std::fs` no abre ninguno de los dos. Si alguna
> vez se quiere exportar desde el móvil, la solución es `tauri-plugin-fs`, cuyo
> `writeFile` normaliza los tres formatos. Por ahora no hace falta porque la
> función está oculta.

### Geolocalización

`tauri-plugin-geolocation` funciona en Android. El plugin inyecta
`ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION` en el manifest al compilar, así
que no hay que declararlas a mano, y `capabilities/default.json` ya lista los tres
comandos que el código usa: `allow-check-permissions`, `allow-request-permissions`
y `allow-get-current-position`.

> **El GPS no funcionaba por dos bugs, ninguno de ellos del plugin.** El primero
> fue `capabilities/default.json` pidiendo `geolocation:default`, que no existe:
> es el único plugin del proyecto sin `default_permission`. El segundo, y el que
> quedaba después de arreglar el primero, era que `ActividadForm.vue` llamaba a
> `isPermissionGranted()` y `requestPermission()`, que son los nombres de la
> **API v1** de Tauri. En v2 las funciones son `checkPermissions()` y
> `requestPermissions()`, y devuelven un objeto `{ location, coarseLocation }`,
> no el string `'granted'`. La llamada vieja tiraba `TypeError` y el `catch`
> mostraba "No se pudo leer la ubicacion", el mismo mensaje para un error de
> código y para uno de señal.

Tres detalles que no son opcionales:

**1. Aceptar la ubicación aproximada.** En Android 12+ la persona puede conceder
solo `ACCESS_COARSE_LOCATION`. El alias `location` del plugin exige *ambas*
permisos, así que `location` queda sin conceder aunque `coarseLocation` sí lo
esté. Por eso `ubicar()` acepta cualquiera de las dos.

**2. Pedir alta precisión explícitamente.** `getCurrentPosition()` sin opciones
deja `enableHighAccuracy: false` y `maximumAge: 0`. Con `maximumAge: 0` el
plugin descarta la última posición conocida (`Geolocation.kt:135`), y sin alta
precisión pide `PRIORITY_LOW_POWER`, que adentro de un edificio no resuelve
nunca. Se pasa `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }`.

**3. El botón es solo de móvil.** En escritorio el plugin es un stub
(`src/desktop.rs:36-50`): `get_current_position` devuelve `Position::default()`
—latitud 0, longitud 0— y los permisos siempre `Prompt`. El botón está detrás
de `v-if="ES_MOVIL"`, igual que la exportación y la planilla, porque un botón
que al tocarlo dice "no disponible" es peor que un botón que no está.

El criterio de producto se mantiene: **el GPS es opcional y todos los campos se
pueden tipear a mano**. Si el permiso se deniega o no hay señal, la app sigue
funcionando. El `catch` loguea el error real antes de mostrar el mensaje: un
fallo en campo sin log es un fallo que no se puede diagnosticar.

En iOS hay que agregar `NSLocationWhenInUseUsageDescription` a `Info.plist`: sin
esa descripción, iOS **cierra la app** al pedir ubicación.

### Compilar y probar

Una sola vez por máquina:

```powershell
# 1. Android Studio -> SDK Manager: Android SDK Platform, Build-Tools,
#    Platform-Tools, NDK (Side by side), Command-line Tools
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LocalAppData\Android\Sdk\ndk\<version>", "User")

# 2. JDK 17, 20 o 21. Ver la nota de Gradle abajo.
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "<ruta al JDK>", "User")

# 3. Targets de Rust
rustup target add aarch64-linux-android x86_64-linux-android

# 4. Una vez por proyecto: genera src-tauri/gen/android/
pnpm tauri android init --ci
```

Y después, cada vez:

```powershell
pnpm tauri android dev --host <ip-de-la-lan>     # con recarga en caliente
pnpm tauri android build --debug --apk --target aarch64
```

> **El JDK tiene que ser 17, 20 o 21.** No 25. La plantilla de Tauri fija Gradle
> 8.14.3 y AGP 8.11, y según la [matriz de compatibilidad de Gradle](),
> correr Gradle sobre JDK 25 necesita Gradle 9.1 o superior. Con JDK 25 el build
> falla con un error poco descriptivo. El JBR que trae Android Studio es un JDK
> 25, así que **no** hay que apuntar `JAVA_HOME` a él: hay que instalar un JDK 21
> aparte (Temurin sirve) y apuntar ahí.

> **Windows Developer Mode es obligatorio.** Al generar el APK, Tauri crea un
> symlink del `.so` compilado en `gen/android/app/src/main/jniLibs/arm64-v8a`. Sin
> Modo desarrollador, Windows responde "Creation symbolic link is not allowed for
> this system" y el build falla al final, después de haber compilado todo Rust.
> Se activa en Ajustes → Privacidad y seguridad → Para desarrolladores.

#### Conectar el teléfono

Un cable USB-C a USB-C común viene **sin líneas de datos**, y aun siendo uno de
datos, Windows exige que el teléfono quede con el driver WinUSB enlazado, que es
un paso manual y frágil por fabricante. Para Android 11 o superior no hace
falta cable: usar **depuración wireless**.

En el teléfono: Opciones de desarrollador → **Depuración wireless** → *Emparejar
dispositivo mediante código*. Después:

```powershell
adb pair <ip>:<puerto> <codigo-de-6-digitos>
adb connect <ip>:<puerto>
```

Requiere que el teléfono y la PC estén en la misma red, que es justo lo que
necesita el dev server para `tauri android dev`.

> `adb` no viene en el `PATH`. O se agrega
> `%LOCALAPPDATA%\Android\Sdk\platform-tools`, o se llama con la ruta completa.

### Orden de trabajo sugerido

1. Cliente de Supabase con storage nativo, login, y recuperar sesión al arrancar.
2. Listado de jornadas del mes + detalle. Con esto ya se cubre la lectura, que es
   el 80% del uso real.
3. Captura de una jornada y de una atención.
4. Transiciones de estado por RPC.
5. Solo después: exportación y planilla.

Los pasos 1–4 no tocan nada que no esté en el contrato de datos de arriba.

### Qué NO hacer

- **No agregar columnas a `v_agregados_actividad` pensando en el móvil.** La
  vista es el contrato del 345W; si aparece una necesidad nueva, va en otra hoja
  del Excel o en una vista aparte.
- **No duplicar reglas de negocio en el cliente.** Los agregados los calcula la
  vista. Si el móvil calcula los suyos y no coinciden con el Excel, el admin ve
  dos números distintos y no sabe cuál es el bueno.
- **No abrir la RLS "para que funcione".** Si un coordinador no ve algo que
  debería, el bug está en la consulta del cliente, no en la política.

---

```sql
-- tablas
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;

-- políticas RLS (28: 24 base + 3 de 012 + 1 de 013)
select tablename, policyname, cmd from pg_policies
  where schemaname = 'public' order by tablename, cmd;

-- triggers
select event_object_table, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public' order by event_object_table, trigger_name;

-- la vista está aislada (security_invoker)
select reloptions from pg_class where relname = 'v_agregados_actividad';
```

---

## Desarrollo local

Con Docker disponible, se puede levantar un stack local de Supabase:

```bash
supabase start          # Postgres + Auth + Storage locales (requiere Docker)
supabase db reset       # aplica migraciones + seed sobre el stack local
```

> **No uses `supabase db reset --linked` salvo que quieras borrar los datos del
> proyecto remoto.** A diferencia del `db reset` normal, que solo toca el stack
> local, el `--linked` aplica el reset sobre el proyecto de Supabase en la nube:
> deja las 9 tablas vacías y tira los usuarios. Las migraciones de arriba se
> aplican con `supabase db push --linked`, que es aditivo y no borra nada.

Para la app:

```bash
pnpm install
cp .env.example .env     # y completar la clave publicable
pnpm tauri dev
```

Los tests que no necesitan base (el binario de Rust y los dos scripts de node):

```bash
cd src-tauri && cargo test --lib   # 18 tests: geometría de la planilla PDF
pnpm build                         # compila el frontend
node scripts/verify-edades.mjs     # 17 checks: rangos y contrato del 345W
node scripts/verify-export.mjs     # 14 checks: arma el .xlsx de verdad
```

`cargo clippy --all-targets` tiene que salir limpio. En el script no hay lint de
JavaScript: el proyecto no tiene ESLint configurado.

### Estructura del frontend

| Archivo | Qué hace |
|---|---|
| `src/plugins/vuetify.js` | `createVuetify`: iconset `lucide`, locale `es`, tema claro. Importa `main.css` **después** de `vuetify/styles` para que las reglas propias ganen. |
| `src/plugins/iconset-lucide.js` | Aliases de Vuetify traducidos a componentes de `lucide-vue-next` |
| `src/assets/main.css` | Sistema de diseño: tokens, papel cálido, azul ONU, retícula, estados, tira de conteos, impresión |
| `src/lib/supabase.js` | cliente con la clave publicable |
| `src/lib/catalogos.js` | los 5 catálogos, cacheados en memoria |
| `src/lib/morbilidad.js` | conteos 345W del cliente y las dos advertencias de captura |
| `src/lib/fechas.js` | `YYYY-MM` ↔ `YYYY-MM-DD`, sin `new Date()` para parsear |
| `src/lib/columnas345w.js` | el contrato de las 21 columnas, sin dependencias, para poder verificarlo con node |
| `src/lib/edades.js` | los 7 rangos de edad, el clasificador y las 14 columnas del desglose |
| `src/lib/esquemas.js` | schemas Zod de los formularios, y la validación antes de cada `INSERT` |
| `src/lib/xlsx.js` | armado de las 3 hojas del .xlsx, sin Supabase ni Tauri, para que sea testeable |
| `src/lib/export345w.js` | consultas a la base y guardado del archivo |
| `src/lib/pdfPlanilla.js` | arma la planilla en blanco para llenar a mano y la pide a Rust |
| `src/stores/auth.js` | sesión de Supabase + perfil de `profiles` |
| `src/stores/actividades.js` | jornada abierta, lista, atenciones, servicios y transiciones |
| `src/router.js` | rutas con guard de autenticación |
| `src/components/AppShell.vue` | sidebar + barra superior + router-view. El sidebar es permanente en escritorio y temporal en mobile |
| `src/components/ActividadForm.vue` | cabecera de la jornada, guardado al salir del campo |
| `src/components/AtencionesGrid.vue` | grilla de carga masiva (Enter salta de columna) |
| `src/components/AtencionDialog.vue` | edición de una persona + sus servicios |
| `src/components/TiraConteos.vue` | conteos 345W en vivo |
| `src/components/ConfirmarDialog.vue` | confirmación reutilizable para acciones destructivas |
| `src/components/EmptyState.vue` | estado vacío con icono y texto (lista sin datos) |
| `src/components/EstadoChip.vue` | chip de `borrador` / `enviada` / `validada` |
| `src/components/AppBar.vue` | barra superior (desktop). En mobile la navegación va en `AppShell` |
| `src/App.vue` | raíz: solo `<router-view>` |
| `src/main.js` | arranque: monta Vue, crea Pinia, registra Vuetify y el router |
| `src/views/ActividadesView.vue` | lista de jornadas |
| `src/views/ActividadView.vue` | pantalla de captura |
| `src/views/HomeView.vue` | exportación del .xlsx: rango de meses, checklist de jornadas y hojas |
| `src/views/LoginView.vue` | pantalla de login |
| `src/views/ServiciosView.vue` | coordinador: CRUD de servicios de su coordinación |
| `src/views/UsuariosView.vue` | admin: crear (Edge Function), editar, desactivar |
| `src/views/CatalogosView.vue` | admin: CRUD de los 4 catálogos, con tabs |
| `src/views/PerfilView.vue` | editar nombre y cambiar contraseña |

### Navegación

El sidebar (`AppShell.vue`) es la navegación principal. Qué ve cada rol:

| Destino | Ruta | Coordinador | Admin |
|---|---|---|---|
| Actividades | `/actividades` | ✓ | ✓ |
| Exportar a Excel | `/exportar` | ✓ | ✓ |
| Servicios | `/servicios` | ✓ | — (desde Catálogos) |
| Usuarios | `/usuarios` | — | ✓ |
| Catálogos | `/catalogos` | — | ✓ |
| Perfil | `/perfil` | ✓ | ✓ |

El sidebar es **permanente** en escritorio y **temporal** en mobile, con un botón
hamburguesa para abrirlo. En la barra superior queda solo lo que depende de la
sesión: la coordinación y el rol.

Dos decisiones que conviene no deshacer sin pensarlo:

- **`lucide-vue-next`, no `@mdi`.** Vuetify no trae un iconset de lucide, así
  que hay uno propio en `src/plugins/iconset-lucide.js`. La clave de cómo
  funciona: en `useIcon`, si el valor del icono **no es un string**, Vuetify
  usa `VComponentIcon` y renderiza el componente tal cual. Por eso los aliases
  se exportan como componentes (`collapse: ChevronUp`) y no como paths SVG.
  Dos detalles que hay que respetar:
  - Los imports son **nombrados**. Un `import * as` metería los ~5.800 iconos
    de la librería al bundle y arruinaría el tree-shaking.
  - Lucide dibuja el `svg` con `width`/`height` fijos en 24 e ignora el prop
    `size` de Vuetify, así que en `main.css` hay una regla `.v-icon > svg
    { width: 1em; height: 1em }` para que el icono siga el `font-size` del
    `v-icon`, que es lo que Vuetify cambia con `size`.
- **`createWebHashHistory`, no `createWebHistory`.** En el build de Tauri el
  protocolo de assets no sabe servir `/actividades`, así que con history API un
  refresh daría 404. Con el hash, el webview siempre resuelve `index.html`.

El `csp` de `tauri.conf.json` ya está definido (permite `connect-src` a
`https://*.supabase.co` y `wss://*.supabase.co` para el Realtime). **Todavía no
se probó con la sesión real en el webview**: una CSP mal escrita rompe el login
de forma silenciosa, así que conviene revisarlo en el primer `pnpm tauri dev`
contra un proyecto real.

### El lado Rust

`src-tauri/` tiene **un solo propósito**: lo que el webview no puede hacer por su
propio cuenta. Todo lo demás —leer datos, escribir en Supabase, la lógica de
negocio— vive en el frontend. Esa frontera es deliberada y es la que permite que
la app ande igual en el escritorio y en el teléfono.

```
src-tauri/
├── src/
│   ├── lib.rs        2 comandos + 3 plugins + el entry point
│   ├── planilla.rs   el PDF de la planilla en blanco
│   └── main.rs       entry point de escritorio (delegado)
├── tauri.conf.json   config, CSP, capabilities
├── capabilities/     permisos del ACL
└── gen/              proyectos nativos generados — NO editar a mano
```

#### Los dos comandos

| Comando | Qué hace | Dónde se usa |
|---|---|---|
| `escribir_archivo(ruta, contenido)` | Escribe bytes en una ruta elegida por el usuario | Exportar 345W · planilla PDF |
| `generar_pdf_planilla(datos)` | Arma el PDF de la planilla en blanco y devuelve los bytes | El ícono de impresora de la jornada |

Ninguno de los dos necesita permiso de disco: el usuario elige dónde guardar con
el `dialog` plugin, y el comando escribe solo ahí. El flujo completo está en
[Cómo llega el archivo a disco](#cómo-llega-el-archivo-a-disco).

> **Por qué no aparecen en `capabilities/default.json`.** El ACL de Tauri
> gobierna los comandos **de los plugins**. Los comandos propios de la app se
> registran en el `invoke_handler` y no necesitan permiso. Escribirlo en las
> capabilities no haría nada, y por eso no está.

#### Los tres plugins

| Plugin | Para qué | Soporta Android |
|---|---|---|
| `tauri-plugin-dialog` | Diálogos nativos de abrir y guardar | Sí |
| `tauri-plugin-opener` | `openPath()` — abrir el archivo generado | Sí |
| `tauri-plugin-geolocation` | GPS para las coordenadas de la jornada | Sí |

Los permisos de cada uno van en `capabilities/default.json`. Ojo con el de
geolocation: **no tiene `default_permission`**, hay que nombrar los comandos
uno por uno (ver [Geolocalización](#geolocalización)).

#### `planilla.rs`

Genera la planilla en blanco: una hoja **A4 horizontal** con el encabezado de la
jornada ya completo y una grilla de 15 renglones para llenar a mano.

Tres decisiones del módulo que conviene conocer antes de tocarlo:

- **La geometría está calculada aparte del dibujo.** `y_de_grilla()` y
  `capacidad_de_filas()` dicen dónde cae cada renglón sin dibujar nada. Eso es lo
  que permite testear que la grilla entra en la hoja y que los renglones quedan
  parejos: el flujo de la página va comprimido con Flate y las coordenadas no se
  pueden leer del PDF generado.
- **El alto de la fila es fijo** (8 mm). Quien llena en campo necesita saber
  cuánto espacio hay entre renglones sin medir la página. El encabezado se
  comprime para que entren los 15.
- **El logo se compone sobre blanco antes de incrustarlo.** Es un workaround de
  un bug de `printpdf` 0.7: escribe la SMask con el ancho de la imagen donde va
  la altura, y una imagen apaisada deja la máscara a medio llenar. El síntoma es
  un **rectángulo negro detrás del logo**. Sin canal alfa no hay SMask y no hay
  bug. Hay un test que falla si alguien vuelve a pasar la imagen con alpha
  (`el_logo_no_lleva_mascara_de_transparencia`).

#### Correr los tests de Rust

```powershell
cd src-tauri
cargo test
```

Los 19 tests viven al final de `planilla.rs` y cubren geometría, paginación,
sanitización de texto y el bug del logo. Uno está marcado `#[ignore]`
(`volcar_para_revision`): deja el PDF en el temporal para mirarlo a ojo, y no
corre en la suite porque escribe en disco.

### Design system

Los estilos viven en `src/assets/main.css` y se manejan por **custom
properties**, no por valores sueltos. Los colores, el espaciado y los radios no
se escriben a mano en los componentes: se referencian.

**Color de texto** — cuatro pasos de énfasis descendente:

| Token | Uso |
|---|---|
| `--tinta` | Títulos y texto principal |
| `--tinta-2` | Texto de apoyo |
| `--tinta-3` | Etiquetas, texto terciario, contra-insets |
| `--tinta-4` | Separadores decorativos, separador `/` de la barra |

**Superficies y reglas:**

| Token | Uso |
|---|---|
| `--superficie` | Fondo de tarjetas y de la app bar |
| `--superficie-2`, `--superficie-3` | Estados hover y deshabilitados |
| `--papel` | Hoja, con una sombra leve |
| `--regla` | Línea de tabla, borde de campo |
| `--regla-fuerte` | Línea de encabezado, pastilla |

**Marca y semánticos:**

| Token | Uso |
|---|---|
| `--azul` | Botón primario, foco |
| `--azul-fuerte` | Estado hover del primario |
| `--azul-tenue` | Fondo de la fila que tiene el foco |
| `--azul-borde` | Borde del estado activo |
| `--aviso`, `--aviso-fondo` | Alerta informativa |
| `--peligro`, `--peligro-fondo`, `--peligro-borde` | Acción destructiva |

**Los tres estados de una jornada.** Cada estado tiene su color, su fondo y su
borde, y los tres los usa `EstadoChip`:

| Estado | Color | Fondo | Borde |
|---|---|---|---|
| Borrador | `--borrador` | `--borrador-fondo` | `--borrador-borde` |
| Enviada | `--enviada` | `--enviada-fondo` | `--enviada-borde` |
| Validada | `--validada` | `--validada-fondo` | `--validada-borde` |

**Espaciado, radios y formas.** La escala `--e-1` a `--e-12` es un múltiplo de
4 px: `--e-2` son 8 px, `--e-4` son 16. Los radios son `--radio-s` (botones,
pastillas) y `--radio-m` (tarjetas). Los campos usan `--alto-campo` y
`--alto-campo-sm` para que la grilla de carga rápida tenga el mismo alto que las
filas de la tabla de arriba.

**Tipografías:**

| Token | Qué es |
|---|---|
| `--fuente-ui` | Archivo, Inter Tight variable |
| `--fuente-cifra` | Números tabulares, Archivo variable |
| `--fuente-mono` | Código, JetBrains Mono |

> **Por qué tipografías variables y no una fuente por peso.** Archivo e Inter
> Tight son variables, así que el peso sale de una sola descarga en vez de
> cuatro. `--fuente-cifra` usa `font-variant-numeric: tabular-nums`: sin eso las
> columnas de conteos bailan cuando el número cambia de largo, y una grilla que
> se mueve sola es más difícil de leer que una que no usa cifras tabulares.

**Insets del sistema** — `--inset-top`, `--inset-bottom`, `--inset-left`,
`--inset-right`. Leen `env(safe-area-inset-*)` y solo valen en móvil; en
escritorio dan `0px`. Ver [App móvil](#app-móvil-android).

### Verificación de la RLS

Los scripts de `scripts/` se dividen en dos grupos.

**Los que no tocan la base** (node pelado, sin claves ni sesión):

```powershell
node scripts/verify-edades.mjs   # rangos de edad y contrato de las 21 columnas
node scripts/verify-export.mjs   # arma el .xlsx de verdad con construirWorkbook
node scripts/verify-esquemas.mjs     # 27 checks: límites de los schemas
```

`verify-edades` es el que importa: verifica que las 21 columnas del 345W sigan
siendo las 21, en el mismo orden y con el mismo origen. Si alguien mueve una
columna, la ONU rechaza el archivo y ningún test del lado de Rust lo notaría,
así que esta lista es la red.

`verify-export` importa el `construirWorkbook` real y relee el archivo del buffer.
Importa, no reimplementa: cuando estas funciones vivían en `export345w.js` —que
arrastra Supabase y Tauri— el script tenía que copiarlas, y la copia terminó
probando menos columnas de las que tiene la hoja real. Eso dejó pasar un bug que
rompía la exportación entera: `getColumn('REPORTING MONTH')` en una hoja sin
claves definidas revienta con *Out of bounds*, porque ExcelJS interpreta el texto
como letra de columna. Por eso el armado vive en `xlsx.js` y el test importa de
ahí.

**Los que corren contra la base real**, crean usuarios de prueba y los borran al
terminar. No están versionados a propósito (ver `.gitignore`): necesitan la
`service_role`, que se lee del CLI en el momento y se pasa por variable de
entorno, nunca en un archivo.

```powershell
.\scripts\run-verify-submit.ps1    # envío, validación, congelamiento de morbilidad
.\scripts\run-verify-revertir.ps1  # reversión, borrado del borrador, puerta angosta
```

El primero cubre la 010 (37 checks) y el segundo la 011 (33 checks). Ambos
terminan en `N OK / 0 FALLA` y borran todo lo que crearon.

### Índice de scripts

Son 17 archivos en `scripts/`. Casi todos tienen un `.mjs` con la lógica y un
`.ps1` que lo envuelve —el `.ps1` pone las variables de entorno y las claves,
así que **hay que correr esos y no los `.mjs` sueltos**.

**Los `lugares:*` de `package.json` ejecutan los `.mjs` directamente**, y eso
solo funciona si ya tenés `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el
entorno.

#### Lugares y geografía

| Comando | Qué hace |
|---|---|
| `lugares:scrapear` | Descarga el padrón de lugares de Venezuela |
| `lugares:build` | Limpia y construye `src/lib/venezuela.js` |
| `lugares:verificar` | Revisa que el padrón esté consistente |
| `lugares:migrar` | Migra los lugares de los datos ya cargados (envuelve `run-migrar-lugares.ps1`) |

Los `.mjs` sueltos son `scrapear-lugares.mjs`, `build-venezuela.mjs`,
`resolver-lugares.mjs`, `migrar-lugares.mjs` y `verify-venezuela.mjs`.
`datos-crudos.json` es el intermedio entre el scrapeo y el build.

#### Verificación

| Script | Qué cubre |
|---|---|
| `verify-esquemas.mjs` | Que los schemas de Zod sigan del contrato de la base |
| `verify-edades.mjs` | Que los rangos de edad clasifiquen igual que la vista |
| `verify-export.mjs` | Que las 3 hojas del `.xlsx` salgan con las columnas y el orden correctos. Importa el código real, no una copia |
| `run-verify-submit.ps1` | La 010: envío, validación y congelamiento de la morbilidad (37 checks) |
| `run-verify-revertir.ps1` | La 011: reversión, borrado del borrador y la puerta angosta (33 checks) |

Los `.mjs` de esos dos (`verify-submit.mjs` y `verify-revertir.mjs`) llevan la
lógica; los `.ps1` son los que hay que correr.

> **Los `verify-*` que no tocan la base** corren con node pelado, sin claves ni
> sesión, y se pueden correr sin red. Los que sí tocan la base necesitan las
> variables de entorno y **crean y borran datos de prueba**: no los corras
> contra una base con carga real.

#### Usuarios de prueba

| Script | Qué hace |
|---|---|
| `run-crear-usuarios-prueba.ps1` | Crea `admin@organizacion.org` y `coordinador@organizacion.org`. **Deja las cuentas vivas** — ver la sección de más abajo |
| `crear-usuarios-prueba.mjs` | La lógica del anterior; el `.ps1` pone las claves y las variables |

### La planilla PDF

El generador de Rust está en `src-tauri/src/planilla.rs`: 18 tests sobre la
geometría de la planilla en blanco (renglones, paginación, encabezado, peso del
archivo). Los comandos que exponen al webview viven en `src-tauri/src/lib.rs`
(`generar_pdf_planilla` y `escribir_archivo`), y `src-tauri/src/main.rs` es solo
el arranque del binario de Tauri.

Un detalle que costó encontrar: **el flujo de la página del PDF va en claro**, se
puede leer con un editor de texto y verificar contra el archivo real. Eso se usó
para confirmar que el logo de la fundación sale sin fondo negro —que era un bug de
`printpdf`, no del PNG— extrayendo los píxeles del PDF generado.

El logo se compone sobre blanco antes de incrustarlo a propósito: `printpdf`
0.7.0 escribe la máscara de transparencia con el ancho de la imagen donde va la
altura, así que con un PNG vertical la deja a medio llenar y el visor la rellena
opaca.

```bash
cd src-tauri
cargo test --lib                        # 18 tests
cargo test --lib volcar -- --ignored     # deja un PDF de muestra en el temp
```

### Usuarios de prueba

Los `verify-*` crean usuarios con sufijo y los borran: sirven para probar la
RLS, no para entrar a la app. Para tener un login manual hace falta otro
script, que **deja las cuentas vivas**:

```powershell
.\scripts\run-crear-usuarios-prueba.ps1 --listar                    # ver coordinaciones
.\scripts\run-crear-usuarios-prueba.ps1 --clave=MiClave123 --coord=Psicologia
```

Crea `admin@organizacion.org` (rol `admin`, sin coordinación) y
`coordinador@organizacion.org` (rol `coordinador`, en la coordinación indicada).
Es idempotente: si el usuario ya existe, le actualiza la contraseña en vez de
fallar. La contraseña va por `--clave` o por `CLAVE_PRUEBA`; si no se pasa
ninguna, genera una y la imprime.

#### ⚠️ Credenciales de desarrollo (borrar cuando termine la prueba)

> **Estas son cuentas reales de acceso en el proyecto remoto.** Andan con
> password conocida y escrita acá a propósito, así que el README **no** debe
> subirse a un repo público. Si eso pasa, lo primero es borrarlas.

| Rol | Email | Contraseña | Coordinacion |
|---|---|---|---|
| **Admin** | `admin@organizacion.org` | `Prueba345W!2026` | (ninguna: ve todo) |
| **Coordinador** | `coordinador@organizacion.org` | `Prueba345W!2026` | Psicología |

Para regenerar con otra contraseña, o para destruirlas:

```powershell
.\scripts\run-crear-usuarios-prueba.ps1 --clave=OtraClave
.\scripts\run-crear-usuarios-prueba.ps1 --borrar
```

`--borrar` elimina los usuarios, **no** las actividades que hayan creado: esas
hay que borrarlas desde la app.

Sobre `--coord`: ignora mayúsculas y tildes, así que `--coord=Psicologia`
encuentra `Psicología`. Sin `--coord` usa la primera coordinación cuyo nombre
empieza con `psico`, o la primera de la lista.

El README original de la plantilla de Tauri quedó reemplazado por este. La
configuración recomendada de VS Code sigue siendo
[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) +
[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode).

---

## Distribución

Compilar el APK está en
[Compilar y probar](#compilar-y-probar). Esto es lo que pasa **después**: cómo
llega el archivo a un coordinador y cómo se actualiza.

### Pasarle la app a un teléfono

La app no está en ninguna tienda: se instala desde el archivo.

1. Pasá el `.apk` al teléfono (Drive, WhatsApp, cable, lo que sirva).
2. Abrilo desde el explorador de archivos o desde el aviso de descarga.
3. Android va a pedir permiso para **instalar apps de orígenes desconocidos**.
   Aceptalo **para la app desde la que lo abriste** (el explorador de archivos),
   no tiene que ser para todas.
4. Se instala y aparece el ícono.

> La app está firmada con un certificado propio, no con el de Play. Android
> muestra el aviso de "origen desconocido" justamente por eso. Es normal para
> una app que no viene de una tienda.

### Actualizar una app ya instalada

Android **no actualiza** si algo de esto cambió:

| Si cambió… | Qué pasa |
|---|---|
| La **firma** | Rechaza la actualización. Reinstallar desde cero |
| El **`identifier`** | Es otra app distinta. Queda la vieja instalada al lado |
| Solo la **`version`** | ✅ Actualiza normal |

Para publicar una versión nueva:

1. Subí el `version` de `tauri.conf.json` (`0.1.0` → `0.1.1`).
2. `versionCode` lo calcula la CLI desde ese número.
3. Compilá y pasá el `.apk` otra vez.

> **El `identifier` no se toca después de publicar.** Es el ID de la app en Play
> y una vez registrado no se puede cambiar. Para este proyecto está en
> `com.data_recollection_ftr`; si la app todavía no salió de la organización,
> este es el momento barato de cambiarlo.

### Qué pasa si se pierde el keystore

**La clave de firma es irrecuperable.** Está en
`%USERPROFILE%\.telar\telar-upload.jks`, con la contraseña al lado en
`credenciales.txt`. Esa carpeta **no está en el repo, a propósito**.

Si se pierde y la app ya se distribuyó:

- Android **rechaza** cualquier APK firmada con otra clave. No hay forma de
  "forzar" la actualización.
- En Google Play es peor: se puede pedir un cambio de clave, pero la app tiene
  que publicarse de nuevo y las instalaciones existentes quedan sin poder
  actualizarse solas.
- Lo que **no** se pierde son los datos: viven en Supabase, no en el teléfono.

Por eso la carpeta tiene que estar respaldada en algún lado que no sea esta
máquina.

### Publicar en Google Play

Para Play hace falta un **App Bundle** (`.aab`), no un `.apk`, y una cuenta de
desarrollador de Google Play (pago único de US$25).

```powershell
pnpm tauri android build --aab --target aarch64
```

La cuenta además va a pedir una **política de privacidad** publicada, porque la
app maneja datos personales identificables (cédula, nombre, condiciones). No es
opcional: Play la revisa antes de aprobar la primera versión.

### Verificar una APK antes de mandarla

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --print-certs src-tauri\gen\android\app\build\outputs\apk\release\app-release.apk
```

El control de tamaño es el más rápido: **15-25 MB** significa que el `strip` de
`Cargo.toml` se aplicó; **~150 MB** significa que se coló el `.so` de debug.

---

## Troubleshooting

### Compilar

**`Execution failed for task ':app:compileDebugKotlin'` o `Unsupported class file major version`**
: Es el JDK. Gradle 8.14 no corre sobre JDK 25. `JAVA_HOME` tiene que apuntar a
  un JDK 17, 20 o 21 — **no** al JBR de Android Studio, que es 25.

**`Creation symbolic link is not allowed for this system`**
: Falta el Modo desarrollador de Windows (Ajustes → Privacidad y seguridad → Para
  desarrolladores). Aparece **al final** del build, después de haber compilado
  todo Rust, así que se pierde bastante tiempo si no se sabe.

**`Blocking waiting for file lock on build directory`**
: Hay otro build corriendo. Matalo con `taskkill /PID <id> /T /F`.

**La APK pesa ~150 MB en vez de 15-25 MB**
: Se coló el `.so` de debug. Espera a que termine un build de `release` completo.

**R8 rompe algo y la app crashea al abrir**
: En `release` viene `isMinifyEnabled = true`. Es lo primero que hay que
  desactivar para separar un problema de R8 de un bug real.

### Supabase

**Las consultas devuelven 401 o "sin permisos"**
: Casi siempre es que la sesión no se recuperó. `auth.init()` tiene que correr
  antes de la primera consulta; si algo consulta antes, PostgREST responde 401 y
  la UI muestra "sin permisos" en vez de "cargando".

**Un trigger bloquea un `UPDATE` que debería pasar**
: Los tres triggers de bloqueo hacen `if auth.uid() is null then return`. Sin
  JWT no hay sesión que sea un cliente, y bloquearía el mantenimiento legítimo.
  Desde el SQL Editor no hay sesión: es el comportamiento esperado.

**Un `.xlsx` sale con columnas vacías**
: Los sufijos de los rangos de edad van en **minúscula** (`edad_0_5_f`). Postgres
  devuelve los nombres tal cual y el mapeo no encuentra el valor si está en
  mayúscula.

### La aplicación

**El GPS nunca funcionó**
: `capabilities/default.json` pedía `geolocation:default`, y ese set **no
  existe** — es el único plugin sin `default_permission`. Hay que nombrar los
  permisos uno por uno.

**Una tabla se sale de la pantalla en el teléfono**
: Las tablas anchas se scrollean en horizontal, no se recomprimen. Es
  intencional: las columnas del 345W no se pueden acortar sin perder
  información.

**La barra superior se dibuja debajo del sidebar en escritorio**
: `left` y `right` de `.v-app-bar` **no se tocan nunca**. No son estilos del
  componente: Vuetify los *calcula* en su composable de layout para apartar la
  barra del navigation drawer, y los escribe como estilo inline
  (`left: 248px` con el drawer de 248). Ponerlos en el CSS con `!important` los
  pisa con `0` y rompe el escritorio.

  El síntoma es traicionero: como `env()` devuelve `0px` en escritorio, los
  valores del CSS no delatan nada. Lo que se ve es que la barra queda tapada por
  el sidebar —el título se lee a medias— y además con un hueco de 248 px a la
  derecha. Solo aparece con el drawer abierto.

  Para mover la barra por los insets, `top` sí lleva `!important` (Vuetify
  escribe `top: 0` inline) y los laterales van por `padding`, que suma dentro
  de la caja y compone con el offset del drawer. Ver
  [App móvil (Android)](#app-móvil-android).

**Un `v-card-title` se corta a media palabra**
: Vuetify aplica `white-space: nowrap` a `.v-card-title` y `overflow: hidden` a
  la tarjeta. Está corregido en `main.css` de forma global; si reaparece, es que
  alguien lo sobreescribió.

**El ícono del launcher es el de Tauri**
: `tauri icon` escribe en `src-tauri/icons/`, pero el proyecto Android tiene su
  propia carpeta `res/`, y **nada copia una en la otra** durante el build. Hay
  que copiarlo a mano.

**La app se pega a la barra de estado y a la de navegación**
: Es edge-to-edge, que Android exige desde `targetSdk 35`. Los insets se resuelven
  en CSS con `env(safe-area-inset-*)`; ver
  [App móvil](#app-móvil-android).

### Cosas que parecen errores y no lo son

- **El `.xlsx` no se abre en el teléfono.** No se descarga ni se genera ahí: la
  función está oculta en móvil a propósito.
- **Los Elderly no suman con Female y Male.** Son un subtotal, están contadas
  dos veces por diseño del 345W.
- **Una persona con sexo "O" no aparece en Girls/Boys/Female/Male.** Cuenta en
  el total de personas y en ninguno de los cuatro desgloses binarios.
- **`Geolocalización` devuelve 0 en un `.mjs` de verificación.** Los scripts que
  corren con node pelado no tienen WebView; es normal.
