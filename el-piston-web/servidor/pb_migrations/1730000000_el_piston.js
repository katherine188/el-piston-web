/// <reference path="../pb_data/types.d.ts" />
// Esquema de "El Pistón". Se aplica solo al arrancar PocketBase (>= 0.23).

migrate((app) => {
  // ---- Reglas de acceso reutilizables ----
  const staff = "@request.auth.id != ''";
  const gestion = "(@request.auth.rol = 'dueno' || @request.auth.rol = 'recepcion')";
  const dueno = "@request.auth.rol = 'dueno'";
  const fechas = () => [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  // ---- users: añadimos el rol y cerramos el registro público ----
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({
    name: "rol", required: true, maxSelect: 1,
    values: ["dueno", "recepcion", "mecanico"],
  }));
  users.listRule = staff;
  users.viewRule = staff;
  users.createRule = dueno;
  users.updateRule = "(id = @request.auth.id && @request.body.rol:isset = false) || " + dueno;
  users.deleteRule = dueno;
  app.save(users);

  // ---- clientes ----
  const clientes = new Collection({
    type: "base", name: "clientes",
    listRule: staff, viewRule: staff, createRule: gestion, updateRule: gestion, deleteRule: dueno,
    fields: [
      { type: "text", name: "nombre", required: true, max: 120 },
      { type: "text", name: "telefono", required: true, max: 30 },
      { type: "text", name: "direccion", max: 200 },
      ...fechas(),
    ],
    indexes: ["CREATE INDEX idx_clientes_nombre ON clientes (nombre)"],
  });
  app.save(clientes);

  // ---- vehiculos (N por cliente) ----
  const vehiculos = new Collection({
    type: "base", name: "vehiculos",
    listRule: staff, viewRule: staff, createRule: gestion, updateRule: gestion, deleteRule: dueno,
    fields: [
      { type: "relation", name: "cliente", required: true, collectionId: clientes.id, cascadeDelete: false, maxSelect: 1 },
      { type: "text", name: "matricula", required: true, max: 15 },
      { type: "text", name: "marca", required: true, max: 60 },
      { type: "text", name: "modelo", required: true, max: 60 },
      { type: "number", name: "anio", min: 1950, max: 2100, onlyInt: true },
      { type: "number", name: "kilometraje", min: 0, onlyInt: true },
      ...fechas(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_vehiculos_matricula ON vehiculos (matricula)"],
  });
  app.save(vehiculos);

  // ---- repuestos (inventario) ----
  const repuestos = new Collection({
    type: "base", name: "repuestos",
    listRule: staff, viewRule: staff, createRule: gestion, updateRule: gestion, deleteRule: dueno,
    fields: [
      { type: "text", name: "nombre", required: true, max: 120 },
      { type: "text", name: "codigo", required: true, max: 40 },
      { type: "number", name: "precio", min: 0 },
      { type: "number", name: "existencias", min: 0, onlyInt: true },
      { type: "number", name: "minimo", min: 0, onlyInt: true },
      ...fechas(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_repuestos_codigo ON repuestos (codigo)"],
  });
  app.save(repuestos);

  // ---- ordenes de servicio ----
  const ordenes = new Collection({
    type: "base", name: "ordenes",
    listRule: staff, viewRule: staff, createRule: gestion,
    // el mecánico solo puede tocar sus órdenes y no puede reasignarlas
    updateRule: gestion + " || (mecanico = @request.auth.id && @request.body.mecanico:isset = false)",
    deleteRule: dueno,
    fields: [
      { type: "relation", name: "vehiculo", required: true, collectionId: vehiculos.id, cascadeDelete: false, maxSelect: 1 },
      { type: "date", name: "fecha_entrada", required: true },
      { type: "date", name: "fecha_salida" },
      { type: "text", name: "problema", required: true, max: 1000 },
      { type: "relation", name: "mecanico", collectionId: users.id, cascadeDelete: false, maxSelect: 1 },
      { type: "select", name: "estado", required: true, maxSelect: 1,
        values: ["recibida", "en_diagnostico", "en_reparacion", "lista", "entregada", "cancelada"] },
      ...fechas(),
    ],
    indexes: [
      "CREATE INDEX idx_ordenes_estado ON ordenes (estado)",
      "CREATE INDEX idx_ordenes_vehiculo ON ordenes (vehiculo)",
    ],
  });
  app.save(ordenes);

  // ---- trabajos (mano de obra) ----
  const detalleRule = gestion + " || orden.mecanico = @request.auth.id";
  app.save(new Collection({
    type: "base", name: "trabajos",
    listRule: staff, viewRule: staff, createRule: staff, updateRule: detalleRule, deleteRule: detalleRule,
    fields: [
      { type: "relation", name: "orden", required: true, collectionId: ordenes.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "descripcion", required: true, max: 200 },
      { type: "number", name: "precio_mano_obra", min: 0 },
      ...fechas(),
    ],
    indexes: ["CREATE INDEX idx_trabajos_orden ON trabajos (orden)"],
  }));

  // ---- repuestos_usados (updateRule null = bloqueado: se borra y se vuelve a crear) ----
  app.save(new Collection({
    type: "base", name: "repuestos_usados",
    listRule: staff, viewRule: staff, createRule: staff, updateRule: null, deleteRule: detalleRule,
    fields: [
      { type: "relation", name: "orden", required: true, collectionId: ordenes.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "repuesto", required: true, collectionId: repuestos.id, cascadeDelete: false, maxSelect: 1 },
      { type: "number", name: "cantidad", required: true, min: 1, onlyInt: true },
      { type: "number", name: "precio_unitario", min: 0 }, // lo fija el servidor (pb_hooks)
      ...fechas(),
    ],
    indexes: ["CREATE INDEX idx_usados_orden ON repuestos_usados (orden)"],
  }));

  // ---- pagos (los mecánicos no ven dinero) ----
  app.save(new Collection({
    type: "base", name: "pagos",
    listRule: gestion, viewRule: gestion, createRule: gestion, updateRule: dueno, deleteRule: dueno,
    fields: [
      { type: "relation", name: "orden", required: true, collectionId: ordenes.id, cascadeDelete: true, maxSelect: 1 },
      { type: "number", name: "monto", required: true, min: 0.01 },
      { type: "date", name: "fecha", required: true },
      { type: "select", name: "metodo", required: true, maxSelect: 1, values: ["efectivo", "transferencia", "tarjeta"] },
      ...fechas(),
    ],
    indexes: ["CREATE INDEX idx_pagos_orden ON pagos (orden)"],
  }));
}, (app) => {
  for (const n of ["pagos", "repuestos_usados", "trabajos", "ordenes", "repuestos", "vehiculos", "clientes"]) {
    app.delete(app.findCollectionByNameOrId(n));
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("rol");
  app.save(users);
});
