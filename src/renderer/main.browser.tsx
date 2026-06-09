/**
 * Browser entry point - 加载 mock API 后启动 React 应用
 * 用法: npx vite --config vite.browser.config.ts
 */
import './browser-mock'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/ThemeProvider'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
