export interface UserRecord {
  id: number;
  email: string;
  name: string;
  password: string;
  tc: string | null;
  is_active: number | boolean;
  is_admin: number | boolean;
  created_at: string;
  updated_at: string;
  last_login?: string | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  senderId: string;
  recipientId?: string | null;
  text: string;
  date: string;
  created_at?: Date | string;
}

export interface ChatConversation {
  room_id: string;
  room_type?: string;
  participants: string[];
  last_message?: {
    id: string;
    text: string;
    senderId: string;
    date: string;
  };
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface WebSocketSessionData {
  room: string;
  topic: string;
  sessionId: string;
}
