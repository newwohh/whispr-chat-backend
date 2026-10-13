import logging
from rest_framework.response import Response
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .renderers import UserRenderer
from .serializers import UserRegistrationSerializer, UserLoginSerializer
from .models import User
from .consumers import sanitize_group_name
from .mongodb import (
    save_message,
    get_messages,
    get_user_conversations,
    get_all_chats,
    generate_direct_room_id,
    check_mongo_connection,
)

logger = logging.getLogger(__name__)


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token)
    }


def broadcast_chat_message(room_id: str, message_data: dict):
    """Utility to broadcast a message to the room's Django Channels WebSocket group."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            group_name = sanitize_group_name(room_id)
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    "type": "chat_message_broadcast",
                    "data": {
                        "id": message_data["id"],
                        "text": message_data["text"],
                        "message": message_data["text"],
                        "senderId": message_data["senderId"],
                        "username": message_data["senderId"],
                        "recipientId": message_data.get("recipientId"),
                        "date": message_data["date"],
                        "room_id": room_id,
                    }
                }
            )
    except Exception as e:
        logger.warning(f"Could not broadcast message over channel layer: {e}")


class MessageAPIView(APIView):
    """
    World chat API endpoint (backward compatible with the Pusher endpoint).
    Stores messages in MongoDB and broadcasts in real-time over WebSockets.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        room_id = request.query_params.get('room', 'world')
        limit = int(request.query_params.get('limit', 100))
        messages = get_messages(room_id, limit=limit)
        return Response({
            'room': room_id,
            'messages': messages
        }, status=status.HTTP_200_OK)

    def post(self, request):
        username = request.data.get('username') or request.data.get('senderId') or 'Anonymous'
        text = request.data.get('message') or request.data.get('text') or ''
        room_id = request.data.get('room') or request.data.get('room_id') or 'world'

        if not text.strip():
            return Response({'error': 'Message text is required'}, status=status.HTTP_400_BAD_REQUEST)

        saved = save_message(
            room_id=room_id,
            sender_id=username,
            text=text,
        )

        broadcast_chat_message(room_id, saved)
        return Response(saved, status=status.HTTP_201_CREATED)


class ChatMessagesView(APIView):
    """
    Endpoint for fetching and sending messages for a specific chat room / conversation.
    """
    permission_classes = [AllowAny]

    def get(self, request, room_id):
        limit = int(request.query_params.get('limit', 100))
        messages = get_messages(room_id, limit=limit)
        return Response({
            'room_id': room_id,
            'messages': messages
        }, status=status.HTTP_200_OK)

    def post(self, request, room_id):
        sender = request.data.get('senderId') or request.data.get('username') or 'Anonymous'
        text = request.data.get('text') or request.data.get('message') or ''
        recipient = request.data.get('recipientId') or request.data.get('recipient')
        msg_id = request.data.get('id')
        date_str = request.data.get('date')

        if not text.strip():
            return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)

        saved = save_message(
            room_id=room_id,
            sender_id=sender,
            text=text,
            recipient_id=recipient,
            message_id=msg_id,
            date=date_str,
        )

        broadcast_chat_message(room_id, saved)
        return Response({
            'message': saved,
            'status': 'success'
        }, status=status.HTTP_201_CREATED)


class DirectChatMessagesView(APIView):
    """
    Endpoint for 1-on-1 direct messaging between two users.
    Automatically generates the sorted room_id matching the frontend convention.
    """
    permission_classes = [AllowAny]

    def get(self, request, other_user):
        current_user = request.query_params.get('user')
        if not current_user:
            return Response({'error': 'User query parameter is required (e.g. ?user=username)'}, status=status.HTTP_400_BAD_REQUEST)

        room_id = generate_direct_room_id(current_user, other_user)
        limit = int(request.query_params.get('limit', 100))
        messages = get_messages(room_id, limit=limit)
        return Response({
            'room_id': room_id,
            'participants': [current_user, other_user],
            'messages': messages
        }, status=status.HTTP_200_OK)

    def post(self, request, other_user):
        current_user = request.data.get('senderId') or request.data.get('username')
        text = request.data.get('text') or request.data.get('message') or ''

        if not current_user:
            return Response({'error': 'senderId or username is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not text.strip():
            return Response({'error': 'Message text is required'}, status=status.HTTP_400_BAD_REQUEST)

        room_id = generate_direct_room_id(current_user, other_user)
        saved = save_message(
            room_id=room_id,
            sender_id=current_user,
            text=text,
            recipient_id=other_user,
        )

        broadcast_chat_message(room_id, saved)
        return Response({
            'room_id': room_id,
            'message': saved,
            'status': 'success'
        }, status=status.HTTP_201_CREATED)


class UserConversationsView(APIView):
    """
    Endpoint to list chat conversations stored in MongoDB.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        username = request.query_params.get('username')
        if username:
            conversations = get_user_conversations(username)
        else:
            conversations = get_all_chats()
        return Response({
            'conversations': conversations
        }, status=status.HTTP_200_OK)


class HealthCheckView(APIView):
    """Health check endpoint verifying Django and MongoDB status."""
    permission_classes = [AllowAny]

    def get(self, request):
        mongo_status = check_mongo_connection()
        return Response({
            'status': 'healthy',
            'websocket_support': True,
            'mongodb': mongo_status,
        }, status=status.HTTP_200_OK)


class UserSignupView(APIView):
    renderer_classes = [UserRenderer]
    permission_classes = [AllowAny]

    def post(self, request, format=None):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = get_tokens_for_user(user)
        return Response({'token': token, 'message': "success"}, status=status.HTTP_201_CREATED)


class UserLoginView(APIView):
    renderer_classes = [UserRenderer]
    permission_classes = [AllowAny]

    def post(self, request, format=None):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.data.get('email')
        password = serializer.data.get('password')
        user = authenticate(email=email, password=password)
        all_members = User.objects.all()
        users = []
        for u in all_members:
            each_user = {
                'name': u.name,
                'id': u.id
            }
            users.append(each_user)

        if user is not None:
            token = get_tokens_for_user(user)
            user_data = {
                'id': user.id,
                'username': email,
                'email': email,
                'name': user.name,
            }
            return Response({
                'token': token,
                'user': user_data,
                'users': users,
                'msg': "login success"
            }, status=status.HTTP_200_OK)
        else:
            return Response({'errors': {'non_field_errors': ["Email or Password not valid"]}}, status=status.HTTP_404_NOT_FOUND)
