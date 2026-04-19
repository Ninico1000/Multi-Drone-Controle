import React from 'react';

const EventLog = ({ log }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">Event Log</h2>
      <div className="bg-gray-900 rounded p-3 h-32 overflow-y-auto font-mono text-sm">
        {log.map((entry, index) => (
          <div key={index} className="mb-1">
            <span className="text-gray-400">[{entry.time}]</span> {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventLog;
