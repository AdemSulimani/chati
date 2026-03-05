import type { Message } from './types'

type MessageBubbleProps = {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const modifier =
    message.type === 'user' ? 'chat-widget__message--user' : 'chat-widget__message--bot'
  return (
    <div className={`chat-widget__message ${modifier}`}>
      <div className="chat-widget__bubble">{message.text}</div>
    </div>
  )
}
