import {
  pb, cargarOrdenes, cargarDetalle, cargarMecanicos, crear, actualizar, borrar,
  ESTADOS, ABIERTAS, esGestion, esDueno, usuario, mensajeError,
  vehiculoDe, clienteDe, mecanicoDe, nombreDe,
} from "../api.js";
import { html, raw, mount, money, fecha, insignia, formDialog, confirmar, toast, vista } from "../ui.js";
import { listaFilas } from "./comun.js";

// Estado de los filtros: se conserva si la vista se vuelve a pintar (p. ej. por tiempo real)
let filtro = "abiertas";
let busqueda = "";

// ---------------------------------------------------------------- Lista
export async function listaOrdenes(main) {
  const { ordenes } = await cargarOrdenes();
  const base = esGestion() ? ordenes : ordenes.filter((o) => o.mecanico === usuario().id);

  mount(main, html`
    <div class="titulo-pagina">
      <h1>${esGestion() ? "Órdenes de servicio" : "Mis órdenes"}</h1>
      ${esGestion() ? html`<button class="btn" data-accion="nueva">Nueva orden</button>` : ""}
    </div>
    <div class="herramientas">
      <input type="search" id="buscar" placeholder="Buscar por matrícula o cliente" value="${busqueda}" aria-label="Buscar órdenes">
      <select id="filtro" aria-label="Filtrar por estado">
        <option value="abiertas">Abiertas</option>
        <option value="todas">Todas</option>
        ${ESTADOS.map((e) => html`<option value="${e.id}">${e.etiqueta}</option>`)}
      </select>
    </div>
    <div id="lista"></div>`);

  const selector = main.querySelector("#filtro");
  selector.value = filtro;

  const pintar = () => {
    const q = busqueda.trim().toLowerCase();
    const lista = base
      .filter((o) => (filtro === "abiertas" ? ABIERTAS.includes(o.estado) : filtro === "todas" || o.estado === filtro))
      .filter((o) => !q || `${vehiculoDe(o).matricula} ${clienteDe(o).nombre}`.toLowerCase().includes(q));
    mount(main.querySelector("#lista"), listaFilas(lista, "No hay órdenes con ese filtro."));
  };
  pintar();

  main.querySelector("#buscar").oninput = (e) => { busqueda = e.target.value; pintar(); };
  selector.onchange = (e) => { filtro = e.target.value; pintar(); };
  main.onclick = (e) => { if (e.target.closest('[data-accion="nueva"]')) nuevaOrden(); };
}

// ---------------------------------------------------------------- Alta (reutilizable desde clientes y vehículos)
export async function nuevaOrden(vehiculoPre) {
  try {
    const [vehiculos, mecanicos] = await Promise.all([
      pb.collection("vehiculos").getFullList({ sort: "matricula", expand: "cliente" }),
      cargarMecanicos(),
    ]);
    if (!vehiculos.length) return toast("Primero registra un cliente y su vehículo.", "aviso");

    formDialog({
      titulo: "Nueva orden de servicio",
      campos: [
        { name: "vehiculo", label: "Vehículo", type: "select", required: true,
          options: vehiculos.map((v) => ({ value: v.id, label: `${v.matricula}, ${v.marca} ${v.modelo} (${v.expand?.cliente?.nombre ?? ""})` })) },
        { name: "kilometraje", label: "Kilometraje actual", type: "number", min: 0, step: 1, ayuda: "Opcional. Actualiza el kilometraje del vehículo." },
        { name: "problema", label: "Problema que reporta el cliente", type: "textarea", required: true, maxlength: 1000 },
        { name: "mecanico", label: "Mecánico asignado", type: "select",
          options: [{ value: "", label: "Sin asignar" }, ...mecanicos.map((m) => ({ value: m.id, label: nombreDe(m) }))] },
      ],
      valores: { vehiculo: vehiculoPre?.id },
      enviar: async (d) => {
        const orden = await crear("ordenes", {
          vehiculo: d.vehiculo, problema: d.problema, mecanico: d.mecanico,
          estado: "recibida", fecha_entrada: new Date().toISOString(),
        });
        if (d.kilometraje != null) await actualizar("vehiculos", d.vehiculo, { kilometraje: d.kilometraje });
        toast("Orden creada");
        location.hash = `#/ordenes/${orden.id}`;
      },
    });
  } catch (err) {
    toast(mensajeError(err), "error");
  }
}

