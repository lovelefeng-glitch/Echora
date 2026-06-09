import type { ElectronAPI } from './index'

declare global {
  interface Window {
    echora: ElectronAPI
  }
}
