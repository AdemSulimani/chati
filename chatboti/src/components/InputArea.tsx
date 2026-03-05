import { useState, type FormEvent, type KeyboardEvent } from 'react'

type InputAreaProps = {
  onSend: (text: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function InputArea({
  onSend,
  placeholder = 'Shkruaj pyetjen tënde...',
  autoFocus,
}: InputAreaProps) {
  const [value, setValue] = useState('')

  function doSend() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    doSend()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    }
  }

  return (
    <form className="chat-widget__input" onSubmit={handleSubmit}>
      <textarea
        className="chat-widget__input-field"
        placeholder={placeholder}
        aria-label="Shkruaj mesazhin"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        autoFocus={autoFocus}
      />
      <button type="submit" className="chat-widget__send-button">
        Send
      </button>
    </form>
  )
}
