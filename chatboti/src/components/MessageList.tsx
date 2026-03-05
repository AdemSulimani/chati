import { useEffect, useRef } from 'react'
import type { Message } from './types'
import { MessageBubble } from './MessageBubble'

type MessageListProps = {
  messages: Message[]
  isTyping?: boolean
}

export function MessageList({ messages, isTyping }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={containerRef} className="chat-widget__messages">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isTyping && (
        <div className="chat-widget__typing">
          <div className="chat-widget__typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <span className="chat-widget__typing-label">Asistenti po shkruan…</span>
        </div>
      )}
    </div>
  )
}
