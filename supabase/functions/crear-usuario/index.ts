/**
 * Edge Function: crear-usuario
 *
 * Crea un usuario de Supabase Auth. Corre con la service_role (que vive en el
 * servidor de la funcion y nunca se expone al cliente), pero antes verifica que
 * quien la llama es admin: sin ese control, cualquiera podria crear cuentas.
 *
 *   POST /functions/v1/crear-usuario
 *   { "email", "password", "nombre", "rol", "coordinacion_id" }
 *
 * El rol y la coordinacion se aplican sobre public.profiles, que es donde la
 * app los lee. El trigger handle_new_user() ya creo el perfil con rol
 * 'coordinador'; este UPDATE lo promueve o le asigna coordinacion.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ROLES_VALIDOS = ["coordinador", "admin"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const cuerpo = await req.json();
    const { email, password, nombre, rol, coordinacion_id } = cuerpo;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Faltan email o contraseña." }),
        { status: 400, headers: corsHeaders },
      );
    }
    if (rol && !ROLES_VALIDOS.includes(rol)) {
      return new Response(
        JSON.stringify({ error: `Rol inválido. Debe ser ${ROLES_VALIDOS.join(" o ")}.` }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Quien llama: se valida con su propio JWT, no con la service_role.
    // El cliente va con la anon key; el token del usuario se pasa a getUser,
    // que es quien lo verifica y devuelve el usuario.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado." }),
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.split(" ")[1];
    // El cliente va con la anon key, pero tiene que mandar el JWT del usuario en
    // el Authorization de CADA request. Sin eso la RLS ve auth.uid() como NULL
    // y la query de profiles no devuelve nada.
    const clienteUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: { user: llamador }, error: errorUsuario } = await clienteUsuario
      .auth.getUser(token);
    if (errorUsuario || !llamador) {
      return new Response(
        JSON.stringify({ error: "No autorizado." }),
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: perfil, error: errorPerfil } = await clienteUsuario
      .from("profiles")
      .select("rol")
      .eq("id", llamador.id)
      .maybeSingle();

    if (errorPerfil || perfil?.rol !== "admin") {
      return new Response(
        JSON.stringify({ error: "Solo un administrador puede crear usuarios." }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Aca si: service_role, porque crear usuarios exige la API admin.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre ?? null },
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: corsHeaders },
      );
    }

    // El trigger ya creo el perfil como 'coordinador'. Se ajusta rol y coord.
    const cambios = {};
    if (rol) cambios.rol = rol;
    if (coordinacion_id !== undefined) cambios.coordinacion_id = coordinacion_id;

    if (Object.keys(cambios).length) {
      const { error: errorPerfil2 } = await admin
        .from("profiles")
        .update(cambios)
        .eq("id", data.user.id);

      if (errorPerfil2) {
        return new Response(
          JSON.stringify({ error: errorPerfil2.message }),
          { status: 400, headers: corsHeaders },
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.user.id, email: data.user.email }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Error inesperado." }),
      { status: 500, headers: corsHeaders },
    );
  }
});
