from django.urls import path
from .views import (
    MessageAPIView,
    ChatMessagesView,
    DirectChatMessagesView,
    UserConversationsView,
    HealthCheckView,
    UserSignupView,
    UserLoginView,
)

app_name = 'app'

urlpatterns = [
    # Messages & Chat endpoints backed by MongoDB and WebSockets
    path('messages/', MessageAPIView.as_view(), name="messages"),
    path('chats/', UserConversationsView.as_view(), name="conversations"),
    path('chats/<str:room_id>/messages/', ChatMessagesView.as_view(), name="chat_messages"),
    path('chats/direct/<str:other_user>/messages/', DirectChatMessagesView.as_view(), name="direct_messages"),
    path('health/', HealthCheckView.as_view(), name="health"),

    # Auth endpoints
    path('signup/', UserSignupView.as_view(), name='signup'),
    path('login/', UserLoginView.as_view(), name='login'),
]
