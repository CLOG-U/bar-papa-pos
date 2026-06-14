# Bar Papa POS

Sistema POS local para mini-bar. Permite manejar mesas abiertas, productos, inventario, cobros en efectivo, cobros por partes, ventas, tickets, exportes y trazabilidad.

## Requisitos

- Windows con Node.js instalado.
- Usar `npm.cmd` en PowerShell si `npm` aparece bloqueado por politicas de ejecucion.

## Iniciar el sistema

1. Abrir una terminal en la carpeta del proyecto.
2. Instalar dependencias si es la primera vez:

```powershell
npm.cmd install
```

3. Iniciar la aplicacion:

```powershell
npm.cmd run dev
```

4. Abrir el POS en el navegador:

```text
http://127.0.0.1:5173
```

La API local corre en:

```text
http://127.0.0.1:3001
```

## Primer ingreso

Usuario inicial:

```text
Admin
```

PIN inicial:

```text
1234
```

Luego puedes crear mas usuarios en el apartado `Usuarios`.

## Flujo diario recomendado

1. Entrar con PIN.
2. Revisar alertas de stock minimo.
3. Crear o editar productos en `Productos`.
4. Abrir mesas desde `Mesas`.
5. Agregar productos a cada mesa.
6. Cobrar la mesa cuando el cliente termine.
7. Revisar ventas y exportes en `Ventas`.
8. Ajustar inventario cuando entren productos nuevos.

## Productos

En `Productos` puedes:

- Crear cervezas u otros productos.
- Definir categoria.
- Definir precio en USD.
- Definir stock actual.
- Definir stock minimo.
- Activar o desactivar productos para venta.

Si editas el stock actual, el sistema registra el movimiento en inventario y auditoria.

## Mesas

En `Mesas` puedes:

- Crear una mesa con nombre o referencia.
- Agregar productos.
- Aumentar o reducir cantidades.
- Cerrar cuenta.
- Cancelar mesa.

Cuando agregas productos a una mesa, el inventario se descuenta de inmediato.

Cuando reduces o cancelas consumos, el inventario se devuelve automaticamente.

## Cancelar mesa

Usa `Cancelar mesa` cuando una mesa abierta ya no debe cobrarse.

Al cancelar:

- La mesa deja de aparecer como abierta.
- Los productos vuelven al inventario.
- La accion queda registrada en auditoria.

## Cobro normal

Al presionar `Cerrar cuenta`, se abre una ventana de cobro.

En `Pago completo`:

- El sistema muestra el total.
- Ingresas el efectivo recibido.
- El sistema calcula el cambio.
- No permite confirmar si el efectivo no cubre el total.

## Cobro por partes

Usa `Por partes` cuando varios clientes pagan una misma mesa.

Cada parte tiene:

- Nombre de la parte.
- Cantidad de productos a cobrar.
- Monto a cobrar.
- Efectivo recibido.
- Cambio de esa parte.

El campo `Productos` ayuda a calcular automaticamente el monto cuando alguien dice, por ejemplo: "cobreme 4".

Reglas importantes:

- No se puede asignar mas productos que los existentes en la mesa.
- El total cubierto por partes debe coincidir con el total de la mesa.
- El cambio se calcula dentro de cada parte.
- El total de la mesa no se altera por el billete entregado; solo por el monto a cobrar.

## Inventario

En `Inventario` puedes:

- Ver stock actual.
- Ver productos con stock bajo.
- Hacer entradas o ajustes manuales.
- Revisar movimientos de inventario.
- Exportar inventario a Excel o PDF.

## Alertas de stock minimo

Cuando un producto activo llega a su stock minimo o queda por debajo, aparece una alerta visible en la parte superior.

La alerta no bloquea la operacion, pero se mantiene visible hasta que se reponga inventario o se ajuste el stock minimo.

## Ventas

En `Ventas` puedes:

- Ver ventas cerradas.
- Ver total historico.
- Revisar pagos y cambios.
- Descargar ticket PDF.
- Exportar ventas a Excel o PDF.

El total de ventas se calcula desde la tabla `sales` de SQLite, usando el campo `total_cents`.

## Usuarios

En `Usuarios` puedes crear usuarios con PIN.

Todos los usuarios tienen los mismos permisos en esta version.

Cada accion importante queda asociada al usuario que la hizo.

## Auditoria

En `Auditoria` puedes revisar acciones como:

- Inicio de sesion.
- Creacion de mesas.
- Cambios en productos.
- Cambios de precio.
- Ajustes de inventario.
- Cierre de ventas.
- Cancelacion de mesas.

## Datos y respaldo

La base local se guarda en:

```text
data/bar-papa.sqlite
```

Archivos auxiliares de SQLite:

```text
data/bar-papa.sqlite-wal
data/bar-papa.sqlite-shm
```

Para respaldar el sistema, copia la carpeta `data` con la aplicacion detenida.

## Exportes

Desde la aplicacion puedes exportar:

- Inventario en Excel.
- Inventario en PDF.
- Ventas en Excel.
- Ventas en PDF.
- Ticket interno de cada venta en PDF.

Los tickets son internos para control del bar. No son factura fiscal.

## Comandos utiles

Compilar la aplicacion:

```powershell
npm.cmd run build
```

Iniciar solo el servidor API:

```powershell
npm.cmd run dev:server
```

Iniciar solo la interfaz:

```powershell
npm.cmd run dev:client
```

## Notas

- Moneda configurada: USD.
- Persistencia: SQLite local.
- Uso esperado: un computador local del mini-bar.
- El sistema no incluye facturacion fiscal ni pagos mixtos por metodo; el flujo actual es efectivo.
