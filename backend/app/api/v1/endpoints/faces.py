from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.user import User
from app.schemas.face import FaceRegisterRequest, FaceVerifyRequest, FaceVerifyResponse
from app.services.face_recognition import FaceRecognitionService

router = APIRouter()


@router.post("/register", response_model=dict)
async def register_face(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    request: FaceRegisterRequest,
) -> dict:
    # Verify employee exists
    result = await db.execute(select(Employee).where(Employee.id == request.employee_id))
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    face_service = FaceRecognitionService()

    # Generate embeddings from images
    embeddings = []
    for idx, image_b64 in enumerate(request.images):
        try:
            embedding = face_service.get_face_embedding(image_b64)
            if embedding is not None:
                embeddings.append(embedding)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error processing image {idx + 1}: {str(e)}",
            )

    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid face found in any of the provided images",
        )

    # Delete existing embeddings for this employee
    await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == request.employee_id)
    )
    existing = await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == request.employee_id)
    )
    for emb in existing.scalars().all():
        await db.delete(emb)

    # Save new embeddings
    for idx, embedding in enumerate(embeddings):
        face_emb = FaceEmbedding(
            employee_id=request.employee_id,
            embedding=embedding.tolist(),
            is_primary=(idx == 0),
        )
        db.add(face_emb)

    await db.commit()

    return {
        "success": True,
        "message": f"Registered {len(embeddings)} face embedding(s) for {employee.full_name}",
        "embeddings_count": len(embeddings),
    }


@router.post("/verify", response_model=FaceVerifyResponse)
async def verify_face(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: FaceVerifyRequest,
) -> FaceVerifyResponse:
    face_service = FaceRecognitionService()

    # Get embedding from provided image
    try:
        query_embedding = face_service.get_face_embedding(request.image)
    except Exception as e:
        return FaceVerifyResponse(
            success=False,
            message=f"Error processing image: {str(e)}",
        )

    if query_embedding is None:
        return FaceVerifyResponse(
            success=False,
            message="No face detected in the provided image",
        )

    # Find best match using pgvector
    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        return FaceVerifyResponse(
            success=False,
            message="No matching employee found",
        )

    employee, confidence = match

    return FaceVerifyResponse(
        success=True,
        employee_id=employee.id,
        employee_name=employee.full_name,
        confidence=confidence,
        message=f"Welcome, {employee.full_name}!",
    )


@router.delete("/{employee_id}")
async def delete_face_embeddings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
) -> dict:
    result = await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == employee_id)
    )
    embeddings = result.scalars().all()

    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No face embeddings found for this employee",
        )

    for emb in embeddings:
        await db.delete(emb)

    await db.commit()

    return {
        "success": True,
        "message": f"Deleted {len(embeddings)} face embedding(s)",
    }
