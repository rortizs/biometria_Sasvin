# 🤖 Configuración Completa Bot de Telegram - Paso a Paso

## Opción A: Si ya tienes un bot pero no funciona

1. **Ve a @BotFather en Telegram**
2. Envía: `/mybots`
3. Selecciona tu bot
4. Selecciona "API Token"
5. Copia el token COMPLETO

## Opción B: Crear un bot nuevo desde cero

### Paso 1: Crear el Bot
1. **Abre Telegram** (en tu teléfono o desktop)
2. **Busca:** `@BotFather`
3. **Envía:** `/start`
4. **Envía:** `/newbot`
5. **Nombre del bot:** `SistemasLab Monitor`
6. **Username del bot:** `sistemaslab_monitor_bot` (debe terminar en _bot)
7. **GUARDA EL TOKEN** que te da, ejemplo:
   ```
   5123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789
   ```

### Paso 2: Obtener tu Chat ID

#### Método 1: Con curl desde el servidor
```bash
# Reemplaza TU_TOKEN_AQUI con el token real
TOKEN="TU_TOKEN_AQUI"

# Primero envía un mensaje al bot desde Telegram
# Busca tu bot por su username y envíale "Hola"

# Luego ejecuta:
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -m json.tool
```

#### Método 2: Desde el navegador
1. **PRIMERO** envía un mensaje a tu bot (búscalo por username)
2. Abre en el navegador:
   ```
   https://api.telegram.org/botTU_TOKEN/getUpdates
   ```
3. Busca esta estructura:
   ```json
   "message": {
      "chat": {
         "id": 123456789,  <-- ESTE ES TU CHAT_ID
         "first_name": "Tu Nombre"
      }
   }
   ```

### Paso 3: Script para encontrar tu Chat ID automáticamente

Crea este script en el servidor:

```bash
#!/bin/bash
# find-chatid.sh

TOKEN="TU_TOKEN_AQUI"  # Pon tu token aquí

echo "Obteniendo mensajes..."
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" > /tmp/telegram.json

if grep -q '"ok":true' /tmp/telegram.json; then
    echo "✅ Conectado al bot"
    
    # Extraer todos los chat IDs
    chat_ids=$(grep -oP '"chat":\{"id":\K[0-9-]+' /tmp/telegram.json | sort -u)
    
    if [ ! -z "$chat_ids" ]; then
        echo "Chat IDs encontrados:"
        echo "$chat_ids"
        
        # Usar el primer chat ID
        first_id=$(echo "$chat_ids" | head -1)
        echo ""
        echo "Enviando mensaje de prueba al Chat ID: $first_id"
        
        curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
            -d "chat_id=${first_id}" \
            -d "text=✅ Hola! Tu Chat ID es: ${first_id}"
        
        echo ""
        echo "========================================="
        echo "CONFIGURACIÓN PARA TU SCRIPT:"
        echo "TELEGRAM_BOT_TOKEN=\"${TOKEN}\""
        echo "TELEGRAM_CHAT_ID=\"${first_id}\""
        echo "========================================="
    else
        echo "❌ No hay mensajes. Envía un mensaje al bot primero!"
    fi
else
    echo "❌ Error: Token inválido o bot no existe"
fi
```

### Paso 4: Si es un grupo

Si quieres enviar a un grupo en lugar de chat privado:

1. **Añade el bot al grupo**
2. **Dale permisos de admin** (opcional pero recomendado)
3. El Chat ID del grupo será negativo, ejemplo: `-1001234567890`

### Problemas Comunes y Soluciones

| Problema | Solución |
|----------|----------|
| "Unauthorized" | Token incorrecto, crea un bot nuevo |
| "Chat not found" | Chat ID incorrecto, usa el script para encontrarlo |
| No llegan mensajes | Verifica que enviaste mensaje al bot primero |
| "Bad Request" | Formato de mensaje incorrecto o caracteres especiales |

### Comando de Prueba Final

Una vez que tengas TOKEN y CHAT_ID correctos:

```bash
TOKEN="5123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789"
CHAT_ID="123456789"

curl -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
     -d "chat_id=${CHAT_ID}" \
     -d "text=✅ Alertas configuradas correctamente!" \
     -d "parse_mode=HTML"
```

Si recibes el mensaje, ya puedes actualizar los scripts con estos valores.