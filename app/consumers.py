import json
import logging
import re
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .mongodb import save_message, get_messages

logger = logging.getLogger(__name__)


def sanitize_group_name(name: str) -> str:
    """
    Sanitize room name to be a valid Django Channels group name.
    Channels group names must be ASCII alphanumerics, hyphens, or periods, < 100 chars.
    """
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', str(name or 'world'))
    return f"chat_{clean_name}"[:95]


class ChatConsumer(AsyncWebsocketConsumer):
    """
    Real-time WebSocket consumer for 1-on-1 and group chat rooms.
    Persists messages to MongoDB and broadcasts updates to room participants.
    """

    async def connect(self):
        # Extract room name from URL kwargs, default to 'world'
        self.room_name = self.scope.get('url_route', {}).get('kwargs', {}).get('room_name', 'world')
        self.room_group_name = sanitize_group_name(self.room_name)

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        logger.info(f"WebSocket connected: channel={self.channel_name}, room={self.room_name}, group={self.room_group_name}")

        # Send connection confirmation to client
        await self.send(text_data=json.dumps({
            "type": "connection_established",
            "room": self.room_name,
            "message": f"Connected to {self.room_name} chat room"
        }))

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        logger.info(f"WebSocket disconnected: channel={self.channel_name}, room={self.room_name}, code={close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Invalid JSON format"
            }))
            return

        msg_type = payload.get("type", "chat_message")

        # Handle ping
        if msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return

        # Handle typing indicator
        if msg_type == "typing":
            username = payload.get("username") or payload.get("senderId") or "Anonymous"
            is_typing = payload.get("is_typing", True)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "typing_broadcast",
                    "username": username,
                    "is_typing": is_typing,
                    "sender_channel": self.channel_name,
                }
            )
            return

        # Handle fetch_history request over socket
        if msg_type == "fetch_history":
            limit = int(payload.get("limit", 100))
            messages = await database_sync_to_async(get_messages)(self.room_name, limit=limit)
            await self.send(text_data=json.dumps({
                "type": "history",
                "room": self.room_name,
                "messages": messages
            }))
            return

        # Handle chat message
        if msg_type in ("chat_message", "message"):
            text = payload.get("text") or payload.get("message") or ""
            sender = payload.get("senderId") or payload.get("username") or "Anonymous"
            recipient = payload.get("recipientId") or payload.get("recipient")
            custom_id = payload.get("id")
            date_str = payload.get("date")

            if not text.strip():
                return

            # Save to MongoDB
            saved_msg = await database_sync_to_async(save_message)(
                room_id=self.room_name,
                sender_id=sender,
                text=text,
                recipient_id=recipient,
                message_id=custom_id,
                date=date_str,
            )

            broadcast_data = {
                "id": saved_msg["id"],
                "text": saved_msg["text"],
                "message": saved_msg["text"],
                "senderId": saved_msg["senderId"],
                "username": saved_msg["senderId"],
                "recipientId": saved_msg.get("recipientId"),
                "date": saved_msg["date"],
                "room_id": self.room_name,
            }

            try:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "chat_message_broadcast",
                        "data": broadcast_data,
                    }
                )
            except Exception as e:
                logger.warning(f"Group broadcast fallback: {e}")
                await self.send(text_data=json.dumps({
                    "type": "chat_message",
                    **broadcast_data
                }))

    async def chat_message_broadcast(self, event):
        """Receive message broadcast from group and send down to WebSocket client."""
        await self.send(text_data=json.dumps({
            "type": "chat_message",
            **event["data"]
        }))

    async def typing_broadcast(self, event):
        """Receive typing broadcast from group and relay to client (except the sender)."""
        if event.get("sender_channel") == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            "type": "typing",
            "username": event["username"],
            "is_typing": event["is_typing"],
            "room": self.room_name,
        }))
