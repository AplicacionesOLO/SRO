import { useState } from 'react';
import type { ChatSession, ChatMessage } from '../../../types/chat';
import SROAssistantHeader from './SROAssistantHeader';
import SROAssistantMessageList from './SROAssistantMessageList';
import SROAssistantInput from './SROAssistantInput';

interface SROAssistantPanelProps {
  session: ChatSession | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  userName?: string;
  onSend: (question: string) => void;
  onClose: () => void;
  onNewSession: () => void;
  onClearError: () => void;
}

export default function SROAssistantPanel({
  session,
  messages,
  loading,
  sending,
  error,
  userName,
  onSend,
  onClose,
  onNewSession,
  onClearError,
}: SROAssistantPanelProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    if (!session) {
      onNewSession();
      setTimeout(() => onSend(q), 300);
    } else {
      onSend(q);
    }
  };

  const handleSuggest = (q: string) => {
    setInput('');
    if (!session) {
      onNewSession();
      setTimeout(() => onSend(q), 300);
    } else {
      onSend(q);
    }
  };

  const title = session?.title || 'SRObot';

  const panelContent = (
    <>
      <SROAssistantHeader
        title={title}
        onClose={onClose}
        onNewSession={onNewSession}
        sending={sending}
      />
      <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
        <SROAssistantMessageList
          messages={messages}
          loading={loading}
          sending={sending}
          userName={userName}
          onSuggest={handleSuggest}
        />
      </div>
      {error && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex-shrink-0">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          <span className="flex-1">{error}</span>
          <button onClick={onClearError} className="text-red-400 hover:text-red-700 cursor-pointer flex-shrink-0">
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}
      <SROAssistantInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        sending={sending}
        disabled={false}
      />
    </>
  );

  return (
    <>
      {/* Desktop */}
      <div
        className="hidden sm:flex fixed bottom-20 right-6 z-[9999] flex-col rounded-2xl overflow-hidden"
        style={{
          width: '400px',
          height: '72vh',
          maxHeight: '640px',
          minHeight: '400px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {panelContent}
      </div>
      {/* Mobile */}
      <div className="sm:hidden fixed inset-0 z-[9999] flex flex-col bg-white">
        {panelContent}
      </div>
    </>
  );
}
