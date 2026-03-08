import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/context'
import { AuthProvider } from './auth/AuthContext'
import RegistrationModal from './components/RegistrationModal'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
        <RegistrationModal />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
