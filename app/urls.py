from django.urls import path
from .views import MessageAPIView,UserSignupView

app_name = 'app'

urlpatterns = [
    path('messages/',MessageAPIView.as_view()),
    path('signup/',UserSignupView.as_view(),name='signup'),
]