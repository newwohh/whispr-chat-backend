import json
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from channels.testing import WebsocketCommunicator

from whispr.asgi import application
from .models import User
from .mongodb import (
    save_message,
    get_messages,
    get_user_conversations,
    generate_direct_room_id,
    check_mongo_connection,
)


class MongoStorageTests(TestCase):
    def test_save_and_retrieve_messages(self):
        room = "test_room_storage"
        msg = save_message(
            room_id=room,
            sender_id="nevin",
            text="Hello test!",
            recipient_id="bob"
        )
        self.assertIsNotNone(msg.get("id"))
        self.assertEqual(msg["senderId"], "nevin")
        self.assertEqual(msg["text"], "Hello test!")

        messages = get_messages(room)
        self.assertGreaterEqual(len(messages), 1)
        self.assertEqual(messages[0]["text"], "Hello test!")

    def test_direct_room_id_generation(self):
        room1 = generate_direct_room_id("alice", "bob")
        room2 = generate_direct_room_id("bob", "alice")
        self.assertEqual(room1, room2)
        self.assertEqual(room1, "".join(sorted("alicebob")))

    def test_user_conversations(self):
        save_message("room_conv_1", "userA", "Hi B", recipient_id="userB")
        convs = get_user_conversations("userA")
        self.assertTrue(any(c["room_id"] == "room_conv_1" for c in convs))


class ChatAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="testuser@example.com",
            name="testuser",
            tc="True",
            password="testpassword123",
        )

    def test_health_check(self):
        url = reverse('app:health')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'healthy')
        self.assertTrue(response.data.get('websocket_support'))
        self.assertIn('mongodb', response.data)

    def test_world_messages_post_and_get(self):
        url = reverse('app:messages')
        payload = {
            'username': 'testuser',
            'message': 'Test world chat message'
        }
        post_res = self.client.post(url, payload, format='json')
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(post_res.data.get('text'), 'Test world chat message')

        get_res = self.client.get(url)
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(get_res.data.get('messages', [])) >= 1)

    def test_room_chat_messages(self):
        room_id = "general_discussion"
        url = reverse('app:chat_messages', kwargs={'room_id': room_id})

        post_res = self.client.post(url, {
            'senderId': 'testuser',
            'text': 'Hello room!',
        }, format='json')
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)

        get_res = self.client.get(url)
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['room_id'], room_id)
        self.assertTrue(any(m['text'] == 'Hello room!' for m in get_res.data['messages']))

    def test_direct_messages_api(self):
        url = reverse('app:direct_messages', kwargs={'other_user': 'recipient_user'})
        post_res = self.client.post(url, {
            'senderId': 'testuser',
            'text': 'Private DM',
        }, format='json')
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(post_res.data['status'], 'success')

        get_res = self.client.get(url + '?user=testuser')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(m['text'] == 'Private DM' for m in get_res.data['messages']))

    def test_signup_and_login(self):
        signup_url = reverse('app:signup')
        signup_payload = {
            'email': 'newguy@example.com',
            'name': 'newguy',
            'password': 'Password123!',
            'password2': 'Password123!',
            'tc': 'True',
        }
        res_signup = self.client.post(signup_url, signup_payload, format='json')
        self.assertEqual(res_signup.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', res_signup.data)

        login_url = reverse('app:login')
        login_payload = {
            'email': 'newguy@example.com',
            'password': 'Password123!',
        }
        res_login = self.client.post(login_url, login_payload, format='json')
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)
        self.assertEqual(res_login.data.get('msg'), 'login success')


class WebSocketTests(TestCase):
    async def test_websocket_connection_and_messaging(self):
        communicator = WebsocketCommunicator(application, "/ws/chat/testroom/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Expect welcome message
        welcome_response = await communicator.receive_json_from()
        self.assertEqual(welcome_response.get("type"), "connection_established")
        self.assertEqual(welcome_response.get("room"), "testroom")

        # Test ping/pong
        await communicator.send_json_to({"type": "ping"})
        pong_response = await communicator.receive_json_from()
        self.assertEqual(pong_response.get("type"), "pong")

        # Test sending a message
        await communicator.send_json_to({
            "type": "chat_message",
            "senderId": "socket_user",
            "text": "WebSocket is real-time!"
        })
        msg_broadcast = await communicator.receive_json_from()
        self.assertEqual(msg_broadcast.get("type"), "chat_message")
        self.assertEqual(msg_broadcast.get("text"), "WebSocket is real-time!")
        self.assertEqual(msg_broadcast.get("senderId"), "socket_user")

        # Disconnect
        await communicator.disconnect()
