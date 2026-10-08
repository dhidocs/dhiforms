import { localize, type FieldType, type RowType } from '../core'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors, type Announcements, type CollisionDetection } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState, type ReactNode } from 'react'
import { t } from '../react/labels'
import { fieldTypeInfo, isFieldsRow, rowTypeInfo } from './model'
import { addRowOfType, insertField, insertFieldInNewRow, moveField, moveFieldToNewRow, movePage, moveRow, useDesigner } from './store'
import classes from './designer.module.css'

// What each kind of dragged thing may be dropped on. Ids look like "row:2", "field:2:0", "palette-field:text"; "gap:2" is the space above row 2.
const dropTargets: Record<string, string[]> = {
  page: ['page'],
  row: ['row', 'end'],
  'palette-row': ['row', 'end'],
  field: ['field', 'row', 'end'],
  'palette-field': ['gap', 'field', 'row', 'end'],
}

const kindOf = (id: string | number) => String(id).split(':')[0]

const collision: CollisionDetection = (args) => {
  const allowed = dropTargets[kindOf(args.active.id)] ?? []
  const droppableContainers = args.droppableContainers.filter((container) => allowed.includes(kindOf(container.id)))
  const underPointer = pointerWithin({ ...args, droppableContainers })
  // A gap overlaps the edges of the rows around it, so a gap under the pointer wins over those rows.
  const gap = underPointer.find((collision) => kindOf(collision.id) === 'gap')
  if (gap) return [gap]
  return underPointer.length > 0 ? underPointer : closestCenter({ ...args, droppableContainers })
}

function isPastMiddle(active: any, over: any, axis: 'x' | 'y') {
  const moved = active.rect.current.translated
  if (!moved) return false
  if (axis === 'y') return moved.top + moved.height / 2 > over.rect.top + over.rect.height / 2
  return moved.left + moved.width / 2 > over.rect.left + over.rect.width / 2
}

function dropOnCanvas(event: any) {
  const { active, over } = event
  if (!over) return
  const { definition, page } = useDesigner.getState()
  const rows = definition.pages[page].rows
  const [kind, ...activeParts] = String(active.id).split(':')
  const [overKind, ...overParts] = String(over.id).split(':')
  const overRow = Number(overParts[0])
  const overField = Number(overParts[1])

  if (kind === 'page' && overKind === 'page') {
    if (active.id !== over.id) movePage(Number(activeParts[0]), overRow)
  }

  if (kind === 'row') {
    const from = Number(activeParts[0])
    if (overKind === 'end') moveRow(from, rows.length - 1)
    else if (from !== overRow) moveRow(from, overRow)
  }

  if (kind === 'palette-row') {
    const type = activeParts[0] as RowType
    if (overKind === 'end') addRowOfType(type, rows.length)
    else addRowOfType(type, isPastMiddle(active, over, 'y') ? overRow + 1 : overRow)
  }

  if (kind === 'field') {
    const fromRow = Number(activeParts[0])
    const fromField = Number(activeParts[1])
    if (overKind === 'field') {
      if (fromRow === overRow && fromField === overField) return
      const after = fromRow !== overRow && isPastMiddle(active, over, 'x')
      moveField(fromRow, fromField, overRow, after ? overField + 1 : overField)
    }
    if (overKind === 'row') {
      if (isFieldsRow(rows[overRow])) {
        if (overRow !== fromRow) moveField(fromRow, fromField, overRow, (rows[overRow] as any).fields.length)
      } else moveFieldToNewRow(fromRow, fromField, overRow + 1)
    }
    if (overKind === 'end') moveFieldToNewRow(fromRow, fromField, rows.length)
  }

  if (kind === 'palette-field') {
    const type = activeParts[0] as FieldType
    if (overKind === 'field') insertField(type, overRow, isPastMiddle(active, over, 'x') ? overField + 1 : overField)
    if (overKind === 'row') insertField(type, overRow)
    if (overKind === 'gap') insertFieldInNewRow(type, overRow)
    if (overKind === 'end') insertField(type, null)
  }
}

function overlayLabel(id: string) {
  const [kind, first, second] = id.split(':')
  const { definition, page } = useDesigner.getState()
  if (kind === 'end') return t('designer.endOfPage')
  if (kind === 'gap') return t('designer.newRowHere')
  if (kind === 'palette-field') return fieldTypeInfo[first as FieldType].label
  if (kind === 'palette-row') return rowTypeInfo[first as RowType].label
  if (kind === 'page') return localize(definition.pages[Number(first)]?.title) || t('designer.page')
  const row = definition.pages[page]?.rows[Number(first)]
  if (kind === 'row') return row ? rowTypeInfo[row.type].label : t('designer.row')
  return (isFieldsRow(row) ? localize(row.fields[Number(second)]?.label) : '') || t('designer.field')
}

// Space picks up and drops, so Enter stays free to click palette items and select fields and page tabs.
const keyboardCodes = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter', 'Tab'] }

// Screen reader messages name the item and target instead of dnd-kit's internal ids such as "row:2".
const announcements: Announcements = {
  onDragStart: ({ active }) => t('designer.dragPickedUp', { name: overlayLabel(String(active.id)) }),
  onDragOver: ({ active, over }) => (over ? t('designer.dragOver', { name: overlayLabel(String(active.id)), target: overlayLabel(String(over.id)) }) : t('designer.dragNotOver', { name: overlayLabel(String(active.id)) })),
  onDragEnd: ({ active, over }) => (over ? t('designer.dragDropped', { name: overlayLabel(String(active.id)), target: overlayLabel(String(over.id)) }) : t('designer.dragDroppedNowhere', { name: overlayLabel(String(active.id)) })),
  onDragCancel: ({ active }) => t('designer.dragCancelled', { name: overlayLabel(String(active.id)) }),
}

export function DesignerDnd({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes }))

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('designer.dragInstructions') } }}
      collisionDetection={collision}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(event) => {
        setActiveId(null)
        dropOnCanvas(event)
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>{activeId && <div className={classes.overlay}>{overlayLabel(activeId)}</div>}</DragOverlay>
    </DndContext>
  )
}
