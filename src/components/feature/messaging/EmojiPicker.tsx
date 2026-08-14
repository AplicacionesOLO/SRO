import { useState } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Caritas',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😔', '😢', '😭', '😤', '😡', '🤔', '🤨', '😴', '🤯', '😳', '🥺', '😬', '🙃', '😅', '🤗'],
  },
  {
    label: 'Gestos',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '👌', '✌️', '🤞', '👋', '🤙', '👊', '✊', '👆', '👇'],
  },
  {
    label: 'Objetos',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💯', '✅', '❌', '⚠️', '🔥', '✨', '⭐', '🎉', '🎊', '🎁', '📌', '📎', '📅', '⏰', '💡', '🚀', '📦', '🏭', '🚚', '📄', '✉️', '📞'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [activeGroup, setActiveGroup] = useState(0);

  const current = EMOJI_GROUPS[activeGroup];

  return (
    <div className="absolute bottom-12 left-0 w-[280px] bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-gray-50">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setActiveGroup(i)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              i === activeGroup ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {g.emojis[0]}
          </button>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-8 gap-1 p-2 max-h-[168px] overflow-y-auto">
        {current.emojis.map((e) => (
          <button
            key={e}
            onClick={() => onSelect(e)}
            className="w-7 h-7 flex items-center justify-center text-lg rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}