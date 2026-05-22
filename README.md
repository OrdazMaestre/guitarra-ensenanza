# Primeros Pasos con mi Guitarra

Web educativa de guitarra construida con Next.js.

## Desarrollo local

```powershell
npm run dev
```

Abre [http://localhost:3000/lecciones/temario](http://localhost:3000/lecciones/temario).

## Comprobaciones

```powershell
npm run lint
npm run build
```

## Despliegue en Render

El repo incluye `render.yaml` y `Dockerfile` para crear un Web Service en Render con Docker.

Configuracion esperada:

- Runtime: `docker`
- Plan: `free`
- Region: `frankfurt`
- Dockerfile: `./Dockerfile`
- Docker context: `.`

Render usara el `CMD ["node", "server.js"]` del Dockerfile.

La raiz `/` redirige a `/lecciones/temario`.

## Nota de seguridad

Antes de publicar definitivamente, revisar licencias/copyright de las imagenes extraidas del PDF de referencia y sustituirlas por recursos propios cuando toque.
