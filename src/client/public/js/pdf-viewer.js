const showPdfFallback = () => {
  document.querySelectorAll('.pdf-viewer-container').forEach(container => {
    if (container.dataset.pdfReady) return;
    container.dataset.pdfReady = '1';
    container.textContent = '';
    const url = container.getAttribute('data-pdf-url');
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = '📄 PDF';
      container.appendChild(link);
    }
  });
};

const initPdfViewers = async () => {
  let pdfjsLib;
  try {
    pdfjsLib = await import('/js/pdf.min.mjs?v=102');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.mjs?v=102';
  } catch (err) {
    showPdfFallback();
    return;
  }

  document.querySelectorAll('.pdf-viewer-container').forEach(async container => {
    const pdfUrl = container.getAttribute('data-pdf-url');
    if (!pdfUrl || container.dataset.pdfReady) return;
    container.dataset.pdfReady = '1';

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument(pdfUrl).promise;
    } catch (err) {
      container.textContent = '';
      const fallback = document.createElement('a');
      fallback.href = pdfUrl;
      fallback.textContent = '📄 PDF';
      container.appendChild(fallback);
      return;
    }

    let currentPage = 1;
    let scale = 1.5;
    let rotation = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'pdf-canvas-wrap';
    canvasWrap.appendChild(canvas);
    container.innerHTML = '';
    container.appendChild(canvasWrap);

    const controls = document.createElement('div');
    controls.className = 'pdf-controls';
    controls.innerHTML = `
      <button class="pdf-prev">⬅️</button>
      <button class="pdf-next">➡️</button>
      <button class="pdf-zoom-in">🔍+</button>
      <button class="pdf-zoom-out">🔍−</button>
      <button class="pdf-rotate">↻</button>
      <button class="pdf-download">⬇️</button>
      <button class="pdf-fullscreen">🔲</button>
      <button class="pdf-metadata">ℹ️</button>
    `;

    container.appendChild(controls);

    const renderPage = async (num) => {
      const page = await pdf.getPage(num);
      const viewport = page.getViewport({ scale, rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    const goToPage = (delta) => {
      const newPage = currentPage + delta;
      if (newPage >= 1 && newPage <= pdf.numPages) {
        currentPage = newPage;
        renderPage(currentPage);
      }
    };

    try {
      const firstPage = await pdf.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1, rotation: 0 });
      const avail = canvasWrap.clientWidth || container.clientWidth;
      if (avail > 0 && baseViewport.width > 0) {
        scale = Math.min(1.5, Math.max(0.5, (avail - 40) / baseViewport.width));
      }
    } catch (e) {}

    renderPage(currentPage);

    controls.querySelector('.pdf-prev').onclick = () => goToPage(-1);
    controls.querySelector('.pdf-next').onclick = () => goToPage(1);
    controls.querySelector('.pdf-zoom-in').onclick = () => { scale += 0.2; renderPage(currentPage); };
    controls.querySelector('.pdf-zoom-out').onclick = () => { scale = Math.max(0.5, scale - 0.2); renderPage(currentPage); };
    controls.querySelector('.pdf-rotate').onclick = () => { rotation = (rotation + 90) % 360; renderPage(currentPage); };
    controls.querySelector('.pdf-download').onclick = () => {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = 'document.pdf';
      a.click();
    };
    controls.querySelector('.pdf-fullscreen').onclick = () => {
      if (canvas.requestFullscreen) canvas.requestFullscreen();
      else if (canvas.webkitRequestFullscreen) canvas.webkitRequestFullscreen();
      else if (canvas.mozRequestFullScreen) canvas.mozRequestFullScreen();
      else if (canvas.msRequestFullscreen) canvas.msRequestFullscreen();
    };
    controls.querySelector('.pdf-metadata').onclick = async () => {
      const info = await pdf.getMetadata();
      alert(`Title: ${info.info.Title || 'N/A'}\nAuthor: ${info.info.Author || 'N/A'}\nPDF Producer: ${info.info.Producer || 'N/A'}`);
    };
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPdfViewers);
} else {
  initPdfViewers();
}
