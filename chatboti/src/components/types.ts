export type Message = {
  id: string
  type: 'user' | 'bot'
  text: string
  timestamp?: number
}
