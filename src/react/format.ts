import dayjs from 'dayjs'

// The one place the renderer formats dates, numbers, money and file sizes.

export const formatDate = (value?: string | null) => (value ? dayjs(value).format('D MMM YYYY') : '')
export const formatDateTime = (value?: string | null) => (value ? dayjs(value).format('D MMM YYYY, HH:mm') : '')
// Save times: the time alone when it is today, otherwise "6 Oct, 14:01".
export const formatSavedTime = (value?: string | null, now?: string) => (!value ? '' : dayjs(value).isSame(dayjs(now), 'day') ? dayjs(value).format('HH:mm') : dayjs(value).format('D MMM, HH:mm'))
export const formatNumber = (value?: number | null) => (value == null ? '' : value.toLocaleString('en-US'))
export const formatMoney = (value: number, currency?: string) => `${currency ? `${currency} ` : ''}${Math.round(value).toLocaleString('en-US')}`

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
