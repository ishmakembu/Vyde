/**
 * VIDE Call Testing Script
 * Tests WebSocket signaling and simulates call flow
 * 
 * Run with: node test-call.js
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:4000';
const CALL_ID = `test-call-${Date.now()}`;
const ROOM_ID = `test-room-${Date.now()}`;
const USER_A = 'user-a-' + Date.now();
const USER_B = 'user-b-' + Date.now();

console.log('=========================================');
console.log('VIDE CALL TESTING');
console.log('=========================================');

const ws = new WebSocket(WS_URL);

let step = 0;

ws.on('open', () => {
    console.log('\n[1] WebSocket connected to port 4000');
    testCallFlow();
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`\n[Step ${++step}] Received: ${msg.type}`);
    console.log('  Payload:', JSON.stringify(msg.payload || msg).substring(0, 200));
    
    handleMessage(msg);
});

ws.on('error', (err) => {
    console.error('\n❌ WebSocket Error:', err.message);
});

function send(msg) {
    ws.send(JSON.stringify(msg));
    console.log(`→ Sent: ${msg.type}`);
}

function testCallFlow() {
    // Step 1: User A comes online
    setTimeout(() => {
        console.log('\n--- TEST: User A Online ---');
        send({ type: 'user:online', payload: { userId: USER_A } });
    }, 500);

    // Step 2: User B comes online  
    setTimeout(() => {
        console.log('\n--- TEST: User B Online ---');
        send({ type: 'user:online', payload: { userId: USER_B } });
    }, 1000);

    // Step 3: User A initiates call to User B
    setTimeout(() => {
        console.log('\n--- TEST: Call Initiation ---');
        send({ 
            type: 'call:initiate', 
            payload: { 
                calleeId: USER_B, 
                roomId: ROOM_ID, 
                callId: CALL_ID 
            },
            id: 'test-1'
        });
    }, 1500);

    // Step 4: User B accepts call
    setTimeout(() => {
        console.log('\n--- TEST: Call Accepted ---');
        send({ 
            type: 'call:accept', 
            payload: { 
                callId: CALL_ID, 
                roomId: ROOM_ID 
            },
            id: 'test-2'
        });
    }, 2000);

    // Step 5: Simulate WebRTC signaling (SDP offer)
    setTimeout(() => {
        console.log('\n--- TEST: WebRTC SDP Offer ---');
        send({
            type: 'signal:offer',
            payload: {
                to: USER_B,
                callId: CALL_ID,
                sdp: {
                    type: 'offer',
                    sdp: 'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 127 125 108 109 124 123 122 121 120 119 118 114 115 116 117'
                }
            }
        });
    }, 2500);

    // Step 6: Simulate ICE candidate exchange
    setTimeout(() => {
        console.log('\n--- TEST: ICE Candidate ---');
        send({
            type: 'signal:ice',
            payload: {
                to: USER_B,
                callId: CALL_ID,
                candidate: {
                    candidate: 'a=candidate:842163049 1 udp 1677729535 192.168.1.1 54321 typ host',
                    sdpMid: 'video',
                    sdpMLineIndex: 0
                }
            }
        });
    }, 3000);

    // Step 7: Send chat message during call
    setTimeout(() => {
        console.log('\n--- TEST: Chat Message ---');
        send({
            type: 'chat:send',
            payload: {
                callId: CALL_ID,
                content: 'Hello from test!'
            },
            id: 'test-msg-1'
        });
    }, 3500);

    // Step 8: Send reaction
    setTimeout(() => {
        console.log('\n--- TEST: Reaction ---');
        send({
            type: 'reaction:send',
            payload: {
                callId: CALL_ID,
                emoji: '🔥',
                pack: 'default'
            }
        });
    }, 4000);

    // Step 9: End call
    setTimeout(() => {
        console.log('\n--- TEST: End Call ---');
        send({
            type: 'call:end',
            payload: { callId: CALL_ID }
        });
    }, 4500);

    // Finish
    setTimeout(() => {
        console.log('\n=========================================');
        console.log('CALL TESTING COMPLETE');
        console.log('=========================================');
        ws.close();
        process.exit(0);
    }, 5000);
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'auth:ok':
            console.log('  ✅ Auth successful');
            break;
        case 'pong':
            console.log('  ✅ Ping acknowledged');
            break;
        case 'user:presence':
            console.log('  ✅ User presence broadcast');
            break;
        case 'call:incoming':
            console.log('  ✅ Incoming call notification');
            break;
        case 'call:accepted':
            console.log('  ✅ Call accepted');
            break;
        case 'call:ended':
            console.log('  ✅ Call ended');
            break;
        case 'call:timeout':
            console.log('  ⚠️ Call timeout');
            break;
        case 'room:peer_joined':
            console.log('  ✅ Peer joined room');
            break;
        case 'chat:message':
            console.log('  ✅ Chat message received');
            break;
        case 'chat:typing':
            console.log('  ✅ Typing indicator received');
            break;
        case 'reaction:incoming':
            console.log('  ✅ Reaction received');
            break;
        default:
            console.log('  ℹ️ Unknown event type');
    }
}