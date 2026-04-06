const WebSocket = require('ws');

console.log('Testing WebSocket connection to localhost:4000...');

const ws = new WebSocket('ws://localhost:4000');

ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    
    // Send ping
    ws.send(JSON.stringify({ type: 'ping' }));
    
    // Close after test
    setTimeout(() => {
        ws.close();
        process.exit(0);
    }, 1000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg.type);
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('Connection closed');
});

// Timeout after 5 seconds
setTimeout(() => {
    console.log('⏱️ Connection timed out');
    ws.close();
    process.exit(1);
}, 5000);