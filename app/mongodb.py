import os
import uuid
from datetime import datetime, timezone
import logging
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from django.conf import settings

logger = logging.getLogger(__name__)

_mongo_client = None
_mongo_db = None


def get_mongo_settings():
    """Retrieve MongoDB URI and DB name from settings or environment."""
    mongo_uri = getattr(
        settings,
        'MONGODB_URI',
        os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
    )
    db_name = getattr(
        settings,
        'MONGODB_DB_NAME',
        os.getenv('MONGODB_DB_NAME', 'whispr')
    )
    return mongo_uri, db_name


def get_mongo_client():
    """Returns a cached MongoClient instance (or mongomock if configured)."""
    global _mongo_client
    if _mongo_client is not None:
        return _mongo_client

    mongo_uri, _ = get_mongo_settings()
    use_mock = getattr(settings, 'USE_MONGOMOCK', False) or os.getenv('USE_MONGOMOCK', 'false').lower() == 'true'

    if use_mock:
        try:
            import mongomock
            logger.info("Using mongomock for MongoDB storage.")
            _mongo_client = mongomock.MongoClient()
            return _mongo_client
        except ImportError:
            logger.warning("mongomock requested but not installed. Falling back to real MongoClient.")

    try:
        _mongo_client = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
        )
        # Verify connection
        _mongo_client.admin.command('ping')
        logger.info(f"Connected to MongoDB at {mongo_uri}")
    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        logger.warning(f"Could not connect to live MongoDB ({exc}). Falling back to in-memory mongomock for graceful dev/testing.")
        try:
            import mongomock
            _mongo_client = mongomock.MongoClient()
        except ImportError:
            # Re-raise if mongomock is unavailable
            raise exc

    return _mongo_client


def get_db():
    """Returns the MongoDB database instance and ensures indexes exist."""
    global _mongo_db
    if _mongo_db is not None:
        return _mongo_db

    _, db_name = get_mongo_settings()
    client = get_mongo_client()
    _mongo_db = client[db_name]

    # Ensure indexes
    try:
        _mongo_db.messages.create_index([("room_id", ASCENDING), ("date", ASCENDING)])
        _mongo_db.messages.create_index([("id", ASCENDING)], unique=True)
        _mongo_db.chats.create_index([("room_id", ASCENDING)], unique=True)
        _mongo_db.chats.create_index([("participants", ASCENDING)])
    except Exception as e:
        logger.debug(f"Index creation note: {e}")

    return _mongo_db


def generate_direct_room_id(user1: str, user2: str) -> str:
    """
    Generate room identifier for direct chat between two users.
    Matches the frontend's alphabetical concatenation scheme.
    """
    combined = (user1 or '') + (user2 or '')
    return "".join(sorted(combined))


def save_message(room_id: str, sender_id: str, text: str, recipient_id: str = None, message_id: str = None, date: str = None):
    """
    Saves a chat message into MongoDB and updates the corresponding chat conversation.
    Returns the message dictionary.
    """
    db = get_db()
    msg_id = message_id or str(uuid.uuid4())
    now_iso = date or datetime.now(timezone.utc).isoformat()

    message_doc = {
        "id": msg_id,
        "room_id": room_id,
        "senderId": sender_id,
        "recipientId": recipient_id,
        "text": text,
        "date": now_iso,
        "created_at": datetime.now(timezone.utc),
    }

    # Insert into messages collection
    db.messages.insert_one(message_doc.copy())

    # Update or create chat conversation
    participants = [sender_id]
    if recipient_id and recipient_id not in participants:
        participants.append(recipient_id)

    db.chats.update_one(
        {"room_id": room_id},
        {
            "$set": {
                "room_id": room_id,
                "last_message": {
                    "id": msg_id,
                    "text": text,
                    "senderId": sender_id,
                    "date": now_iso,
                },
                "updated_at": datetime.now(timezone.utc),
            },
            "$addToSet": {
                "participants": {"$each": participants}
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc),
                "room_type": "world" if room_id == "world" else "direct",
            }
        },
        upsert=True
    )

    # Return clean serializable message dict
    return {
        "id": msg_id,
        "room_id": room_id,
        "senderId": sender_id,
        "recipientId": recipient_id,
        "text": text,
        "date": now_iso,
    }


def get_messages(room_id: str, limit: int = 200, skip: int = 0):
    """
    Retrieves messages for a given room sorted chronologically.
    Returns list of message dictionaries.
    """
    db = get_db()
    cursor = db.messages.find(
        {"room_id": room_id},
        {"_id": 0}
    ).sort("created_at", ASCENDING).skip(skip).limit(limit)

    return list(cursor)


def get_chat_conversation(room_id: str):
    """Retrieves chat conversation metadata by room_id."""
    db = get_db()
    doc = db.chats.find_one({"room_id": room_id}, {"_id": 0})
    return doc


def get_user_conversations(username: str):
    """Retrieves all chat conversations where username is a participant."""
    db = get_db()
    cursor = db.chats.find(
        {"participants": username},
        {"_id": 0}
    ).sort("updated_at", DESCENDING)
    return list(cursor)


def get_all_chats():
    """Retrieves all chat rooms/conversations."""
    db = get_db()
    cursor = db.chats.find({}, {"_id": 0}).sort("updated_at", DESCENDING)
    return list(cursor)


def check_mongo_connection():
    """
    Returns connection status and basic statistics.
    """
    try:
        client = get_mongo_client()
        _, db_name = get_mongo_settings()
        db = client[db_name]
        is_mock = "mongomock" in type(client).__module__
        msg_count = db.messages.count_documents({})
        chat_count = db.chats.count_documents({})
        return {
            "status": "connected",
            "is_mock": is_mock,
            "database": db_name,
            "message_count": msg_count,
            "chat_count": chat_count,
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
