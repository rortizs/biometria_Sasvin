# Registro de Rostro con Liveness Detection

**Archivo:** `frontend/src/app/features/admin/pages/employees/employees.component.ts`  
**Acceso:** `http://localhost:4200/admin/employees` → botón 📷 en la fila del empleado

---

## ¿Por qué existe este flujo?

Sin protección, cualquier persona podría:
- Imprimir una foto del catedrático y ponerla frente a la cámara
- Mostrar una foto en el celular
- Usar una foto de redes sociales

Este flujo guiado de 5 pasos soluciona ese problema sin necesidad de hardware especial ni librerías de IA.

---

## El flujo completo — 5 pasos

El administrador abre el modal de registro de rostro. El sistema guía al catedrático a través de 5 posiciones distintas de cabeza. Cada posición es fotografiada automáticamente tras un contador de 10 segundos.

```
┌─────────────────────────────────────────────────────────┐
│                   FLUJO DE 5 PASOS                       │
│                                                         │
│  [1] Frente     →  "Mirá directo a la cámara"           │
│       😐         10 seg → captura automática             │
│                                                         │
│  [2] Derecha    →  "Girá la cabeza hacia la derecha"    │
│       👉         10 seg → captura automática             │
│                                                         │
│  [3] Izquierda  →  "Girá la cabeza hacia la izquierda"  │
│       👈         10 seg → captura automática             │
│                                                         │
│  [4] Arriba     →  "Levantá levemente la vista arriba"  │
│       👆         10 seg → captura automática             │
│                                                         │
│  [5] Abajo      →  "Bajá levemente la vista hacia abajo"│
│       👇         10 seg → captura automática             │
│                                                         │
│       ↓                                                 │
│   Verificación de liveness                              │
│       ↓                                                 │
│   Guardar en base de datos                              │
└─────────────────────────────────────────────────────────┘
```

> **¿Por qué 10 segundos?** El sistema atiende catedráticos mayores de 60 años que necesitan más tiempo para leer la instrucción, entenderla y ejecutar el movimiento con comodidad.

---

## Elementos visuales de la pantalla

```
┌────────────────────────────────────────┐
│ [1]  [2]  [3]  [4]  [5]  ← barra de pasos
│  ●    ○    ○    ○    ○     (● = actual, ✓ = completado)
│                                        │
│  ┌──────────────────────────┐          │
│  │                          │          │
│  │     😐 (emoji direccion)  │          │
│  │   ╭──────────────────╮   │  ← video │
│  │   │   ÓVALO GUÍA     │   │          │
│  │   │   (punteado)     │   │          │
│  │   ╰──────────────────╯   │          │
│  │                          │          │
│  │  "Mirá directo a cámara" │          │
│  └──────────────────────────┘          │
│                                        │
│  [foto1] [foto2] [foto3] [  ] [  ]     │← miniaturas
│                                        │
│  Estado: "Posicioná tu rostro..."      │
│                                        │
│  [Cancelar]  [Iniciar captura]         │
└────────────────────────────────────────┘
```

### Descripción de cada elemento

| Elemento | Descripción |
|---|---|
| **Barra de pasos** | Muestra 5 círculos. El paso actual es azul, los completados son verdes con ✓, los pendientes son grises |
| **Video en vivo** | Stream de la cámara frontal del dispositivo, invertido horizontalmente (como un espejo) |
| **Óvalo guía** | Línea punteada blanca en el centro de la imagen. El catedrático debe centrar su rostro dentro del óvalo. Se vuelve verde sólido cuando se captura el paso |
| **Emoji + flecha** | Indica visualmente hacia dónde mover la cabeza. Se anima con efecto pulso |
| **Instrucción de texto** | Texto simple y grande debajo del emoji |
| **Countdown circular** | Al presionar "Iniciar captura", aparece un círculo azul pulsante con el número que regresa de 10 a 1. Al llegar a 0 captura automáticamente |
| **Flash verde** | Al capturar, toda la pantalla del video se vuelve verde con un ✓ gigante por 1.2 segundos antes de pasar al siguiente paso |
| **Miniaturas** | Row de 5 slots. Cada foto capturada aparece como miniatura con el label del ángulo |
| **Mensaje de estado** | Texto informativo en la parte inferior. Se vuelve rojo si hay error |

