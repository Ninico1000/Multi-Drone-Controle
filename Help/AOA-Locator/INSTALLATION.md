# Installation Guide

## Installationsstatus

### ✅ Erfolgreich installiert

Die folgenden Python-Pakete wurden im Virtual Environment installiert:

```
✓ numpy 2.3.5          - Mathematische Berechnungen
✓ pyserial 3.5         - Serielle Kommunikation
✓ matplotlib 3.10.7    - Visualisierung (optional)
✓ contourpy 1.3.3      - Matplotlib Dependency
✓ cycler 0.12.1        - Matplotlib Dependency
✓ fonttools 4.61.0     - Matplotlib Dependency
✓ kiwisolver 1.4.9     - Matplotlib Dependency
✓ packaging 25.0       - Matplotlib Dependency
✓ pillow 12.0.0        - Image Processing
✓ pyparsing 3.2.5      - Matplotlib Dependency
✓ python-dateutil 2.9  - Date/Time Utilities
✓ six 1.17.0           - Python 2/3 Compatibility
```

### ⚠️ Manuelle Installation erforderlich

**tkinter (GUI Framework)**

tkinter ist nicht im Virtual Environment verfügbar und muss system-weit installiert werden:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install python3-tk
```

**Fedora/RHEL:**
```bash
sudo dnf install python3-tkinter
```

**macOS:**
```bash
# tkinter ist normalerweise bereits enthalten
# Falls nicht:
brew install python-tk
```

**Windows:**
- tkinter ist normalerweise in Python enthalten
- Falls nicht: Python neu installieren mit tkinter-Option

## Verwendung

### Mit Startup-Script (empfohlen)

```bash
cd aoa_locator/calibration_tool
./run_calibration_tool.sh
```

Das Script:
- Aktiviert automatisch das Virtual Environment
- Prüft Dependencies
- Startet das Kalibrierungs-Tool

### Manuell

```bash
cd aoa_locator/calibration_tool

# Virtual Environment aktivieren
source venv/bin/activate

# Tool starten
python calibration_tool.py

# Virtual Environment deaktivieren (nach Verwendung)
deactivate
```

## Prüfung der Installation

### Python-Pakete testen

```bash
cd aoa_locator/calibration_tool
venv/bin/python -c "import numpy, serial, matplotlib; print('Pakete OK')"
```

### tkinter testen

```bash
python3 -c "import tkinter; tkinter.Tk()"
```

Wenn ein leeres Fenster erscheint, ist tkinter korrekt installiert.

## Troubleshooting

### Problem: "ModuleNotFoundError: No module named 'tkinter'"

**Lösung:**
```bash
sudo apt-get install python3-tk  # Ubuntu/Debian
```

Nach Installation prüfen:
```bash
python3 -c "import tkinter; print('tkinter OK')"
```

### Problem: Virtual Environment nicht gefunden

**Lösung:**
```bash
cd aoa_locator/calibration_tool
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

### Problem: Serial Port Permission Denied

**Lösung (Linux):**
```bash
# Berechtigung für aktuellen Port
sudo chmod 666 /dev/ttyACM0

# Oder User zur dialout-Gruppe hinzufügen (permanent)
sudo usermod -a -G dialout $USER
# Danach ausloggen und wieder einloggen
```

### Problem: "externally-managed-environment"

**Lösung:**

Nutzen Sie immer das Virtual Environment:
```bash
# NICHT: pip3 install ...
# SONDERN: venv/bin/pip install ...
```

Oder verwenden Sie das Startup-Script `run_calibration_tool.sh`

## Vollständige Neuinstallation

Falls Probleme auftreten:

```bash
cd aoa_locator/calibration_tool

# Altes venv löschen
rm -rf venv

# Neues venv erstellen
python3 -m venv venv

# Pakete installieren
venv/bin/pip install -r requirements.txt

# tkinter system-weit installieren
sudo apt-get install python3-tk

# Tool starten
./run_calibration_tool.sh
```

## System-Anforderungen

### Mindestanforderungen

- Python 3.7 oder höher (installiert: Python 3.12.3 ✓)
- pip 20.0 oder höher (installiert: pip 24.0 ✓)
- ~200 MB freier Speicher für Dependencies
- tkinter (GUI Framework)

### Empfohlene Spezifikationen

- Python 3.10+
- 4 GB RAM
- Linux/macOS/Windows 10+

## Bekannte Einschränkungen

1. **tkinter**: Muss system-weit installiert werden (nicht via pip)
2. **Virtual Environment**: Empfohlen für Isolation von System-Paketen
3. **Berechtigungen**: Serial Ports benötigen Read/Write-Berechtigung

## Weitere Hilfe

Bei weiteren Problemen:

1. Prüfen Sie die Python-Version: `python3 --version`
2. Prüfen Sie installierte Pakete: `venv/bin/pip list`
3. Lesen Sie README.md für Verwendungs-Anleitung
4. Prüfen Sie Serial Port: `ls -l /dev/ttyACM*`

## Pakete-Übersicht

### Core Dependencies (requirements.txt)

```
numpy>=1.20.0      # Numerische Berechnungen
pyserial>=3.5      # Serial Port Kommunikation
matplotlib>=3.3.0  # Visualisierung (optional)
```

### System Dependencies (apt/dnf/brew)

```
python3-tk         # tkinter GUI Framework
```

### Optional für Entwicklung

```
pylint             # Code Quality
pytest             # Testing
black              # Code Formatting
```

Installation optional Dependencies:
```bash
venv/bin/pip install pylint pytest black
```

## Status: Installation abgeschlossen ✓

Alle Python-Pakete sind installiert.

**Nächster Schritt:** tkinter installieren (siehe oben)

Dann kann das Tool gestartet werden mit:
```bash
./run_calibration_tool.sh
```
