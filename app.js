const MAX_IMAGES = 24;
const state = {
  images: [],
  previewStart: performance.now(),
  exportStart: 0,
  duration: 4,
  mode: 'ai',
  exporting: false,
  downloadUrl: null,
};

const input = document.querySelector('#image-input');
const dropzone = document.querySelector('#dropzone');
const imageList = document.querySelector('#image-list');
const emptyList = document.querySelector('#empty-list');
const imageCount = document.querySelector('#image-count');
const canvas = document.querySelector('#preview-canvas');
const generatedVideo = document.querySelector('#generated-video');
const context = canvas.getContext('2d');
const canvasEmpty = document.querySelector('#canvas-empty');
const backgroundSelect = document.querySelector('#background');
const durationInput = document.querySelector('#duration');
const durationValue = document.querySelector('#duration-value');
const formatSelect = document.querySelector('#format');
const formatNote = document.querySelector('#format-note');
const exportButton = document.querySelector('#export-button');
const progressWrap = document.querySelector('#progress-wrap');
const progressBar = document.querySelector('#progress');
const progressLabel = document.querySelector('#progress-label');
const progressPercent = document.querySelector('#progress-percent');
const downloadLink = document.querySelector('#download-link');
const exportMeta = document.querySelector('#export-meta');
const angleIndicator = document.querySelector('#angle-indicator');
const modeInputs = [...document.querySelectorAll('input[name="generation-mode"]')];
const aiModeCard = document.querySelector('#ai-mode-card');
const sequenceModeCard = document.querySelector('#sequence-mode-card');
const modelStatus = document.querySelector('#model-status');
const generationNoteCopy = document.querySelector('#generation-note-copy');

function supportsMime(mime) {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime);
}

function supportedMime(format) {
  const candidates = format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find(supportsMime) || '';
}

function updateFormatAvailability() {
  const mp4Option = [...formatSelect.options].find((option) => option.value === 'mp4');
  const mp4Available = Boolean(supportedMime('mp4'));
  mp4Option.disabled = !mp4Available;
  if (!mp4Available && formatSelect.value === 'mp4') formatSelect.value = 'webm';
  formatNote.textContent = mp4Available
    ? '视频在浏览器中本地生成，不会上传照片。'
    : '当前浏览器无法直接编码 MP4，视频将以 WebM 格式导出；照片不会上传。';
}

function addFiles(fileList) {
  const files = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
  const room = Math.max(0, MAX_IMAGES - state.images.length);
  const accepted = files.slice(0, room);
  if (!accepted.length && files.length) {
    exportMeta.textContent = state.images.length >= MAX_IMAGES
      ? `最多添加 ${MAX_IMAGES} 张照片`
      : '请选择 JPG、PNG 或 WebP 图片';
    return;
  }
  accepted.forEach((file) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const item = { file, url, image, id: `${Date.now()}-${Math.random()}` };
    image.onload = () => {
      state.previewStart = performance.now();
    };
    image.onerror = () => {
      state.images = state.images.filter((entry) => entry.id !== item.id);
      URL.revokeObjectURL(url);
      renderList();
      exportMeta.textContent = `无法读取图片：${file.name}`;
    };
    image.src = url;
    state.images.push(item);
  });
  renderList();
  if (files.length > accepted.length) exportMeta.textContent = `已达到 ${MAX_IMAGES} 张照片上限`;
  input.value = '';
}

function reorderImage(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.images.length) return;
  [state.images[index], state.images[target]] = [state.images[target], state.images[index]];
  renderList();
  state.previewStart = performance.now();
}

function removeImage(index) {
  const [removed] = state.images.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.url);
  renderList();
  state.previewStart = performance.now();
}

function renderList() {
  imageList.replaceChildren();
  state.images.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'image-row';
    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = item.url;
    thumb.alt = '';
    const details = document.createElement('div');
    details.className = 'file-details';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.file.name;
    name.title = item.file.name;
    const number = document.createElement('span');
    number.className = 'file-index';
    number.textContent = index === 0
      ? 'AI 主视图 · 当前模型输入'
      : `角度 ${String(index + 1).padStart(2, '0')} · 暂不融合`;
    details.append(name, number);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const up = makeIconButton('↑', `将 ${item.file.name} 上移`, () => reorderImage(index, -1));
    const down = makeIconButton('↓', `将 ${item.file.name} 下移`, () => reorderImage(index, 1));
    const remove = makeIconButton('×', `移除 ${item.file.name}`, () => removeImage(index));
    up.disabled = index === 0;
    down.disabled = index === state.images.length - 1;
    actions.append(up, down, remove);
    row.append(thumb, details, actions);
    imageList.append(row);
  });
  const count = state.images.length;
  imageCount.textContent = `${count} 张`;
  emptyList.hidden = count !== 0;
  canvasEmpty.hidden = count !== 0;
  exportButton.disabled = count === 0 || state.exporting;
  downloadLink.hidden = true;
  exportMeta.textContent = count
    ? `${count} 张照片已就绪 · 可拖动或用箭头调整顺序`
    : '上传至少一张照片即可预览';
  angleIndicator.textContent = count ? `已添加 ${count} 个视角` : '等待照片';
  hideGeneratedVideo();
}