---

## Código: los 5 pasos configurados

```typescript
// employees.component.ts — línea ~501
readonly faceSteps = [
  { label: 'Frente',    arrow: '😐', instruction: 'Mirá directo a la cámara, sin mover la cabeza' },
  { label: 'Derecha',   arrow: '👉', instruction: 'Girá la cabeza lentamente hacia la derecha' },
  { label: 'Izquierda', arrow: '👈', instruction: 'Girá la cabeza lentamente hacia la izquierda' },
  { label: 'Arriba',    arrow: '👆', instruction: 'Levantá levemente la vista hacia arriba' },
  { label: 'Abajo',     arrow: '👇', instruction: 'Bajá levemente la vista hacia abajo' },
];
```

Cada objeto tiene:
- `label` → nombre del paso (se muestra en la barra de pasos y en la miniatura)
- `arrow` → emoji de dirección (se muestra en el overlay del video con animación)
- `instruction` → texto legible para el catedrático

**Para agregar o cambiar un paso**, solo modificás este array. El resto del código lee la longitud del array dinámicamente.

---

## Código: el contador (countdown)

```typescript
// employees.component.ts — método startCountdown()
startCountdown(): void {
  if (this.counting()) return;  // evita doble click

  this.counting.set(true);
  this.countdownValue.set(10);  // ← 10 segundos
  this.statusMsg.set(this.faceSteps[this.faceStep()].instruction);

  this.countdownTimer = setInterval(() => {
    const val = this.countdownValue() - 1;
    if (val <= 0) {
      clearInterval(this.countdownTimer);
      this.captureCurrentStep();  // captura automática al llegar a 0
    } else {
      this.countdownValue.set(val);
    }
  }, 1000);  // ← corre cada 1 segundo
}
```

**Para cambiar el tiempo**, solo cambiás `this.countdownValue.set(10)` al número de segundos que quieras.

---

## Código: la captura de cada paso

```typescript
// employees.component.ts — método captureCurrentStep()
private captureCurrentStep(): void {
  const frame = this.cameraService.captureFrame();  // toma el frame actual del video
  this.counting.set(false);

  if (!frame) {
    this.statusMsg.set('No se detectó imagen. Intentá de nuevo.');
    this.statusIsError.set(true);
    return;
  }

  // Agrega la foto al array de fotos capturadas
  this.capturedImages.update(imgs => [...imgs, frame]);
  this.stepCaptured.set(true);  // activa el flash verde
  this.statusMsg.set(`✓ Ángulo ${this.faceSteps[this.faceStep()].label} capturado`);

  // Espera 1.2 segundos (el flash verde) y avanza al siguiente paso
  this.flashTimer = setTimeout(() => {
    this.stepCaptured.set(false);
    const nextStep = this.faceStep() + 1;

    if (nextStep < this.faceSteps.length) {
      // Hay más pasos → avanzar
      this.faceStep.set(nextStep);
      this.statusMsg.set(this.faceSteps[nextStep].instruction + ' y presioná Capturar');
    } else {
      // Ya se capturaron todos los pasos → verificar liveness
      this.statusMsg.set('¡Perfecto! Verificando variación entre fotos...');
      this.verifyLiveness();
    }
  }, 1200);
}
```

---

## Código: verificación de liveness (anti-spoofing)

```typescript
// employees.component.ts — método verifyLiveness()
private verifyLiveness(): void {
  const images = this.capturedImages();
  if (images.length < 5) return;

  // Comparar el TAMAÑO del string base64 de cada foto
  // ¿Por qué funciona esto?
  // - Una foto impresa o en pantalla tiene el mismo contenido visual
  //   en los 5 ángulos → los frames base64 tienen casi el mismo tamaño
  // - Una persona real que mueve la cabeza genera distintas texturas,
  //   sombras y perspectivas → los frames tienen tamaños distintos
  const sizes = images.map(img => img.length);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);
  const variation = (maxSize - minSize) / maxSize;

  if (variation < 0.005) {
    // Variación menor al 0.5% → probablemente foto estática
    this.statusMsg.set('⚠️ Las fotos son muy similares. Moví la cabeza en cada paso.');
    this.statusIsError.set(true);
    this.capturedImages.set([]);  // borra todo y reinicia
    this.faceStep.set(0);
  } else {
    // Variación suficiente → es una persona real
    this.statusMsg.set('✓ Verificación exitosa. Podés guardar el registro.');
    this.statusIsError.set(false);
    // Ahora aparece el botón "Guardar registro"
  }
}
```

