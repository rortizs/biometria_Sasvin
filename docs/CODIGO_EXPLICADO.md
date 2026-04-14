# Documentación técnica del código — Sistema Biométrico

Este documento explica línea por línea los archivos más importantes del proyecto.  
Está pensado para que puedas entender **qué hace cada parte, por qué existe y cómo se conecta con el resto**.

---

## Índice

1. [Backend — Cómo funciona el reconocimiento facial](#1-backend--cómo-funciona-el-reconocimiento-facial)
2. [Backend — Cómo se registra el rostro de un empleado](#2-backend--cómo-se-registra-el-rostro-de-un-empleado)
3. [Backend — Cómo se marca asistencia (check-in / check-out)](#3-backend--cómo-se-marca-asistencia-check-in--check-out)
4. [Backend — Cómo valida la geolocalización](#4-backend--cómo-valida-la-geolocalización)
5. [Backend — Seguridad: JWT y contraseñas](#5-backend--seguridad-jwt-y-contraseñas)
6. [Backend — Cómo se conecta a la base de datos](#6-backend--cómo-se-conecta-a-la-base-de-datos)
7. [Frontend — Cómo funciona la cámara](#7-frontend--cómo-funciona-la-cámara)
8. [Frontend — Cómo obtiene la ubicación GPS](#8-frontend--cómo-obtiene-la-ubicación-gps)
9. [Frontend — Cómo maneja la autenticación del admin](#9-frontend--cómo-maneja-la-autenticación-del-admin)
10. [Frontend — Cómo se envían las fotos al backend](#10-frontend--cómo-se-envían-las-fotos-al-backend)
11. [Frontend — Cómo protege las rutas del panel admin](#11-frontend--cómo-protege-las-rutas-del-panel-admin)

---

## 1. Backend — Cómo funciona el reconocimiento facial

**Archivo:** `backend/app/services/face_recognition.py`

Este es el archivo más importante del sistema. Contiene toda la lógica matemática de reconocimiento facial.

### Concepto clave: ¿Qué es un "embedding"?

Antes de leer el código, necesitás entender este concepto:

Un **embedding facial** es una lista de 128 números decimales que representan matemáticamente un rostro. La librería `face_recognition` analiza una foto y convierte el rostro en esos 128 números. Dos fotos del mismo rostro producirán listas de números muy similares (distancia pequeña). Dos personas diferentes producirán listas muy distintas (distancia grande).

```
Foto de Juan  →  [0.12, -0.34, 0.89, 0.01, ..., 0.67]  ← 128 números
Otra foto de Juan → [0.11, -0.35, 0.88, 0.02, ..., 0.66]  ← muy similares
Foto de María →  [0.78, 0.23, -0.45, 0.91, ..., -0.12]  ← muy distintos
```

Esa "similitud" entre listas se mide con **distancia coseno**: cuanto más cercana a 0, más parecidos son los rostros.

---

### Código completo comentado

```python
import base64
import io
from typing import Tuple

import face_recognition  # librería principal de reconocimiento facial (usa dlib internamente)
import numpy as np       # para operaciones matemáticas con vectores
from PIL import Image    # para abrir y convertir imágenes
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding

settings = get_settings()


class FaceRecognitionService:
    """
    Servicio que maneja todo el reconocimiento facial.
    Se instancia una vez por request en los endpoints que lo necesitan.
    """

    def __init__(self, threshold: float | None = None):
        # threshold es el umbral de distancia máxima para considerar que dos rostros
        # son la misma persona. El default es 0.6 (configurable desde el .env).
        # Menor threshold = más estricto (más falsos negativos, más seguro).
        # Mayor threshold = más permisivo (más falsos positivos, menos seguro).
        self.threshold = threshold or settings.face_recognition_threshold


    def decode_base64_image(self, image_b64: str) -> np.ndarray:
        """
        Convierte una imagen en formato base64 a un array de números (numpy array).

        ¿Por qué base64? Porque el frontend no puede enviar archivos binarios
        directamente en un JSON. La imagen se "codifica" como texto base64
        para poder viajar dentro del JSON del request HTTP.

        Ejemplo de base64:
            "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
                                    ↑ este es el contenido real en base64

        El proceso es:
        1. Quitar el prefijo "data:image/jpeg;base64," si existe
        2. Decodificar el texto base64 → bytes binarios (la imagen real)
        3. Abrir esos bytes como imagen con PIL
        4. Convertir a RGB (algunos dispositivos mandan RGBA o CMYK)
        5. Convertir a numpy array (que es lo que entiende face_recognition)
        """
        # Paso 1: quitar prefijo del data URL si existe
        # Ejemplo: "data:image/jpeg;base64,CONTENIDO" → "CONTENIDO"
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        # Paso 2: decodificar base64 → bytes
        image_data = base64.b64decode(image_b64)

        # Paso 3: abrir como imagen con PIL (Python Imaging Library)
        image = Image.open(io.BytesIO(image_data))

        # Paso 4: convertir a RGB
        # face_recognition SOLO trabaja con imágenes RGB (3 canales: Rojo, Verde, Azul)
        # RGBA tiene 4 canales (el 4to es transparencia → se la sacamos)
        # CMYK es el modelo de colores de impresión → lo convertimos a pantalla
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Paso 5: convertir imagen PIL → numpy array
        # Resultado: array de forma (alto, ancho, 3) con valores 0-255
        return np.array(image)


    def get_face_embedding(self, image_b64: str) -> np.ndarray | None:
        """
        A partir de una imagen en base64, detecta el rostro y devuelve su embedding.

        Devuelve None si:
        - No se detectó ningún rostro en la imagen
        - No se pudo calcular el embedding

        Devuelve np.ndarray (array de 128 números) si todo salió bien.
        """
        # Convertir la imagen base64 a numpy array (la imagen como números)
        image_array = self.decode_base64_image(image_b64)

        # PASO 1: Detectar DÓNDE están los rostros en la imagen
        # face_locations devuelve una lista de tuplas: [(top, right, bottom, left), ...]
        # Cada tupla es la posición de un rectángulo que enmarca un rostro.
        # Si la lista está vacía → no hay ningún rostro en la imagen.
        face_locations = face_recognition.face_locations(image_array)

        if not face_locations:
            # No se detectó ningún rostro → devolver None
            # El endpoint devolverá HTTP 400 "No face detected"
            return None

        # PASO 2: Calcular el EMBEDDING de cada rostro encontrado
        # face_encodings recibe la imagen Y las posiciones de los rostros
        # Devuelve una lista de arrays de 128 números, uno por rostro.
        face_encodings = face_recognition.face_encodings(image_array, face_locations)

        if not face_encodings:
            return None

        # Si hay varios rostros, usamos solo el primero (el más prominente)
        # En un kiosco bien configurado debería haber solo un rostro
        return face_encodings[0]


    async def find_best_match(
        self, db: AsyncSession, query_embedding: np.ndarray
    ) -> Tuple[Employee, float] | None:
        """
        Busca en la base de datos el empleado cuyo rostro más se parezca
        al embedding que recibimos como parámetro.

        Usa pgvector (extensión de PostgreSQL) para hacer la búsqueda
        de similitud vectorial de forma eficiente.

        Devuelve (Employee, confianza) si encontró coincidencia, o None si no.
        """
        # Convertir el numpy array a lista de Python para pasarlo a SQL
        # [0.12, -0.34, 0.89, ...] → "[0.12, -0.34, 0.89, ...]" (como string)
        embedding_list = query_embedding.tolist()

        # CONSULTA SQL CON PGVECTOR
        # El operador "<=>" calcula la DISTANCIA COSENO entre dos vectores.
        # La distancia coseno va de 0 (idénticos) a 2 (opuestos).
        # ORDER BY distance LIMIT 1 → devuelve el más parecido primero.
        #
        # Equivale a: "¿Cuál de todos los rostros registrados se parece más
        # al rostro que me mandaron?"
        query = text("""
            SELECT
                fe.id,
                fe.employee_id,
                fe.embedding <=> :query_embedding AS distance
            FROM face_embeddings fe
            JOIN employees e ON fe.employee_id = e.id
            WHERE e.is_active = true
            ORDER BY fe.embedding <=> :query_embedding
            LIMIT 1
        """)

        result = await db.execute(query, {"query_embedding": str(embedding_list)})
        row = result.fetchone()

        # Si no hay ningún empleado con rostro registrado → no hay match
        if row is None:
            return None

        distance = row.distance

        # CONVERTIR DISTANCIA A CONFIANZA (0% - 100%)
        # Distancia coseno 0 = idénticos = confianza 100%
        # Distancia coseno 2 = opuestos  = confianza 0%
        # Fórmula: confianza = 1 - (distancia / 2)
        # Ejemplos:
        #   distance=0.0 → confidence=1.0  (100%)  perfectamente igual
        #   distance=0.4 → confidence=0.8  (80%)   muy probable
        #   distance=1.0 → confidence=0.5  (50%)   mitad y mitad
        #   distance=2.0 → confidence=0.0  (0%)    persona diferente
        confidence = 1 - (distance / 2)

        # VERIFICAR SI LA DISTANCIA ESTÁ DENTRO DEL UMBRAL ACEPTADO
        # threshold=0.6 significa: acepto si la distancia es menor a (1 - 0.6) = 0.4
        # Si la distancia es mayor a 0.4 → no es suficientemente parecido → None
        if distance > (1 - self.threshold):
            return None

        # Buscar el objeto Employee completo en la base de datos
        emp_result = await db.execute(
            select(Employee).where(Employee.id == row.employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        if employee is None:
            return None

        return employee, confidence


    def compare_faces(
        self, known_embedding: np.ndarray, query_embedding: np.ndarray
    ) -> Tuple[bool, float]:
        """
        Compara dos embeddings directamente (sin ir a la base de datos).
        Útil para verificaciones puntuales o tests.

        Usa distancia EUCLIDIANA (no coseno como find_best_match).
        La librería face_recognition recomienda 0.6 como threshold para Euclídea.

        Devuelve: (es_la_misma_persona, nivel_de_confianza)
        """
        # Distancia euclidiana = raíz cuadrada de la suma de cuadrados de diferencias
        # Es como medir la "distancia en línea recta" entre dos puntos en espacio 128D
        distance = np.linalg.norm(known_embedding - query_embedding)

        # Con distancia euclidiana:
        # 0.0 = idénticos
        # 0.6 = límite recomendado por face_recognition
        # >1.0 = personas claramente distintas
        is_match = distance <= self.threshold

        # Normalizar a confianza 0-1 (asumiendo máxima distancia ~1.0)
        confidence = max(0, 1 - (distance / 1.0))

        return is_match, confidence
```

---

## 2. Backend — Cómo se registra el rostro de un empleado

**Archivo:** `backend/app/api/v1/endpoints/faces.py`

Este endpoint lo usa el administrador para registrar las fotos del rostro de cada catedrático en el sistema.

```python
@router.post("/register", response_model=dict)
async def register_face(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],  # SOLO admins
    request: FaceRegisterRequest,
) -> dict:
    """
    Recibe entre 1 y 5 fotos del empleado y guarda los embeddings en la base de datos.
    Más fotos = mejor reconocimiento (distintos ángulos, iluminación, etc.)
    """

    # PASO 1: Verificar que el empleado existe
    result = await db.execute(select(Employee).where(Employee.id == request.employee_id))
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    face_service = FaceRecognitionService()

    # PASO 2: Procesar cada imagen y extraer su embedding
    embeddings = []
    for idx, image_b64 in enumerate(request.images):
        # request.images es una lista de strings base64, uno por foto
        embedding = face_service.get_face_embedding(image_b64)
        if embedding is not None:
            # Si se detectó un rostro en esta foto → guardar el embedding
            embeddings.append(embedding)
        # Si no se detectó rostro en esta foto → simplemente se ignora

    if not embeddings:
        # Ninguna de las fotos tenía un rostro detectable → error
        raise HTTPException(
            status_code=400,
            detail="No valid face found in any of the provided images",
        )

    # PASO 3: Borrar los embeddings anteriores del empleado
    # Si el empleado ya tenía fotos registradas, las reemplazamos.
    # Esto permite "actualizar" el registro facial (ej: cambio de look).
    existing = await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == request.employee_id)
    )
    for emb in existing.scalars().all():
        await db.delete(emb)

    # PASO 4: Guardar los nuevos embeddings
    for idx, embedding in enumerate(embeddings):
        face_emb = FaceEmbedding(
            employee_id=request.employee_id,
            embedding=embedding.tolist(),  # numpy array → lista de Python para guardarlo en DB
            is_primary=(idx == 0),         # la primera foto es la "principal"
        )
        db.add(face_emb)

    await db.commit()  # confirmar todos los cambios en la base de datos

    return {
        "success": True,
        "message": f"Registered {len(embeddings)} face embedding(s) for {employee.full_name}",
        "embeddings_count": len(embeddings),
    }
```

### ¿Por qué guardar múltiples embeddings?

Si registrás 3 fotos del mismo empleado, se crean **3 filas** en la tabla `face_embeddings` para ese empleado. Cuando alguien hace check-in, pgvector compara el nuevo rostro contra **todos** los embeddings y devuelve el más cercano. Tener varios embeddings con distintos ángulos, luminosidad y expresión mejora la probabilidad de reconocimiento correcto.

### El modelo FaceEmbedding en la base de datos

**Archivo:** `backend/app/models/face_embedding.py`

```python
class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[uuid.UUID]       # identificador único
    employee_id: Mapped[uuid.UUID]  # a qué empleado pertenece este embedding
    embedding = mapped_column(Vector(128), nullable=False)
    #                          ↑
    #           Vector(128) es el tipo especial de pgvector
    #           Guarda exactamente 128 números decimales en una columna
    #           y permite búsquedas de similitud con el operador <=>

    is_primary: Mapped[bool]    # si hay varios, cuál fue la primera foto
    created_at: Mapped[datetime]
```

---

## 3. Backend — Cómo se marca asistencia (check-in / check-out)

**Archivo:** `backend/app/api/v1/endpoints/attendance.py`

Este endpoint NO requiere autenticación con token JWT porque el rostro en sí mismo es la autenticación.

```python
@router.post("/check-in", response_model=AttendanceResponse)
async def check_in(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckIn,  # {images: [...base64...], latitude: float, longitude: float}
) -> AttendanceResponse:

    face_service = FaceRecognitionService()

    # PASO 1: Extraer el embedding del rostro enviado
    # Solo procesamos la primera imagen (las otras 3 son para anti-spoofing futuro)
    try:
        query_embedding = face_service.get_face_embedding(request.images[0])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")

    if query_embedding is None:
        # No se detectó ningún rostro en la foto
        raise HTTPException(status_code=400, detail="No face detected in the provided image")

    # PASO 2: Buscar en la base de datos el empleado más parecido
    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        # Nadie en la base de datos coincide con este rostro
        raise HTTPException(status_code=404, detail="No matching employee found")

    employee, confidence = match
    # employee = el objeto Employee que coincide
    # confidence = número entre 0 y 1 (ej: 0.85 = 85% de confianza)

    today = date.today()
    now = datetime.utcnow()

    # PASO 3: Validar geolocalización
    # Verifica si el empleado está dentro del radio de su sede asignada
    geo_valid, distance = await _validate_geo(
        db, employee, request.latitude, request.longitude
    )
    # geo_valid = True/False (¿está en el lugar correcto?)
    # distance = cuántos metros está de su sede

    # PASO 4: Verificar si ya tiene registro de hoy
    # CONSTRAINT de la DB: solo puede haber UN registro por empleado por día
    result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == employee.id,
            AttendanceRecord.record_date == today,
        )
    )
    attendance = result.scalar_one_or_none()

    if attendance:
        if attendance.check_in:
            # Ya hizo check-in hoy → devolver el registro existente con mensaje
            return AttendanceResponse(
                ...
                message=f"Already checked in at {attendance.check_in.strftime('%H:%M')}",
            )
    else:
        # No tiene registro hoy → crear uno nuevo
        attendance = AttendanceRecord(
            employee_id=employee.id,
            record_date=today,
        )
        db.add(attendance)

    # PASO 5: Guardar los datos del check-in
    attendance.check_in = now
    attendance.check_in_confidence = confidence      # qué tan seguro fue el reconocimiento
    attendance.status = "present"

    # Guardar coordenadas GPS del momento del check-in
    attendance.check_in_latitude = request.latitude
    attendance.check_in_longitude = request.longitude
    attendance.check_in_distance_meters = distance   # metros desde su sede
    attendance.geo_validated = geo_valid             # True si estaba en el lugar correcto

    await db.commit()
    await db.refresh(attendance)

    # PASO 6: Construir mensaje de respuesta
    message = f"Welcome, {employee.full_name}! Check-in at {now.strftime('%H:%M')}"
    if not geo_valid and request.latitude is not None:
        if distance:
            message += f" (Outside permitted area: {distance:.0f}m)"
        else:
            message += " (No location assigned)"

    return AttendanceResponse(...)
```

### El modelo AttendanceRecord en la base de datos

**Archivo:** `backend/app/models/attendance.py`

```python
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID]
    employee_id: Mapped[uuid.UUID]    # a qué empleado pertenece
    record_date: Mapped[date]         # fecha del registro (sin hora)
    check_in: Mapped[datetime | None]     # hora de entrada (con hora:minuto:segundo)
    check_out: Mapped[datetime | None]    # hora de salida (None si no salió aún)

    check_in_confidence: Mapped[float | None]   # confianza del reconocimiento (0-1)
    check_out_confidence: Mapped[float | None]

    status: Mapped[str]   # "present", "late", "absent"

    # Coordenadas GPS registradas
    check_in_latitude: Mapped[float | None]
    check_in_longitude: Mapped[float | None]
    check_in_distance_meters: Mapped[float | None]  # cuántos metros de su sede
    check_out_latitude: Mapped[float | None]
    check_out_longitude: Mapped[float | None]
    check_out_distance_meters: Mapped[float | None]

    geo_validated: Mapped[bool]  # True = estaba en su sede; False = fuera de rango

    # RESTRICCIÓN IMPORTANTE: un empleado solo puede tener UN registro por día
    # Si intentás insertar dos filas con el mismo (employee_id, record_date) → error de DB
    __table_args__ = (
        UniqueConstraint("employee_id", "record_date", name="uq_employee_date"),
    )
```

---

## 4. Backend — Cómo valida la geolocalización

**Archivo:** `backend/app/services/geolocation.py`

Este servicio implementa la **fórmula de Haversine** — la fórmula matemática estándar para calcular distancias entre dos coordenadas GPS sobre la superficie esférica de la Tierra.

```python
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia en METROS entre dos puntos GPS.

    La Tierra no es plana, entonces no podés usar Pitágoras directamente.
    La fórmula de Haversine tiene en cuenta la curvatura de la Tierra.

    Ejemplo:
        lat1, lon1 = 14.6407, -90.5133  (Campus UMG Ciudad)
        lat2, lon2 = 14.6408, -90.5130  (50 metros al este)
        resultado  ≈ 28.5 metros
    """
    R = 6371000  # Radio de la Tierra en metros (promedio)

    # Convertir grados a radianes (la trigonometría trabaja en radianes)
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi    = math.radians(lat2 - lat1)  # diferencia de latitudes
    delta_lambda = math.radians(lon2 - lon1)  # diferencia de longitudes

    # Fórmula de Haversine
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c  # distancia en metros


def validate_location(
    user_lat: float,
    user_lon: float,
    location_lat: float,
    location_lon: float,
    radius_meters: int,
    location_name: str | None = None,
) -> GeoValidationResult:
    """
    Responde: ¿Está el usuario dentro del radio permitido de su sede?

    Ejemplo:
        Sede UMG: lat=14.6407, lon=-90.5133, radio=100 metros
        Usuario:  lat=14.6408, lon=-90.5130
        Distancia calculada: 28.5 metros
        28.5 < 100 → is_valid = True ✓

        Otro usuario: lat=14.6500, lon=-90.5200
        Distancia calculada: 1200 metros
        1200 > 100 → is_valid = False ✗
    """
    distance = haversine_distance(user_lat, user_lon, location_lat, location_lon)

    return GeoValidationResult(
        is_valid=distance <= radius_meters,   # True si está dentro del radio
        distance_meters=round(distance, 2),   # distancia exacta (para mostrar en el reporte)
        location_name=location_name,
        allowed_radius=radius_meters,
    )
```

### Cómo se usa en el check-in

**Archivo:** `backend/app/api/v1/endpoints/attendance.py` — función `_validate_geo`

```python
async def _validate_geo(
    db: AsyncSession,
    employee: Employee,
    latitude: float | None,
    longitude: float | None,
) -> tuple[bool, float | None]:
    """
    Valida si el empleado está dentro de su sede asignada.
    Devuelve (es_válido, distancia_en_metros).
    """

    # Si no mandaron coordenadas GPS → no se puede validar
    if latitude is None or longitude is None:
        return False, None

    # Si el empleado no tiene sede asignada → tampoco se puede validar
    if employee.location_id is None:
        return False, None

    # Buscar la sede asignada al empleado
    result = await db.execute(
        select(Location).where(Location.id == employee.location_id)
    )
    location = result.scalar_one_or_none()

    if not location:
        return False, None

    # Llamar a la función de validación con:
    # - Coordenadas del usuario (vienen del celular/tablet)
    # - Coordenadas de la sede (guardadas por el admin)
    # - Radio permitido en metros (configurable por sede)
    validation = validate_location(
        user_lat=latitude,
        user_lon=longitude,
        location_lat=location.latitude,
        location_lon=location.longitude,
        radius_meters=location.radius_meters,
        location_name=location.name,
    )

    return validation.is_valid, validation.distance_meters
```

### El modelo Location en la base de datos

**Archivo:** `backend/app/models/location.py`

```python
class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID]
    name: Mapped[str]              # Ej: "Campus Central UMG"
    address: Mapped[str | None]    # Dirección textual (opcional)
    latitude: Mapped[float]        # Ej: 14.6407
    longitude: Mapped[float]       # Ej: -90.5133
    radius_meters: Mapped[int]     # Ej: 100 (metros de radio permitido)
                                   # Default: 50 metros
    is_active: Mapped[bool]
```

---

## 5. Backend — Seguridad: JWT y contraseñas

**Archivo:** `backend/app/core/security.py`

### Contraseñas con bcrypt

```python
def get_password_hash(password: str) -> str:
    """
    Convierte una contraseña en texto plano a un hash seguro.

    NUNCA se guarda la contraseña original en la base de datos.
    Se guarda el hash. El hash es irreversible (no se puede descifrar).

    Ejemplo:
        "mipassword123"  →  "$2b$12$K7CRVjQd4nMfBz..."

    Cada vez que llames a esta función con la misma contraseña,
    el resultado es DISTINTO porque bcrypt agrega un "salt" aleatorio.
    """
    salt = bcrypt.gensalt()  # genera un salt único aleatorio
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano coincide con su hash guardado.

    Ejemplo:
        verify_password("mipassword123", "$2b$12$K7CRVjQd4nMfBz...") → True
        verify_password("otrapassword",  "$2b$12$K7CRVjQd4nMfBz...") → False
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )
```

### Tokens JWT

```python
def create_access_token(subject: str) -> str:
    """
    Crea un token JWT de acceso (válido por 30 minutos por defecto).

    Un JWT tiene 3 partes separadas por puntos:
    HEADER.PAYLOAD.SIGNATURE

    El PAYLOAD contiene:
    {
        "sub": "uuid-del-usuario",    ← quién es el usuario
        "type": "access",             ← tipo de token
        "exp": 1712345678             ← cuándo expira (timestamp Unix)
    }

    Este token se firma con SECRET_KEY. Si alguien lo modifica,
    la firma no coincide y el servidor lo rechaza.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {"exp": expire, "sub": str(subject), "type": "access"}
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(subject: str) -> str:
    """
    Crea un token de refresh (válido por 7 días).
    Se usa para obtener un nuevo access_token cuando el de 30 minutos expira,
    sin pedirle al usuario que haga login nuevamente.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict | None:
    """
    Decodifica y valida un JWT.
    Si el token es válido → devuelve el payload (el diccionario con sub, type, exp).
    Si expiró o fue modificado → devuelve None.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except jwt.JWTError:
        return None
```

### Cómo se valida el token en cada request

**Archivo:** `backend/app/api/deps.py`

```python
async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(oauth2_scheme)],  # extrae el token del header Authorization
) -> User:
    """
    Esta función se ejecuta automáticamente en cada endpoint que la declara como Depends.
    FastAPI la inyecta como dependencia.

    El flujo es:
    1. Extraer el token del header: "Authorization: Bearer eyJhbGci..."
    2. Decodificar el token con decode_token()
    3. Verificar que sea de tipo "access" (no "refresh")
    4. Buscar el usuario en la base de datos por su ID (el "sub" del payload)
    5. Verificar que el usuario está activo
    6. Devolver el objeto User

    Si cualquier paso falla → lanza HTTP 401 Unauthorized automáticamente.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")

    return user


async def get_current_active_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Extiende get_current_user agregando la verificación de rol.
    Solo permite acceso a usuarios con rol 'admin' o 'supervisor'.
    """
    if current_user.role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user
```

---

## 6. Backend — Cómo se conecta a la base de datos

**Archivo:** `backend/app/db/session.py`

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

settings = get_settings()

# MOTOR ASYNC de SQLAlchemy
# "async" significa que las operaciones de base de datos no bloquean el servidor.
# Si hay 10 requests simultáneos, el servidor puede atenderlos todos mientras
# espera respuestas de la DB, en vez de quedar bloqueado esperando uno por uno.
#
# La URL tiene el formato:
# postgresql+asyncpg://usuario:password@host:puerto/nombre_db
#                      ↑
#                   asyncpg es el driver async para PostgreSQL
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,  # si debug=True, imprime cada SQL en los logs
    future=True,
)

# Fábrica de sesiones
# Una "sesión" es una transacción abierta con la base de datos.
# expire_on_commit=False: los objetos siguen accesibles después de hacer commit
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,  # los cambios no se guardan solos, hay que hacer db.commit()
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Generador async que provee una sesión de DB a cada endpoint.
    Se declara como Depends(get_db) en cada endpoint que necesite la DB.

    Garantiza que:
    - Cada request tiene su propia sesión
    - La sesión se cierra automáticamente al terminar el request
    - Aunque el endpoint lance una excepción, la sesión se cierra igual (finally)
    """
    async with async_session_maker() as session:
        try:
            yield session   # entrega la sesión al endpoint
        finally:
            await session.close()  # siempre cierra, pase lo que pase
```

---

## 7. Frontend — Cómo funciona la cámara

**Archivo:** `frontend/src/app/core/services/camera.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class CameraService {

  // Signals de Angular — reactive state management
  // Cuando cambian, Angular actualiza automáticamente la UI
  private readonly isActive = signal(false);      // ¿la cámara está encendida?
  private readonly isCapturing = signal(false);   // ¿está capturando fotos ahora?

  async start(videoEl: HTMLVideoElement, config: Partial<CameraConfig> = {}): Promise<void> {
    /**
     * Solicita acceso a la cámara del dispositivo y conecta el stream
     * al elemento <video> del HTML.
     *
     * RESOLUTION_CHAIN: intenta primero alta resolución (1280x960),
     * si el dispositivo no la soporta, baja a 960x720, luego a 640x480.
     * Si ninguna funciona, pide sin restricciones de resolución.
     * Así funciona tanto en tablets nuevas como en teléfonos viejos.
     */
    for (const resolution of RESOLUTION_CHAIN) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            facingMode: finalConfig.facingMode,  // 'user' = cámara frontal
          },
          audio: false,  // no necesitamos audio
        });
        break; // Si no falló → salir del loop
      } catch (error) {
        if (error.name !== 'OverconstrainedError') {
          throw error; // Error de permisos u otro → no seguir intentando
        }
        // OverconstrainedError = resolución no soportada → intentar la siguiente
      }
    }

    // Conectar el stream de video al elemento <video> en el HTML
    videoEl.srcObject = this.stream;
    await videoEl.play();

    this.isActive.set(true);

    // Escuchar cuando el usuario cambia de pestaña o minimiza la app
    // Para liberar la cámara cuando no se usa (buena práctica de privacidad)
    this.setupVisibilityListeners();
  }


  captureFrame(): string | null {
    /**
     * Toma una "foto" del frame actual del video y la devuelve como base64.
     *
     * Técnicamente:
     * 1. Crea un elemento <canvas> invisible
     * 2. Dibuja el frame actual del video en el canvas
     * 3. Convierte el canvas a JPEG en base64
     *
     * El base64 resultante es lo que se envía al backend.
     */
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;   // escalado a máximo 1280px de ancho
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoElement, 0, 0, canvasWidth, canvasHeight);

    // 0.7 o 0.8 de calidad JPEG según el dispositivo
    // Menor calidad = imagen más pequeña = menos datos a enviar al backend
    return canvas.toDataURL('image/jpeg', quality);
  }


  async captureFrames(count: number = 3, delayMs: number = 250): Promise<string[]> {
    /**
     * Captura múltiples frames con un delay entre cada uno.
     * Se usan 3 frames con 250ms de diferencia como medida básica anti-spoofing:
     * dificulta usar una foto estática en lugar del rostro real.
     *
     * El guard isCapturing() evita que si el usuario hace doble click,
     * se disparen dos capturas simultáneas.
     */
    if (this.isCapturing()) return [];  // doble-tap guard

    this.isCapturing.set(true);
    const frames: string[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const frame = this.captureFrame();
        if (frame) frames.push(frame);
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs)); // esperar 250ms
        }
      }
    } finally {
      this.isCapturing.set(false); // siempre liberar el guard, pase lo que pase
    }

    return frames;
  }
}
```

---

## 8. Frontend — Cómo obtiene la ubicación GPS

**Archivo:** `frontend/src/app/core/services/geolocation.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class GeolocationService {

  // Signals para el estado del GPS
  private readonly _state = signal<GeoState>('idle');    // idle|acquiring|acquired|error
  private readonly _lastPosition = signal<GeoPosition | null>(null);

  getCurrentPosition(config?: Partial<GeoConfig>): Observable<GeoPosition> {
    /**
     * Obtiene las coordenadas GPS actuales del dispositivo.
     *
     * Soporta dos modos:
     * - Browser (PWA en Chrome/Safari): usa navigator.geolocation
     * - Nativo (Capacitor en Android/iOS): usa el plugin @capacitor/geolocation
     *
     * La diferencia es que Capacitor da mayor precisión en móviles
     * y maneja mejor los permisos nativos del sistema operativo.
     */
    this._state.set('acquiring');

    if (this.platformService.isNative()) {
      return this.getPositionNative(finalConfig);  // Capacitor
    } else {
      return this.getPositionBrowser(finalConfig);  // browser estándar
    }
  }

  private getPositionBrowser(config: GeoConfig): Observable<GeoPosition> {
    /**
     * Versión browser: envuelve la API del navegador en un Observable de RxJS.
     * El navegador pedirá permiso al usuario la primera vez.
     */
    return from(
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,  // usar GPS preciso (no solo WiFi/cell)
          timeout: 10000,            // esperar máximo 10 segundos
          maximumAge: 30000,         // aceptar posición cacheada de hasta 30 seg
        });
      })
    ).pipe(
      map(position => ({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,  // margen de error en metros
      })),
      tap(pos => {
        this._state.set('acquired');
        this._lastPosition.set(pos);
      }),
      catchError(error => {
        // Mapear el código de error del navegador a un mensaje amigable
        this._state.set('error');
        return throwError(() => this.mapBrowserError(error));
      })
    );
  }
}
```

---

## 9. Frontend — Cómo maneja la autenticación del admin

**Archivo:** `frontend/src/app/core/services/auth.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly currentUser = signal<User | null>(null);

  // Computeds: se recalculan automáticamente cuando currentUser cambia
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  constructor() {
    // Al iniciar la app, intentar restaurar la sesión si hay token guardado
    this.loadCurrentUser();
  }

  login(credentials: LoginRequest): Observable<TokenResponse> {
    /**
     * IMPORTANTE: el backend espera "application/x-www-form-urlencoded",
     * no JSON. Esto es un estándar OAuth2 para el endpoint de login.
     * Por eso se usa URLSearchParams en vez de un objeto JSON directo.
     */
    const formData = new URLSearchParams();
    formData.set('username', credentials.username);  // FastAPI espera 'username' no 'email'
    formData.set('password', credentials.password);

    return this.http.post<TokenResponse>(`${this.baseUrl}/auth/login`, formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).pipe(
      tap((response) => {
        // Guardar los dos tokens en localStorage
        // Así sobreviven si el usuario cierra y reabre el navegador
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('refresh_token', response.refresh_token);
        this.loadCurrentUser();  // cargar datos del usuario inmediatamente
      })
    );
  }

  private loadCurrentUser(): void {
    /**
     * Si hay un token guardado, consultar al backend quién es ese usuario.
     * El interceptor agrega el token al header automáticamente.
     */
    const token = localStorage.getItem('access_token');
    if (!token) return;

    this.http.get<User>(`${this.baseUrl}/auth/me`).subscribe({
      next: (user) => this.currentUser.set(user),
      error: () => {
        // Token inválido o expirado → limpiar y quedar sin sesión
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      },
    });
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }
}
```

**Archivo:** `frontend/src/app/core/interceptors/auth.interceptor.ts`

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  /**
   * Interceptor: se ejecuta AUTOMÁTICAMENTE en CADA request HTTP del frontend.
   * Su función: agregar el token JWT al header de cada request.
   *
   * Sin esto, tendrías que agregar el header manualmente en cada llamada HTTP.
   * Con esto, solo lo configurás una vez y funciona para toda la app.
   *
   * También maneja la renovación automática del token cuando expira (401).
   */
  const token = authService.getAccessToken();

  // No agregar token al login ni al refresh (no tienen token todavía)
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  // Clonar el request y agregarle el header de autorización
  // Se clona porque los HttpRequest son inmutables en Angular
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // El access token expiró → intentar renovarlo con el refresh token
        return authService.refreshAccessToken().pipe(
          switchMap((response) => {
            // Reintentar el request original con el nuevo token
            const newReq = req.clone({
              setHeaders: { Authorization: `Bearer ${response.access_token}` }
            });
            return next(newReq);
          }),
          catchError(() => {
            // El refresh token también expiró → forzar logout
            authService.logout();
            return throwError(() => error);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
```

---

## 10. Frontend — Cómo se envían las fotos al backend

**Archivo:** `frontend/src/app/core/services/attendance.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly api = inject(ApiService);

  checkIn(request: AttendanceCheckInRequest): Observable<AttendanceRecord> {
    /**
     * Envía el check-in al backend.
     *
     * request tiene esta estructura:
     * {
     *   images: [
     *     "data:image/jpeg;base64,/9j/4AAQ...",  ← foto 1
     *     "data:image/jpeg;base64,/9j/4BBR...",  ← foto 2
     *     "data:image/jpeg;base64,/9j/4CCS...",  ← foto 3
     *   ],
     *   latitude: 14.6407,   ← coordenada GPS (puede ser null si no hay GPS)
     *   longitude: -90.5133,
     * }
     *
     * El backend solo usa images[0] para el reconocimiento.
     * Las otras fotos son para uso futuro (anti-spoofing más avanzado).
     */
    return this.api.post<AttendanceRecord>('/attendance/check-in', request);
  }
}
```

**Archivo:** `frontend/src/app/core/services/api.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class ApiService {
  /**
   * Servicio base para todos los requests HTTP.
   * Todos los demás servicios (AttendanceService, EmployeeService, etc.)
   * usan este servicio en vez de HttpClient directamente.
   *
   * Ventaja: si hay que cambiar la URL base o agregar headers globales,
   * se hace en un solo lugar.
   *
   * La URL base viene de environment.apiUrl:
   *   development → "http://localhost:8000/api/v1"
   *   production  → "https://asistencia.sistemaslab.dev/api/v1"
   */

  get<T>(path: string, params?: Record<string, string | number | boolean>): Observable<T> {
    // Construir query params: /attendance?date=2026-03-24&limit=50
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        httpParams = httpParams.set(key, String(value));
      });
    }
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: httpParams });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }
}
```

---

## 11. Frontend — Cómo protege las rutas del panel admin

**Archivo:** `frontend/src/app/core/guards/auth.guard.ts`

```typescript
export const authGuard: CanActivateFn = () => {
  /**
   * Protege las rutas /admin/*.
   * Si hay token → permitir acceso.
   * Si no hay token → redirigir al login.
   *
   * Nota: solo verifica que el token EXISTE, no que sea válido.
   * La validación real ocurre cuando el backend recibe el request
   * y el interceptor intenta renovarlo si expiró.
   */
  const token = authService.getAccessToken();
  if (token) return true;

  router.navigate(['/auth/login']);
  return false;
};


export const guestGuard: CanActivateFn = () => {
  /**
   * Protege las rutas /auth/login.
   * Si NO hay token → permitir acceso (el usuario no está logueado).
   * Si SÍ hay token → redirigir al dashboard (ya está logueado, no tiene sentido ir al login).
   */
  const token = authService.getAccessToken();
  if (!token) return true;

  router.navigate(['/admin/dashboard']);
  return false;
};
```

---

## Resumen visual del sistema completo

```
TABLET/PC (kiosco)
│
│  1. Usuario se para frente a la cámara
│  2. CameraService.start() → pide permiso de cámara
│  3. Usuario presiona "Marcar Asistencia"
│  4. CameraService.captureFrames(3, 250ms) → 3 fotos en base64
│  5. GeolocationService.getCurrentPosition() → lat/lon
│  6. AttendanceService.checkIn({images, lat, lon}) → POST HTTP
│
├── INTERCEPTOR agrega "Authorization: Bearer <token>" automáticamente
│   (para check-in no se necesita, pero el interceptor igual lo intenta)
│
BACKEND FastAPI
│
│  7. Endpoint /attendance/check-in recibe el request
│  8. FaceRecognitionService.get_face_embedding(images[0])
│     │── decode base64 → numpy array
│     │── face_recognition.face_locations() → detecta el rostro
│     └── face_recognition.face_encodings() → vector de 128 números
│
│  9. FaceRecognitionService.find_best_match(db, embedding)
│     └── SQL: SELECT ... ORDER BY embedding <=> :query_embedding LIMIT 1
│         pgvector calcula distancia coseno contra todos los embeddings
│
│  10. Si distancia < umbral (0.6) → empleado identificado
│
│  11. _validate_geo(db, employee, lat, lon)
│      │── busca la sede asignada al empleado
│      │── haversine_distance(user_lat, user_lon, sede_lat, sede_lon)
│      └── ¿distancia <= radio_sede? → geo_validated = True/False
│
│  12. INSERT attendance_records (employee_id, check_in, confidence, geo_validated, ...)
│
└── Respuesta JSON → {employee_name, check_in, confidence, geo_validated, message}

TABLET (recibe respuesta)
│
└── Muestra pantalla de éxito con nombre y hora por 5 segundos → vuelve a idle
```
