# AoA Locator Calibration Tool

GUI-basiertes Kalibrierungs-Tool für das BLE 5.1 AoA Positioning System.

## Übersicht

Das Kalibrierungs-Tool ermöglicht:
- **Anker-Konfiguration**: Eingabe von Positionen (X, Y, Z) und Serial Ports
- **Referenz-Messungen**: Datenerfassung an bekannten Positionen
- **Korrektur-Berechnung**: Automatische Berechnung von Korrektur-Faktoren
- **Config-Management**: Speichern und Laden von Konfigurationen (JSON)

## Installation

### Abhängigkeiten installieren

```bash
cd calibration_tool
pip3 install -r requirements.txt
```

### Benötigte Pakete

- Python 3.7+
- numpy (Mathematische Berechnungen)
- pyserial (Serielle Kommunikation mit Anchors)
- tkinter (GUI - normalerweise in Python enthalten)

## Verwendung

### Tool starten

```bash
python3 calibration_tool.py
```

## Kalibrierungs-Workflow

### 1. Anker konfigurieren

**Schritt 1:** Anker hinzufügen
- Klicken Sie auf "Add Anchor"
- Geben Sie ein:
  - Anchor ID (z.B. "1", "2", "3", "4")
  - Serial Port (z.B. "/dev/ttyACM0", "COM3")
  - Position X, Y, Z in Metern

**Beispiel-Setup (rechteckiges Feld 4x3m):**
```
Anchor 1: X=0.0,  Y=0.0,  Z=2.0  (Ecke unten links)
Anchor 2: X=4.0,  Y=0.0,  Z=2.0  (Ecke unten rechts)
Anchor 3: X=4.0,  Y=3.0,  Z=2.0  (Ecke oben rechts)
Anchor 4: X=0.0,  Y=3.0,  Z=2.0  (Ecke oben links)
```

**Schritt 2:** Verbindung testen
- Wählen Sie einen Anker aus
- Klicken Sie "Test Connection"
- Prüfen Sie, ob "Connected" angezeigt wird

### 2. Referenz-Messungen durchführen

**Vorbereitung:**
- Bereiten Sie mehrere Referenz-Positionen vor (mindestens 3, besser 5-10)
- Positionieren Sie ein BLE Tag an jeder Referenz-Position
- Messen Sie die exakten Koordinaten (z.B. mit Maßband)

**Messung durchführen:**

1. Positionieren Sie das Tag an einer bekannten Position
2. Geben Sie die Koordinaten ein (X, Y, Z)
3. Wählen Sie Mess-Dauer (Standard: 10 Sekunden)
4. Klicken Sie "Start Measurement"
5. Warten Sie, bis die Messung abgeschlossen ist
6. Wiederholen Sie für alle Referenz-Positionen

**Empfohlene Referenz-Positionen:**

```
Position 1: X=2.0, Y=1.5, Z=1.0  (Mitte des Feldes, 1m Höhe)
Position 2: X=1.0, Y=1.0, Z=1.0  (Links unten)
Position 3: X=3.0, Y=1.0, Z=1.0  (Rechts unten)
Position 4: X=1.0, Y=2.0, Z=1.0  (Links oben)
Position 5: X=3.0, Y=2.0, Z=1.0  (Rechts oben)
Position 6: X=2.0, Y=1.5, Z=0.5  (Mitte, niedrig)
Position 7: X=2.0, Y=1.5, Z=1.5  (Mitte, hoch)
```

**Tipps:**
- Mehr Messungen = bessere Kalibrierung
- Verschiedene Höhen verwenden (Z-Achse)
- Ecken und Mitte des Tracking-Bereichs abdecken
- Mindestens 10 Sekunden pro Position messen
- Tag während Messung still halten

### 3. Korrektur-Faktoren berechnen

**Schritt 1:** Kalibrierung starten
- Wählen Sie Tab "Calibration Results"
- Klicken Sie "Calculate Corrections"

