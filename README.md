# pdfAutopsy

Lector de PDF nativo para Windows 11 orientado a estudio: resaltados, notas, conceptos recurrentes, repasos y modo de lectura fullscreen.

## Desarrollo

```bash
npm install
npm run dev
```

## Build local

```bash
npm run desktop:pack
```

Los instaladores quedan en `release/`.

## Publicar una actualizacion

La app usa GitHub Releases con `electron-updater`. En cada arranque, la app instalada consulta el ultimo release publicado y descarga automaticamente una version nueva si el `version` de `package.json` es mayor.

Flujo recomendado:

```bash
npm version patch
git push
git push --tags
```

El workflow `Release` crea el release al recibir un tag `v*` y sube los assets de Windows necesarios para el auto-update.

Para publicar manualmente desde una maquina local con `GH_TOKEN` configurado:

```bash
npm run desktop:publish
```
