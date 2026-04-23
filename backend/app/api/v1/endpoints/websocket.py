from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.security import decode_token
from app.services.websocket_manager import ws_manager

router = APIRouter()


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    """
    WebSocket endpoint for real-time notifications.
    Client connects with: ws://host/api/v1/ws/notifications?token=<JWT>
    """
    payload = decode_token(token)
    user_id = payload.get("sub") if payload else None
    if not payload or payload.get("type") != "access" or not user_id:
        await websocket.accept()
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, str(user_id))
    try:
        while True:
            # Keep connection alive — client can send "ping", we respond "pong"
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, str(user_id))
