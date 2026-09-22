// The demo board Lodestar ships with — a hand-authored "Q3 planning"
// board that exercises every object kind, connection variant, and degraded
// state (invalid frontmatter, newer-schema read-only, a component that threw).
//
// This stands in for reading a real board folder from a space mount: once the
// PollSource/WatchSource change layer (spec §5.2) and the V1 MDX-from-mount gate
// land, the store is hydrated from `objects/*.mdx` + `views/*.md` + `journeys/*.md`
// instead of from here. The shapes are identical, so that swap is local to the store.

import type { Background, Journey, NoteColor, View, WObject } from '../lib/types';

/** Note palette order, shown in the inspector swatch row (DESIGN_BRIEF §1). */
export const NOTE_COLORS: NoteColor[] = [
  'lemon',
  'tangerine',
  'peach',
  'rose',
  'lilac',
  'sky',
  'mint',
  'graphite',
];

export const BOARD = {
  title: 'Q3 planning',
  background: 'grid' as Background,
};

function note(
  id: string,
  color: NoteColor,
  x: number,
  y: number,
  title: string,
  extra: Partial<WObject> = {},
): WObject {
  return {
    id,
    kind: 'note',
    color,
    x,
    y,
    w: 200,
    h: 148,
    rot: 0,
    scale: 1,
    z: 2,
    title,
    tags: '',
    connections: [],
    ...extra,
  };
}

export function seedObjects(): WObject[] {
  return [
    { id: 'lbl-title', kind: 'label', x: -300, y: -265, w: 780, h: 110, rot: 0, scale: 1, z: 1, title: 'Q3 launch.', connections: [] },
    { id: 'fr-now', kind: 'frame', x: -460, y: -150, w: 430, h: 580, rot: 0, scale: 1, z: 1, title: 'Now', connections: [] },
    { id: 'fr-next', kind: 'frame', x: 60, y: -150, w: 430, h: 580, rot: 0, scale: 1, z: 1, title: 'Next', connections: [] },
    note('n-share', 'lemon', -430, -70, 'Ship share links', {
      tags: 'platform',
      connections: [{ to: 'n-journey', kind: 'arrow', label: 'then', style: { stroke: 'accent', dash: false } }],
    }),
    note('n-watch', 'sky', -430, 118, 'fs-watch polling fallback', {
      tags: 'sync',
      connections: [{ to: 'n-virt', kind: 'arrow', label: 'depends on', style: { stroke: 'ink', dash: true } }],
    }),
    note('n-embed', 'rose', -430, 306, 'Embed click-to-load review', {
      tags: 'security',
      warn: true,
      connections: [{ to: 'sh-dec', kind: 'arrow', label: 'blocks', style: { stroke: 'accent', dash: false } }],
    }),
    note('n-journey', 'lilac', 92, -70, 'Journey authoring UI', {
      tags: 'showcase',
      connections: [{ to: 'n-mobile', kind: 'line', style: { stroke: 'ink', dash: false } }],
    }),
    note('n-mobile', 'mint', 92, 118, 'Mobile inspector sheet', { tags: 'mobile' }),
    note('n-virt', 'peach', 92, 306, '500-object virtualization', { tags: 'perf', readonly: true }),
    {
      id: 'pr-note',
      kind: 'prose',
      x: 560,
      y: -150,
      w: 288,
      h: 188,
      rot: -1.5,
      scale: 1,
      z: 2,
      title: 'Concurrency',
      body: 'Per-file last-write-wins. One object = one file = the unit of conflict. Position and tags merge instead of clobber.',
      connections: [{ to: 'n-journey', kind: 'arrow', label: 'informs', style: { stroke: 'ink', dash: false } }],
    },
    {
      id: 'sh-dec',
      kind: 'shape',
      shape: 'diamond',
      x: 592,
      y: 108,
      w: 224,
      h: 128,
      rot: 0,
      scale: 1,
      z: 2,
      title: 'Launch?',
      connections: [{ to: 'vd-demo', kind: 'arrow', style: { stroke: 'accent', dash: false } }],
    },
    { id: 'im-mood', kind: 'img', x: 560, y: 300, w: 288, h: 180, rot: 1.5, scale: 1, z: 2, title: 'Hero frame', loaded: false, connections: [] },
    { id: 'em-player', kind: 'embed', x: 892, y: -150, w: 300, h: 196, rot: 0, scale: 1, z: 2, origin: 'player.vimeo.com', connections: [] },
    { id: 'vd-demo', kind: 'video', x: 892, y: 96, w: 300, h: 172, rot: 0, scale: 1, z: 2, title: 'Demo cut · 0:42', connections: [] },
    {
      id: 'cm-chart',
      kind: 'component',
      x: 892,
      y: 312,
      w: 300,
      h: 168,
      rot: 0,
      scale: 1,
      z: 2,
      title: '<BurndownChart/>',
      error: "Cannot read properties of undefined (reading 'map')",
      connections: [],
    },
  ];
}

export const SEED_VIEWS: View[] = [
  { name: 'overview', cx: 250, cy: 150, zoom: 0.6 },
  { name: 'now-detail', cx: -235, cy: 170, zoom: 1.0 },
  { name: 'next-detail', cx: 285, cy: 170, zoom: 1.0 },
  { name: 'right-cluster', cx: 760, cy: 130, zoom: 0.82 },
];

export const SEED_JOURNEYS: Journey[] = [
  {
    id: 'jr-investor',
    title: 'Investor walkthrough',
    steps: [
      { view: 'overview', caption: 'Every object on the canvas is one file.', duration: 900 },
      { view: 'now-detail', caption: 'What ships now — sync, security, links.', duration: 1000 },
      { view: 'next-detail', caption: "What's next — journeys, mobile, scale.", duration: 1000 },
      { view: 'right-cluster', caption: 'Live React components, on a canvas.', duration: 1000 },
    ],
  },
  {
    id: 'jr-quick',
    title: 'Quick tour',
    steps: [
      { view: 'overview', caption: 'Start here.', duration: 800 },
      { view: 'now-detail', caption: 'The work in flight.', duration: 900 },
    ],
  },
];
