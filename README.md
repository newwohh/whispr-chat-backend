# Whispr 

This is the backend repository for Whispr, a real-time chat application developed using Python Django, Firebase, and Pusher. Whispr allows users to chat with each other in real-time, creating seamless communication experiences.

## Features

- Real-time messaging: Users can send and receive messages instantly, making communication fast and efficient.
- User Authentication: Whispr uses Firebase for user authentication, ensuring secure and reliable login/signup processes.
- Pusher Integration: Pusher is used for real-time updates and notifications, enabling smooth and responsive messaging.
- Database Storage: Firebase Firestore is utilized to store chat data, user profiles, and other relevant information.
- WebSocket Support: Pusher's WebSocket support ensures real-time messaging without the need for frequent HTTP requests.

## Technologies Used

- Python Django: A powerful web framework used for building the backend server and handling requests.
- Firebase: Google's cloud-based platform used for user authentication and database storage.
- Pusher: A service for building real-time applications and enabling seamless WebSocket communication.
- Other dependencies: (List any other major dependencies and their purpose, if applicable.)

## Getting Started

To set up the backend locally, follow these steps:

1. Clone this repository to your local machine.
2. Install the required dependencies using `pip` or your preferred package manager.
3. Set up a Firebase project and obtain the necessary API keys and credentials.
4. Configure your Firebase settings in the Django project to enable authentication and database access.
5. Set up a Pusher account and obtain the API keys.
6. Integrate Pusher into the Django project to enable real-time messaging.
7. Start the Django development server using the `manage.py` script.

## Contributing

Contributions to Whispr are welcome! If you'd like to contribute to the project, please follow these steps:

1. Fork the repository on GitHub.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with descriptive commit messages.
4. Push your branch to your forked repository.
5. Submit a pull request to the main repository.

We hope you enjoy using Whispr for your real-time chat needs! Happy chatting!
