import './App.css'
import { ChatWidget } from './components/ChatWidget'

function App() {
  return (
    <>
      {/* Përfaqëson layout-in kryesor të faqes së ecommerce-it */}
      <main>
        {/* Këtu normalisht do të ishte përmbajtja e faqes / produktet */}
      </main>

      {/* Widget-i i chat-it, prezent në krejt faqen */}
      <ChatWidget
        storeName="ProteinPlus"
        primaryColor="#dc2626"
        primaryColorDark="#b91c1c"
      />
    </>
  )
}

export default App
