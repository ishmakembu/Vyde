/**
 * Estimates available bandwidth by sending dummy data packets over an
 * RTCDataChannel and measuring throughput.
 *
 * Returns estimated bandwidth in kbps, or null on failure.
 */
export async function probeBandwidth(): Promise<number | null> {
  let pc1: RTCPeerConnection | null = null;
  let pc2: RTCPeerConnection | null = null;

  try {
    const config: RTCConfiguration = { iceServers: [] };
    pc1 = new RTCPeerConnection(config);
    pc2 = new RTCPeerConnection(config);

    // Wire ICE candidates cross-peer
    pc1.onicecandidate = (e) => { if (e.candidate) pc2!.addIceCandidate(e.candidate).catch(() => {}); };
    pc2.onicecandidate = (e) => { if (e.candidate) pc1!.addIceCandidate(e.candidate).catch(() => {}); };

    const dc = pc1.createDataChannel('probe', { ordered: false, maxRetransmits: 0 });

    // Connect peers
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    // Wait for DataChannel to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DC open timeout')), 5000);
      dc.onopen = () => { clearTimeout(timeout); resolve(); };
    });

    // Send 50 × 8 KB = 400 KB worth of dummy packets, measure time
    const PACKET_SIZE = 8192;
    const PACKET_COUNT = 50;
    const payload = new Uint8Array(PACKET_SIZE).fill(0);

    const start = performance.now();
    for (let i = 0; i < PACKET_COUNT; i++) {
      dc.send(payload);
    }

    // Wait a moment for the buffer to flush
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const elapsed = performance.now() - start; // ms

    // kbps = (bytes * 8) / (ms / 1000) / 1000
    const bytes = PACKET_SIZE * PACKET_COUNT;
    const kbps = (bytes * 8) / (elapsed / 1000) / 1000;

    return Math.round(kbps);
  } catch {
    return null;
  } finally {
    pc1?.close();
    pc2?.close();
  }
}
