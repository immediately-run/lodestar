// Root component — immediately.run renders the default export of THIS file.
// Global CSS (design tokens, fonts, full-bleed base) is imported here, not in
// main.tsx, because the runtime never loads main.tsx.
import './index.css';
import Lodestar from './components/Lodestar';

function App() {
  return <Lodestar />;
}

export default App;
