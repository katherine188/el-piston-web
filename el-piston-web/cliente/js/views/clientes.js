import { pb, cargarOrdenes, crear, actualizar, borrar, esDueno, mensajeError, clienteDe } from "../api.js";
import { html, mount, money, formDialog, confirmar, toast, vista } from "../ui.js";
import { listaFilas } from "./comun.js";
import { nuevaOrden } from "./ordenes.js";

let busqueda = "";

// ---------------------------------------------------------------- Formularios
function formCliente(cliente) {
  formDialog({
    titulo: cliente ? "Editar cliente" : "Nuevo cliente",
    campos: [
      { name: "nombre", label: "Nombre", required: true, maxlength: 120 },
      { name: "telefono", label: "Teléfono", type: "tel", required: true, maxlength: 30 },
      { name: "direccion", label: "Dirección", maxlength: 200, ayuda: "Opcional" },
    ],
    valores: cliente ?? {},
    enviar: async (d) => {
      if (cliente) await actualizar("clientes", cliente.id, d);
      else { const nuevo = await crear("clientes", d); location.hash = `#/clientes/${nuevo.id}`; }
      toast(cliente ? "Cliente actualizado" : "Cliente creado");
      vista.recargar();
    },
  });
}

function formVehiculo(clienteId, vehiculo) {
  formDialog({
    titulo: vehiculo ? "Editar vehículo" : "Nuevo vehículo",
    campos: [
      { name: "matricula", label: "Matrícula", required: true, maxlength: 15, mayus: true },
      { name: "marca", label: "Marca", required: true, maxlength: 60 },
      { name: "modelo", label: "Modelo", required: true, maxlength: 60 },
      { name: "anio", label: "Año", type: "number", min: 1950, max: new Date().getFullYear() + 1, step: 1 },
      { name: "kilometraje", label: "Kilometraje", type: "number", min: 0, step: 1 },
    ],
    valores: vehiculo ?? {},
    enviar: async (d) => {
      if (vehiculo) await actualizar("vehiculos", vehiculo.id, d);
      else await crear("vehiculos", { ...d, cliente: clienteId });
      toast(vehiculo ? "Vehículo actualizado" : "Vehículo registrado");
      vista.recargar();
    },
  });
}

// ---------------------------------------------------------------- Lista
export async function listaClientes(main) {
  const [clientes, vehiculos, { ordenes }] = await Promise.all([
    pb.collection("clientes").getFullList({ sort: "nombre" }),
    pb.collection("vehiculos").getFullList(),
    cargarOrdenes(),
  ]);
  const nVeh = new Map(), deuda = new Map();
  for (const v of vehiculos) nVeh.set(v.cliente, (nVeh.get(v.cliente) ?? 0) + 1);
  for (const o of ordenes) if (o.cobrable && o.saldo > 0) deuda.set(clienteDe(o).id, (deuda.get(clienteDe(o).id) ?? 0) + o.saldo);

  mount(main, html`
    <div class="titulo-pagina"><h1>Clientes</h1><button class="btn" data-accion="nuevo">Nuevo cliente</button></div>
    <div class="herramientas"><input type="search" id="buscar" placeholder="Buscar por nombre o teléfono" value="${busqueda}" aria-label="Buscar clientes"></div>
    <div id="lista"></div>`);

  const pintar = () => {
    const q = busqueda.trim().toLowerCase();
    const lista = clientes.filter((c) => !q || `${c.nombre} ${c.telefono}`.toLowerCase().includes(q));
    mount(main.querySelector("#lista"), lista.length ? html`<div class="filas">${lista.map((c) => html`
      <a class="fila fila-cliente" href="#/clientes/${c.id}">
        <span class="fila-principal"><strong>${c.nombre}</strong><small>${c.telefono}</small></span>
        <span class="fila-meta">${nVeh.get(c.id) ?? 0} ${(nVeh.get(c.id) ?? 0) === 1 ? "vehículo" : "vehículos"}</span>
        <span class="monto ${deuda.get(c.id) ? "debe" : ""}">${deuda.get(c.id) ? "Debe " + money(deuda.get(c.id)) : ""}</span>
      </a>`)}</div>` : html`<p class="vacio">No hay clientes que coincidan. Registra uno con “Nuevo cliente”.</p>`);
  };
  pintar();
  main.querySelector("#buscar").oninput = (e) => { busqueda = e.target.value; pintar(); };
  main.onclick = (e) => { if (e.target.closest('[data-accion="nuevo"]')) formCliente(); };
}

