// [Previous code remains the same until the end of file]

// ===== CALL FUNCTIONALITY =====
const startCallBtn = document.getElementById('start-call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const muteBtn = document.getElementById('mute-btn');
const videoToggleBtn = document.getElementById('video-toggle-btn');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callContainer = document.getElementById('call-container');

let peer;
let currentCall;
let localStream;
let isMuted = false;
let isVideoOff = false;

// Initialize PeerJS
function initPeer() {
  peer = new Peer(undefined, {
    host: location.hostname,
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs'
  });

  peer.on('open', (id) => {
    socket.emit('register-call-id', { userId: id });
  });

  peer.on('call', (call) => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStream = stream;
        localVideo.srcObject = stream;
        call.answer(stream);
        currentCall = call;
        
        call.on('stream', (remoteStream) => {
          remoteVideo.srcObject = remoteStream;
          callContainer.style.display = 'block';
          callStatus.textContent = 'Call active';
          endCallBtn.disabled = false;
        });
      })
      .catch(err => console.error('Failed to get local stream', err));
  });
}

// Start call
startCallBtn.addEventListener('click', () => {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;
      callStatus.textContent = 'Calling...';
      
      socket.emit('request-call-ids');
      
      socket.once('call-ids', (userIds) => {
        if (userIds.length > 0) {
          const call = peer.call(userIds[0], stream);
          currentCall = call;
          
          call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
            callContainer.style.display = 'block';
            callStatus.textContent = 'Call active';
            endCallBtn.disabled = false;
          });
        }
      });
    })
    .catch(err => {
      console.error('Failed to start call', err);
      callStatus.textContent = 'Failed to start call';
    });
});

// End call
endCallBtn.addEventListener('click', endCall);

function endCall() {
  if (currentCall) {
    currentCall.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  callContainer.style.display = 'none';
  callStatus.textContent = 'Call ended';
  endCallBtn.disabled = true;
}

// Mute/unmute
muteBtn.addEventListener('click', () => {
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    isMuted = !isMuted;
    muteBtn.innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i> ${isMuted ? 'Unmute' : 'Mute'}`;
  }
});

// Toggle video
videoToggleBtn.addEventListener('click', () => {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    isVideoOff = !isVideoOff;
    videoToggleBtn.innerHTML = `<i class="fas fa-video${isVideoOff ? '-slash' : ''}"></i> Video ${isVideoOff ? 'On' : 'Off'}`;
  }
});

// Initialize when joining room
socket.on('room-joined', () => {
  initPeer();
});

// Clean up on leaving room
leaveRoomBtn.addEventListener('click', () => {
  endCall();
});