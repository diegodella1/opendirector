# Manual de Uso y Operacion

## 1. Que es OpenDirector

OpenDirector tiene tres piezas:

- `Webapp`: donde el productor crea shows, arma el rundown, edita scripts, sube media y monitorea el aire.
- `Automator`: app de operador/TD que se conecta al servidor y a `vMix`, y ejecuta el show.
- `Prompter`: vista para talento/conductor, accesible desde navegador.

Roles tipicos:

- `Productor`: usa la webapp.
- `Operador`: usa el Automator junto a `vMix`.
- `Talento`: usa el prompter.

## 2. Flujo General

Orden recomendado de uso:

1. Crear un show nuevo.
2. Configurar datos base del show y la integracion con `vMix`.
3. Armar bloques, elementos, scripts y acciones.
4. Probar el show en `ready` o `rehearsal`.
5. Conectar el Automator al servidor y a `vMix`.
6. Ir a `live` cuando el show sale al aire.
7. Operar desde `Go Live` y desde el Automator.
8. Guardar el show como template si queres reutilizarlo.

## 3. Vistas y Para Que Sirve Cada Una

### Home `/`

Es la pantalla principal de la webapp.

Sirve para:

- ver todos los shows
- crear un show nuevo
- crear un show desde template
- abrir `Edit`
- abrir `Go Live`
- abrir `Prompter`
- guardar un show existente como template

### Edit `/shows/:id/edit`

Es la vista de armado del rundown.

Aca se hace casi todo el trabajo editorial:

- crear bloques
- agregar elementos a cada bloque
- ordenar bloques y elementos
- escribir scripts
- definir media asociada
- cargar acciones de automatizacion
- subir media
- administrar personas
- administrar GT templates

### Go Live `/shows/:id/live`

Es la vista de supervision del productor durante el show.

Sirve para:

- ver el rundown actual
- ver bloque actual y siguiente
- ver tiempos
- cambiar estado del show
- enviar senales al talento
- ver execution log

### Prompter `/shows/:id/prompter`

Es la pantalla de lectura para talento.

Sirve para:

- leer el script
- controlar scroll
- ver senales del productor
- usar mirror/fullscreen

### Download `/download`

Pagina para bajar el instalador del Automator.

## 4. Crear un Show

En la pantalla principal:

1. Escribi el nombre del show.
2. Elegi si queres:
   `Blank show`: show vacio.
   `From: <template>`: show basado en un template existente.
3. Hace click en `New Show`.

Resultado esperado:

- el show aparece en el listado
- queda en estado `draft`
- se crea su configuracion base

## 5. Estados del Show

Estados disponibles:

- `draft`: show en armado.
- `ready`: show listo para probar o salir.
- `rehearsal`: ensayo.
- `live`: al aire.
- `archived`: cerrado.

Regla practica:

- mientras esta `live`, varias ediciones operativas quedan bloqueadas para evitar cambios peligrosos.

Uso recomendado:

1. `draft` mientras armas el contenido.
2. `ready` cuando terminaste de preparar.
3. `rehearsal` si haces ensayo.
4. `live` solo cuando el show ya sale.
5. `archived` al terminar el ciclo del programa.

## 6. Configuracion del Show

Cada show tiene una configuracion tecnica propia.

Campos importantes de `od_show_config`:

- `vmix_host`: host o IP de `vMix`
- `vmix_port`: puerto TCP de `vMix`, normalmente `8099`
- `clip_pool_a_key`
- `clip_pool_b_key`
- `graphic_key`
- `graphic_overlay`
- `lower_third_key`
- `lower_third_overlay`
- `action_delay_ms`
- `overrun_behavior`
- `overrun_safe_input_key`

### Que es `vmix_host` y `vmix_port`

OpenDirector separa dos cosas:

- `Webapp`: guarda la configuracion general del show.
- `Automator`: hace la conexion real a `vMix`.

Entonces:

- `vmix_host` y `vmix_port` representan a que instancia de `vMix` esta pensado ese show.
- el operador, en el Automator, tambien debe conectarse a ese `vMix`.

Uso tipico:

- si `vMix` corre en la misma PC del operador: `127.0.0.1:8099`
- si `vMix` esta en otra maquina: `IP_DE_VMIX:8099`

## 7. Construccion del Rundown

### Que es un bloque

Un bloque es una unidad grande del programa.

Ejemplos:

- Apertura
- Noticias
- Entrevista
- Tanda
- Cierre

Campos utiles:

- nombre
- posicion
- duracion estimada
- script
- notas
- estado del bloque

### Que es un elemento

Un elemento es una unidad operable dentro de un bloque.

Ejemplos:

- clip
- graphic
- lower third
- audio
- note

Un bloque puede tener muchos elementos.

### Que es una accion

Una accion es una instruccion concreta que el Automator puede ejecutar sobre `vMix`.

Ejemplos:

