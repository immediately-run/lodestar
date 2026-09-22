// Desktop edit-mode object palette (left rail). Each tool drops a new object of
// its kind at the camera centre; double-clicking empty canvas opens the same set
// as a quick-create menu (spec §4.2).

import { useWb } from '../hooks/useLodestarCtx';
import Icon from './Icon';
import type { ObjectKind } from '../lib/types';

const TOOLS: { icon: string; label: string; kind?: ObjectKind }[] = [
  { icon: 'cursor', label: 'Select' },
  { icon: 'sticky', label: 'Sticky note', kind: 'note' },
  { icon: 'type', label: 'Prose', kind: 'prose' },
  { icon: 'square', label: 'Shape', kind: 'shape' },
  { icon: 'image', label: 'Image', kind: 'img' },
  { icon: 'type', label: 'Label', kind: 'label' },
  { icon: 'frame', label: 'Frame', kind: 'frame' },
  { icon: 'comp', label: 'Component', kind: 'component' },
];

function EditToolbar() {
  const wb = useWb();
  if (wb.state.mode !== 'edit' || wb.isMobile()) return null;
  const { cam } = wb.state;

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        background: 'color-mix(in oklab, var(--panel) 90%, transparent)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        zIndex: 40,
        backdropFilter: 'blur(10px)',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      {TOOLS.map((t, i) => {
        const isSelect = !t.kind;
        return (
          <button
            key={`${t.label}-${i}`}
            title={t.label}
            aria-label={t.label}
            onClick={() =>
              t.kind === 'img'
                ? wb.insertImage(cam.cx, cam.cy)
                : t.kind
                  ? wb.createObject(t.kind, cam.cx, cam.cy)
                  : wb.clearSelection()
            }
            style={{
              display: 'flex',
              width: 38,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              background: isSelect ? 'var(--panel-2)' : 'transparent',
              border: 'none',
              borderRadius: 9,
              color: isSelect ? 'var(--ink)' : 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            <Icon name={t.icon} size={18} />
          </button>
        );
      })}
    </div>
  );
}

export default EditToolbar;
