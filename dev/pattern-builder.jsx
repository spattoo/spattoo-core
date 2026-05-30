import React from 'react';
import ReactDOM from 'react-dom/client';
import PatternBuilder from '../src/designer/PatternBuilder.jsx';

function App() {
  async function handleSave(payload) {
    console.log('Pattern saved:', payload);
    // In dev, just log — no API call
  }

  return <PatternBuilder onSave={handleSave} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