// ---------------------------------------------------------------- Detalle
export async function detalleOrden(main, id) {
  const { orden, trabajos, usados, pagos, totales } = await cargarDetalle(id);
  const gestion = esGestion();
  const v = vehiculoDe(orden), c = clienteDe(orden);
  const puedeEditar = gestion || orden.mecanico === usuario().id;
  const cerrada = ["entregada", "cancelada"].includes(orden.estado);
  const idx = ESTADOS.findIndex((e) => e.id === orden.estado);
  const siguiente = idx < 4 && ESTADOS[idx + 1] && (gestion || idx < 3) ? ESTADOS[idx + 1] : null;
  const editable = puedeEditar && !cerrada;

  const quitar = (accion, itemId, etiqueta) =>
    editable ? html`<button class="btn-texto" data-accion="${accion}" data-id="${itemId}" aria-label="${etiqueta}">Quitar</button>` : "";

  mount(main, html`
    <a class="volver" href="#/ordenes">Volver a órdenes</a>

    <header class="cabecera-orden">
      <div>
        <span class="placa placa-grande">${v.matricula}</span>
        <p class="vehiculo">${v.marca} ${v.modelo}${v.anio ? `, ${v.anio}` : ""}. ${v.kilometraje ?? 0} km</p>
        <p>${gestion ? html`<a href="#/clientes/${c.id}">${c.nombre}</a>` : c.nombre}
           ${c.telefono ? html`<a class="tel" href="tel:${c.telefono}">${c.telefono}</a>` : ""}</p>
        ${gestion ? html`<a href="#/vehiculos/${v.id}">Ver historial del vehículo</a>` : ""}
      </div>
      <div class="estado-orden">
        ${insignia(orden.estado)}
        <p>Mecánico: <strong>${mecanicoDe(orden)}</strong>
           ${gestion && !cerrada ? html`<button class="btn-texto" data-accion="reasignar">Cambiar</button>` : ""}</p>
        <p>Entrada: ${fecha(orden.fecha_entrada)}${orden.fecha_salida ? html`<br>Entrega: ${fecha(orden.fecha_salida)}` : ""}</p>
      </div>
    </header>

    <section class="bloque">
      <h2>Problema reportado</h2>
      <p>${orden.problema}</p>
    </section>

    ${puedeEditar ? html`
      <div class="acciones-estado">
        ${siguiente && !cerrada ? html`<button class="btn" data-accion="estado" data-estado="${siguiente.id}">Pasar a: ${siguiente.etiqueta}</button>` : ""}
        ${gestion && !cerrada ? html`<button class="btn-sec btn-peligro-sec" data-accion="estado" data-estado="cancelada">Cancelar orden</button>` : ""}
        ${gestion && orden.estado === "cancelada" ? html`<button class="btn-sec" data-accion="estado" data-estado="recibida">Reabrir orden</button>` : ""}
      </div>` : ""}

    <section class="bloque">
      <div class="bloque-cab"><h2>Trabajos realizados</h2>
        ${editable ? html`<button class="btn-sec" data-accion="nuevo-trabajo">Agregar trabajo</button>` : ""}</div>
      ${trabajos.length ? html`<ul class="lineas">${trabajos.map((t) => html`
        <li><span>${t.descripcion}</span><span class="monto">${money(t.precio_mano_obra)}</span>${quitar("quitar-trabajo", t.id, "Quitar trabajo")}</li>`)}</ul>`
        : html`<p class="vacio-mini">Aún no se ha anotado ningún trabajo.</p>`}
    </section>

    <section class="bloque">
      <div class="bloque-cab"><h2>Repuestos usados</h2>
        ${editable ? html`<button class="btn-sec" data-accion="nuevo-repuesto">Agregar repuesto</button>` : ""}</div>
      ${usados.length ? html`<ul class="lineas">${usados.map((u) => html`
        <li><span>${u.expand?.repuesto?.nombre ?? "Repuesto"} <small>x${u.cantidad} a ${money(u.precio_unitario)}</small></span>
            <span class="monto">${money(u.cantidad * u.precio_unitario)}</span>${quitar("quitar-repuesto", u.id, "Quitar repuesto")}</li>`)}</ul>`
        : html`<p class="vacio-mini">No se ha usado ningún repuesto.</p>`}
    </section>

    ${gestion ? html`
      <section class="bloque">
        <div class="bloque-cab"><h2>Pagos</h2>
          ${orden.estado !== "cancelada" && totales.saldo > 0 ? html`<button class="btn-sec" data-accion="nuevo-pago">Registrar pago</button>` : ""}</div>
        ${pagos.length ? html`<ul class="lineas">${pagos.map((p) => html`
          <li><span>${fecha(p.fecha)} <small>${p.metodo}</small></span><span class="monto">${money(p.monto)}</span>
              ${esDueno() ? html`<button class="btn-texto" data-accion="quitar-pago" data-id="${p.id}">Quitar</button>` : ""}</li>`)}</ul>`
          : html`<p class="vacio-mini">Todavía no hay pagos.</p>`}
      </section>

      <section class="totales" aria-label="Resumen de cobro">
        <dl>
          <div><dt>Mano de obra</dt><dd>${money(totales.manoObra)}</dd></div>
          <div><dt>Repuestos</dt><dd>${money(totales.repuestos)}</dd></div>
          <div class="total"><dt>Total</dt><dd>${money(totales.total)}</dd></div>
          <div><dt>Pagado</dt><dd>${money(totales.pagado)}</dd></div>
          <div class="${totales.saldo > 0 ? "debe" : ""}"><dt>Falta por pagar</dt><dd>${money(totales.saldo)}</dd></div>
        </dl>
        <progress max="${totales.total || 1}" value="${Math.min(totales.pagado, totales.total)}" aria-label="Porcentaje pagado"></progress>
      </section>` : ""}
  `);

  main.onclick = async (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (!b) return;
    try {
      switch (b.dataset.accion) {
        case "estado": return await cambiarEstado(orden, b.dataset.estado, totales, usados.length);
        case "reasignar": return await reasignar(orden);
        case "nuevo-trabajo": return formTrabajo(orden.id);
        case "nuevo-repuesto": return await formRepuesto(orden.id);
        case "nuevo-pago": return formPago(orden.id, totales.saldo);
        case "quitar-trabajo":
          if (await confirmar("¿Quitar este trabajo de la orden?", "Quitar")) { await borrar("trabajos", b.dataset.id); vista.recargar(); }
          return;
        case "quitar-repuesto":
          if (await confirmar("¿Quitar este repuesto? Las unidades volverán al inventario.", "Quitar")) { await borrar("repuestos_usados", b.dataset.id); vista.recargar(); }
          return;
        case "quitar-pago":
          if (await confirmar("¿Eliminar este pago?", "Eliminar")) { await borrar("pagos", b.dataset.id); vista.recargar(); }
          return;
      }
    } catch (err) {
      toast(mensajeError(err), "error");
    }
  };
}

