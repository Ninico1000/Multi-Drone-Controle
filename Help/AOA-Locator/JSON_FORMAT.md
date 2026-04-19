# JSON Output Format Documentation

## Overview

The AoA Locator firmware outputs CTE (Constant Tone Extension) packets in JSON format over USB CDC Serial. Each packet contains metadata and IQ samples captured during the CTE reception.

## JSON Structure

### Compact Format (Default)

The firmware uses a compact JSON format to minimize bandwidth usage:

```json
{"timestamp":12345,"rssi":-45,"channel":37,"cte_type":0,"slot_duration":2,"sample_count":74,"iq_samples":[{"i":12,"q":-34,"ant":0},{"i":56,"q":78,"ant":1},...]}
```

### Pretty-Printed Format (for reference)

For readability, the same data structure formatted with indentation:

```json
{
  "timestamp": 12345,
  "rssi": -45,
  "channel": 37,
  "cte_type": 0,
  "slot_duration": 2,
  "sample_count": 74,
  "iq_samples": [
    {"i": 12, "q": -34, "ant": 0},
    {"i": 56, "q": 78, "ant": 1},
    {"i": -23, "q": 45, "ant": 2},
    {"i": 67, "q": -12, "ant": 3},
    ...
  ]
}
```

## Field Descriptions

### Metadata Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `timestamp` | uint32 | 0 - 4294967295 | Timestamp in milliseconds since device start |
| `rssi` | int8 | -128 to 0 | Received Signal Strength Indicator in dBm |
| `channel` | uint8 | 0 - 39 | BLE channel number (37, 38, 39 for advertising) |
| `cte_type` | uint8 | 0 - 2 | CTE type: 0=AoA, 1=AoD 1μs, 2=AoD 2μs |
| `slot_duration` | uint8 | 1 or 2 | Antenna switching slot duration in microseconds |
| `sample_count` | uint16 | 1 - 82 | Number of IQ samples in the packet |

### IQ Sample Fields

Each entry in the `iq_samples` array contains:

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `i` | int8 | -128 to 127 | In-phase component (I) |
| `q` | int8 | -128 to 127 | Quadrature component (Q) |
| `ant` | uint8 | 0 - 3 | Antenna index used for this sample |

## Example Packets

### Example 1: Typical AoA Packet

```json
{"timestamp":5432,"rssi":-52,"channel":37,"cte_type":0,"slot_duration":2,"sample_count":24,"iq_samples":[{"i":45,"q":-23,"ant":0},{"i":67,"q":12,"ant":1},{"i":-34,"q":56,"ant":2},{"i":78,"q":-45,"ant":3},{"i":23,"q":34,"ant":0},{"i":-12,"q":67,"ant":1},{"i":89,"q":-56,"ant":2},{"i":-78,"q":23,"ant":3},{"i":34,"q":45,"ant":0},{"i":56,"q":-12,"ant":1},{"i":-67,"q":78,"ant":2},{"i":45,"q":-34,"ant":3},{"i":12,"q":56,"ant":0},{"i":-23,"q":67,"ant":1},{"i":78,"q":-45,"ant":2},{"i":-56,"q":34,"ant":3},{"i":67,"q":23,"ant":0},{"i":-45,"q":12,"ant":1},{"i":34,"q":-56,"ant":2},{"i":23,"q":78,"ant":3},{"i":-12,"q":45,"ant":0},{"i":56,"q":-67,"ant":1},{"i":-34,"q":23,"ant":2},{"i":78,"q":-12,"ant":3}]}
```

### Example 2: Strong Signal Packet

```json
{"timestamp":10987,"rssi":-35,"channel":38,"cte_type":0,"slot_duration":2,"sample_count":16,"iq_samples":[{"i":102,"q":-87,"ant":0},{"i":95,"q":76,"ant":1},{"i":-89,"q":98,"ant":2},{"i":112,"q":-65,"ant":3},{"i":87,"q":54,"ant":0},{"i":-76,"q":102,"ant":1},{"i":98,"q":-89,"ant":2},{"i":-102,"q":76,"ant":3},{"i":65,"q":87,"ant":0},{"i":89,"q":-98,"ant":1},{"i":-102,"q":65,"ant":2},{"i":76,"q":-87,"ant":3},{"i":54,"q":98,"ant":0},{"i":-65,"q":102,"ant":1},{"i":87,"q":-76,"ant":2},{"i":-98,"q":65,"ant":3}]}
```

## Parsing JSON Data

### Python Example

