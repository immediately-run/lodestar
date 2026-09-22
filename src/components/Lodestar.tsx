// The app root: instantiates the controller once, provides it to the tree, and
// lays out the canvas + every chrome surface. Each surface decides its own
// visibility (mode, mobile, open/closed) so this stays a flat composition.

import { useLodestar } from '../hooks/useLodestar';
import { LodestarContext } from '../lib/context';
import Canvas from './Canvas';
import TopBar from './TopBar';
import EditToolbar from './EditToolbar';
import Inspector from './Inspector';
import JourneysPanel from './JourneysPanel';
import QuickCreateMenu from './QuickCreateMenu';
import Playback from './Playback';
import Toasts from './Toasts';
import DemoMenu from './DemoMenu';
import MobileChrome from './MobileChrome';
import StateScreens from './StateScreens';

function Lodestar() {
  const wb = useLodestar();
  return (
    <LodestarContext.Provider value={wb}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', color: 'var(--ink)', font: '400 16px/1.5 var(--sans)', overflow: 'hidden', userSelect: 'none' }}>
        <Canvas />
        <TopBar />
        <EditToolbar />
        <Inspector />
        <JourneysPanel />
        <QuickCreateMenu />
        <Playback />
        <Toasts />
        <DemoMenu />
        <MobileChrome />
        <StateScreens />
      </div>
    </LodestarContext.Provider>
  );
}

export default Lodestar;
