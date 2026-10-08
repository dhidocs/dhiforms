import { Badge } from '@mantine/core'
import type { FormStatus } from '../core'
import { useT } from '../react/labels'

const statusBadges = {
  draft: { labelKey: 'designer.statusDraft', color: 'yellow' },
  awaiting_dev: { labelKey: 'designer.statusAwaitingDev', color: 'blue' },
  published: { labelKey: 'designer.statusPublished', color: 'green' },
  archived: { labelKey: 'designer.statusArchived', color: 'gray' },
} as const

export function FormStatusBadge({ status }: { status: FormStatus }) {
  const t = useT()
  return <Badge color={statusBadges[status].color}>{t(statusBadges[status].labelKey)}</Badge>
}