```python
import serial
import json

# Open serial port
ser = serial.Serial('/dev/ttyACM0', 115200, timeout=1)

while True:
    try:
        # Read line from serial port
        line = ser.readline().decode('utf-8').strip()

        # Skip non-JSON lines (welcome messages, etc.)
        if not line.startswith('{'):
            continue

        # Parse JSON
        packet = json.loads(line)

        # Extract metadata
        timestamp = packet['timestamp']
        rssi = packet['rssi']
        channel = packet['channel']
        sample_count = packet['sample_count']

        # Extract IQ samples
        iq_samples = packet['iq_samples']

        # Process samples
        for sample in iq_samples:
            i = sample['i']
            q = sample['q']
            antenna = sample['ant']

            # Calculate magnitude and phase
            magnitude = (i**2 + q**2)**0.5
            phase = atan2(q, i)

            print(f"Antenna {antenna}: I={i}, Q={q}, Mag={magnitude:.2f}, Phase={phase:.2f}")

        print(f"Packet at {timestamp}ms: RSSI={rssi}dBm, {sample_count} samples")
        print("-" * 60)

    except json.JSONDecodeError:
        print(f"Invalid JSON: {line}")
    except KeyboardInterrupt:
        break

ser.close()
```

### JavaScript/Node.js Example

```javascript
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

const port = new SerialPort('/dev/ttyACM0', { baudRate: 115200 });
const parser = port.pipe(new Readline({ delimiter: '\n' }));

parser.on('data', line => {
  // Skip non-JSON lines
  if (!line.startsWith('{')) {
    return;
  }

  try {
    const packet = JSON.parse(line);

    console.log(`Timestamp: ${packet.timestamp}ms`);
    console.log(`RSSI: ${packet.rssi}dBm`);
    console.log(`Channel: ${packet.channel}`);
    console.log(`Sample Count: ${packet.sample_count}`);

    // Process IQ samples
    packet.iq_samples.forEach((sample, index) => {
      const magnitude = Math.sqrt(sample.i ** 2 + sample.q ** 2);
      const phase = Math.atan2(sample.q, sample.i);

      console.log(`  Sample ${index}: I=${sample.i}, Q=${sample.q}, Ant=${sample.ant}`);
    });

    console.log('-'.repeat(60));
  } catch (error) {
    console.error('JSON parse error:', error.message);
  }
});
```

## Data Processing Notes

### IQ Sample Interpretation

1. **Magnitude**: `sqrt(I² + Q²)` - Signal strength for this sample
2. **Phase**: `atan2(Q, I)` - Phase angle in radians
3. **Antenna Pattern**: Samples cycle through antennas 0, 1, 2, 3, 0, 1, 2, 3, ...

### RSSI Considerations

- RSSI is measured in dBm (typically -100 to -30 dBm range)
- Lower values (more negative) indicate weaker signals
- Strong signals: -30 to -50 dBm
- Medium signals: -50 to -70 dBm
- Weak signals: -70 to -90 dBm

### Timestamp Usage

- Timestamps are in milliseconds since device boot
- Wraps around after ~49.7 days (2³² ms)
- Use for packet ordering and time-of-arrival calculations
- Synchronize multiple anchors using external timing signals

### Channel Information

BLE advertising channels:
- Channel 37: 2402 MHz
- Channel 38: 2426 MHz
- Channel 39: 2480 MHz

## Buffer Management

The firmware uses a circular buffer with capacity for 8 CTE packets:

- **Buffer Full**: Oldest packets are dropped (logged as overflow)
- **Processing Rate**: Packets sent over USB as fast as possible during idle state
- **Maximum Throughput**: ~3-5 packets/second depending on USB bandwidth

### Buffer Overflow Handling

If you see buffer overflows in the logs, consider:
1. Increasing buffer size in `iq_sample.h` (`IQ_PACKET_BUFFER_SIZE`)
2. Reducing CTE transmission rate from tags
3. Optimizing host-side packet processing

## Integration with Multi-Drone Control

### Recommended Processing Pipeline

1. **Serial Reception**: Read JSON packets from USB CDC
2. **Packet Validation**: Verify JSON structure and RSSI thresholds
3. **Angle Calculation**: Compute AoA from IQ samples using MUSIC/ESPRIT algorithm
4. **Position Triangulation**: Combine angles from multiple anchors
5. **Kalman Filtering**: Smooth position estimates over time

### Multi-Anchor Synchronization

For accurate positioning, synchronize anchor timestamps:
- Use network time protocol (NTP) or PTP
- Include anchor ID in JSON output (modify firmware)
- Align timestamps using common reference point

## Performance Characteristics

- **Packet Size**: ~150-2000 bytes depending on sample count
- **Update Rate**: 1-10 Hz typical (depends on tag transmission rate)
- **Latency**: <10ms from CTE reception to JSON output
- **USB Throughput**: Up to 12 Mbps (USB Full Speed)

## Troubleshooting

### No JSON Output

1. Check USB CDC connection
2. Verify firmware is scanning (LED indicators)
3. Ensure BLE tag is transmitting CTE packets
4. Check serial port settings (115200 baud, 8N1)

### Corrupted JSON

1. Increase serial buffer size in host application
2. Check for buffer overflows in firmware logs
3. Verify USB cable quality and length

### Missing Samples

1. Check `sample_count` field matches array length
2. Verify antenna pattern configuration
3. Review CTE transmission parameters on tag
