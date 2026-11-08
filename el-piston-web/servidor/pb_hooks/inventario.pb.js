/// <reference path="../pb_data/types.d.ts" />
// Las existencias las controla el servidor, no el cliente: así nadie puede saltarse la regla.

// 1) Antes de guardar: valida existencias y congela el precio vigente del repuesto.
onRecordCreateRequest((e) => {
  let repuesto;
  try {
    repuesto = $app.findRecordById("repuestos", e.record.getString("repuesto"));
  } catch (_) {
    throw new BadRequestError("El repuesto indicado no existe.");
  }
  const cantidad = e.record.getInt("cantidad");
  const quedan = repuesto.getInt("existencias");
  if (cantidad > quedan) {
    throw new BadRequestError("Solo quedan " + quedan + " unidades de " + repuesto.getString("nombre") + ".");
  }
  e.record.set("precio_unitario", repuesto.getFloat("precio"));
  e.next();
}, "repuestos_usados");

// 2) Ya guardado: descuenta las existencias.
onRecordAfterCreateSuccess((e) => {
  const repuesto = $app.findRecordById("repuestos", e.record.getString("repuesto"));
  repuesto.set("existencias", repuesto.getInt("existencias") - e.record.getInt("cantidad"));
  $app.save(repuesto);
  e.next();
}, "repuestos_usados");

// 3) Si se quita el repuesto de la orden, las unidades vuelven al inventario.
onRecordAfterDeleteSuccess((e) => {
  try {
    const repuesto = $app.findRecordById("repuestos", e.record.getString("repuesto"));
    repuesto.set("existencias", repuesto.getInt("existencias") + e.record.getInt("cantidad"));
    $app.save(repuesto);
  } catch (_) { /* el repuesto ya no existe */ }
  e.next();
}, "repuestos_usados");