**Schritt 2:** Ergebnisse prüfen
- **RMS Error**: Sollte < 0.1m sein (gut), < 0.3m (akzeptabel)
- **Position Offset**: Korrektur der Anker-Positionen
- **Phase Offset**: Phasen-Kalibrierung für AoA
- **Gain Factor**: Verstärkungs-Korrektur

**Schritt 3:** Korrekturen anwenden
- Klicken Sie "Apply to Config"
- Die Anker-Positionen werden automatisch korrigiert

### 4. Konfiguration speichern

**Speichern:**
- Menu: File → Save Configuration
- Datei: `config.json`

**Format:**
```json
{
  "version": "1.0",
  "anchors": [
    {
      "anchor_id": "1",
      "serial_port": "/dev/ttyACM0",
      "position": [0.0, 0.0, 2.0],
      "phase_offset": 12.5,
      "gain_factor": 1.03
    }
  ],
  "calibration": {
    "timestamp": "2025-01-15T14:30:00",
    "rms_error": 0.08,
    "anchor_corrections": { ... }
  }
}
```

## GUI-Übersicht

### Hauptfenster

```
+-------------------+----------------------------------+
| Anchor Config     |  Reference Measurements          |
|                   |  [Tab: Measurements]             |
| [Anchor List]     |                                  |
|  - ID             |  Input: X, Y, Z, Duration        |
|  - Serial Port    |  [Start Measurement]             |
|  - Position       |                                  |
|  - Status         |  [Measurement List]              |
|                   |                                  |
| [Add] [Edit]      |  [Tab: Calibration Results]      |
| [Remove] [Test]   |                                  |
|                   |  [Results Display]               |
|                   |  [Calculate] [Export] [Apply]    |
|                   |                                  |
|                   |  [Tab: Visualization]            |
|                   |                                  |
|                   |  [System Layout Canvas]          |
+-------------------+----------------------------------+
```

### Tabs

**1. Reference Measurements**
- Referenz-Position eingeben (X, Y, Z)
- Mess-Dauer einstellen (1-60 Sekunden)
- Messung starten
- Gesammelte Messungen anzeigen

**2. Calibration Results**
- Korrekturen berechnen
- Ergebnisse anzeigen (RMS Error, Offsets)
- Ergebnisse exportieren
- Korrekturen auf Config anwenden

**3. Visualization**
- System-Layout visualisieren
- Anker-Positionen (grün/rot)
- Referenz-Punkte (blau)
- Ansicht wählen: Top (XY), Side (XZ), Front (YZ)

## Kalibrierungs-Mathematik

### Position Offset

Berechnet die Korrektur der Anker-Position basierend auf:
- Erwartete Distanz (aus Referenz-Position)
- Gemessene Distanz (aus RSSI)
- Least-Squares-Optimierung

### Phase Offset

Berechnet Phasen-Korrektur aus IQ-Samples:
- Extrahiert Phase von Referenz-Antenna
- Median-Filter für Robustheit
- In Grad (0-360°)

### Gain Factor

Berechnet Verstärkungskorrektur:
- Vergleich gemessene vs. erwartete RSSI
- Geometrisches Mittel über alle Samples
- Typisch: 0.8 - 1.2

### RMS Error

Root Mean Square Error der Position:
- Misst Genauigkeit der Kalibrierung
- < 0.1m: Sehr gut
- 0.1-0.3m: Gut
- > 0.3m: Verbesserung nötig (mehr Messungen)

## Troubleshooting

### Problem: "Anchor verbindet nicht"

**Lösungen:**
1. Serial Port prüfen:
   ```bash
   ls /dev/ttyACM*  # Linux
   # oder Device Manager (Windows)
   ```

2. Berechtigungen prüfen (Linux):
   ```bash
   sudo chmod 666 /dev/ttyACM0
   # oder zur dialout-Gruppe hinzufügen:
   sudo usermod -a -G dialout $USER
   ```

