import { useState, type CSSProperties } from 'react'
import './ChatWidget.css'
import { LauncherButton } from './LauncherButton'
import { ChatWindow } from './ChatWindow'

type ChatWidgetProps = {
  storeName?: string
  primaryColor?: string
  primaryColorDark?: string
}

export function ChatWidget({ storeName, primaryColor, primaryColorDark }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)

  const themeStyle: CSSProperties = {
    ...(primaryColor && { '--chat-widget-color-primary': primaryColor }),
    ...(primaryColorDark && { '--chat-widget-color-primary-dark': primaryColorDark }),
  } as CSSProperties

  return (
    <div className="chat-widget" aria-live="polite" style={themeStyle}>
      <LauncherButton onClick={() => setIsOpen((prev) => !prev)} isOpen={isOpen} />
      {isOpen && <ChatWindow onClose={() => setIsOpen(false)} storeName={storeName} />}
    </div>
  )
}
