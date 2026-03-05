type ChatHeaderProps = {
  onClose: () => void
  title?: string
  subtitle?: string
}

export function ChatHeader({
  onClose,
  title = 'Chat me asistentin',
  subtitle = 'Zakonisht përgjigjemi për disa sekonda',
}: ChatHeaderProps) {
  return (
    <header className="chat-widget__header">
      <div className="chat-widget__header-text">
        <span className="chat-widget__title">{title}</span>
        {subtitle && <span className="chat-widget__subtitle">{subtitle}</span>}
      </div>
      <button
        type="button"
        className="chat-widget__close"
        onClick={onClose}
        aria-label="Mbyll chatin"
      >
        ×
      </button>
    </header>
  )
}
