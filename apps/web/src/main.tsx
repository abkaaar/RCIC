import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyStoredAccent } from './theme'
import './styles.css'

applyStoredAccent()

createRoot(document.getElementById('root')!).render(<App />)
