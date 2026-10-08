import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconGripVertical } from '@tabler/icons-react'
import { useT } from '../react/labels'
import classes from './designer.module.css'

// A vertical drag-and-drop list that reports the new id order (option lists in the property panel).
export function SortableList({ ids, onReorder, children }: any) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const handleDragEnd = ({ active, over }: any) => {
    if (!over || active.id === over.id) return
    onReorder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

// `as` is the element or component to render (a string such as 'div' or Table.Tr); children receives the drag handle.
export function SortableItem({ id, as, className, children }: any) {
  const t = useT()
  const Element: any = as ?? 'div'
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })

  const handle = (
    <button type="button" ref={setActivatorNodeRef} className={classes.sortHandle} aria-label={t('admin.dragToReorder')} {...attributes} {...listeners}>
      <IconGripVertical size={16} />
    </button>
  )

  return (
    <Element ref={setNodeRef} className={className} data-dragging={isDragging} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children(handle)}
    </Element>
  )
}