### ¿Por qué 0.5% de umbral?

Con 3 fotos usábamos 0.3%. Con 5 fotos subimos a 0.5% porque hay más oportunidad de variación natural entre los 5 ángulos. Si el sistema rechaza registros legítimos con demasiada frecuencia, bajá el umbral a 0.003. Si sigue pasando fotos estáticas, subilo a 0.01.

---

## Signals de estado usados

```typescript
faceStep        // número del paso actual (0-4)
capturedImages  // array con las fotos capturadas (máx 5)
counting        // true = el countdown está corriendo
countdownValue  // número actual del countdown (10..1)
stepCaptured    // true = muestra el flash verde
statusMsg       // texto de instrucción/estado
statusIsError   // true = texto en rojo (hay error)
saving          // true = enviando al backend
```

Todos son **Signals de Angular** (no BehaviorSubject ni variables normales). Cuando cambian, Angular actualiza automáticamente solo la parte del HTML que los usa.

---

## Flujo de datos completo

```
Admin abre modal
    ↓
registerFace(employee) → inicia cámara
    ↓
[usuario ve el óvalo y las instrucciones]
    ↓
Admin presiona "Iniciar captura"
    ↓
startCountdown() → countdown 10..1
    ↓
captureCurrentStep() → toma frame del video
    ↓
[flash verde 1.2 seg]
    ↓
¿Hay más pasos? → SÍ → avanzar al siguiente paso
                 → NO → verifyLiveness()
    ↓
verifyLiveness() → compara tamaños base64
    ↓
¿Variación > 0.5%? → SÍ → mostrar botón "Guardar"
                   → NO → reiniciar todo, pedir repetir
    ↓
Admin presiona "Guardar registro"
    ↓
saveFaces() → POST /api/v1/faces/register
    {
      employee_id: "uuid",
      images: [base64_1, base64_2, base64_3, base64_4, base64_5]
    }
    ↓
Backend extrae embeddings de cada foto con face_recognition
Guarda 5 vectores de 128 números en tabla face_embeddings
    ↓
Modal se cierra, tabla de empleados se recarga
```

---

## Consideraciones para mejorar en el futuro

### Lo que hace este sistema (suficiente para el 95% de los casos)
- Requiere movimiento de cabeza en 5 direcciones distintas
- Verifica variación entre frames
- 10 segundos por paso → accesible para adultos mayores

### Lo que NO hace (mejoras posibles si se necesita más seguridad)
- No detecta rostros en tiempo real (no sabe si el óvalo tiene un rostro dentro)
- No analiza si el movimiento fue en la dirección correcta (solo compara variación)
- No usa profundidad 3D (necesitaría cámara especial)

### Cómo agregar detección de rostro en tiempo real (futuro)
Se podría integrar **TensorFlow.js con el modelo BlazeFace** — corre 100% en el browser, sin servidor:
```typescript
import * as blazeface from '@tensorflow-models/blazeface';
// Detecta si hay un rostro en el frame actual
// Si no hay rostro → no empieza el countdown
```

---

## Archivos relacionados

| Archivo | Rol |
|---|---|
| `employees.component.ts` | Toda la lógica del flujo de 5 pasos |
| `camera.service.ts` | `captureFrame()` — toma el frame del video y lo convierte a base64 |
| `employee.service.ts` | `registerFace(id, images[])` — envía las fotos al backend |
| `backend/app/api/v1/endpoints/faces.py` | Endpoint que recibe las fotos y extrae embeddings |
| `backend/app/services/face_recognition.py` | Convierte cada foto a vector de 128 números con dlib |
