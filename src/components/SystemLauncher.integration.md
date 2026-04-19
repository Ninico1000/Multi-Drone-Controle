# SystemLauncher Integration Guide

## Integration in MultiDroneControl.jsx

### 1. Import hinzufügen

```javascript
// Am Anfang der Datei nach den anderen Imports:
import SystemLauncher from './SystemLauncher';
```

### 2. State für Launcher hinzufügen

```javascript
// In der MultiDroneControl Komponente, nach den anderen useState Hooks:
const [showLauncher, setShowLauncher] = useState(false);
```

### 3. Button in der Toolbar hinzufügen

Finde die Toolbar (normalerweise im Header-Bereich) und füge den Launcher-Button hinzu:

```javascript
<button
  onClick={() => setShowLauncher(true)}
  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
  title="Open System Launcher"
>
  <Play className="w-4 h-4" />
  System Launcher
</button>
```

### 4. SystemLauncher Komponente zum Render hinzufügen

Am Ende der return-Statements (vor dem schließenden </div>):

```javascript
{/* System Launcher */}
<SystemLauncher
  isOpen={showLauncher}
  onClose={() => setShowLauncher(false)}
/>
```

## Vollständiges Beispiel

```javascript
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Play, Square, AlertCircle, Radio, Settings } from 'lucide-react';
import * as THREE from 'three';
import ThreeScene from './ThreeScene';
import DronePanel from './DronePanel';
import AnchorSetup from './AnchorSetup';
import KeyframeEditor from './KeyframeEditor';
import Timeline from './Timeline';
import EventLog from './EventLog';
import SystemLauncher from './SystemLauncher';  // <-- NEU
// ... rest of imports

const MultiDroneControl = () => {
  // ... existing state
  const [showLauncher, setShowLauncher] = useState(false);  // <-- NEU

  // ... rest of component

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Multi-Drone Control with AoA</h1>

          <div className="flex items-center gap-2">
            {/* Existing buttons */}

            {/* System Launcher Button - NEU */}
            <button
              onClick={() => setShowLauncher(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              System Launcher
            </button>
          </div>
        </div>
      </div>

      {/* Rest of the component */}
      {/* ... */}

      {/* System Launcher Modal - NEU */}
      <SystemLauncher
        isOpen={showLauncher}
        onClose={() => setShowLauncher(false)}
      />
    </div>
  );
};

export default MultiDroneControl;
```

## Alternative: Keyboard Shortcut

Für schnellen Zugriff kann ein Keyboard Shortcut hinzugefügt werden:

```javascript
useEffect(() => {
  const handleKeyPress = (e) => {
    // Ctrl+L oder Cmd+L öffnet den Launcher
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      setShowLauncher(true);
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

## Icons importieren

Falls das Play-Icon für den Button nicht importiert ist:

```javascript
import { Upload, Download, Play, Square, AlertCircle, Radio, Settings, Terminal } from 'lucide-react';
```

## Styling anpassen

Der Button kann je nach Design der App angepasst werden:

```javascript
// Variant 1: Purple (wie im Beispiel)
className="bg-purple-600 hover:bg-purple-700"

// Variant 2: Green (für "Start")
className="bg-green-600 hover:bg-green-700"

// Variant 3: Blue (neutral)
className="bg-blue-600 hover:bg-blue-700"

// Variant 4: Mit Outline
className="border border-purple-500 text-purple-500 hover:bg-purple-900"
```

## Position des Buttons

Der Launcher-Button sollte idealerweise in der Hauptnavigation platziert werden, z.B.:

1. **Header rechts**: Neben anderen System-Controls
2. **Sidebar**: In einer vertikalen Toolbar
3. **Floating Action Button**: Als fester Button unten rechts

Beispiel für Floating Action Button:

```javascript
<button
  onClick={() => setShowLauncher(true)}
  className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg z-40"
  title="System Launcher (Ctrl+L)"
>
  <Play className="w-6 h-6" />
</button>
```
