import state from './state.js';
import { showCallModal, hideCallModal, updateCallUI } from './calls.js';
import socketManager from './socket.js';

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

class AudioRelayManager {
  constructor() {
    this.localStream = null;
    this.remoteAudioContext = null;
    this.remoteAudioQueue = [];
    this.isPlaying = false;
    this.currentCall = null;
    this.audioContext = null;
    this.audioWorklet = null;
    this.mediaRecorder = null;
    this.remoteAudio = null;
    console.log('[AudioRelay] Manager initialized');
  }

  async startCall(conversationId, hasVideo = false) {
    try {
      console.log('[AudioRelay] Starting call:', conversationId);
      
      this.currentCall = {
        conversationId,
        hasVideo,
        status: 'calling',
        startTime: Date.now()
      };

      await this.getLocalMedia(hasVideo);
      
      this.sendSignal('call:start', {
        conversationId,
        hasVideo,
        timestamp: Date.now()
      });

      this.playRingback();
      showCallModal({
        conversationId,
        isOutgoing: true,
        hasVideo,
        status: 'calling'
      });

      return true;
    } catch (error) {
      console.error('[AudioRelay] Failed to start call:', error);
      this.handleError(error);
      return false;
    }
  }

  async getLocalMedia(hasVideo) {
    try {
      const constraints = {
        audio: AUDIO_CONFIG,
        video: hasVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[AudioRelay] Got local media:', this.localStream.getTracks().length, 'tracks');
      
      updateCallUI({ localStream: this.localStream });
      
      this.startAudioStreaming();
      
      return this.localStream;
    } catch (error) {
      console.error('[AudioRelay] Failed to get media:', error);
      throw error;
    }
  }

  startAudioStreaming() {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: AUDIO_CONFIG.sampleRate
    });

    const source = this.audioContext.createMediaStreamSource(this.localStream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(this.audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (!this.currentCall || this.currentCall.status !== 'connected') return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const base64 = this.arrayBufferToBase64(pcmData.buffer);
      
      this.sendSignal('call:audio', {
        conversationId: this.currentCall.conversationId,
        audio: base64,
        timestamp: Date.now()
      });
    };

    this.audioWorklet = processor;
    console.log('[AudioRelay] Audio streaming started');
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async acceptCall(conversationId) {
    try {
      console.log('[AudioRelay] Accepting call:', conversationId);
      
      if (!conversationId) {
        conversationId = this.currentCall?.conversationId;
      }
      
      if (!this.currentCall || this.currentCall.conversationId !== conversationId) {
        console.error('[AudioRelay] No incoming call found');
        return;
      }

      this.stopRingtone();
      
      await this.getLocalMedia(this.currentCall.hasVideo);
      
      this.currentCall.status = 'connected';
      this.currentCall.connectedTime = Date.now();

      this.sendSignal('call:accept', {
        conversationId,
        timestamp: Date.now()
      });

      this.setupRemoteAudio();

      updateCallUI({ status: 'connected' });
      
      console.log('[AudioRelay] Call accepted');
    } catch (error) {
      console.error('[AudioRelay] Failed to accept call:', error);
      this.handleError(error);
    }
  }

  setupRemoteAudio() {
    this.remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: AUDIO_CONFIG.sampleRate
    });
    
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    
    const destination = this.remoteAudioContext.createMediaStreamDestination();
    this.remoteAudio.srcObject = destination.stream;
    
    updateCallUI({ remoteStream: destination.stream });
    
