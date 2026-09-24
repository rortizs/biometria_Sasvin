from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.services.websocket_manager import ws_manager

router = APIRouter()

AUTH_SUBPROTOCOL = "bearer"


def _requested_subprotocols(header_value: str | None) -> list[str]:
    if not header_value:
        return []
    return [protocol.strip() for protocol in header_value.split(",") if protocol.strip()]


def _websocket_credential_from_subprotocols(header_value: str | None) -> str | None:
    protocols = _requested_subprotocols(header_value)
    for index, protocol in enumerate(protocols[:-1]):
        if protocol.lower() == AUTH_SUBPROTOCOL:
            return protocols[index + 1]
    return None


def _select_auth_subprotocol(header_value: str | None) -> str | None:
    if _websocket_credential_from_subprotocols(header_value):
        return AUTH_SUBPROTOCOL
    return None


def _resolve_websocket_credential(
    subprotocols: str | None,
    query_credential: str | None,
) -> tuple[str | None, str | None]:
    subprotocol_credential = _websocket_credential_from_subprotocols(subprotocols)
    if subprotocol_credential:
        return subprotocol_credential, _select_auth_subprotocol(subprotocols)
    return query_credential, None


async def _connect_websocket(websocket: WebSocket, user_id: str, subprotocol: str | None) -> None:
    await websocket.accept(subprotocol=subprotocol)
    ws_manager._connections.setdefault(user_id, []).append(websocket)


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    """
    WebSocket endpoint for real-time notifications.

    Preferred client auth uses WebSocket subprotocols:
    `Sec-WebSocket-Protocol: bearer, <JWT>`. Legacy `?token=<JWT>` is
    still accepted only as a compatibility fallback for older clients.
    """
    credential, accepted_subprotocol = _resolve_websocket_credential(
        websocket.headers.get("sec-websocket-protocol"),
        token,
    )
    payload = decode_token(credential) if credential else None
    user_id = payload.get("sub") if payload else None
    if not payload or payload.get("type") != "access" or not user_id:
        await websocket.accept(subprotocol=accepted_subprotocol)
        await websocket.close(code=4001)
        return

    await _connect_websocket(websocket, str(user_id), accepted_subprotocol)
    try:
        while True:
            # Keep connection alive — client can send "ping", we respond "pong"
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, str(user_id))
