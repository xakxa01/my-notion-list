# Guardar en Notion (Chrome Extension)

Extensión para Chrome que permite guardar texto seleccionado como nueva página en tu base de datos de Notion, con plantilla opcional y notificaciones configurables.

## Cómo usar

1. **Instalar la extensión** (carga desempaquetada):
   - Ejecuta `npm run build`.
   - Abre Chrome → `chrome://extensions/` → Activa "Modo desarrollador" → "Cargar descomprimida" → selecciona la carpeta **`dist`** del proyecto.

2. **Conectar Notion**:
   - En el popup, haz clic en **"Iniciar sesión con Notion"** (en la pantalla de Notion puedes usar "Continuar con Google" si tu workspace lo tiene).
   - O usa **"Usar token manual"** y pega el token de una integración Internal de Notion.
   - Abre **Opciones** (botón "Abrir opciones") y elige la **base de datos** donde quieres guardar el texto.

3. **Guardar texto**:
   - Selecciona texto en cualquier página.
   - Clic derecho → **Guardar '[texto]' en Notion** → elige plantilla (Sin template, Por defecto, o una con nombre).
   - Se crea una página en la base de datos elegida con el texto como título y la plantilla aplicada.

4. **Opciones**:
   - **Base de datos de Notion**: la única base donde se guardará el texto (obligatorio para usar el menú).
   - **Mostrar notificación al guardar**: activa o desactiva la notificación de confirmación.
   - **OAuth**: Client ID (Notion) y URL del proxy OAuth para "Iniciar sesión con Notion".

## OAuth (Iniciar sesión con Notion / Google)

Para usar **"Iniciar sesión con Notion"** (y en la pantalla de Notion usar "Continuar con Google"):

1. Crea una integración **Public** en [Notion → My integrations](https://www.notion.so/my-integrations).
2. En OAuth Domain & URIs, añade como Redirect URI la que devuelve Chrome (en Opciones de la extensión se puede mostrar; es de la forma `https://<id>.chromiumapp.org/`). Obtén tu ID de extensión en `chrome://extensions` y la URL será `https://<extension-id>.chromiumapp.org/`.
3. Despliega el backend incluido en el repo:
   - La carpeta `api/` contiene una función serverless para Vercel (`api/notion-token.js`).
   - Despliega en [Vercel](https://vercel.com) y configura las variables de entorno `NOTION_CLIENT_ID` y `NOTION_CLIENT_SECRET` (de tu integración Public).
   - La URL será algo como `https://tu-proyecto.vercel.app/api/notion-token`.
4. En **Opciones** de la extensión, rellena **Client ID (Notion)** con el Client ID de tu integración y **URL del proxy OAuth** con la URL de tu función (ej. `https://tu-proyecto.vercel.app/api/notion-token`).
5. En el popup, haz clic en **"Iniciar sesión con Notion"**; se abrirá Notion, podrás iniciar sesión (incl. con Google) y autorizar la integración.

Sin OAuth, usa una integración **Internal** y **"Usar token manual"** en el popup.

## Guía paso a paso en la extensión

En el popup, el enlace **"¿Cómo configuro la integración?"** abre un modal con los pasos para crear la integración en Notion, conectar con token o OAuth, y elegir la base de datos en Opciones.

## Desarrollo

- `npm run build`: genera la extensión en `dist/` (popup, options, background, manifest, callback).
- Carga `dist/` como extensión descomprimida en Chrome para probar.

## Permisos

- **contextMenus**: menú al hacer clic derecho sobre texto seleccionado.
- **storage**: token, base de datos elegida y preferencias.
- **identity**, **notifications**: OAuth y notificaciones de confirmación.
- **host_permissions** para `api.notion.com`: llamadas a la API de Notion.
