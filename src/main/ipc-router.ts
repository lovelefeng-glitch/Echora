import { ipcMain, BrowserWindow } from 'electron'
import type {
  IpcHandleChannels,
  IpcOnChannels,
  IpcPushChannels,
  IpcChannelName
} from '../shared/ipc-types'

type ExtractRequestArray<T extends keyof IpcHandleChannels> =
  IpcHandleChannels[T]['request'] extends void
    ? []
    : IpcHandleChannels[T]['request'] extends unknown[]
      ? IpcHandleChannels[T]['request']
      : []

type HandleHandler<T extends keyof IpcHandleChannels> = (
  ...args: ExtractRequestArray<T>
) => Promise<IpcHandleChannels[T]['response']> | IpcHandleChannels[T]['response']

type OnHandler<T extends keyof IpcOnChannels> = (
  params: IpcOnChannels[T]['params']
) => void

interface IpcRouterOptions {
  getWindow: () => BrowserWindow | null
}

export class IpcRouter {
  private getWindow: () => BrowserWindow | null
  private registered = new Set<string>()

  constructor(options: IpcRouterOptions) {
    this.getWindow = options.getWindow
  }

  handle<T extends keyof IpcHandleChannels>(
    channel: T,
    handler: HandleHandler<T>
  ): void {
    if (this.registered.has(channel)) {
      throw new Error(`IPC channel "${channel}" is already registered`)
    }
    this.registered.add(channel)

    ipcMain.handle(channel, async (_event, ...args) => {
      return (handler as (...a: unknown[]) => unknown)(...args)
    })
  }

  on<T extends keyof IpcOnChannels>(
    channel: T,
    handler: OnHandler<T>
  ): void {
    if (this.registered.has(channel)) {
      throw new Error(`IPC channel "${channel}" is already registered`)
    }
    this.registered.add(channel)

    ipcMain.on(channel, (_event, params: IpcOnChannels[T]['params']) => {
      handler(params)
    })
  }

  send<T extends keyof IpcPushChannels>(
    channel: T,
    data: IpcPushChannels[T]
  ): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send(channel, data)
      } catch {
      }
    }
  }

  removeHandler(channel: IpcChannelName): void {
    if (this.registered.has(channel)) {
      this.registered.delete(channel)
      ipcMain.removeHandler(channel)
    }
  }

  removeAllHandlers(): void {
    for (const channel of this.registered) {
      ipcMain.removeHandler(channel)
    }
    this.registered.clear()
  }

  hasChannel(channel: string): boolean {
    return this.registered.has(channel)
  }

  getRegisteredChannels(): string[] {
    return Array.from(this.registered)
  }
}
