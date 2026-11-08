import {
  cargarOrdenes, cargarMecanicos, repuestosBajos, ESTADOS, ABIERTAS,
  esGestion, usuario, vehiculoDe, clienteDe, mecanicoDe, nombreDe,
} from "../api.js";
import { html, mount, money, diasDesde, hoy, diaLocal } from "../ui.js";

const tarjeta = (o) => {
  const v = vehiculoDe(o);
  const dias = diasDesde(o.fecha_entrada);
  return html`
    <a class="tarjeta" href="#/ordenes/${o.id}">
      <span class="placa">${v.matricula}</span>
      <strong>${v.marca} ${v.modelo}</strong>
      <span class="meta">${clienteDe(o).nombre}</span>
      <span class="meta">${mecanicoDe(o)}</span>
      <span class="meta">${dias === 0 ? "Entró hoy" : `Hace ${dias} ${dias === 1 ? "día" : "días"} en el taller`}</span>
    </a>`;
};

export async function panel(main) {
  const gestion = esGestion();
  const [{ ordenes }, mecanicos, bajos] = await Promise.all([
    cargarOrdenes(),
    gestion ? cargarMecanicos() : Promise.resolve([]),
    repuestosBajos(),
  ]);
  const visibles = gestion ? ordenes : ordenes.filter((o) => o.mecanico === usuario().id);
  const abiertas = visibles.filter((o) => ABIERTAS.includes(o.estado));

  // Resumen económico (solo gestión)
  const mes = hoy().slice(0, 7);
  const facturadoMes = ordenes
    .filter((o) => o.estado === "entregada" && o.fecha_salida && diaLocal(o.fecha_salida).startsWith(mes))
    .reduce((s, o) => s + o.total, 0);
  const porCobrar = ordenes.filter((o) => o.cobrable).reduce((s, o) => s + o.saldo, 0);

  // Carga por mecánico
  const carga = mecanicos.map((m) => ({ nombre: nombreDe(m), n: abiertas.filter((o) => o.mecanico === m.id).length }));
  const sinAsignar = abiertas.filter((o) => !o.mecanico).length;
  if (sinAsignar) carga.push({ nombre: "Sin asignar", n: sinAsignar });
  const max = Math.max(1, ...carga.map((c) => c.n));

  mount(main, html`
    <div class="titulo-pagina">
      <h1>${gestion ? "Panel del taller" : "Mis órdenes abiertas"}</h1>
      ${gestion ? html`<p class="resumen">Facturado este mes <strong>${money(facturadoMes)}</strong>. Por cobrar <strong>${money(porCobrar)}</strong>.</p>` : ""}
    </div>

    <section class="tablero" aria-label="Órdenes abiertas por estado">
      ${ESTADOS.filter((e) => ABIERTAS.includes(e.id)).map((e) => {
        const lista = abiertas.filter((o) => o.estado === e.id);
        return html`
          <div class="columna col-${e.id}">
            <h2>${e.etiqueta}<span class="cuenta">${lista.length}</span></h2>
            ${lista.length ? lista.map(tarjeta) : html`<p class="vacio-mini">Sin órdenes</p>`}
          </div>`;
      })}
    </section>

    <div class="dos-col">
      ${gestion ? html`
        <section class="bloque">
          <h2>Carga por mecánico</h2>
          ${carga.length ? html`<ul class="carga">${carga.map((c) => html`
            <li><span>${c.nombre}</span><span class="barra-carga"><i style="width:${(c.n / max) * 100}%"></i></span><strong>${c.n}</strong></li>`)}</ul>`
            : html`<p class="vacio-mini">Aún no hay mecánicos registrados.</p>`}
        </section>` : ""}
      <section class="bloque">
        <h2>Repuestos por agotarse</h2>
        ${bajos.length ? html`<ul class="lista-simple">${bajos.map((r) => html`
          <li><span>${r.nombre}</span><strong class="${r.existencias === 0 ? "agotado" : "pocas"}">${r.existencias === 0 ? "Agotado" : `Quedan ${r.existencias}`}</strong></li>`)}</ul>
          <a href="#/inventario">Ir al inventario</a>`
          : html`<p class="vacio-mini">Todo el inventario está por encima del mínimo.</p>`}
      </section>
    </div>`);
}
