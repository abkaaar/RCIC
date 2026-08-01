/**
 * Client API/WS endpoints.
 * Prefer VITE_* overrides; otherwise same-origin so Vite proxy (dev) or nginx (Docker) can forward.
 */
const secure = typeof location !== 'undefined' && location.protocol === 'https:'
const host = typeof location !== 'undefined' ? location.hostname : 'localhost'
const protoHttp = secure ? 'https' : 'http'
const protoWs = secure ? 'wss' : 'ws'

const envApi = import.meta.env.VITE_API_URL as string | undefined
const envWs = import.meta.env.VITE_WS_URL as string | undefined

/** Empty string = same-origin relative fetch (Docker nginx / Vite proxy). */
export const API_URL =
  envApi && envApi.length > 0 ? envApi.replace(/\/$/, '') : typeof location !== 'undefined' ? location.origin : `${protoHttp}://${host}`

export const WS_URL =
  envWs && envWs.length > 0
    ? envWs.replace(/\/$/, '')
    : typeof location !== 'undefined'
      ? `${protoWs}://${location.host}/yjs`
      : `${protoWs}://${host}/yjs`
