/**
 * ImagePopup - 拍立得风格的图片弹窗
 */
interface ImagePopupProps {
  src: string
  title?: string
  onClose: () => void
}

export function ImagePopup({ src, title, onClose }: ImagePopupProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: 9999 }}
      onClick={onClose}
    >
      {/* 拍立得卡片 */}
      <div
        className="relative rounded-lg shadow-2xl"
        style={{
          padding: '12px 12px 48px 12px',
          maxWidth: '85vw',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-secondary)',
          animation: 'popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 图片容器 */}
        <div
          className="flex items-center justify-center rounded"
          style={{
            minWidth: '120px',
            minHeight: '80px',
            maxWidth: '80vw',
            maxHeight: '75vh',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <img
            src={src}
            alt={title}
            className="block"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
        
        {/* 底部标题区域 */}
        {title && (
          <div
            className="absolute bottom-0 left-0 right-0 text-center text-sm truncate"
            style={{ 
              padding: '8px 12px',
              maxWidth: '100%',
              color: 'var(--text-secondary)',
            }}
            title={title}
          >
            {title}
          </div>
        )}
        
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center hover:shadow-lg transition-all"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          ✕
        </button>
      </div>
      
      <style>{`
        @keyframes popIn {
          0% {
            opacity: 0;
            transform: scale(0.8) rotate(-3deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }
      `}</style>
    </div>
  )
}
