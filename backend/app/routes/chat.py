from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, List
import json
from ..logger import logger
from ..auth import get_current_user_ws

router = APIRouter()

# Connection manager to keep track of active websockets per team
class ConnectionManager:
    def __init__(self):
        # team_id -> List of websockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, team_id: int):
        await websocket.accept()
        if team_id not in self.active_connections:
            self.active_connections[team_id] = []
        self.active_connections[team_id].append(websocket)
        logger.info(f"WS connected to team {team_id}. Total: {len(self.active_connections[team_id])}")

    def disconnect(self, websocket: WebSocket, team_id: int):
        if team_id in self.active_connections:
            if websocket in self.active_connections[team_id]:
                self.active_connections[team_id].remove(websocket)
            if not self.active_connections[team_id]:
                del self.active_connections[team_id]
        logger.info(f"WS disconnected from team {team_id}.")

    async def broadcast(self, message: dict, team_id: int):
        if team_id in self.active_connections:
            # We must serialize the dict to a string first
            text_data = json.dumps(message)
            for connection in self.active_connections[team_id]:
                try:
                    await connection.send_text(text_data)
                except Exception as e:
                    logger.warning(f"Error broadcasting WS message: {e}")

manager = ConnectionManager()

@router.websocket("/ws/{team_id}")
async def websocket_endpoint(websocket: WebSocket, team_id: int, token: str):
    user = await get_current_user_ws(token)
    if not user or user.team_id != team_id:
        await websocket.close(code=1008) # Policy Violation
        return

    await manager.connect(websocket, team_id)
    
    # Notify others that someone joined
    # await manager.broadcast({"type": "join", "user": user.display_name}, team_id)

    try:
        while True:
            data = await websocket.receive_text()
            # Expecting data to be a text message from the user
            payload = {
                "type": "message",
                "user": user.display_name,
                "text": data,
                "timestamp": __import__("datetime").datetime.now().isoformat()
            }
            await manager.broadcast(payload, team_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, team_id)
        # await manager.broadcast({"type": "leave", "user": user.display_name}, team_id)
