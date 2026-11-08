import { html, money, fecha, insignia } from "../ui.js";
import { vehiculoDe, clienteDe, mecanicoDe, esGestion } from "../api.js";

export function filaOrden(o) {
  const v = vehiculoDe(o), c = clienteDe(o);
  const debe = o.cobrable && o.saldo > 0;
  return html`
    <a class="fila" href="#/ordenes/${o.id}">
      <span class="placa">${v.matricula}</span>
      <span class="fila-principal"><strong>${v.marca} ${v.modelo}</strong><small>${c.nombre}</small></span>
      <span>${insignia(o.estado)}</span>
      <span class="fila-meta">${mecanicoDe(o)}<small>${fecha(o.fecha_entrada)}</small></span>
      ${esGestion() ? html`<span class="monto ${debe ? "debe" : ""}">${money(o.total)}<small>${debe ? "Debe " + money(o.saldo) : ""}</small></span>` : ""}
    </a>`;
}

export const listaFilas = (lista, vacio) =>
  lista.length ? html`<div class="filas">${lista.map(filaOrden)}</div>` : html`<p class="vacio">${vacio}</p>`;
