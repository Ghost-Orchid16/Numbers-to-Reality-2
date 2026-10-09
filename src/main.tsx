import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

function App() {
  return <h1 className="text-4xl">NUMBERS → REALITY</h1>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
