// Capa de datos: toda la comunicación con PocketBase pasa por aquí.
import PocketBase from "https://cdn.jsdelivr.net/npm/pocketbase@0.26.2/dist/pocketbase.es.mjs";
import { PB_URL } from "./config.js";

export const pb = new PocketBase(PB_URL);

export const ESTADOS = [
  { id: "recibida", etiqueta: "Recibida" },
  { id: "en_diagnostico", etiqueta: "En diagnóstico" },
  { id: "en_reparacion", etiqueta: "En reparación" },
  { id: "lista", etiqueta: "Lista para entregar" },
  { id: "entregada", etiqueta: "Entregada" },
  { id: "cancelada", etiqueta: "Cancelada" },
];
export const ABIERTAS = ["recibida", "en_diagnostico", "en_reparacion", "lista"];
export const etiquetaEstado = (id) => ESTADOS.find((e) => e.id === id)?.etiqueta ?? id;

// ---- Sesión y roles ----
export const usuario = () => pb.authStore.record;
export const esGestion = () => ["dueno", "recepcion"].includes(usuario()?.rol);
export const esDueno = () => usuario()?.rol === "dueno";
export const nombreDe = (u) => u?.name || u?.email || "Sin asignar";

// ---- Ayudas para leer los registros expandidos ----
export const vehiculoDe = (o) => o.expand?.vehiculo ?? {};
export const clienteDe = (o) => vehiculoDe(o).expand?.cliente ?? {};
export const mecanicoDe = (o) => nombreDe(o.expand?.mecanico);

// ---- Errores legibles para el usuario ----
export function mensajeError(err) {
  if (err?.status === 0) return "No hay conexión con el servidor. Revisa que PocketBase esté en marcha.";
  const campos = Object.entries(err?.response?.data ?? {}).map(([k, v]) => `${k}: ${v.message}`);
  if (campos.length) return campos.join(". ");
  return err?.response?.message || err?.message || "Ocurrió un error inesperado.";
}

// ---- Escrituras ----
export const crear = (col, datos) => pb.collection(col).create(datos);
export const actualizar = (col, id, datos) => pb.collection(col).update(id, datos);
export const borrar = (col, id) => pb.collection(col).delete(id);

// ---- Lecturas auxiliares ----
export const cargarMecanicos = () => pb.collection("users").getFullList({ filter: 'rol = "mecanico"', sort: "name" });
export const repuestosBajos = () => pb.collection("repuestos").getFullList({ filter: "existencias <= minimo", sort: "existencias" });
export const conteoBajos = async () => (await pb.collection("repuestos").getList(1, 1, { filter: "existencias <= minimo" })).totalItems;

// ---- Totales de una orden ----
const sumar = (lista, f) => lista.reduce((s, x) => s + f(x), 0);

function totalesDe(estado, trabajos, usados, pagos) {
  const manoObra = sumar(trabajos, (t) => t.precio_mano_obra);
  const repuestos = sumar(usados, (u) => u.cantidad * u.precio_unitario);
  const total = manoObra + repuestos;
  const pagado = sumar(pagos, (p) => p.monto);
  return {
    manoObra, repuestos, total, pagado,
    saldo: estado === "cancelada" ? 0 : Math.max(0, total - pagado),
    // Solo se considera deuda cuando el trabajo ya terminó (lista o entregada)
    cobrable: ["lista", "entregada"].includes(estado),
  };
}

// Todas las órdenes con sus totales. Las 4 consultas viajan en paralelo.
export async function cargarOrdenes() {
  const gestion = esGestion();
  const [ordenes, trabajos, usados, pagos] = await Promise.all([
    pb.collection("ordenes").getFullList({ sort: "-fecha_entrada", expand: "vehiculo.cliente,mecanico" }),
    pb.collection("trabajos").getFullList(),
    pb.collection("repuestos_usados").getFullList(),
    gestion ? pb.collection("pagos").getFullList({ sort: "-fecha" }) : Promise.resolve([]),
  ]);
  const porOrden = (lista) => {
    const m = new Map();
    for (const r of lista) m.set(r.orden, [...(m.get(r.orden) ?? []), r]);
    return m;
  };
  const t = porOrden(trabajos), u = porOrden(usados), p = porOrden(pagos);
  for (const o of ordenes) Object.assign(o, totalesDe(o.estado, t.get(o.id) ?? [], u.get(o.id) ?? [], p.get(o.id) ?? []));
  return { ordenes, pagos };
}

// Una orden con todo su detalle.
export async function cargarDetalle(id) {
  const filtro = pb.filter("orden = {:id}", { id });
  const [orden, trabajos, usados, pagos] = await Promise.all([
    pb.collection("ordenes").getOne(id, { expand: "vehiculo.cliente,mecanico" }),
    pb.collection("trabajos").getFullList({ filter: filtro, sort: "created" }),
    pb.collection("repuestos_usados").getFullList({ filter: filtro, sort: "created", expand: "repuesto" }),
    esGestion() ? pb.collection("pagos").getFullList({ filter: filtro, sort: "fecha" }) : Promise.resolve([]),
  ]);
  return { orden, trabajos, usados, pagos, totales: totalesDe(orden.estado, trabajos, usados, pagos) };
}
