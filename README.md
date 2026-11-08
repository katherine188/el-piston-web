# El Pistón Web · Gestión de taller automotriz

Sistema web para un taller mecánico con dos mecánicos y una recepcionista. La información está centralizada en un servidor **PocketBase** y se usa desde un cliente en **HTML, CSS y JavaScript** (sin frameworks) que habla con el servidor mediante el SDK oficial de PocketBase.

Asignatura: Programación para Dispositivos Móviles. Actividad individual.

## Estructura

```
servidor/
  pb_migrations/   esquema: colecciones, relaciones, índices y reglas de acceso
  pb_hooks/        lógica de servidor: control de existencias
cliente/
  index.html
  css/styles.css
  js/
    config.js      URL del servidor y moneda
    api.js         único módulo que habla con PocketBase
    ui.js          plantillas con escape, diálogos, avisos, formatos
    app.js         login, router por hash, tiempo real
    views/         panel, ordenes, clientes, inventario, reportes
capturas/          capturas de la aplicación en uso
```

## Cómo ejecutarlo

Requisitos: [PocketBase](https://pocketbase.io/docs/) **0.23 o superior** (las migraciones usan su API de JavaScript) y cualquier servidor estático para el cliente.

1. **Servidor.** Descarga el ejecutable de PocketBase, cópialo dentro de `servidor/` y ejecuta:
   ```
   cd servidor
   ./pocketbase serve
   ```
   Al arrancar aplica solo la migración y los hooks. Servidor en `http://127.0.0.1:8090`.
2. **Superusuario.** Abre el enlace que imprime la consola (`/_/#/pbinstal/...`) y crea tu superusuario.
3. **Usuarios del taller.** En el panel `http://127.0.0.1:8090/_/`, colección `users`, crea al menos:
   - un usuario con `rol = dueno`
   - uno con `rol = recepcion`
   - dos con `rol = mecanico` (rellena también `name`)
4. **Cliente.** Desde otra terminal:
   ```
   cd cliente
   npx serve .
   ```
   (o la extensión Live Server de VS Code). Los módulos ES no funcionan abriendo el HTML con `file://`. Entra con uno de los usuarios creados.

Si el servidor está en otra dirección, cambia `PB_URL` en `cliente/js/config.js`.

## Modelo de datos

| Colección | Campos principales | Relaciones |
|---|---|---|
| `users` (auth) | nombre, correo, **rol** (dueno, recepcion, mecanico) | |
| `clientes` | nombre, teléfono, dirección | |
| `vehiculos` | matrícula (única), marca, modelo, año, kilometraje | `cliente` (un cliente tiene N vehículos) |
| `ordenes` | fecha de entrada, fecha de salida, problema, estado | `vehiculo`, `mecanico` (users) |
| `trabajos` | descripción, precio de mano de obra | `orden` |
| `repuestos` | nombre, código (único), precio, existencias, mínimo | |
| `repuestos_usados` | cantidad, **precio unitario congelado** | `orden`, `repuesto` |
| `pagos` | monto, fecha, método | `orden` |

Estados de la orden: `recibida`, `en_diagnostico`, `en_reparacion`, `lista`, `entregada`, `cancelada`.

## Reglas de acceso

| Colección | Leer | Crear | Editar | Borrar |
|---|---|---|---|---|
| `users` | personal | dueño | cada uno su perfil (sin cambiar su rol), dueño todo | dueño |
| `clientes`, `vehiculos`, `repuestos` | personal | dueño y recepción | dueño y recepción | dueño |
| `ordenes` | personal | dueño y recepción | dueño y recepción; el mecánico solo las suyas y sin reasignarlas | dueño |
| `trabajos` | personal | personal | dueño, recepción o el mecánico de esa orden | igual que editar |
| `repuestos_usados` | personal | personal | bloqueado (se quita y se vuelve a agregar) | dueño, recepción o el mecánico de esa orden |
| `pagos` | dueño y recepción | dueño y recepción | dueño | dueño |

"Personal" = cualquier usuario autenticado. El registro público de usuarios está cerrado. Los mecánicos no ven dinero (`pagos` les está vedado).

## Decisiones de diseño

**Qué necesita ver cada rol.** El mecánico entra directo a *sus* órdenes abiertas, desde el teléfono, y puede anotar trabajos y repuestos y avanzar el estado hasta "lista para entregar". La recepción y el dueño ven todo el taller, cobran y consultan reportes. El menú se adapta al rol y las rutas de gestión están protegidas también en el cliente (la seguridad real la dan las reglas del servidor).

**Pantallas.**
- *Panel*: un tablero con las órdenes abiertas agrupadas por estado, la carga de cada mecánico, los repuestos por agotarse y un resumen de facturado del mes y por cobrar.
- *Órdenes*: lista con búsqueda por matrícula o cliente y filtro por estado. El detalle reúne problema, cambio de estado, trabajos, repuestos, pagos y totales.
- *Clientes*: lista con saldo pendiente, ficha con sus vehículos y su historial. *Vehículo*: historial de servicios.
- *Inventario*: existencias con nivel (disponible, pocas unidades, agotado), reposición y edición.
- *Reportes*: facturación por período y clientes con saldo pendiente.

**Existencias controladas por el servidor.** Un hook (`pb_hooks/inventario.pb.js`) valida que haya unidades, descuenta las existencias al usar un repuesto y las devuelve si se quita de la orden. Así la regla no depende del cliente. El mismo hook guarda el **precio unitario vigente** en el momento del uso, de modo que un cambio posterior de precio no altera órdenes antiguas.

**Aviso de repuestos por agotarse.** Cada repuesto tiene un `minimo`. Cuando las existencias lo alcanzan, aparece en el panel, el menú muestra un punto de aviso y todos los usuarios conectados reciben un aviso en vivo.

**Cuánto se debe.** Total = mano de obra + repuestos (cantidad por precio congelado). Saldo = total − pagos. Como el pago puede hacerse en dos partes, cada pago es un registro y el saldo se calcula. Una orden solo cuenta como deuda del cliente cuando está *lista* o *entregada* (una orden en reparación todavía no tiene un total final). No se puede registrar un pago mayor al saldo. Antes de entregar un vehículo con deuda, la aplicación pide confirmación.

**Facturado.** Suma de los totales de las órdenes *entregadas* cuya fecha de entrega cae dentro del período. El reporte muestra además lo *cobrado* (pagos recibidos) en el mismo período.

**Cancelar.** Una orden cancelada no cuenta como deuda ni como facturación y puede reabrirse. Para no descuadrar el inventario, hay que quitar primero los repuestos de la orden.

**Experiencia de usuario.**
- Diseño primero para móvil: el menú pasa a la parte inferior y el tablero se desliza horizontalmente.
- La matrícula es el identificador visual en todo el sistema, con aspecto de placa.
- Estados de carga, vacíos con indicación de qué hacer y mensajes de error que explican qué pasó.
- Formularios en diálogo con validación y errores del servidor mostrados dentro del propio diálogo.
- Confirmación antes de acciones destructivas o con consecuencias (entregar con deuda, cancelar, quitar).
- Los datos se actualizan solos en todas las pantallas abiertas (tiempo real).
- Accesible: foco visible, `aria-live` en los avisos, etiquetas en todos los campos, respeta `prefers-reduced-motion`.

## Asincronía y buenas prácticas

- Todo el acceso a datos es `async/await` con `try/catch`. Las consultas independientes se lanzan **en paralelo con `Promise.all`** (por ejemplo, órdenes, trabajos, repuestos usados y pagos se piden a la vez).
- **Tiempo real** con `subscribe()` del SDK: cuando alguien cambia algo, las vistas se refrescan (con *debounce* para agrupar ráfagas de eventos).
- **Filtros parametrizados** con `pb.filter("orden = {:id}", { id })` en lugar de concatenar cadenas.
- **Sin XSS**: las plantillas `html` escapan todo valor interpolado automáticamente; no se inserta texto del usuario sin escapar.
- **Módulos ES** con responsabilidades separadas: `api.js` (datos), `ui.js` (presentación), `views/` (pantallas), `app.js` (arranque y rutas). La URL del servidor vive en un solo archivo.
- La sesión se valida al abrir la aplicación (`authRefresh`) y si el token caduca se vuelve al login.
- Los errores del servidor se traducen a mensajes legibles (`mensajeError`) y la falta de conexión se distingue de los errores de validación.

## Limitaciones conocidas y mejoras posibles

- Los totales y reportes se calculan en el cliente a partir de todas las órdenes. Es adecuado para un taller pequeño; con mucho volumen convendría paginar o agregar un endpoint de reportes en el servidor.
- El descuento de existencias no corre dentro de una única transacción con el alta del repuesto usado. Con SQLite y tan pocos usuarios simultáneos el riesgo es mínimo.
- Cualquier usuario del personal puede agregar trabajos y repuestos a cualquier orden (las reglas de PocketBase no permiten comprobar la orden en el momento de crear). Editar y borrar sí se limita al mecánico asignado.

## Capturas

Las capturas de la aplicación en uso están en la carpeta [`capturas/`](capturas/).
