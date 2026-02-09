import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AdminEntry from './AdminEntry.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminEntry />
  </StrictMode>,
)
