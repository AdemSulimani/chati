import { useState, useCallback } from 'react'
import type { Message } from './types'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'

const QUICK_REPLIES = [
  { id: 'qr-products', label: 'Produktet', text: 'Mund të më tregoni më shumë për produktet?' },
  { id: 'qr-stock', label: 'Stoku', text: 'A është ky produkt në stok?' },
  { id: 'qr-shipping', label: 'Shipping', text: 'Sa kushton dhe sa zgjat shipping-u?' },
  { id: 'qr-returns', label: 'Kthimet', text: 'Cila është politika e kthimeve?' },
  { id: 'qr-offers', label: 'Ofertat', text: 'A keni oferta aktuale?' },
]

function createInitialMessages(storeName?: string): Message[] {
  const greeting = storeName
    ? `Përshëndetje 👋, si mund të ju ndihmoj sot në ${storeName}?`
    : 'Përshëndetje 👋, si mund të ju ndihmoj sot?'

  return [
    {
      id: '1',
      type: 'bot',
      text: greeting,
      timestamp: Date.now(),
    },
  ]
}

type ChatWindowProps = {
  onClose: () => void
  storeName?: string
}

function nextId() {
  return String(Date.now())
}

export function ChatWindow({ onClose, storeName }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(() => createInitialMessages(storeName))
  const [isTyping, setIsTyping] = useState(false)

  const handleSend = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), type: 'user', text, timestamp: Date.now() },
      // Tani vetëm UI – përgjigje bot-i do shtohet me backend
    ])

    // Simulim i thjeshtë i gjendjes "Asistenti po shkruan..."
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
    }, 1200)
  }, [])

  return (
    <div className="chat-widget__popup" role="dialog" aria-label="Dritarja e chat-it">
      <ChatHeader
        onClose={onClose}
        title={storeName ? `Chat me asistentin e ${storeName}` : undefined}
      />
      <div className="chat-widget__body">
        {QUICK_REPLIES.length > 0 && (
          <div className="chat-widget__quick-replies">
            {QUICK_REPLIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chat-widget__quick-reply"
                onClick={() => handleSend(item.text)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <MessageList messages={messages} isTyping={isTyping} />
        <InputArea onSend={handleSend} autoFocus />
      </div>
    </div>
  )
}
