import os
import uuid
import json
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI, OpenAIError

# Create Flask app. 
# We serve frontend static assets directly from the 'frontend' directory.
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)  # Enable CORS for cross-origin development

# ==========================================
# OPENAI CONFIGURATION
# ==========================================
# Hardcode your OpenAI API key here as requested.
# Replace "YOUR_OPENAI_API_KEY" with your actual key (starts with "sk-...").
OPENAI_API_KEY = "AQ.Ab8RN6LbPTU8mYkpE1pD7Vk9esI0ubPQ-lHHh-rxyqVl0P3o_A"

# File path to save conversations
CONVERSATIONS_FILE = os.path.join(os.path.dirname(__file__), 'conversations.json')

def load_conversations():
    """Load conversations from the local JSON file."""
    if not os.path.exists(CONVERSATIONS_FILE):
        return []
    try:
        with open(CONVERSATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        app.logger.error(f"Error loading conversations: {e}")
        return []

def save_conversations(conversations):
    """Save conversations to the local JSON file."""
    try:
        with open(CONVERSATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(conversations, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        app.logger.error(f"Error saving conversations: {e}")
        return False

# Serve the static index.html at root
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Handle a user message, query OpenAI (or fallback to simulated response),
    log the interaction, and return the response.
    """
    try:
        data = request.json or {}
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id', '').strip()
        metadata = data.get('metadata', {})

        if not user_message:
            return jsonify({"error": "Message content is required"}), 400

        # Generate a new session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())

        # Initialize chatbot response variables
        bot_response = ""
        is_simulated = False
        
        # Determine model and API base URL dynamically
        # Detect Google AI Studio keys (starting with AQ. or AIzaSy)
        is_gemini = OPENAI_API_KEY.startswith("AQ.") or OPENAI_API_KEY.startswith("AIzaSy")
        model_used = "gemini-3.5-flash" if is_gemini else "gpt-4o-mini"

        # Check if API Key is configured
        if not OPENAI_API_KEY or OPENAI_API_KEY == "YOUR_OPENAI_API_KEY":
            is_simulated = True
            bot_response = (
                "👋 Hello from Smart AI! I'm running in **Demo Mode** because your OpenAI API Key is "
                "not yet configured in `backend/app.py`.\n\n"
                "Please replace standard credentials to start chatting with GPT-4.\n\n"
                f"**Here is your message formatted back to you:**\n> {user_message}"
            )
        else:
            try:
                # Initialize client dynamically
                if is_gemini:
                    client = OpenAI(
                        api_key=OPENAI_API_KEY,
                        base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
                    )
                else:
                    client = OpenAI(api_key=OPENAI_API_KEY)
                
                # Fetch history for this session to provide context
                history = load_conversations()
                session_history = [
                    conv for conv in history 
                    if conv.get('session_id') == session_id
                ]
                
                # Build messages array for chat completion context
                messages = [
                    {"role": "system", "content": "You are Smart AI, a helpful, intelligent, and advanced AI assistant."}
                ]
                
                # Add up to 10 historical turns
                for conv in session_history[-10:]:
                    messages.append({"role": "user", "content": conv.get('user_message')})
                    messages.append({"role": "assistant", "content": conv.get('bot_response')})
                
                # Add the current user message
                messages.append({"role": "user", "content": user_message})

                # API Call to OpenAI GPT model
                completion = client.chat.completions.create(
                    model=model_used,
                    messages=messages,
                    temperature=0.7
                )
                
                bot_response = completion.choices[0].message.content
                
            except OpenAIError as oai_err:
                app.logger.warning(f"OpenAI API error: {oai_err}. Falling back to Demo Mode.")
                is_simulated = True
                bot_response = (
                    "⚠️ **OpenAI API Key Error**: Failed to authenticate or communicate with OpenAI.\n\n"
                    f"*Details: {oai_err}*\n\n"
                    "I have automatically switched to **Demo Mode** so you can continue testing the interface.\n\n"
                    f"**Here is your message formatted back to you:**\n> {user_message}"
                )
            except Exception as inner_err:
                app.logger.error(f"Unexpected error during API call: {inner_err}")
                return jsonify({
                    "error": "An unexpected error occurred during processing."
                }), 500

        # Construct the conversation entry
        entry_id = str(uuid.uuid4())
        from datetime import timezone
        timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        
        # Build metadata dictionary
        entry_metadata = {
            "model": model_used if not is_simulated else "mock-model",
            "simulated": is_simulated,
            **metadata
        }

        conversation_entry = {
            "id": entry_id,
            "timestamp": timestamp,
            "user_message": user_message,
            "bot_response": bot_response,
            "session_id": session_id,
            "metadata": entry_metadata
        }

        # Load existing conversations, append the new one, and save
        conversations = load_conversations()
        conversations.append(conversation_entry)
        save_conversations(conversations)

        # Return response to client
        return jsonify({
            "id": entry_id,
            "session_id": session_id,
            "bot_response": bot_response,
            "timestamp": timestamp,
            "simulated": is_simulated
        }), 200

    except Exception as e:
        app.logger.error(f"Unhandled error in /api/chat: {e}")
        return jsonify({"error": "An internal server error occurred"}), 500

@app.route('/api/history/<session_id>', methods=['GET'])
def get_history(session_id):
    """Retrieve chat history for a specific session."""
    try:
        conversations = load_conversations()
        session_history = [
            conv for conv in conversations 
            if conv.get('session_id') == session_id
        ]
        # Sort session history by timestamp just in case
        session_history.sort(key=lambda x: x.get('timestamp', ''))
        return jsonify(session_history), 200
    except Exception as e:
        app.logger.error(f"Error retrieving history for session {session_id}: {e}")
        return jsonify({"error": "Failed to retrieve history"}), 500

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Retrieve a summary of all active sessions, including the last message and timestamp."""
    try:
        conversations = load_conversations()
        
        sessions_dict = {}
        for conv in conversations:
            sid = conv.get('session_id')
            if not sid:
                continue
            
            msg_time = conv.get('timestamp', '')
            user_msg = conv.get('user_message', '')
            
            # Keep track of the most recent message in the session
            if sid not in sessions_dict or msg_time > sessions_dict[sid]['timestamp']:
                sessions_dict[sid] = {
                    "session_id": sid,
                    "last_message": user_msg[:60] + "..." if len(user_msg) > 60 else user_msg,
                    "timestamp": msg_time
                }
        
        # Sort sessions by timestamp descending (newest first)
        sessions_list = list(sessions_dict.values())
        sessions_list.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return jsonify(sessions_list), 200
    except Exception as e:
        app.logger.error(f"Error retrieving sessions list: {e}")
        return jsonify({"error": "Failed to retrieve sessions"}), 500

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete all records of a specific session."""
    try:
        conversations = load_conversations()
        updated_conversations = [
            conv for conv in conversations 
            if conv.get('session_id') != session_id
        ]
        
        if len(conversations) == len(updated_conversations):
            return jsonify({"message": "Session not found", "deleted_count": 0}), 404
        
        save_conversations(updated_conversations)
        return jsonify({
            "message": "Session deleted successfully", 
            "deleted_count": len(conversations) - len(updated_conversations)
        }), 200
    except Exception as e:
        app.logger.error(f"Error deleting session {session_id}: {e}")
        return jsonify({"error": "Failed to delete session"}), 500

@app.route('/api/chat/<message_id>', methods=['DELETE'])
def delete_message(message_id):
    """Delete a single conversation message pair by its unique ID."""
    try:
        conversations = load_conversations()
        updated_conversations = [
            conv for conv in conversations 
            if conv.get('id') != message_id
        ]
        
        if len(conversations) == len(updated_conversations):
            return jsonify({"message": "Message not found", "deleted": False}), 404
        
        save_conversations(updated_conversations)
        return jsonify({
            "message": "Message deleted successfully", 
            "deleted": True
        }), 200
    except Exception as e:
        app.logger.error(f"Error deleting message {message_id}: {e}")
        return jsonify({"error": "Failed to delete message"}), 500

if __name__ == '__main__':
    # Run the server on port 5000
    print("Starting Smart AI Chatbot Flask server on http://127.0.0.1:5000...")
    app.run(debug=True, port=5000)
