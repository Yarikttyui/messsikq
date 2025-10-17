import state from './state.js';
import { showCallModal, hideCallModal, updateCallUI } from './calls.js';
import socketManager from './socket.js';
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:a.relay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turns:a.relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];
const PC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};
const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user'
};
class CallManager {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.screenStream = null;
    this.currentCall = null;
    this.isInitiator = false;
    this.isMuted = false;
    this.isVideoEnabled = false;
    this.isScreenSharing = false;
    this.originalVideoSender = null;
    this.pendingIceCandidates = [];
    this.connectionFailTimeout = null;
    this.iceRestartAttempts = 0;
    this.maxIceRestartAttempts = 5;
    this.ringtoneAudio = null;
    this.ringbackAudio = null;
    this.initAudioElements();
  }
  init() {
    console.log('[WebRTC] Call manager initialized');
    this.setupSocketHandlers();
  }
  setupSocketHandlers() {
    console.log('[WebRTC] Setting up socket handlers');
    socketManager.socket.off('call:incoming');
    socketManager.socket.off('call:offer');
    socketManager.socket.off('call:answer');
    socketManager.socket.off('call:ice-candidate');
    socketManager.socket.off('call:rejected');
    socketManager.socket.off('call:ended');
    socketManager.socket.on('call:incoming', ({ conversationId, caller, hasVideo, timestamp }) => {
      console.log('[WebRTC] 📞 Incoming call from:', caller.displayName, 'video:', hasVideo);
      this.handleIncomingCall({ conversationId, caller, hasVideo, timestamp });
    });
    socketManager.socket.on('call:offer', async ({ callerId, callerName, conversationId, offer, hasVideo }) => {
      console.log('[WebRTC] Received call offer from:', callerId, callerName);
      await this.handleOffer(conversationId, callerId, offer, hasVideo, callerName);
    });
    socketManager.socket.on('call:answer', async ({ userId, answer, conversationId }) => {
      console.log('[WebRTC] Received call answer from:', userId);
      await this.handleAnswer(answer);
    });
    socketManager.socket.on('call:ice-candidate', async ({ userId, candidate, conversationId }) => {
      console.log('[WebRTC] Received ICE candidate from:', userId);
      await this.handleIceCandidate(candidate);
    });
    socketManager.socket.on('call:reject', ({ userId, conversationId }) => {
      console.log('[WebRTC] Call rejected by:', userId);
      this.handleCallRejected();
    });
    socketManager.socket.on('call:end', ({ userId, conversationId }) => {
      console.log('[WebRTC] Call ended by:', userId);
      this.endCall();
    });
  }
  async startCall(conversationId, hasVideo = false) {
    try {
      console.log('[WebRTC] Starting call:', conversationId, hasVideo ? 'video' : 'audio');
      this.currentCall = {
        conversationId,
        hasVideo,
        startTime: Date.now(),
        status: 'calling'
      };
      this.isInitiator = true;
      this.isVideoEnabled = hasVideo;
      this.sendSignal('call:start', {
        conversationId,
        hasVideo
      });
      await this.getLocalMedia(hasVideo);
      this.createPeerConnection();
      this.addLocalTracks();
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.peerConnection.setLocalDescription(offer);
      this.sendSignal('call:offer', {
        conversationId,
        offer,
        hasVideo
      });
      this.playRingback();
      showCallModal({
        conversationId,
        isOutgoing: true,
        hasVideo,
        status: 'calling'
      });
      state.setCurrentCall(this.currentCall);
    } catch (error) {
      console.error('[WebRTC] Failed to start call:', error);
      this.handleError(error);
      throw error;
    }
  }
  async answerCall(offer, conversationId, hasVideo) {
    try {
      console.log('[WebRTC] Answering call:', conversationId);
      this.currentCall = {
        conversationId,
        hasVideo,
        startTime: Date.now(),
        status: 'connecting'
      };
      this.isInitiator = false;
      this.isVideoEnabled = hasVideo;
      await this.getLocalMedia(hasVideo);
      this.createPeerConnection();
      this.addLocalTracks();
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC] Remote offer set successfully');
      await this.processPendingIceCandidates();
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.sendSignal('call:answer', {
        conversationId,
        answer
      });
      showCallModal({
        conversationId,
        isOutgoing: false,
        hasVideo,
        status: 'connecting'
      });
      state.setCurrentCall(this.currentCall);
    } catch (error) {
      console.error('[WebRTC] Failed to answer call:', error);
      this.handleError(error);
      throw error;
    }
  }
  async handleOffer(conversationId, fromUserId, offer, hasVideo, callerName) {
    try {
      console.log('[WebRTC] Handling incoming call offer from:', callerName);
      this.playRingtone();
      showCallModal({
        conversationId,
        isOutgoing: false,
        hasVideo,
        status: 'incoming',
        fromUserId,
        callerName
      });
      this.pendingOffer = { conversationId, offer, hasVideo };
    } catch (error) {
      console.error('[WebRTC] Failed to handle offer:', error);
      this.handleError(error);
    }
  }
  async acceptCall() {
    try {
      if (!this.pendingOffer) {
        throw new Error('No pending call to accept');
      }
      this.stopRingtone();
      const { conversationId, offer, hasVideo } = this.pendingOffer;
      this.pendingOffer = null;
      console.log('[WebRTC] Accepting call:', conversationId);
      await this.answerCall(offer, conversationId, hasVideo);
    } catch (error) {
      console.error('[WebRTC] Failed to accept call:', error);
      this.handleError(error);
    }
  }
  async handleAnswer(answer) {
    try {
      console.log('[WebRTC] Handling answer');
      if (!this.peerConnection) {
        console.error('[WebRTC] No peer connection');
        return;
      }
      if (!this.isInitiator) {
        console.warn('[WebRTC] Ignoring answer - not the initiator');
        return;
      }
      if (this.peerConnection.remoteDescription) {
        console.warn('[WebRTC] Ignoring answer - remote description already set');
        return;
      }
      const signalingState = this.peerConnection.signalingState;
      console.log('[WebRTC] Current signaling state:', signalingState);
      if (signalingState !== 'have-local-offer') {
        console.error('[WebRTC] Cannot set remote answer - wrong state:', signalingState);
        console.error('[WebRTC] Expected: have-local-offer, Got:', signalingState);
        return;
      }
      if (!answer || !answer.type || answer.type !== 'answer') {
        console.error('[WebRTC] Invalid answer SDP:', answer);
        return;
      }
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Remote description set successfully');
      await this.processPendingIceCandidates();
      this.stopRingback();
      this.currentCall.status = 'connected';
      updateCallUI({ status: 'connected' });
    } catch (error) {
      console.error('[WebRTC] Failed to handle answer:', error);
      this.handleError(error);
    }
  }
  async handleIceCandidate(candidate) {
    try {
      if (!this.peerConnection || !this.peerConnection.remoteDescription) {
        console.log('[WebRTC] Queueing ICE candidate (connection not ready)');
        this.pendingIceCandidates.push(candidate);
        return;
      }
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added ICE candidate');
    } catch (error) {
      console.error('[WebRTC] Failed to add ICE candidate:', error);
    }
  }
  async processPendingIceCandidates() {
    console.log('[WebRTC] Processing', this.pendingIceCandidates.length, 'pending ICE candidates');
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTC] Added queued ICE candidate');
      } catch (error) {
        console.error('[WebRTC] Failed to add queued ICE candidate:', error);
      }
    }
  }
  rejectCall(conversationId) {
    console.log('[WebRTC] Rejecting call:', conversationId);
    this.stopRingtone();
    this.sendSignal('call:reject', { conversationId });
    this.pendingOffer = null;
    this.cleanup();
  }
  handleCallRejected() {
    console.log('[WebRTC] Call was rejected');
    updateCallUI({ 
      status: 'rejected',
      error: 'Вызов отклонен'
    });
    setTimeout(() => {
      hideCallModal();
      this.cleanup();
    }, 2000);
  }
  endCall() {
    console.log('[WebRTC] Ending call');
    if (this.currentCall) {
      this.sendSignal('call:end', { 
        conversationId: this.currentCall.conversationId 
      });
    }
    this.cleanup();
    hideCallModal();
  }
  toggleMute() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMuted = !audioTrack.enabled;
      updateCallUI({ isMuted: this.isMuted });
      console.log('[WebRTC] Mute:', this.isMuted);
    }
  }
  toggleVideo() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.isVideoEnabled = videoTrack.enabled;
      updateCallUI({ isVideoEnabled: this.isVideoEnabled });
      console.log('[WebRTC] Video:', this.isVideoEnabled);
    }
  }
  async toggleScreenShare() {
    try {
      if (this.isScreenSharing) {
        await this.stopScreenShare();
      } else {
        await this.startScreenShare();
      }
    } catch (error) {
      console.error('[WebRTC] Failed to toggle screen share:', error);
      this.handleError(error);
    }
  }
  async startScreenShare() {
    try {
      console.log('[WebRTC] Starting screen share');
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // System audio if supported
      });
      const screenTrack = this.screenStream.getVideoTracks()[0];
      const sender = this.peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      if (sender) {
        this.originalVideoSender = sender.track;
        await sender.replaceTrack(screenTrack);
      } else {
        this.peerConnection.addTrack(screenTrack, this.screenStream);
      }
      screenTrack.onended = () => {
        console.log('[WebRTC] Screen sharing ended');
        this.stopScreenShare();
      };
      this.isScreenSharing = true;
      updateCallUI({ isScreenSharing: true });
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        console.log('[WebRTC] Screen sharing cancelled by user');
      } else {
        throw error;
      }
    }
  }
  async stopScreenShare() {
    try {
      console.log('[WebRTC] Stopping screen share');
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }
      if (this.originalVideoSender && this.peerConnection) {
        const sender = this.peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          await sender.replaceTrack(this.originalVideoSender);
        }
      }
      this.isScreenSharing = false;
      updateCallUI({ isScreenSharing: false });
    } catch (error) {
      console.error('[WebRTC] Failed to stop screen share:', error);
    }
  }
  async getLocalMedia(hasVideo) {
    try {
      const constraints = {
        audio: AUDIO_CONSTRAINTS,
        video: hasVideo ? VIDEO_CONSTRAINTS : false
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] Got local media:', this.localStream.getTracks().length, 'tracks');
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Failed to get local media:', error);
      throw new Error(hasVideo ? 
        'Не удалось получить доступ к камере и микрофону' : 
        'Не удалось получить доступ к микрофону'
      );
    }
  }
  createPeerConnection() {
    console.log('[WebRTC] Creating peer connection');
    this.peerConnection = new RTCPeerConnection(PC_CONFIG);
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate;
        console.log('[WebRTC] 📡 New ICE candidate:', {
          type: candidate.type,
          protocol: candidate.protocol,
          address: candidate.address,
          port: candidate.port
        });
        this.sendSignal('call:ice-candidate', {
          conversationId: this.currentCall.conversationId,
          candidate: candidate
        });
      } else {
        console.log('[WebRTC] ✅ All ICE candidates sent');
      }
    };
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);
      updateCallUI({ remoteStream: this.remoteStream });
    };
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
      switch (this.peerConnection.connectionState) {
        case 'connected':
          if (this.connectionFailTimeout) {
            clearTimeout(this.connectionFailTimeout);
            this.connectionFailTimeout = null;
          }
          this.iceRestartAttempts = 0;
          this.currentCall.status = 'connected';
          updateCallUI({ status: 'connected' });
          console.log('[WebRTC] ✅ Connection established successfully');
          break;
        case 'connecting':
          console.log('[WebRTC] 🔄 Connecting...');
          break;
        case 'disconnected':
          console.log('[WebRTC] ⚠️ Connection disconnected, waiting for reconnection...');
          if (!this.connectionFailTimeout) {
            this.connectionFailTimeout = setTimeout(() => {
              if (this.peerConnection && 
                  this.peerConnection.connectionState !== 'connected') {
                console.log('[WebRTC] Connection still not restored, attempting restart...');
                this.restartIce();
              }
            }, 15000);
          }
          break;
        case 'failed':
          console.log('[WebRTC] ❌ Connection failed, attempting recovery...');
          this.restartIce();
          break;
        case 'closed':
          this.cleanup();
          break;
      }
    };
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);
      switch (this.peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          console.log('[WebRTC] ✅ ICE connection established');
          if (this.connectionFailTimeout) {
            clearTimeout(this.connectionFailTimeout);
            this.connectionFailTimeout = null;
          }
          break;
        case 'checking':
          console.log('[WebRTC] 🔍 Checking ICE candidates...');
          break;
        case 'disconnected':
          console.log('[WebRTC] ⚠️ ICE disconnected, waiting...');
          if (!this.connectionFailTimeout) {
            this.connectionFailTimeout = setTimeout(() => {
              if (this.peerConnection && 
                  this.peerConnection.iceConnectionState === 'disconnected') {
                console.log('[WebRTC] ICE still disconnected after timeout, restarting...');
                this.restartIce();
              }
            }, 10000);
          }
          break;
        case 'failed':
          console.log('[WebRTC] ❌ ICE connection failed, attempting restart...');
          if (this.connectionFailTimeout) {
            clearTimeout(this.connectionFailTimeout);
            this.connectionFailTimeout = null;
          }
          this.restartIce();
          break;
        case 'closed':
          console.log('[WebRTC] ICE connection closed');
          break;
      }
    };
  }
  addLocalTracks() {
    if (!this.localStream || !this.peerConnection) return;
    this.localStream.getTracks().forEach(track => {
      console.log('[WebRTC] Adding local track:', track.kind);
      this.peerConnection.addTrack(track, this.localStream);
    });
    updateCallUI({ localStream: this.localStream });
  }
  sendSignal(event, data) {
    socketManager.socket.emit(event, data);
  }
  async restartIce() {
    if (!this.peerConnection) {
      console.log('[WebRTC] Cannot restart ICE (no connection)');
      return;
    }
    if (this.iceRestartAttempts >= this.maxIceRestartAttempts) {
      console.log('[WebRTC] ⚠️ Max ICE restart attempts reached');
      setTimeout(() => {
        if (this.peerConnection && 
            this.peerConnection.connectionState !== 'connected') {
          console.log('[WebRTC] Still not connected after max retries, ending call');
          this.handleConnectionError();
        }
      }, 5000);
      return;
    }
    this.iceRestartAttempts++;
    console.log(`[WebRTC] 🔄 ICE restart attempt ${this.iceRestartAttempts}/${this.maxIceRestartAttempts}`);
    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      this.sendSignal('call:offer', {
        conversationId: this.currentCall.conversationId,
        offer,
        hasVideo: this.currentCall.hasVideo
      });
      console.log('[WebRTC] ICE restart offer sent');
    } catch (error) {
      console.error('[WebRTC] ICE restart failed:', error);
      this.handleConnectionError();
    }
  }
  handleConnectionError() {
    console.error('[WebRTC] Connection error');
    updateCallUI({ 
      status: 'failed',
      error: 'Соединение потеряно'
    });
    setTimeout(() => {
      this.endCall();
    }, 3000);
  }
  handleError(error) {
    console.error('[WebRTC] Error:', error);
    let errorMessage = 'Произошла ошибка';
    if (error.name === 'NotAllowedError') {
      errorMessage = 'Доступ к камере/микрофону запрещен';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'Камера или микрофон не найдены';
    } else if (error.message) {
      errorMessage = error.message;
    }
    updateCallUI({ 
      status: 'error',
      error: errorMessage
    });
    this.cleanup();
  }
  cleanup() {
    console.log('[WebRTC] Cleaning up');
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.connectionFailTimeout) {
      clearTimeout(this.connectionFailTimeout);
      this.connectionFailTimeout = null;
    }
    this.remoteStream = null;
    this.currentCall = null;
    this.isInitiator = false;
    this.isMuted = false;
    this.isVideoEnabled = false;
    this.isScreenSharing = false;
    this.originalVideoSender = null;
    this.pendingIceCandidates = [];
    this.pendingOffer = null;
    this.iceRestartAttempts = 0;
    this.stopRingtone();
    this.stopRingback();
    state.setCurrentCall(null);
  }
  initAudioElements() {
    this.ringtoneAudio = new Audio();
    this.ringtoneAudio.loop = true;
    this.ringtoneAudio.volume = 0.5;
    this.ringtoneAudio.src = '/sounds/ringtone.wav';
    this.ringtoneAudio.onerror = () => {
      console.log('[WebRTC] Real ringtone not found, generating...');
      const ringtoneContext = new (window.AudioContext || window.webkitAudioContext)();
      const ringtoneDuration = 2;
      const ringtoneBuffer = ringtoneContext.createBuffer(1, ringtoneContext.sampleRate * ringtoneDuration, ringtoneContext.sampleRate);
      const ringtoneData = ringtoneBuffer.getChannelData(0);
      for (let i = 0; i < ringtoneData.length; i++) {
        const t = i / ringtoneContext.sampleRate;
        if (t < 0.4 || (t > 0.5 && t < 0.9)) {
          ringtoneData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.3;
        }
      }
      this.createAudioFromBuffer(ringtoneBuffer, ringtoneContext).then(url => {
        this.ringtoneAudio.src = url;
      });
    };
    this.ringbackAudio = new Audio();
    this.ringbackAudio.loop = true;
    this.ringbackAudio.volume = 0.3;
    this.ringbackAudio.src = '/sounds/ringback.wav';
    this.ringbackAudio.onerror = () => {
      console.log('[WebRTC] Real ringback not found, generating...');
      const ringbackContext = new (window.AudioContext || window.webkitAudioContext)();
      const ringbackDuration = 3;
      const ringbackBuffer = ringbackContext.createBuffer(1, ringbackContext.sampleRate * ringbackDuration, ringbackContext.sampleRate);
      const ringbackData = ringbackBuffer.getChannelData(0);
      for (let i = 0; i < ringbackData.length; i++) {
        const t = i / ringbackContext.sampleRate;
        if (t < 1.0 || (t > 2.0 && t < 3.0)) {
          ringbackData[i] = Math.sin(2 * Math.PI * 480 * t) * 0.2 + Math.sin(2 * Math.PI * 620 * t) * 0.2;
        }
      }
      this.createAudioFromBuffer(ringbackBuffer, ringbackContext).then(url => {
        this.ringbackAudio.src = url;
      });
    };
  }
  async createAudioFromBuffer(buffer, context) {
    const offlineContext = new OfflineAudioContext(1, buffer.length, context.sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start();
    const renderedBuffer = await offlineContext.startRendering();
    const wav = this.audioBufferToWav(renderedBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }
  audioBufferToWav(buffer) {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let offset = 0;
    let pos = 0;
    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };
    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(buffer.numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels);
    setUint16(buffer.numberOfChannels * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return arrayBuffer;
  }
  playRingtone() {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.play().catch(e => console.log('[WebRTC] Failed to play ringtone:', e));
      console.log('[WebRTC] Playing ringtone');
    }
  }
  stopRingtone() {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
    }
  }
  playRingback() {
    if (this.ringbackAudio) {
      this.ringbackAudio.currentTime = 0;
      this.ringbackAudio.play().catch(e => console.log('[WebRTC] Failed to play ringback:', e));
      console.log('[WebRTC] Playing ringback tone');
    }
  }
  stopRingback() {
    if (this.ringbackAudio) {
      this.ringbackAudio.pause();
      this.ringbackAudio.currentTime = 0;
    }
  }
  handleIncomingCall({ conversationId, caller, hasVideo, timestamp }) {
    console.log('[WebRTC] 🔔 Handling incoming call from:', caller.displayName);
    this.playRingtone();
    this.currentCall = {
      conversationId,
      hasVideo,
      caller,
      startTime: timestamp,
      status: 'incoming'
    };
    state.setCurrentCall(this.currentCall);
    import('./calls.js').then(({ showIncomingCallModal }) => {
      showIncomingCallModal({
        conversationId,
        caller,
        hasVideo,
        onAccept: () => {
          console.log('[WebRTC] ✅ Call accepted');
          this.stopRingtone();
          this.acceptCall();
        },
        onDecline: () => {
          console.log('[WebRTC] ❌ Call declined');
          this.stopRingtone();
          this.rejectCall(conversationId);
        }
      });
    });
  }
}
const callManager = new CallManager();
export default callManager;
