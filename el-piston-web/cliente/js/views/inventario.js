import { pb, crear, actualizar, borrar, esGestion, esDueno, mensajeError } from "../api.js";
import { UMBRAL_DEFECTO } from "../config.js";
import { html, mount, money, formDialog, confirmar, toast, vista } from "../ui.js";

let busqueda = "";

const nivel = (r) => (r.existencias === 0 ? "agotado" : r.existencias <= r.minimo ? "pocas" : "ok");
const textoNivel = { agotado: "Agotado", pocas: "Pocas unidades", ok: "Disponible" };

function formRepuesto(r) {
  formDialog({
    titulo: r ? "Editar repuesto" : "Nuevo repuesto",
    campos: [
      { name: "nombre", label: "Nombre", required: true, maxlength: 120 },
      { name: "codigo", label: "Código", required: true, maxlength: 40, mayus: true },
      { name: "precio", label: "Precio de venta", type: "number", required: true, min: 0, step: "0.01" },
      { name: "existencias", label: "Existencias", type: "number", required: true, min: 0, step: 1 },
      { name: "minimo", label: "Avisar cuando queden", type: "number", required: true, min: 0, step: 1,
        ayuda: "Al llegar a esta cantidad el repuesto aparece como “Pocas unidades”." },
    ],
    valores: r ?? { minimo: UMBRAL_DEFECTO },
    enviar: async (d) => {
      if (r) await actualizar("repuestos", r.id, d);
      else await crear("repuestos", d);
      toast(r ? "Repuesto actualizado" : "Repuesto creado");
      vista.recargar();
    },
  });
}

function formReponer(r) {
  formDialog({
    titulo: `Reponer ${r.nombre}`,
    campos: [{ name: "cantidad", label: "Unidades que entran", type: "number", required: true, min: 1, step: 1 }],
    boton: "Agregar al inventario",
    enviar: async (d) => {
      await actualizar("repuestos", r.id, { existencias: r.existencias + d.cantidad });
      toast("Inventario actualizado");
      vista.recargar();
    },
  });
}

export async function inventario(main) {
  const repuestos = await pb.collection("repuestos").getFullList({ sort: "nombre" });
  const gestion = esGestion();

  mount(main, html`
    <div class="titulo-pagina"><h1>Inventario</h1>${gestion ? html`<button class="btn" data-accion="nuevo">Nuevo repuesto</button>` : ""}</div>
    <div class="herramientas"><input type="search" id="buscar" placeholder="Buscar por nombre o código" value="${busqueda}" aria-label="Buscar repuestos"></div>
    <div id="lista"></div>`);

  const pintar = () => {
    const q = busqueda.trim().toLowerCase();
    const lista = repuestos.filter((r) => !q || `${r.nombre} ${r.codigo}`.toLowerCase().includes(q));
    mount(main.querySelector("#lista"), lista.length ? html`<div class="filas">${lista.map((r) => html`
      <div class="fila fila-repuesto">
        <span class="fila-principal"><strong>${r.nombre}</strong><small>${r.codigo}</small></span>
        <span class="monto">${money(r.precio)}</span>
        <span class="existencias"><strong>${r.existencias}</strong><small>mínimo ${r.minimo}</small></span>
        <span class="nivel nivel-${nivel(r)}">${textoNivel[nivel(r)]}</span>
        ${gestion ? html`<span class="fila-acciones">
          <button class="btn-texto" data-accion="reponer" data-id="${r.id}">Reponer</button>
          <button class="btn-texto" data-accion="editar" data-id="${r.id}">Editar</button>
          ${esDueno() ? html`<button class="btn-texto" data-accion="eliminar" data-id="${r.id}">Eliminar</button>` : ""}
        </span>` : ""}
      </div>`)}</div>` : html`<p class="vacio">No hay repuestos que coincidan.</p>`);
  };
  pintar();

  main.querySelector("#buscar").oninput = (e) => { busqueda = e.target.value; pintar(); };
  main.onclick = async (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (!b) return;
    const r = repuestos.find((x) => x.id === b.dataset.id);
    try {
      switch (b.dataset.accion) {
        case "nuevo": return formRepuesto();
        case "editar": return formRepuesto(r);
        case "reponer": return formReponer(r);
        case "eliminar":
          if (await confirmar(`¿Eliminar ${r.nombre}? Solo es posible si no se ha usado en ninguna orden.`, "Eliminar")) {
            await borrar("repuestos", r.id);
            toast("Repuesto eliminado");
            vista.recargar();
          }
      }
    } catch (err) {
      toast(err.status === 400 ? "No se puede eliminar: ya se usó en alguna orden." : mensajeError(err), "error");
    }
  };
}
