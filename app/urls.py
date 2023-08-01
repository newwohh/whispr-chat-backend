from django.urls import path
from .views import MessageAPIView,UserSignupView,UserLoginView

app_name = 'app'

urlpatterns = [
    path('messages/',MessageAPIView.as_view(),name="messages"),
    path('signup/',UserSignupView.as_view(),name='signup'),
    path('login/',UserLoginView.as_view(),name='login'),
]
