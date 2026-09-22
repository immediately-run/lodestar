// The security surface (spec §8.4, DESIGN_BRIEF §1): an external embed renders
// CLICK-TO-LOAD. Nothing reaches the outside site until the viewer deliberately
// acts; the target origin is shown prominently first, and the copy names exactly
// what loading exposes (your IP + that you opened this board). This is the v1
// mitigation for the one residual exfiltration channel.

import { useWb } from '../../hooks/useLodestarCtx';
import Icon from '../Icon';
import type { WObject } from '../../lib/types';

function EmbedObject({ o }: { o: WObject }) {
  const wb = useWb();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--panel-2)',
        border: '1px dashed var(--line-2)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--ink-2)', font: 'var(--mono-xs)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
        <Icon name="externalLink" size={13} strokeWidth={1.75} />
        External embed
      </div>
      <div style={{ font: '700 17px/1.1 var(--mono)', color: 'var(--ink)', wordBreak: 'break-all' }}>{o.origin}</div>
      <div style={{ font: 'var(--body-sm)', color: 'var(--ink-3)', textWrap: 'pretty' }}>
        Loads from an outside site, which can see your IP address and that you opened this board.
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          wb.patchObject(o.id, { loadedEmbed: true });
        }}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 13px',
          background: o.loadedEmbed ? 'var(--panel)' : 'var(--ink)',
          color: o.loadedEmbed ? 'var(--ink-2)' : 'var(--bg)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-pill)',
          font: 'var(--label)',
          cursor: 'pointer',
        }}
      >
        {o.loadedEmbed ? 'Loaded' : `Load ${o.origin}`}
      </button>
    </div>
  );
}

export default EmbedObject;
