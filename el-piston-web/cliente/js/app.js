import { pb, usuario, esGestion, conteoBajos, mensajeError, nombreDe } from "./api.js";
import { html, raw, mount, toast, vista, debounce } from "./ui.js";
import { panel } from "./views/panel.js";
import { listaOrdenes, detalleOrden } from "./views/ordenes.js";
import { listaClientes, detalleCliente, detalleVehiculo } from "./views/clientes.js";
import { inventario } from "./views/inventario.js";
import { reportes } from "./views/reportes.js";

const raiz = document.getElementById("app");

// [patrón de la URL, sección del menú, vista, ¿solo gestión?]
const RUTAS = [
  [/^#\/panel$/, "panel", panel, false],
  [/^#\/ordenes$/, "ordenes", listaOrdenes, false],
  [/^#\/ordenes\/(\w+)$/, "ordenes", detalleOrden, false],
  [/^#\/clientes$/, "clientes", listaClientes, true],
  [/^#\/clientes\/(\w+)$/, "clientes", detalleCliente, true],
  [/^#\/vehiculos\/(\w+)$/, "clientes", detalleVehiculo, true],
  [/^#\/inventario$/, "inventario", inventario, false],
  [/^#\/reportes$/, "reportes", reportes, true],
];

let actual = null; // función que pinta la vista en curso

// ---------------------------------------------------------------- Login
function pantallaLogin() {
  actual = null;
  mount(raiz, html`
    <section class="login">
      <div class="login-marca"><h1>El Pistón</h1><p>Control del taller</p></div>
      <form id="form-login" class="dialogo">
        <label class="campo"><span>Correo</span><input type="email" name="email" required autocomplete="username"></label>
        <label class="campo"><span>Contraseña</span><input type="password" name="password" required autocomplete="current-password"></label>
        <p class="error" role="alert" hidden></p>
        <button class="btn" type="submit">Entrar</button>
      </form>
    </section>`);
  const form = document.getElementById("form-login");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector("button");
    const err = form.querySelector(".error");
    btn.disabled = true;
    err.hidden = true;
    try {
      await pb.collection("users").authWithPassword(form.email.value, form.password.value);
      await suscribir();
      if (location.hash === "#/panel") navegar(); else location.hash = "#/panel"; // si cambia, lo hace hashchange
    } catch (e) {
      err.textContent = e.status === 400 ? "Correo o contraseña incorrectos." : mensajeError(e);
      err.hidden = false;
      btn.disabled = false;
    }
  };
}

function cerrarSesion() {
  for (const c of colecciones()) pb.collection(c).unsubscribe();
  pb.authStore.clear();
  pantallaLogin();
}

// ---------------------------------------------------------------- Estructura y navegación
function pintarMarco(activa) {
  const u = usuario();
  const enlaces = [["panel", "Panel"], ["ordenes", "Órdenes"],
    ...(esGestion() ? [["clientes", "Clientes"]] : []),
    ["inventario", "Inventario"],
    ...(esGestion() ? [["reportes", "Reportes"]] : [])];
  mount(raiz, html`
    <header class="barra">
      <a class="marca" href="#/panel">El Pistón</a>
      <nav aria-label="Principal">
        ${enlaces.map(([id, texto]) => html`
          <a href="#/${id}" class="${id === activa ? "activo" : ""}" ${id === activa ? raw('aria-current="page"') : ""}>${texto}${id === "inventario" ? html`<span class="punto" id="punto-stock" hidden title="Hay repuestos por agotarse"></span>` : ""}</a>`)}
      </nav>
      <div class="sesion"><span>${nombreDe(u)}</span><button class="btn-sec" id="salir">Salir</button></div>
    </header>
    <main id="vista" tabindex="-1"></main>`);
  document.getElementById("salir").onclick = cerrarSesion;
  actualizarPuntoStock();
}

async function actualizarPuntoStock() {
  try {
    const punto = document.getElementById("punto-stock");
    if (punto) punto.hidden = (await conteoBajos()) === 0;
  } catch { /* el aviso es accesorio: si falla, no molestamos */ }
}

async function ejecutar(conCarga) {
  const main = document.getElementById("vista");
  if (!main || !actual) return;
  if (conCarga) mount(main, html`<p class="cargando">Cargando…</p>`);
  try {
    await actual(main);
  } catch (err) {
    if (err.isAbort) return; // petición autocancelada por el SDK: se ignora
    if (err.status === 401) return cerrarSesion();
    mount(main, html`<div class="vacio"><p>${err.status === 404 ? "No encontramos lo que buscas." : mensajeError(err)}</p>
      ${err.status === 404 ? html`<a href="#/panel">Ir al panel</a>` : html`<button class="btn" id="reintentar">Reintentar</button>`}</div>`);
    const r = document.getElementById("reintentar");
    if (r) r.onclick = () => ejecutar(true);
  }
}
vista.recargar = () => ejecutar(false);

function navegar() {
  if (!pb.authStore.isValid) return pantallaLogin();
  const hash = location.hash || "#/panel";
  for (const [patron, seccion, fn, soloGestion] of RUTAS) {
    const m = hash.match(patron);
    if (!m) continue;
    if (soloGestion && !esGestion()) { location.hash = "#/panel"; return; }
    pintarMarco(seccion);
    actual = (main) => fn(main, ...m.slice(1));
    ejecutar(true);
    document.getElementById("vista").focus({ preventScroll: true });
    return;
  }
  location.hash = "#/panel";
}

// ---------------------------------------------------------------- Tiempo real
const colecciones = () =>
  ["ordenes", "trabajos", "repuestos_usados", "repuestos", "clientes", "vehiculos", ...(esGestion() ? ["pagos"] : [])];

async function suscribir() {
  const refrescar = debounce(() => { vista.recargar(); actualizarPuntoStock(); }, 400);
  try {
    await Promise.all(colecciones().map(async (c) => {
      await pb.collection(c).unsubscribe();
      await pb.collection(c).subscribe("*", (e) => {
        refrescar();
        if (c === "repuestos" && e.action === "update" && e.record.existencias <= e.record.minimo) {
          toast(e.record.existencias === 0 ? `Se agotó ${e.record.nombre}` : `Quedan ${e.record.existencias} de ${e.record.nombre}`, "aviso");
        }
      });
    }));
  } catch {
    toast("No se pudo activar la actualización en vivo. Recarga la página si no ves cambios.", "aviso");
  }
}

// ---------------------------------------------------------------- Arranque
async function iniciar() {
  window.addEventListener("hashchange", navegar);
  if (pb.authStore.isValid) {
    try {
      await pb.collection("users").authRefresh(); // valida el token guardado
      await suscribir();
    } catch (e) {
      if ([401, 403, 404].includes(e.status)) pb.authStore.clear();
    }
  }
  navegar();
}
iniciar();
