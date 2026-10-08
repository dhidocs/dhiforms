import type { FieldType, RowType } from '../core'
import { useDraggable } from '@dnd-kit/core'
import { Text } from '@mantine/core'
import { useT } from '../react/labels'
import { addRowOfType, insertField, useDesigner } from './store'
import { fieldTypeInfo, fieldTypes, isFieldsRow, rowTypeInfo, rowTypes } from './model'
import classes from './designer.module.css'

function PaletteItem({ id, label, icon: Icon, onAdd, disabled }: { id: string; label: string; icon: any; onAdd: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })

  // Click or Enter adds the item next to the selection; dragging (pointer, or Space then arrow keys) drops it exactly where wanted.
  return (
    <button type="button" ref={setNodeRef} className={classes.paletteItem} data-dragging={isDragging} disabled={disabled} onClick={onAdd} {...attributes} {...listeners}>
      <Icon size={18} stroke={1.6} />
      {label}
    </button>
  )
}

export function Palette({ readOnly }: { readOnly: boolean }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const page = useDesigner((state) => state.page)
  const selection = useDesigner((state) => state.selection)

  const selectedRow = selection.kind === 'page' ? null : selection.row
  const targetsRow = selectedRow !== null && isFieldsRow(definition.pages[page]?.rows[selectedRow])

  return (
    <aside className={classes.palette} aria-label={t('designer.paletteAria')}>
      <section>
        <h2 className={classes.paneHeading}>{t('designer.rows')}</h2>
        <div className={classes.paletteList}>
          {rowTypes.map((type: RowType) => (
            <PaletteItem key={type} id={`palette-row:${type}`} label={rowTypeInfo[type].label} icon={rowTypeInfo[type].icon} disabled={readOnly} onAdd={() => addRowOfType(type)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className={classes.paneHeading}>{t('designer.fields')}</h2>
        <Text size="xs" c="dimmed" mb={8}>
          {targetsRow ? t('designer.clickAddsToRow') : t('designer.clickAddsNewRow')}
        </Text>
        <div className={classes.paletteList}>
          {fieldTypes.map((type: FieldType) => (
            <PaletteItem key={type} id={`palette-field:${type}`} label={fieldTypeInfo[type].label} icon={fieldTypeInfo[type].icon} disabled={readOnly} onAdd={() => insertField(type, targetsRow ? selectedRow : null)} />
          ))}
        </div>
      </section>
    </aside>
  )
}