- `Play`
- `Pause`
- `CutDirect`
- `OverlayInputIn`
- `OverlayInputOut`
- `SetText`

En la practica:

- el productor arma estas acciones en la web
- el Automator las ejecuta durante el show

## 8. Scripts y Prompter

El script se escribe normalmente a nivel bloque.

El prompter:

- carga esos scripts
- permite scroll manual o automatico
- puede entrar en fullscreen
- puede espejar texto
- sigue funcionando con cache si el servidor se corta

Atajos visibles en prompter:

- `Space`: play/pause scroll
- `Arrows`: velocidad
- `+/-`: tamaño de fuente
- `F`: fullscreen
- `M`: mirror
- `C`: configuracion

## 9. Personas

La seccion `People` sirve para cargar participantes del show.

Campos habituales:

- nombre
- rol
- `vmix_input_key`
- bus de audio
- configuracion de lower third automatico

Esto ayuda a:

- organizar invitados, conductores y panelistas
- preparar lower thirds
- asociar inputs de `vMix`

## 10. Media

La seccion `Media` sirve para subir archivos del show.

Tipos comunes:

- video
- audio
- graphics
- lower thirds
- stingers

Uso esperado:

1. subir archivo
2. revisar thumbnail y metadata
3. asociarlo a elementos del rundown

## 11. GT Templates

Los `GT Templates` sirven para trabajar con graficos parametrizables.

Se usan sobre todo para:

- lower thirds
- placas con campos editables
- templates de `vMix` tipo GT/GTZip

Campos importantes:

- nombre
- `vmix_input_key`
- `overlay_number`
- fields

## 12. Templates de Show

Un template permite reutilizar una estructura de programa.

Flujo:

1. crear y ajustar un show base
2. guardar como template
3. crear nuevos shows desde ese template

Se conserva:

- estructura de bloques
- elementos
- acciones
- personas
- parte de la configuracion general

Uso ideal:

- noticiero diario
- programa semanal
- formato repetitivo de streaming

## 13. Automator

El Automator es la pieza que realmente opera `vMix`.

Funciones principales:

- conectarse al servidor OpenDirector
- conectarse a `vMix`
- descargar o sincronizar el rundown
- ejecutar elementos y acciones
- mandar eventos de ejecucion
- mostrar estado de conexion y tally

### Configuracion minima del Automator

En la pantalla de conexion:

- `Server URL`: URL del servidor OpenDirector
- `vMix Host`: IP o host de `vMix`
- `vMix Port`: normalmente `8099`

Casos comunes:

- mismo equipo que `vMix`: `127.0.0.1` y `8099`
- otra maquina: IP de esa maquina y `8099`

### Validacion recomendada antes del aire

1. abrir Automator
2. confirmar que conecta al servidor
3. confirmar que conecta a `vMix`
4. revisar que el rundown del show correcto este cargado
5. correr preflight si corresponde

## 14. Operacion Durante el Show

Division recomendada:

- `Productor`: mira `Go Live`, manda senales y supervisa.
- `Operador`: usa Automator y ejecuta acciones.
- `Talento`: mira Prompter.

### Antes de salir al aire

Checklist:

1. show correcto abierto
2. estado en `ready` o `rehearsal`
3. scripts revisados
4. media cargada
5. lower thirds probados
6. Automator conectado
7. `vMix` conectado
8. prompter visible en dispositivo final

### Durante el aire

Checklist:

1. pasar a `live`
2. avanzar rundown bloque por bloque
3. monitorear execution log
4. mandar countdown/wrap/go cuando haga falta
5. evitar cambios estructurales grandes en vivo

### Despues del show

1. volver a `ready` o archivar
2. exportar logs si hace falta
3. guardar template si el formato sirve para reutilizar

## 15. Problemas Comunes

### La web carga pero crear shows falla

Posibles causas:

- PostgREST sin schema actualizado
- DB no inicializada correctamente

### El show existe pero el Automator no ejecuta

Revisar:

- conexion del Automator al servidor
- conexion del Automator a `vMix`
- `vMix Host` y `vMix Port`
- que `vMix` tenga habilitado TCP en `8099`

### El prompter no muestra scripts

Revisar:

- que el bloque tenga `script`
- que el show correcto este abierto
- que el talento este en la URL correcta del prompter

### El show esta live y no me deja editar

Eso es esperado en varias operaciones. La idea es proteger el aire.

## 16. Recomendaciones Operativas

- usar templates para formatos repetidos
- no usar `live` durante armado
- confirmar host/port de `vMix` antes del aire
- probar `lower thirds` y overlays antes de la salida
- dejar un show por programa, no mezclar emisiones distintas
- si hay varios operadores, definir una sola persona dueña del Automator

## 17. Proximo Paso Recomendado

Si queres usar este manual como material de onboarding, conviene sumar despues:

- capturas de pantalla
- checklist pre-show
- checklist de contingencia
- glosario corto de terminos de TV
- guia de instalacion del Automator para operador
