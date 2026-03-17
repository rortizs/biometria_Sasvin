# 🚨 CREAR BOT DE TELEGRAM AHORA MISMO

## Paso 1: Crear el Bot (2 minutos)

1. **Abre Telegram** en tu teléfono o computadora
2. **Busca:** `@BotFather` (tiene un check azul ✓)
3. **Envíale:** `/start`
4. **Envíale:** `/newbot`
5. **Cuando te pida el nombre, escribe:** 
   ```
   SistemasLab Monitor 24/7
   ```
6. **Cuando te pida el username, escribe:** 
   ```
   sistemaslab_monitor_bot
   ```
   (Si está ocupado, prueba con: `sistemaslab_alerts_bot` o `sistemaslab_24x7_bot`)

7. **COPIA EL TOKEN** que te da. Se ve así:
   ```
   7234567890:AAFhJ3kL9mNpQ4rS6tU8vW0xY2zA4bC6dE8
   ```

## Paso 2: Envía un mensaje al bot

1. **En el mensaje de BotFather**, haz clic en el link `t.me/tu_bot_username`
2. **Presiona** START o INICIAR
3. **Envíale:** `Hola`

## Paso 3: Obtener tu Chat ID

### Opción A: Desde el navegador (más fácil)

1. **Copia este link y reemplaza TU_TOKEN_AQUI con el token real:**
   ```
   https://api.telegram.org/botTU_TOKEN_AQUI/getUpdates
   ```

2. **Pégalo en tu navegador** y presiona Enter

3. **Busca** esta parte:
   ```json
   "chat": {
      "id": 123456789,
      "first_name": "Tu Nombre",
   ```

4. **El número después de "id":** es tu CHAT_ID (ejemplo: `123456789`)

### Opción B: Con este comando

Si tienes el token, ejecuta esto reemplazando TU_TOKEN:
```bash
curl -s "https://api.telegram.org/botTU_TOKEN/getUpdates" | grep -oP '"chat":\{"id":\K[0-9-]+' | head -1
```

## Paso 4: Información que necesitas

Al final debes tener:
- **TOKEN:** algo como `7234567890:AAFhJ3kL9mNpQ4rS6tU8vW0xY2zA4bC6dE8`
- **CHAT_ID:** un número como `123456789` o `987654321`

## Paso 5: Dámelos para configurar

Una vez que tengas ambos, dímelos y los configuraré automáticamente.