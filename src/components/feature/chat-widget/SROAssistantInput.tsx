import { useRef } from 'react';

interface SROAssistantInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  sending: boolean;
  disabled: boolean;
}

export default function SROAssistantInput({
  value,
  onChange,
  onSubmit,
  sending,
  disabled,
}: SROAssistantInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };

  return (
    <div className="px-3 py-3 bg-white border-t border-gray-200 flex-shrink-0 rounded-b-2xl">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Hacé tu pregunta..."
          rows={1}
          disabled={disabled || sending}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl resize-none focus:outline-none focus:border-teal-500 disabled:opacity-60 bg-gray-50"
          style={{ maxHeight: '96px', overflow: 'auto' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || sending || disabled}
          className="w-9 h-9 flex items-center justify-center bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 cursor-pointer flex-shrink-0 transition-colors"
        >
          {sending ? (
            <i className="ri-loader-4-line animate-spin text-sm"></i>
          ) : (
            <i className="ri-send-plane-fill text-sm"></i>
          )}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter nueva línea</p>
    </div>
  );
}