// ---------------------------------------------------------------- Acciones
async function cambiarEstado(orden, nuevo, totales, nRepuestos) {
  if (nuevo === "cancelada") {
    if (nRepuestos) return toast("Quita primero los repuestos para devolverlos al inventario.", "aviso");
    if (!(await confirmar("¿Cancelar esta orden? Podrás reabrirla después.", "Cancelar orden"))) return;
  }
  if (nuevo === "entregada" && totales.saldo > 0) {
    if (!(await confirmar(`El cliente aún debe ${money(totales.saldo)}. ¿Entregar el vehículo de todos modos?`, "Entregar"))) return;
  }
  await actualizar("ordenes", orden.id, {
    estado: nuevo,
    fecha_salida: nuevo === "entregada" ? new Date().toISOString() : "",
  });
  toast("Estado actualizado");
  vista.recargar();
}

async function reasignar(orden) {
  const mecanicos = await cargarMecanicos();
  formDialog({
    titulo: "Asignar mecánico",
    campos: [{ name: "mecanico", label: "Mecánico", type: "select",
      options: [{ value: "", label: "Sin asignar" }, ...mecanicos.map((m) => ({ value: m.id, label: nombreDe(m) }))] }],
    valores: { mecanico: orden.mecanico },
    enviar: async (d) => { await actualizar("ordenes", orden.id, { mecanico: d.mecanico }); toast("Mecánico asignado"); vista.recargar(); },
  });
}

function formTrabajo(ordenId) {
  formDialog({
    titulo: "Agregar trabajo",
    campos: [
      { name: "descripcion", label: "Trabajo realizado", required: true, maxlength: 200 },
      { name: "precio_mano_obra", label: "Mano de obra", type: "number", required: true, min: 0, step: "0.01" },
    ],
    enviar: async (d) => { await crear("trabajos", { orden: ordenId, ...d }); toast("Trabajo agregado"); vista.recargar(); },
  });
}

async function formRepuesto(ordenId) {
  const disponibles = await pb.collection("repuestos").getFullList({ filter: "existencias > 0", sort: "nombre" });
  if (!disponibles.length) return toast("No hay repuestos con existencias.", "aviso");
  formDialog({
    titulo: "Agregar repuesto",
    campos: [
      { name: "repuesto", label: "Repuesto", type: "select", required: true,
        options: disponibles.map((r) => ({ value: r.id, label: `${r.nombre} (${r.codigo}), ${money(r.precio)}, quedan ${r.existencias}` })) },
      { name: "cantidad", label: "Cantidad", type: "number", required: true, min: 1, step: 1, value: 1 },
    ],
    enviar: async (d) => {
      const r = disponibles.find((x) => x.id === d.repuesto);
      if (d.cantidad > r.existencias) throw new Error(`Solo quedan ${r.existencias} unidades de ${r.nombre}.`);
      await crear("repuestos_usados", { orden: ordenId, repuesto: d.repuesto, cantidad: d.cantidad });
      toast("Repuesto agregado");
      vista.recargar();
    },
  });
}

function formPago(ordenId, saldo) {
  formDialog({
    titulo: "Registrar pago",
    campos: [
      { name: "monto", label: `Monto (falta ${money(saldo)})`, type: "number", required: true, min: 0.01, step: "0.01", value: saldo },
      { name: "metodo", label: "Método de pago", type: "select", required: true,
        options: [{ value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" }, { value: "tarjeta", label: "Tarjeta" }] },
    ],
    enviar: async (d) => {
      if (d.monto > saldo + 0.005) throw new Error(`El pago no puede superar lo que falta (${money(saldo)}).`);
      await crear("pagos", { orden: ordenId, monto: d.monto, metodo: d.metodo, fecha: new Date().toISOString() });
      toast("Pago registrado");
      vista.recargar();
    },
  });
}
