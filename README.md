# MF Football — Primera C para vMix

Aplicación preparada para EasyPanel/Docker.

## Qué hace

1. Consulta la página de Primera C de Promiedos.
2. Lee los datos embebidos de la aplicación Next.js (`__NEXT_DATA__`).
3. Extrae todas las tablas disponibles.
4. Consulta la API de partidos de Promiedos para la fecha seleccionada.
5. Guarda una copia local en `data/primera-c.json`.
6. Si Promiedos falla temporalmente, mantiene los últimos datos válidos.
7. Sirve una gráfica 1920x1080 para vMix.

Fuente configurada:
https://www.promiedos.com.ar/league/primera-c/ffjb

## EasyPanel

Crear una App desde este proyecto.

Puerto:
3000

Variables opcionales:
PORT=3000
REFRESH_MS=60000
LEAGUE_URL=https://www.promiedos.com.ar/league/primera-c/ffjb

Dominio:
https://futbol.mfdesarrollos.com

## URLs

/                 página de prueba/gráfica
/overlay           (se puede agregar como alias posteriormente)
/api/primera-c     JSON normalizado
/api/status        estado del sincronizador
/health            healthcheck

## vMix

Agregar un Browser Input:

https://futbol.mfdesarrollos.com/

Resolución 1920x1080.

Flecha derecha/izquierda cambia de tabla manualmente.
R actualiza la gráfica.
Automáticamente cambia de tabla cada 8 segundos.

## Fondo

Colocar una imagen en:

public/assets/background.jpg

Para usar video de fondo se puede agregar posteriormente sin modificar el scraper.

## Importante

El scraper depende de la estructura pública de Promiedos. Se recomienda respetar sus condiciones de uso y mantener la frecuencia de consultas baja. El sistema guarda cache local para evitar que una falla puntual de la fuente deje la gráfica sin datos.

El proyecto utiliza el patrón de datos observado en Promiedos: `tables_groups[].tables[].table.rows[]`, y la API de partidos `api.promiedos.com.ar/league/games/{leagueId}/{key}`.
