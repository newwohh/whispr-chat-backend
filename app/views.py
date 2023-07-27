from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from .pusher import pusher_client
from rest_framework_simplejwt.tokens import RefreshToken
from .renderers import UserRenderer
from .serializers import UserRegistrationSerializer


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh':str(refresh),
        'access':str(refresh.access_token)
    }

class MessageAPIView(APIView):
    def post(self,request):
        pusher_client.trigger('whispr', 'message', {
            'username': request.data['username'],
            'message':request.data['message'],            
        })
        print(Response([]))
        return Response([])


class UserSignupView(APIView):
    renderer_classes = [UserRenderer]
    def post(self, request, format=None):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = get_tokens_for_user(user)
        return Response({'token':token,'message':"success"},status=status.HTTP_201_CREATED)