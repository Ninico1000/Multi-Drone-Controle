#!/bin/bash
# System Launcher - Complete System Startup Script
#
# Startet alle Komponenten des Multi-Drone Control Systems mit AoA Locator

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Multi-Drone Control System with AoA Locator${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is available
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 1  # Port in use
    else
        return 0  # Port available
    fi
}

# Check prerequisites
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}✗ Node.js not found. Please install Node.js first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

if ! command_exists npm; then
    echo -e "${RED}✗ npm not found. Please install npm first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"

echo

# Check and install Node dependencies
echo -e "${YELLOW}[2/5] Checking Node.js dependencies...${NC}"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd "$SCRIPT_DIR"
    npm install
fi
echo -e "${GREEN}✓ Frontend dependencies ready${NC}"

if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    cd "$SCRIPT_DIR/server"
    npm install
fi
echo -e "${GREEN}✓ Backend dependencies ready${NC}"

echo

# Check Python dependencies (optional - for calibration tool)
echo -e "${YELLOW}[3/5] Checking Python dependencies (optional)...${NC}"

CALIBRATION_DIR="$SCRIPT_DIR/aoa_locator/calibration_tool"
if [ -d "$CALIBRATION_DIR" ]; then
    if [ ! -d "$CALIBRATION_DIR/venv" ]; then
        if command_exists python3; then
            echo -e "${YELLOW}Setting up Python virtual environment...${NC}"
            cd "$CALIBRATION_DIR"
            python3 -m venv venv 2>/dev/null || echo -e "${YELLOW}⚠ Could not create venv (optional)${NC}"
            if [ -f "venv/bin/pip" ] && [ -f "requirements.txt" ]; then
                venv/bin/pip install -r requirements.txt 2>/dev/null || true
            fi
            echo -e "${GREEN}✓ Python virtual environment ready${NC}"
        else
            echo -e "${YELLOW}⚠ Python3 not found (optional for calibration tool)${NC}"
        fi
    else
        echo -e "${GREEN}✓ Python virtual environment ready${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Calibration tool directory not found (optional)${NC}"
fi

echo

# Port configuration
REACT_PORT=3000
BRIDGE_PORT=3001
LAUNCHER_PORT=3002

# Check ports
echo -e "${YELLOW}[4/5] Checking ports...${NC}"

if ! check_port $REACT_PORT; then
    echo -e "${RED}✗ Port $REACT_PORT (React) is already in use${NC}"
    echo -e "${YELLOW}  Stop the existing process or change the port${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Port $REACT_PORT (React) is available${NC}"

if ! check_port $BRIDGE_PORT; then
    echo -e "${YELLOW}⚠ Port $BRIDGE_PORT (Serial Bridge) is already in use${NC}"
    echo -e "${YELLOW}  This is OK if the bridge is already running${NC}"
else
    echo -e "${GREEN}✓ Port $BRIDGE_PORT (Serial Bridge) is available${NC}"
fi

if ! check_port $LAUNCHER_PORT; then
    echo -e "${YELLOW}⚠ Port $LAUNCHER_PORT (Launcher API) is already in use${NC}"
    echo -e "${YELLOW}  This is OK if the launcher is already running${NC}"
else
    echo -e "${GREEN}✓ Port $LAUNCHER_PORT (Launcher API) is available${NC}"
fi

echo

# Start services
echo -e "${YELLOW}[5/5] Starting services...${NC}"
echo

# Create log directory
mkdir -p "$SCRIPT_DIR/logs"

# Function to cleanup on exit
cleanup() {
    echo
    echo -e "${YELLOW}Shutting down services...${NC}"
    jobs -p | xargs -r kill 2>/dev/null
    echo -e "${GREEN}✓ Services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start Launcher API
echo -e "${BLUE}Starting Launcher API on port $LAUNCHER_PORT...${NC}"
cd "$SCRIPT_DIR/server"
node launcher-api.js > "$SCRIPT_DIR/logs/launcher-api.log" 2>&1 &
LAUNCHER_PID=$!
echo -e "${GREEN}✓ Launcher API started (PID: $LAUNCHER_PID)${NC}"
echo -e "  Log: logs/launcher-api.log"

# Wait for Launcher API to start
sleep 2

# Start Serial Bridge (optional - may already be running)
if check_port $BRIDGE_PORT; then
    echo -e "${BLUE}Starting Serial Bridge on port $BRIDGE_PORT...${NC}"
    cd "$SCRIPT_DIR/server"
    node serial-bridge.js > "$SCRIPT_DIR/logs/serial-bridge.log" 2>&1 &
    BRIDGE_PID=$!
    echo -e "${GREEN}✓ Serial Bridge started (PID: $BRIDGE_PID)${NC}"
    echo -e "  Log: logs/serial-bridge.log"
else
    echo -e "${YELLOW}⚠ Serial Bridge already running, skipping${NC}"
fi

# Wait for bridges to start
sleep 2

# Start React Development Server
echo -e "${BLUE}Starting React app on port $REACT_PORT...${NC}"
cd "$SCRIPT_DIR"
npm start > "$SCRIPT_DIR/logs/react-app.log" 2>&1 &
REACT_PID=$!
echo -e "${GREEN}✓ React app started (PID: $REACT_PID)${NC}"
echo -e "  Log: logs/react-app.log"

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   ✓ All services started successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${BLUE}Access points:${NC}"
echo -e "  • React App:       ${GREEN}http://localhost:$REACT_PORT${NC}"
echo -e "  • Launcher API:    ${GREEN}http://localhost:$LAUNCHER_PORT${NC}"
echo -e "  • Serial Bridge:   ${GREEN}ws://localhost:$BRIDGE_PORT${NC}"
echo
echo -e "${BLUE}Logs:${NC}"
echo -e "  • Launcher API:    logs/launcher-api.log"
echo -e "  • Serial Bridge:   logs/serial-bridge.log"
echo -e "  • React App:       logs/react-app.log"
echo
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo

# Wait for React to start (it takes longer)
sleep 5

# Open browser (optional)
if command_exists xdg-open; then
    xdg-open "http://localhost:$REACT_PORT" 2>/dev/null &
elif command_exists open; then
    open "http://localhost:$REACT_PORT" 2>/dev/null &
fi

# Keep script running
wait
