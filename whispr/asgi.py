"""
ASGI config for whispr project.

Exposes the ASGI callable as a module-level variable named ``application``.
Routes HTTP requests to Django and WebSocket connections to Django Channels.
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'whispr.settings')

# Initialize Django ASGI application early to ensure AppRegistry is loaded
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import app.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            app.routing.websocket_urlpatterns
        )
    ),
})
