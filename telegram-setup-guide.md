# 📱 Configuración de Alertas con Telegram

## Paso 1: Crear un Bot de Telegram

1. **Abre Telegram** y busca `@BotFather`
2. Envía el comando: `/newbot`
3. Dale un nombre a tu bot: `SistemasLab Alerts`
4. Dale un username único: `sistemaslab_alerts_bot` (debe terminar en _bot)
5. **GUARDA EL TOKEN** que te da BotFather, algo como:
   ```
   7123456789:AAFabc123def456ghi789jkl012mno345pqr
   ```

## Paso 2: Obtener tu Chat ID

1. **Envía un mensaje** a tu nuevo bot (búscalo por el username)
2. Abre en tu navegador:
   ```
   https://api.telegram.org/bot[TU_TOKEN]/getUpdates
   ```
   Reemplaza [TU_TOKEN] con el token que te dio BotFather

3. Busca `"chat":{"id":` en la respuesta. Ese número es tu CHAT_ID
   Ejemplo: `"chat":{"id":123456789}`

## Paso 3: Probar el envío

Prueba enviando un mensaje:
```bash
curl -X POST "https://api.telegram.org/bot[TU_TOKEN]/sendMessage" \
     -d "chat_id=[TU_CHAT_ID]" \
     -d "text=🚀 Test de alertas SistemasLab"
```

## Paso 4: Configurar en el servidor

Una vez que funcione, guarda estas variables en el servidor.