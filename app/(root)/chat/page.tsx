'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useZero } from '@/lib/zero/zero';
import { type Schema } from '@/lib/zero/config';
import { useQuery } from '@rocicorp/zero/react';

interface ChatEvent { id: string; name: string | null; createdAt: string; }
interface Message {
  id: string;
  userId: string;
  usernameDisplay: string;
  eventId: string;
  text: string;
  replyToMessageId: string | null;
  isDeleted: boolean;
  createdAt: number;
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const { zeroInstance, isConnected: isZeroConnected, isLoading: isZeroLoading, error: zeroError } = useZero(); // Get Zero state from your Provider
  const [currentEvent, setCurrentEvent] = useState<ChatEvent | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null); // For replies

  const messagesEndRef = useRef<HTMLDivElement>(null); // For auto-scrolling

  // --- Step 1: Fetch Current Active Event ---
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/chat/events/active')
        .then(res => {
          if (!res.ok) {
            return res.json().catch(() => ({ message: `HTTP error ${res.status}` }))
              .then(errBody => { throw new Error(errBody.message || `Failed to fetch active event: ${res.status}`); });
          }
          return res.json();
        })
        .then(eventData => {
          setCurrentEvent(eventData);
        })
        .catch(err => console.error("Error fetching active event:", err));
    }
  }, [status]); // Fetch when auth status changes


  useEffect(() => {
    if (currentEvent?.id) {
      // Fetch initial messages using the API route
      fetch(`/api/chat/messages/${currentEvent.id}?limit=50`) // Adjust limit as needed
        .then(res => {
          if (!res.ok) {
            return res.json().catch(() => ({ message: `HTTP error ${res.status}` }))
              .then(errBody => { throw new Error(errBody.message || `Failed to fetch initial messages: ${res.status}`); });
          }
          return res.json();
        })
        .then(messagesData => {
          // Convert DB timestamp (Date object) to Zero timestamp (number) if necessary
          const formattedMessages = messagesData.messages.map((msg: any) => ({
            ...msg,
            createdAt: new Date(msg.createdAt).getTime(), // Convert Date to timestamp number
            usernameDisplay: msg.user.displayName || msg.user.username || 'User', // Get username from joined user data
          }));
          setInitialMessages(formattedMessages.reverse()); // Reverse to show newest at bottom if API orders oldest first
        })
        .catch(err => console.error("Error fetching initial messages:", err));
    }
  }, [currentEvent?.id]); // Fetch when current event changes


  const [realtimeMessages] = useQuery(zeroInstance?.query.messages, [zeroInstance]); // Subscribe to the entire messages map/table

  const combinedMessages = useMemo(() => {
    if (!currentEvent?.id) return [];

    // Filter Zero messages by current event and sort by timestamp
    const zeroEventMessages = Object.values(realtimeMessages || {}) // `realtimeMessages` is a map if messages is a table
      .filter((msg: any) => msg.eventId === currentEvent.id && !msg.isDeleted)
      .sort((a: any, b: any) => a.createdAt - b.createdAt) as Message[]; // Ensure sorting by timestamp

    // Simple merging: Add initial messages that are NOT in Zero state (by ID)
    // This can be complex with pagination and message edits/deletes.
    // For a basic test, let's just show Zero messages if available for the current event.
    return zeroEventMessages;

    // More robust merging logic:
    // Use a Map to easily track messages by ID. Start with initial messages.
    // Add/Update messages from Zero state, overwriting initial ones if they exist.
    // Sort the final values array.
    // const messageMap = new Map<string, Message>();
    // initialMessages.forEach(msg => messageMap.set(msg.id, msg));
    // zeroEventMessages.forEach(msg => messageMap.set(msg.id, msg)); // Zero updates overwrite initial

    // return Array.from(messageMap.values()).sort((a, b) => a.createdAt - b.createdAt);

  }, [initialMessages, realtimeMessages, currentEvent?.id]); // Recompute when dependencies change


  // --- Auto-scroll to bottom ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [combinedMessages]); // Scroll when messages update


  // --- Handle Sending New Message ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeroInstance || !isZeroConnected || isSending || !newMessageText.trim() || !currentEvent?.id) {
      console.log("Cannot send message:", { zeroInstance, isZeroConnected, isSending, text: newMessageText, event: currentEvent });
      return; // Don't send if not ready
    }

    setIsSending(true);
    const text = newMessageText.trim();

    try {
      // Call the Zero mutator to add the message
      // This triggers the optimistic update on the client and the Push request to the server.
      await zeroInstance.mutate.addMessage({
        text: text,
        replyToId: replyToId, // Include replyToId if it's set
        eventId: currentEvent.id, // Pass current event ID
      });
      console.log("addMessage mutation sent.");
      setNewMessageText(''); // Clear input on success
      setReplyToId(null); // Clear reply state
    } catch (err: any) {
      console.error("Error sending message mutation:", err);
      // Zero mutator errors (from server validation/rate limits) should be caught here
      alert(`Failed to send message: ${err.message}`); // Show error to user
    } finally {
      setIsSending(false);
    }
  };

  // --- Handle Reply Click ---
  const handleReplyClick = (messageId: string, username: string) => {
    setReplyToId(messageId);
    // Optional: Focus the input field and maybe prepend "@username "
    setNewMessageText(`@${username} `);
    // Find the input element and focus it
    const inputElement = document.getElementById('messageInput');
    if (inputElement) {
      inputElement.focus();
    }
  };

  // --- Loading and Error States ---
  if (status === 'loading') {
    return <div>Loading authentication...</div>;
  }

  if (!session) {
    // Optional: Redirect to login
    return <div>Please sign in to join the chat.</div>;
  }

  if (isZeroLoading || !currentEvent) {
    return <div>Loading chat session...</div>;
  }

  if (zeroError) {
    return <div>Error connecting to chat: {zeroError.message}</div>;
  }

  if (!isZeroConnected) {
    return <div>Connecting to real-time chat...</div>;
  }

  if (!currentEvent) {
    // Fallback if event wasn't loaded or doesn't exist
    return <div>No active chat event found. Please ask an admin to create one.</div>;
  }


  // --- Render Chat UI ---
  return (
    <div className="flex flex-col h-screen">
      <header className="bg-gray-800 text-white p-4 flex justify-between items-center">
        <h1 className="text-xl">Chat: {currentEvent.name || 'Live Event'}</h1>
        {/* Add user status, online count, etc. */}
        <span>{isZeroConnected ? 'Connected' : 'Disconnected'}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {combinedMessages.map((message) => (
          <div key={message.id} className={`flex items-start space-x-3 ${message.isDeleted ? 'opacity-50 italic' : ''}`}>
            {/* Optional: User Avatar */}
            {/* <img src="/path/to/default-avatar.png" alt="Avatar" className="w-8 h-8 rounded-full" /> */}
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">{message.usernameDisplay}</span>
                <span className="text-xs text-gray-500">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {message.isDeleted && <span className="text-xs text-red-500">(Deleted)</span>}
              </div>
              {message.replyToMessageId && (
                <div className="text-sm text-gray-600 border-l-2 border-gray-400 pl-2 mb-1">
                  Replying to: { /* Find and display replied-to message content/user */}
                  {/* This requires finding the parent message in combinedMessages */}
                  {combinedMessages.find(m => m.id === message.replyToMessageId)?.text || 'Deleted message'}
                </div>
              )}
              <p className="text-gray-800">{message.text}</p>
              {/* Reply button (if not deleted) */}
              {!message.isDeleted && (
                <button
                  onClick={() => handleReplyClick(message.id, message.usernameDisplay)}
                  className="text-xs text-blue-500 hover:underline mt-1"
                >
                  Reply
                </button>
              )}
              {/* Admin delete button (check if user is admin) */}
              {(session.user as any)?.role === 'admin' && !message.isDeleted && (
                <button
                  onClick={() => {
                    if (zeroInstance) {
                      zeroInstance.mutate.deleteMessage({ messageId: message.id })
                        .catch(err => alert(`Failed to delete message: ${err.message}`));
                    }
                  }}
                  className="text-xs text-red-500 hover:underline ml-2"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Area */}
      <div className="p-4 bg-gray-100">
        {replyToId && (
          <div className="text-sm text-gray-700 mb-2">
            Replying to: {combinedMessages.find(m => m.id === replyToId)?.text || '...'}{' '}
            <button onClick={() => setReplyToId(null)} className="text-red-500 text-xs ml-2">Cancel</button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <input
            id="messageInput" // Add ID for focus
            type="text"
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-gray-300 rounded-md shadow-sm p-2 disabled:opacity-50"
            disabled={!isZeroConnected || isSending || !currentEvent?.id}
          />
          <button
            type="submit"
            disabled={!isZeroConnected || isSending || !newMessageText.trim() || !currentEvent?.id}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}