3. Firmware prüfen:
   - USB-Kabel neu einstecken
   - Firmware neu flashen

### Problem: "Keine Messungen empfangen"

**Lösungen:**
1. BLE Tag prüfen:
   - Tag sendet CTE?
   - Tag ist eingeschaltet?
   - Batterie voll?

2. Serial Monitor öffnen:
   ```bash
   cd ../examples
   python3 read_iq_samples.py /dev/ttyACM0 -v
   ```
   - JSON-Pakete sichtbar?

3. Abstand prüfen:
   - Tag nicht zu weit weg (< 10m)
   - Keine Hindernisse zwischen Tag und Anchors

### Problem: "Hoher RMS Error (> 0.5m)"

**Lösungen:**
1. Mehr Referenz-Messungen:
   - Mindestens 5-10 Positionen
   - Verschiedene Höhen

2. Anker-Positionen prüfen:
   - Exakte Messung mit Maßband
   - Koordinaten korrekt eingegeben?

3. Referenz-Positionen prüfen:
   - Genau gemessen?
   - Tag still während Messung?

4. Geometrie verbessern:
   - Anchors in Ecken positionieren
   - Nicht alle in einer Linie

### Problem: "Tool startet nicht"

**Lösungen:**
1. Dependencies installieren:
   ```bash
   pip3 install -r requirements.txt
   ```

2. Python-Version prüfen:
   ```bash
   python3 --version  # Sollte >= 3.7 sein
   ```

3. tkinter installieren (Linux):
   ```bash
   sudo apt-get install python3-tk
   ```

## Export-Funktionen

### JSON Export
```python
# Vollständige Konfiguration
config.json
```

### CSV Export
```python
# Nur Anker-Daten
config_anchors.csv
```

### Text Report
```python
# Lesbarer Bericht
config_report.txt
```

## Erweiterte Funktionen

### Programmatische Verwendung

```python
from anchor_manager import AnchorManager, Anchor
from calibration_math import CalibrationMath
from config_manager import ConfigManager

# Config laden
config_mgr = ConfigManager()
config = config_mgr.load_config("config.json")

# Anchor Manager
anchor_mgr = AnchorManager()
anchor_mgr.load_from_config(config)

# Messung durchführen
measurement = anchor_mgr.measure_reference_position(
    reference_position=(2.0, 1.5, 1.0),
    duration=10.0
)

# Kalibrierung berechnen
calib_math = CalibrationMath()
results = calib_math.calculate_corrections(
    anchor_mgr.anchors,
    [measurement]
)

# Speichern
config['calibration'] = results
config_mgr.save_config(config, "calibrated_config.json")
```

### Batch-Kalibrierung

Mehrere Systeme parallel kalibrieren:

```bash
# Script: batch_calibrate.sh
for system in system1 system2 system3; do
    python3 calibration_tool.py --config ${system}_config.json &
done
```

## Best Practices

### Anker-Platzierung
- Rechteckige oder quadratische Anordnung
- Gleiche Höhe (empfohlen: 2-3m)
- Mindestens 2m Abstand zwischen Anchors
- Ecken des Tracking-Bereichs

### Kalibrierungs-Messungen
- 5-10 Referenz-Positionen minimum
- Gleichmäßig verteilt über Tracking-Bereich
- Verschiedene Höhen (0.5m, 1.0m, 1.5m)
- Jede Position 10-30 Sekunden messen
- Mehrere Durchläufe für Konsistenz

### Qualitätskontrolle
- RMS Error < 0.3m anstreben
- PDOP < 5 (gute Geometrie)
- Regelmäßig neu kalibrieren (monatlich)
- Nach Änderungen an Anker-Positionen

## Lizenz

Dieses Tool ist Teil des AoA Locator Projekts.

## Support

Bei Problemen:
1. README.md und Troubleshooting lesen
2. Logs prüfen
3. GitHub Issues erstellen
