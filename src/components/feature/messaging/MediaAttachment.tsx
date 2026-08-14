import { useState } from 'react';
import type { MessagingAttachment } from '@/types/messaging';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import MediaPreviewModal from './MediaPreviewModal';

interface MediaAttachmentProps {
  attachment: MessagingAttachment;
}

export default function MediaAttachment({ attachment }: MediaAttachmentProps) {
  const url = useSignedUrl(attachment.id);
  const [open, setOpen] = useState(false);
  const isImage = attachment.file_type?.startsWith('image/');

  if (!url) {
    return (
      <div className="w-48 h-32 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
        <i className="ri-loader-4-line text-emerald-500 animate-spin"></i>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-48 h-32 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group"
        title={attachment.file_name}
      >
        {isImage ? (
          <img src={url} alt={attachment.file_name} className="w-full h-full object-cover" />
        ) : (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}
        {!isImage && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <span className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <i className="ri-play-fill text-white text-2xl ml-0.5"></i>
            </span>
          </span>
        )}
      </button>

      {open && (
        <MediaPreviewModal
          url={url}
          type={isImage ? 'image' : 'video'}
          name={attachment.file_name}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}