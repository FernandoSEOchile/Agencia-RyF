# Convenciones de AppSEO

Reglas del proyecto que no se deducen del código. Cúmplelas sin que haga falta
pedirlas.

## Tablas

**Toda tabla se ordena pulsando sus encabezados.** Sin excepción, y desde la
primera versión: no es una mejora posterior, es parte de lo que significa
«tabla» en este panel.

Se hace con `src/components/Tabla.tsx`, que ya resuelve el estado, la flecha y
la comparación:

```tsx
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

type Col = "nombre" | "volumen";
const COLUMNAS: readonly Columna<Col>[] = [
  { id: "nombre", texto: "Nombre" },
  { id: "volumen", texto: "Volumen", clase: "text-right", num: true },
];

const { orden, ordenar, ordenarPor } = useOrden<Col>("volumen", false);
const filas = ordenarPor(datos, (d, c) => (c === "nombre" ? d.nombre : d.volumen));

<table>
  <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
  …
</table>
```

`num: true` hace que la columna arranque de mayor a menor, que es lo que se
quiere ver primero en una cifra. Una columna de botones lleva `fija: true`.

Y con la tabla vienen dos cosas más: **buscador** cuando puede haber más de
treinta filas, y **contenedor con `overflow-x-auto`** para que el ancho no
empuje la página entera.

## Idioma

Todo en español: nombres de variables, funciones, campos de base de datos,
comentarios y textos de la interfaz. Español de Chile en lo que lee el usuario.

## Comentarios

Explican **por qué**, nunca qué. Si el código ya dice lo que hace, el
comentario sobra. Los que valen son los que evitan que alguien «arregle» algo
que estaba bien a propósito.

## Dinero

Cualquier operación que cueste dinero:

1. Se apunta con `apuntar()` o `apuntarClaude()` de `src/lib/gasto.ts`, con el
   importe real que devuelve el proveedor.
2. La lanza una persona pulsando algo, nunca ocurre sola.
3. El importe se guarda calculado, no se recalcula después.

## Secretos

Van cifrados con `src/lib/cifrado.ts` si son por cliente, o en el entorno del
servidor si son del producto (como las credenciales de la aplicación de
Google). Nunca en el código ni en la interfaz.

## Datos por cliente

Toda consulta lleva `clienteId` en el `where`. No se escriben funciones que
devuelvan datos de todos los clientes a la vez salvo en las pantallas de
administración, y nunca para alimentar al asistente.

## Escritura en sitios ajenos

Las herramientas que escriben comprueban el permiso **antes** de llamar al
sitio, y devuelven el estado anterior para que se pueda deshacer.
