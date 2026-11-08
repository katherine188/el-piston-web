import { cargarOrdenes, clienteDe } from "../api.js";
import { html, mount, money, hoy, diaLocal } from "../ui.js";
import { listaFilas } from "./comun.js";

// El período se conserva si la vista se vuelve a pintar (tiempo real)
let desde = hoy().slice(0, 8) + "01";
let hasta = hoy();

export async function reportes(main) {
  const { ordenes, pagos } = await cargarOrdenes();

  // Deudores: solo órdenes terminadas (lista o entregada) con saldo pendiente
  const deudas = new Map();
  for (const o of ordenes.filter((x) => x.cobrable && x.saldo > 0)) {
    const c = clienteDe(o);
    const d = deudas.get(c.id) ?? { cliente: c, saldo: 0, n: 0 };
    d.saldo += o.saldo;
    d.n += 1;
    deudas.set(c.id, d);
  }
  const deudores = [...deudas.values()].sort((a, b) => b.saldo - a.saldo);
  const totalDeuda = deudores.reduce((s, d) => s + d.saldo, 0);

  mount(main, html`
    <div class="titulo-pagina"><h1>Reportes</h1></div>

    <section class="bloque">
      <h2>Facturación por período</h2>
      <div class="herramientas">
        <label>Desde <input type="date" id="desde" value="${desde}"></label>
        <label>Hasta <input type="date" id="hasta" value="${hasta}"></label>
      </div>
      <div id="periodo"></div>
    </section>

    <section class="bloque">
      <div class="bloque-cab"><h2>Clientes con saldo pendiente</h2><strong class="debe">${money(totalDeuda)}</strong></div>
      ${deudores.length ? html`<div class="filas">${deudores.map((d) => html`
        <a class="fila fila-cliente" href="#/clientes/${d.cliente.id}">
          <span class="fila-principal"><strong>${d.cliente.nombre}</strong><small>${d.cliente.telefono}</small></span>
          <span class="fila-meta">${d.n} ${d.n === 1 ? "orden" : "órdenes"}</span>
          <span class="monto debe">${money(d.saldo)}</span>
        </a>`)}</div>` : html`<p class="vacio-mini">Nadie tiene saldo pendiente.</p>`}
    </section>`);

  const pintarPeriodo = () => {
    const entregadas = ordenes.filter((o) =>
      o.estado === "entregada" && o.fecha_salida && diaLocal(o.fecha_salida) >= desde && diaLocal(o.fecha_salida) <= hasta);
    const facturado = entregadas.reduce((s, o) => s + o.total, 0);
    const cobrado = pagos.filter((p) => diaLocal(p.fecha) >= desde && diaLocal(p.fecha) <= hasta).reduce((s, p) => s + p.monto, 0);
    mount(main.querySelector("#periodo"), html`
      <dl class="kpis">
        <div><dt>Facturado (órdenes entregadas)</dt><dd>${money(facturado)}</dd></div>
        <div><dt>Cobrado en el período</dt><dd>${money(cobrado)}</dd></div>
        <div><dt>Órdenes entregadas</dt><dd>${entregadas.length}</dd></div>
      </dl>
      ${listaFilas(entregadas, "No hubo entregas en este período.")}`);
  };
  pintarPeriodo();

  for (const id of ["desde", "hasta"]) {
    main.querySelector(`#${id}`).onchange = (e) => {
      if (id === "desde") desde = e.target.value || desde; else hasta = e.target.value || hasta;
      pintarPeriodo();
    };
  }
}
