export interface VideoScene {
  imageUrl: string;
  duration: number;
  startTime: number;
}

export async function createVideoWithKenBurns(
  scenes: VideoScene[],
  audioUrl: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30);
  const audioElement = new Audio(audioUrl);
  await audioElement.play();
  audioElement.pause();
  audioElement.currentTime = 0;

  const audioContext = new AudioContext();
  const source = audioContext.createMediaElementSource(audioElement);
  const dest = audioContext.createMediaStreamDestination();
  source.connect(dest);
  source.connect(audioContext.destination);

  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) {
    stream.addTrack(audioTrack);
  }

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 5000000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const images = await Promise.all(scenes.map(scene => loadImage(scene.imageUrl)));

  const recordingPromise = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(blob);
    };
  });

  mediaRecorder.start();
  audioElement.play();

  const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const startTime = Date.now();
  const fps = 30;
  const frameInterval = 1000 / fps;

  const animate = () => {
    const elapsed = (Date.now() - startTime) / 1000;

    if (elapsed >= totalDuration) {
      mediaRecorder.stop();
      audioElement.pause();
      if (onProgress) onProgress(100);
      return;
    }

    let currentScene = scenes[0];
    let sceneIndex = 0;
    let sceneStartTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const sceneEnd = scenes.slice(0, i + 1).reduce((sum, s) => sum + s.duration, 0);
      if (elapsed < sceneEnd) {
        currentScene = scenes[i];
        sceneIndex = i;
        sceneStartTime = scenes.slice(0, i).reduce((sum, s) => sum + s.duration, 0);
        break;
      }
    }

    const sceneProgress = (elapsed - sceneStartTime) / currentScene.duration;
    const img = images[sceneIndex];

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgAspect = img.width / img.height;
    const canvasAspect = canvas.width / canvas.height;

    let scale = 1.0 + (sceneProgress * 0.2);
    let drawWidth, drawHeight;

    if (imgAspect > canvasAspect) {
      drawHeight = canvas.height * scale;
      drawWidth = drawHeight * imgAspect;
    } else {
      drawWidth = canvas.width * scale;
      drawHeight = drawWidth / imgAspect;
    }

    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;

    const panX = Math.sin(sceneProgress * Math.PI) * 50;
    const panY = Math.cos(sceneProgress * Math.PI) * 30;

    ctx.drawImage(
      img,
      offsetX + panX,
      offsetY + panY,
      drawWidth,
      drawHeight
    );

    if (onProgress) {
      onProgress((elapsed / totalDuration) * 100);
    }

    setTimeout(animate, frameInterval);
  };

  animate();

  return recordingPromise;
}

export function downloadVideo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
