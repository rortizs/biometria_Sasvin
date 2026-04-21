from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # user_id (str) → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        if user_id in self._connections:
            try:
                self._connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        """Send JSON payload to all connections for a user. Silently ignores if not connected."""
        connections = self._connections.get(str(user_id), [])
        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, str(user_id))

    def is_connected(self, user_id: str) -> bool:
        return str(user_id) in self._connections


# Singleton instance
ws_manager = ConnectionManager()
