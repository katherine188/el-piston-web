// Utilidades de interfaz: plantillas con escape automático, formularios en diálogo, avisos.
import { MONEDA } from "./config.js";
import { etiquetaEstado, mensajeError } from "./api.js";

// ---- Plantillas seguras: todo valor interpolado se escapa salvo que sea html`` o raw() ----
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);

const fmt = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join("") : esc(v));
export const html = (strings, ...vals) =>
  new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ""), ""));
export const mount = (el, contenido) => { el.innerHTML = contenido.s; };

// ---- Formatos ----
export const money = (n) =>
  MONEDA + Number(n || 0).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parse = (iso) => new Date(iso.replace(" ", "T"));
export const fecha = (iso) =>
  iso ? parse(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const diaLocal = (iso) => parse(iso).toLocaleDateString("sv-SE"); // AAAA-MM-DD
export const hoy = () => new Date().toLocaleDateString("sv-SE");
export const diasDesde = (iso) => Math.floor((Date.now() - parse(iso)) / 864e5);
export const insignia = (estado) => html`<span class="estado estado-${estado}">${etiquetaEstado(estado)}</span>`;

// ---- Utilidades varias ----
export const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
// El router asigna aquí la función que vuelve a pintar la vista actual.
export const vista = { recargar: () => {} };

// ---- Avisos ----
export function toast(mensaje, tipo = "ok") {
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = mensaje;
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), tipo === "error" ? 6000 : 3500);
}

// ---- Diálogos ----
const dlg = document.getElementById("modal");

function campoHtml(c, valor) {
  const attrs = raw([
    `name="${c.name}"`, `id="f-${c.name}"`,
    c.required ? "required" : "",
    c.min != null ? `min="${c.min}"` : "",
    c.max != null ? `max="${c.max}"` : "",
    c.step ? `step="${c.step}"` : "",
    c.maxlength ? `maxlength="${c.maxlength}"` : "",
  ].join(" "));
  let control;
  if (c.type === "select") {
    control = html`<select ${attrs}>${c.options.map((o) =>
      html`<option value="${o.value}" ${String(o.value) === String(valor) ? raw("selected") : ""}>${o.label}</option>`)}</select>`;
  } else if (c.type === "textarea") {
    control = html`<textarea ${attrs} rows="3">${valor}</textarea>`;
  } else {
    control = html`<input type="${c.type ?? "text"}" ${attrs} value="${valor}" ${c.mayus ? raw('style="text-transform:uppercase"') : ""}>`;
  }
  return html`<label class="campo" for="f-${c.name}"><span>${c.label}</span>${control}${c.ayuda ? html`<small>${c.ayuda}</small>` : ""}</label>`;
}

// Formulario genérico en diálogo. `enviar(datos)` es async; si lanza, el error se muestra en el propio diálogo.
export function formDialog({ titulo, campos, valores = {}, enviar, boton = "Guardar" }) {
  mount(dlg, html`
    <form class="dialogo">
      <h2>${titulo}</h2>
      ${campos.map((c) => campoHtml(c, valores[c.name] ?? c.value ?? ""))}
      <p class="error" role="alert" hidden></p>
      <div class="acciones">
        <button type="button" class="btn-sec" data-cerrar>Cancelar</button>
        <button type="submit" class="btn">${boton}</button>
      </div>
    </form>`);
  const form = dlg.querySelector("form");
  dlg.onclose = null;
  form.querySelector("[data-cerrar]").onclick = () => dlg.close();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const datos = {};
    for (const c of campos) {
      let v = fd.get(c.name);
      if (c.type === "number") v = v === "" ? null : Number(v);
      else if (typeof v === "string") v = c.mayus ? v.trim().toUpperCase() : v.trim();
      datos[c.name] = v;
    }
    const btn = form.querySelector("[type=submit]");
    const err = form.querySelector(".error");
    btn.disabled = true;
    err.hidden = true;
    try {
      await enviar(datos);
      dlg.close();
    } catch (e) {
      err.textContent = mensajeError(e);
      err.hidden = false;
      btn.disabled = false;
    }
  };
  dlg.showModal();
}

export function confirmar(mensaje, boton = "Confirmar") {
  return new Promise((resolver) => {
    mount(dlg, html`
      <form method="dialog" class="dialogo">
        <p>${mensaje}</p>
        <div class="acciones">
          <button value="cancel" class="btn-sec">Volver</button>
          <button value="ok" class="btn btn-peligro">${boton}</button>
        </div>
      </form>`);
    dlg.returnValue = "";
    dlg.onclose = () => { dlg.onclose = null; resolver(dlg.returnValue === "ok"); };
    dlg.showModal();
  });
}