// ---------------------------------------------------------------- Detalle de cliente
export async function detalleCliente(main, id) {
  const [cliente, vehiculos, { ordenes }] = await Promise.all([
    pb.collection("clientes").getOne(id),
    pb.collection("vehiculos").getFullList({ filter: pb.filter("cliente = {:id}", { id }), sort: "matricula" }),
    cargarOrdenes(),
  ]);
  const suyas = ordenes.filter((o) => clienteDe(o).id === id);
  const deuda = suyas.filter((o) => o.cobrable).reduce((s, o) => s + o.saldo, 0);

  mount(main, html`
    <a class="volver" href="#/clientes">Volver a clientes</a>
    <header class="cabecera-orden">
      <div>
        <h1>${cliente.nombre}</h1>
        <p><a class="tel" href="tel:${cliente.telefono}">${cliente.telefono}</a></p>
        ${cliente.direccion ? html`<p>${cliente.direccion}</p>` : ""}
      </div>
      <div class="estado-orden">
        <p class="${deuda > 0 ? "debe" : ""}">Saldo pendiente <strong>${money(deuda)}</strong></p>
        <button class="btn-sec" data-accion="editar">Editar</button>
        ${esDueno() ? html`<button class="btn-texto" data-accion="eliminar">Eliminar cliente</button>` : ""}
      </div>
    </header>

    <section class="bloque">
      <div class="bloque-cab"><h2>Vehículos</h2><button class="btn-sec" data-accion="nuevo-vehiculo">Agregar vehículo</button></div>
      ${vehiculos.length ? html`<ul class="lineas">${vehiculos.map((v) => html`
        <li><span><a class="placa" href="#/vehiculos/${v.id}">${v.matricula}</a> ${v.marca} ${v.modelo}${v.anio ? `, ${v.anio}` : ""}</span>
            <button class="btn-texto" data-accion="orden" data-id="${v.id}">Nueva orden</button></li>`)}</ul>`
        : html`<p class="vacio-mini">Este cliente aún no tiene vehículos registrados.</p>`}
    </section>

    <section class="bloque">
      <h2>Historial de servicios</h2>
      ${listaFilas(suyas, "Este cliente todavía no tiene órdenes.")}
    </section>`);

  main.onclick = async (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (!b) return;
    try {
      switch (b.dataset.accion) {
        case "editar": return formCliente(cliente);
        case "nuevo-vehiculo": return formVehiculo(id);
        case "orden": return nuevaOrden(vehiculos.find((v) => v.id === b.dataset.id));
        case "eliminar":
          if (await confirmar("¿Eliminar este cliente? Solo es posible si no tiene vehículos.", "Eliminar")) {
            await borrar("clientes", id);
            toast("Cliente eliminado");
            location.hash = "#/clientes";
          }
      }
    } catch (err) {
      toast(err.status === 400 ? "No se puede eliminar: tiene vehículos o historial asociado." : mensajeError(err), "error");
    }
  };
}

// ---------------------------------------------------------------- Historial de un vehículo
export async function detalleVehiculo(main, id) {
  const [vehiculo, { ordenes }] = await Promise.all([
    pb.collection("vehiculos").getOne(id, { expand: "cliente" }),
    cargarOrdenes(),
  ]);
  const cliente = vehiculo.expand?.cliente ?? {};
  const historial = ordenes.filter((o) => o.vehiculo === id);

  mount(main, html`
    <a class="volver" href="#/clientes/${cliente.id}">Volver a ${cliente.nombre}</a>
    <header class="cabecera-orden">
      <div>
        <span class="placa placa-grande">${vehiculo.matricula}</span>
        <p class="vehiculo">${vehiculo.marca} ${vehiculo.modelo}${vehiculo.anio ? `, ${vehiculo.anio}` : ""}. ${vehiculo.kilometraje ?? 0} km</p>
        <p><a href="#/clientes/${cliente.id}">${cliente.nombre}</a></p>
      </div>
      <div class="estado-orden">
        <button class="btn" data-accion="orden">Nueva orden</button>
        <button class="btn-sec" data-accion="editar">Editar</button>
        ${esDueno() ? html`<button class="btn-texto" data-accion="eliminar">Eliminar vehículo</button>` : ""}
      </div>
    </header>
    <section class="bloque"><h2>Historial de servicios</h2>${listaFilas(historial, "Este vehículo aún no tiene servicios.")}</section>`);

  main.onclick = async (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (!b) return;
    try {
      switch (b.dataset.accion) {
        case "editar": return formVehiculo(cliente.id, vehiculo);
        case "orden": return nuevaOrden(vehiculo);
        case "eliminar":
          if (await confirmar("¿Eliminar este vehículo? Solo es posible si no tiene órdenes.", "Eliminar")) {
            await borrar("vehiculos", id);
            toast("Vehículo eliminado");
            location.hash = `#/clientes/${cliente.id}`;
          }
      }
    } catch (err) {
      toast(err.status === 400 ? "No se puede eliminar: tiene órdenes asociadas." : mensajeError(err), "error");
    }
  };
}