    console.log('[AudioRelay] Remote audio setup complete');
  }

  handleIncomingAudio({ audio, timestamp }) {
    if (!this.remoteAudioContext) {
      console.warn('[AudioRelay] Remote audio not ready');
      return;
    }

    try {
      const arrayBuffer = this.base64ToArrayBuffer(audio);
      const pcmData = new Int16Array(arrayBuffer);
      const floatData = new Float32Array(pcmData.length);
      
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / (pcmData[i] < 0 ? 0x8000 : 0x7FFF);
      }

      const audioBuffer = this.remoteAudioContext.createBuffer(
        1,
        floatData.length,
        AUDIO_CONFIG.sampleRate
      );
      
      audioBuffer.getChannelData(0).set(floatData);
      
      const source = this.remoteAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.remoteAudioContext.destination);
      source.start();
      
    } catch (error) {
      console.error('[AudioRelay] Failed to play audio:', error);
    }
  }

  handleCallAccepted({ conversationId, timestamp }) {
    console.log('[AudioRelay] Call accepted by remote');
    
    if (!this.currentCall || this.currentCall.conversationId !== conversationId) {
      return;
    }

    this.stopRingback();
    this.currentCall.status = 'connected';
    this.currentCall.connectedTime = timestamp;
    
    this.setupRemoteAudio();
    
    updateCallUI({ status: 'connected' });
  }

  rejectCall(conversationId) {
    console.log('[AudioRelay] Rejecting call:', conversationId);
    
    if (this.currentCall) {
      this.sendSignal('call:reject', {
        conversationId: this.currentCall.conversationId,
        timestamp: Date.now()
      });
    }

    this.cleanup();
    hideCallModal();
  }

  endCall() {
    console.log('[AudioRelay] Ending call');
    
    if (this.currentCall) {
      this.sendSignal('call:end', {
        conversationId: this.currentCall.conversationId,
        timestamp: Date.now()
      });
    }

    this.cleanup();
    hideCallModal();
  }

  cleanup() {
    console.log('[AudioRelay] Cleaning up');

    this.stopRingtone();
    this.stopRingback();

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.remoteAudioContext) {
      this.remoteAudioContext.close();
      this.remoteAudioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    this.currentCall = null;
    this.remoteAudioQueue = [];
  }

  sendSignal(event, data) {
    socketManager.socket.emit(event, data);
  }

  handleIncomingCall({ conversationId, caller, hasVideo, timestamp }) {
    console.log('[AudioRelay] Incoming call from:', caller.username);
    
    if (this.currentCall) {
      console.log('[AudioRelay] Already in call, rejecting');
      this.sendSignal('call:busy', { conversationId, timestamp: Date.now() });
      return;
    }

    this.currentCall = {
      conversationId,
      caller,
      hasVideo,
      status: 'incoming',
      timestamp
    };

    this.playRingtone();
    
    showCallModal({
      conversationId,
      isOutgoing: false,
      hasVideo,
      status: 'incoming',
      fromUserId: caller.id,
      fromUsername: caller.username
    });
  }

  handleCallEnded({ conversationId }) {
    console.log('[AudioRelay] Call ended by remote');
    this.cleanup();
    hideCallModal();
  }

  playRingtone() {
    console.log('[AudioRelay] Playing ringtone');
    this.ensureAudioElements();
    if (this.ringtone) {
      this.ringtone.currentTime = 0;
      this.ringtone.play().catch(e => console.log('[AudioRelay] Ringtone play failed:', e.message));
    }
  }

  stopRingtone() {
    if (this.ringtone) {
      this.ringtone.pause();
      this.ringtone.currentTime = 0;
    }
  }

  playRingback() {
    console.log('[AudioRelay] Playing ringback');
    this.ensureAudioElements();
    if (this.ringback) {
      this.ringback.currentTime = 0;
      this.ringback.loop = true;
      this.ringback.play().catch(e => console.log('[AudioRelay] Ringback play failed:', e.message));
    }
  }

  stopRingback() {
    if (this.ringback) {
      this.ringback.pause();
      this.ringback.currentTime = 0;
      this.ringback.loop = false;
    }
  }

  handleError(error) {
    console.error('[AudioRelay] Error:', error);
    alert(`Ошибка звонка: ${error.message}`);
    this.cleanup();
    hideCallModal();
  }

  toggleMute() {
    console.log('[AudioRelay] Toggle mute not implemented yet');
  }

  toggleVideo() {
    console.log('[AudioRelay] Toggle video not implemented yet');
  }

  toggleScreenShare() {
    console.log('[AudioRelay] Toggle screen share not implemented yet');
  }

  setupSocketHandlers() {
    console.log('[AudioRelay] Setting up socket handlers');
    
    const socket = socketManager.socket;
    
    if (!socket) {
      console.warn('[AudioRelay] Socket not ready, waiting...');
      setTimeout(() => this.setupSocketHandlers(), 100);
      return;
    }
    
    socket.on('call:incoming', (data) => this.handleIncomingCall(data));
    socket.on('call:accept', (data) => this.handleCallAccepted(data));
    socket.on('call:audio', (data) => this.handleIncomingAudio(data));
    socket.on('call:end', (data) => this.handleCallEnded(data));
    socket.on('call:reject', () => {
      alert('Звонок отклонён');
      this.cleanup();
      hideCallModal();
    });
    socket.on('call:busy', () => {
      alert('Пользователь занят');
      this.cleanup();
      hideCallModal();
    });
    
    console.log('[AudioRelay] Socket handlers registered');
  }

  initAudioElements() {
    this.ringtone = null;
    this.ringback = null;
    console.log('[AudioRelay] Audio elements will be initialized on first use');
  }

  ensureAudioElements() {
    if (this.ringtone && this.ringback) {
      return;
    }

    console.log('[AudioRelay] Creating audio elements...');
    
    try {
      const generateTone = (frequency, duration) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        const destination = audioContext.createMediaStreamDestination();
        gainNode.connect(destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
        
        return destination.stream;
      };
      
      const ringtoneStream = generateTone(480, 2);
      this.ringtone = new Audio();
      this.ringtone.srcObject = ringtoneStream;
      this.ringtone.volume = 0.5;
      this.ringtone.loop = true;
      
      const ringbackStream = generateTone(440, 1);
      this.ringback = new Audio();
      this.ringback.srcObject = ringbackStream;
      this.ringback.volume = 0.3;
      this.ringback.loop = true;
      
      console.log('[AudioRelay] Audio elements created');
    } catch (error) {
      console.error('[AudioRelay] Failed to create audio elements:', error);
    }
  }
}

const audioRelayManager = new AudioRelayManager();
audioRelayManager.initAudioElements();

export default audioRelayManager;
