document.addEventListener('DOMContentLoaded', () => {
  if (typeof pdfjsLib === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.mjs';

  document.querySelectorAll('.pdf-viewer-container').forEach(async container => {
    const pdfUrl = container.getAttribute('data-pdf-url');
    if (!pdfUrl) return;

    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
    let currentPage = 1;
    let scale = 1.5;
    let rotation = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    container.innerHTML = '';
    container.appendChild(canvas);

    const controls = document.createElement('div');
    controls.className = 'pdf-controls';
    controls.innerHTML = `
      <button id="prev">⬅️</button>
      <button id="next">➡️</button>
      <button id="zoomIn">🔍+</button>
      <button id="zoomOut">🔍−</button>
      <button id="rotate">↻</button>
      <button id="download">⬇️</button>
      <button id="fullscreen">🔲</button>
      <button id="metadata">ℹ️</button>
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

    renderPage(currentPage);

    controls.querySelector('#prev').onclick = () => goToPage(-1);
    controls.querySelector('#next').onclick = () => goToPage(1);
    controls.querySelector('#zoomIn').onclick = () => { scale += 0.2; renderPage(currentPage); };
    controls.querySelector('#zoomOut').onclick = () => { scale = Math.max(0.5, scale - 0.2); renderPage(currentPage); };
    controls.querySelector('#rotate').onclick = () => { rotation = (rotation + 90) % 360; renderPage(currentPage); };
    controls.querySelector('#download').onclick = () => {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = 'document.pdf';
      a.click();
    };
    controls.querySelector('#fullscreen').onclick = () => {
      if (canvas.requestFullscreen) canvas.requestFullscreen();
      else if (canvas.webkitRequestFullscreen) canvas.webkitRequestFullscreen();
      else if (canvas.mozRequestFullScreen) canvas.mozRequestFullScreen();
      else if (canvas.msRequestFullscreen) canvas.msRequestFullscreen();
    };
    controls.querySelector('#metadata').onclick = async () => {
      const info = await pdf.getMetadata();
      alert(`Title: ${info.info.Title || 'N/A'}\nAuthor: ${info.info.Author || 'N/A'}\nPDF Producer: ${info.info.Producer || 'N/A'}`);
    };
  });
});

