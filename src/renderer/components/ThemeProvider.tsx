import { useEffect, createContext, useContext, type ReactNode } from 'react'
import { useAppStore } from '../stores/app-store'

const darkTheme = {
  bgPrimary: '#353535',
  bgSecondary: '#292929',
  bgTertiary: '#3a3a3a',
  bgHover: '#404040',
  bgActive: '#1f6feb22',
  bgCard: '#292929',
  bgInputField: '#3a3a3a',
  bgSearch: '#494949',
  bgTag: '#37a1e4',
  bgTagText: '#ffffff',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textHint: '#6e7681',
  textTitle: '#e6edf3',
  accent: '#1f6feb',
  accentHover: '#388bfd',
  accentGlow: '#1f6feb44',
  accentLight: '#1f6feb22',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  inactive: '#484f58',
  border: '#484848',
  borderLight: '#3a3a3a',
  borderMsg: '#ffffff45',
  borderInput: '#ffffff45'
}

const lightTheme = {
  bgPrimary: '#F0F2F5',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#F1F3F5',
  bgHover: '#F0F4FF',
  bgActive: '#EFF6FF',
  bgCard: '#FFFFFF',
  bgInputField: '#F1F3F5',
  bgSearch: '#E8EAED',
  bgTag: '#A8D8EA',
  bgTagText: '#2B4C6F',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textHint: '#9CA3AF',
  textTitle: '#1F2937',
  accent: '#3B82F6',
  accentHover: '#2563EB',
  accentGlow: '#3B82F622',
  accentLight: '#EFF6FF',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  inactive: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderMsg: '#45454545',
  borderInput: '#45454545'
}

type ThemeVars = typeof darkTheme

const ThemeContext = createContext<ThemeVars>(darkTheme)

export function useTheme(): ThemeVars {
  return useContext(ThemeContext)
}

function applyTheme(theme: 'dark' | 'light'): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useAppStore((s) => s.theme)
  const themeVars = theme === 'dark' ? darkTheme : lightTheme

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={themeVars}>
      {children}
    </ThemeContext.Provider>
  )
}