function hideGeneratedVideo() {
  generatedVideo.pause();
  generatedVideo.hidden = true;
  canvas.hidden = false;
}

function showGeneratedVideo(url) {
  generatedVideo.src = url;
  generatedVideo.hidden = false;
  canvas.hidden = true;
  canvasEmpty.hidden = true;
  generatedVideo.play().catch(() => {});
}

function makeIconButton(label, title, onClick) {
  const button = document.createElement('button');
  button.className = 'icon-button';
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', onClick);
  return button;
}

function drawProduct(item, xScale = 1, alpha = 1) {
  if (!item?.image?.complete) return;
  const image = item.image;
  const maxSize = Math.min(canvas.width, canvas.height) * 0.9;
  const ratio = Math.min(maxSize / image.width, maxSize / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  context.save();
  context.globalAlpha = alpha;
  context.translate(canvas.width / 2, canvas.height * 0.48);
  context.scale(xScale, 1);
  context.shadowColor = 'rgba(34, 40, 52, .14)';
  context.shadowBlur = canvas.width * 0.025;
  context.shadowOffsetY = canvas.height * 0.018;
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawFrame(progress) {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const bg = backgroundSelect.value;
  if (bg !== 'transparent') {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
  }
  if (!state.images.length) return;

  const phase = ((progress % 1) + 1) % 1;
  const count = state.images.length;
  if (count === 1) {
    // A single view can only be given a card-like turn; its unseen sides are not reconstructed.
    const yaw = phase * Math.PI * 2;
    const width = Math.max(0.055, Math.abs(Math.cos(yaw)));
    drawProduct(state.images[0], width, 1);
    angleIndicator.textContent = `模拟旋转 · ${Math.round(phase * 360)}°`;
    return;
  }

  const position = phase * count;
  const index = Math.floor(position) % count;
  const blend = position - Math.floor(position);
  const eased = blend * blend * (3 - 2 * blend);
  const nextIndex = (index + 1) % count;
  drawProduct(state.images[index], Math.max(0.14, Math.cos(eased * Math.PI / 2)), 1 - eased * 0.88);
  drawProduct(state.images[nextIndex], Math.max(0.14, Math.sin(eased * Math.PI / 2)), eased * 0.88);
  angleIndicator.textContent = `视角 ${String(index + 1).padStart(2, '0')} / ${count}`;
}

function animate(now) {
  const elapsed = state.exporting
    ? (now - state.exportStart) / 1000
    : (now - state.previewStart) / 1000;
  drawFrame(elapsed / state.duration);
  requestAnimationFrame(animate);
}

function getRecordingMime() {
  const preferred = supportedMime(formatSelect.value);
  if (preferred) return preferred;
  return supportedMime('webm');
}

function setMode(mode) {
  state.mode = mode;
  hideGeneratedVideo();
  downloadLink.hidden = true;
  aiModeCard.classList.toggle('selected', mode === 'ai');
  sequenceModeCard.classList.toggle('selected', mode === 'sequence');
  generationNoteCopy.textContent = mode === 'ai'
    ? '本地 AI 会根据第一张照片估算商品背面和侧面；未拍到的细节由模型推测，可能与实物不同。无 NVIDIA GPU 时生成会更慢，先用 4 秒测试。商品照片不会上传。'
    : '实拍视角模式按当前顺序播放照片，不生成未拍到的角度；照片只在本机处理。';
  exportButton.innerHTML = mode === 'ai'
    ? '<span aria-hidden="true">✦</span>本地 AI 生成旋转视频'
    : '<span aria-hidden="true">✦</span>生成并下载视频';
  document.querySelector('#list-caption').textContent = mode === 'ai'
    ? '第一张是 AI 主视图；当前模型每次使用一张照片'
    : '照片会按下方顺序依次旋转';
  if (mode === 'ai') {
    formatSelect.disabled = true;
    formatNote.textContent = '本地 AI 模式输出 MP4；模型在本机运行。';
  } else {
    formatSelect.disabled = false;
    updateFormatAvailability();
  }
  updateModelStatus();
}

async function updateModelStatus() {
  if (state.mode !== 'ai') {
    modelStatus.innerHTML = '<span class="status-dot"></span><span>实拍视角模式无需 AI 模型</span>';
    return;
  }
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    modelStatus.innerHTML = '<span class="status-dot status-dot-muted"></span><span>本地 AI 需在桌面程序中运行</span>';
    return;
  }
  modelStatus.innerHTML = '<span class="status-dot status-dot-muted"></span><span>检查本地 AI 环境…</span>';
  try {
    const result = await invoke('model_status');
    modelStatus.innerHTML = `<span class="status-dot ${result.ready ? '' : 'status-dot-muted'}"></span><span>${escapeHtml(result.message)}</span>`;
  } catch {
    modelStatus.innerHTML = '<span class="status-dot status-dot-muted"></span><span>本地模型尚未安装</span>';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function generateWithLocalModel() {
  if (!state.images.length || state.exporting) return;
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    exportMeta.textContent = '本地 AI 需在 360spin 桌面版运行；浏览器预览可切换到“实拍视角过渡”。';
    return;
  }
  state.exportStart = performance.now();
  state.exporting = true;
  exportButton.disabled = true;
  downloadLink.hidden = true;
  progressWrap.hidden = false;
  progressBar.removeAttribute('value');
  progressPercent.textContent = '…';
  progressLabel.textContent = '正在本机重建 3D 商品…';
  exportMeta.textContent = '首次运行会在本机下载模型文件；该过程不会上传商品照片。';
  try {
    const imageBase64 = await readMainImageAsBase64();
    const videoBase64 = await invoke('generate_spin', {
      imageBase64,
      fileName: state.images[0].file.name,
      duration: Number(durationInput.value),
      background: backgroundSelect.value,
    });
    const binary = atob(videoBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = state.downloadUrl;
    downloadLink.download = '360spin-product.mp4';
    downloadLink.textContent = '下载 AI 旋转视频（MP4）';
    downloadLink.hidden = false;
    showGeneratedVideo(state.downloadUrl);
    progressBar.value = 100;
    progressPercent.textContent = '100%';
    progressLabel.textContent = '本地 3D 旋转视频已生成';
    exportMeta.textContent = '视频已由本机模型生成，照片没有上传。';
  } catch (error) {
    progressWrap.hidden = true;
    exportMeta.textContent = error?.message || '本地模型生成失败，请检查模型安装状态。';
  } finally {
    state.exporting = false;
    exportButton.disabled = state.images.length === 0;
    updateModelStatus();
  }
}

async function readMainImageAsBase64() {
  const image = state.images[0].image;
  if (!image?.complete) throw new Error('主视图还没加载完成，请稍后再试。');
  const maxDimension = 1024;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d').drawImage(image, 0, 0, width, height);
  return source.toDataURL('image/jpeg', 0.9).split(',')[1] || '';
}

async function exportVideo() {
  if (!state.images.length || state.exporting) return;
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    exportMeta.textContent = '当前浏览器不支持本地视频导出，请使用新版 Chrome 或 Edge。';
    return;
  }
  const mimeType = getRecordingMime();
  if (!mimeType) {
    exportMeta.textContent = '当前浏览器没有可用的视频编码器。';
    return;
  }

  state.exporting = true;
  exportButton.disabled = true;
  downloadLink.hidden = true;
  progressWrap.hidden = false;
  progressBar.value = 0;
  progressPercent.textContent = '0%';
  progressLabel.textContent = '正在生成视频…';
  const duration = Number(durationInput.value);
  state.previewStart = performance.now();
  state.exportStart = state.previewStart;
  const stream = canvas.captureStream(30);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7_000_000 });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    state.exporting = false;
    exportButton.disabled = false;
    exportMeta.textContent = '浏览器无法启动视频编码，请切换 WebM 格式后重试。';
    return;
  }
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const startedAt = performance.now();
  const progressTimer = window.setInterval(() => {
    const percent = Math.min(99, Math.round(((performance.now() - startedAt) / (duration * 1000)) * 100));
    progressBar.value = percent;
    progressPercent.textContent = `${percent}%`;
  }, 100);
  const finished = new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
  });
  recorder.start(250);
  window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, duration * 1000);
  await finished;
  window.clearInterval(progressTimer);
  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = URL.createObjectURL(blob);
  downloadLink.href = state.downloadUrl;
  downloadLink.download = `360spin-product.${extension}`;
  downloadLink.textContent = `下载视频（${extension.toUpperCase()}）`;
  downloadLink.hidden = false;
  showGeneratedVideo(state.downloadUrl);
  progressBar.value = 100;
  progressPercent.textContent = '100%';
  progressLabel.textContent = '视频已生成';
  state.exporting = false;
  exportButton.disabled = false;
  exportMeta.textContent = `已生成 ${duration} 秒视频 · ${extension.toUpperCase()}`;
  state.previewStart = performance.now();
}

input.addEventListener('change', (event) => addFiles(event.target.files));
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-over');
  addFiles(event.dataTransfer.files);
});
durationInput.addEventListener('input', () => {
  state.duration = Number(durationInput.value);
  durationValue.value = `${state.duration} 秒`;
  if (!state.exporting) state.previewStart = performance.now();
});
backgroundSelect.addEventListener('change', () => {
  hideGeneratedVideo();
  drawFrame(0);
});
formatSelect.addEventListener('change', updateFormatAvailability);
modeInputs.forEach((radio) => radio.addEventListener('change', () => setMode(radio.value)));
exportButton.addEventListener('click', () => state.mode === 'ai' ? generateWithLocalModel() : exportVideo());

updateFormatAvailability();
renderList();
setMode('ai');
requestAnimationFrame(animate);
