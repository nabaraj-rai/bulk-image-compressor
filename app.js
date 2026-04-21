    const state = {
      images: [],
      outputMime: "image/jpeg",
      isCompressing: false,
      statsDisplay: {
        original: 0,
        compressed: 0,
        savedBytes: 0,
        savedPercent: 0
      }
    };

    const refs = {
      dropzone: document.getElementById("dropzone"),
      fileInput: document.getElementById("fileInput"),
      browseBtn: document.getElementById("browseBtn"),
      fileCount: document.getElementById("fileCount"),
      qualitySlider: document.getElementById("qualitySlider"),
      qualityValue: document.getElementById("qualityValue"),
      maxWidthSlider: document.getElementById("maxWidthSlider"),
      widthValue: document.getElementById("widthValue"),
      formatPills: Array.from(document.querySelectorAll(".format-pill")),
      compressAllBtn: document.getElementById("compressAllBtn"),
      downloadAllBtn: document.getElementById("downloadAllBtn"),
      clearAllBtn: document.getElementById("clearAllBtn"),
      previewGrid: document.getElementById("previewGrid"),
      emptyState: document.getElementById("emptyState"),
      statusText: document.getElementById("statusText"),
      totalOriginal: document.getElementById("totalOriginal"),
      totalCompressed: document.getElementById("totalCompressed"),
      totalSaved: document.getElementById("totalSaved"),
      toast: document.getElementById("toast")
    };

    refs.qualitySlider.addEventListener("input", () => {
      refs.qualityValue.textContent = refs.qualitySlider.value;
    });

    refs.maxWidthSlider.addEventListener("input", () => {
      refs.widthValue.textContent = refs.maxWidthSlider.value;
    });

    refs.formatPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        refs.formatPills.forEach((p) => {
          p.classList.remove("active");
          p.setAttribute("aria-pressed", "false");
        });
        pill.classList.add("active");
        pill.setAttribute("aria-pressed", "true");
        state.outputMime = pill.dataset.format;
      });
    });

    refs.browseBtn.addEventListener("click", () => refs.fileInput.click());
    refs.dropzone.addEventListener("click", (event) => {
      if (event.target === refs.browseBtn) return;
      refs.fileInput.click();
    });

    refs.dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        refs.fileInput.click();
      }
    });

    refs.fileInput.addEventListener("change", (event) => {
      handleFiles(event.target.files);
      event.target.value = "";
    });

    ["dragenter", "dragover"].forEach((evt) => {
      refs.dropzone.addEventListener(evt, (event) => {
        event.preventDefault();
        refs.dropzone.classList.add("is-over");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((evt) => {
      refs.dropzone.addEventListener(evt, (event) => {
        event.preventDefault();
        refs.dropzone.classList.remove("is-over");
      });
    });

    refs.dropzone.addEventListener("drop", (event) => {
      const files = event.dataTransfer ? event.dataTransfer.files : [];
      handleFiles(files);
    });

    refs.compressAllBtn.addEventListener("click", compressAll);
    refs.downloadAllBtn.addEventListener("click", downloadAll);
    refs.clearAllBtn.addEventListener("click", clearAll);

    function handleFiles(fileList) {
      const files = Array.from(fileList || []);
      const valid = files.filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type));
      if (!valid.length) {
        return;
      }

      for (const file of valid) {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        state.images.push({
          id,
          file,
          previewUrl,
          compressedBlob: null,
          compressedUrl: null,
          compressedSize: 0,
          ratio: 0,
          status: "pending",
          processing: false
        });
      }
      render();
    }

    function render() {
      refs.previewGrid.innerHTML = "";

      if (!state.images.length) {
        refs.emptyState.style.display = "block";
        refs.statusText.textContent = "Add images to begin compression";
      } else {
        refs.emptyState.style.display = "none";
        const doneCount = state.images.filter((img) => img.status === "done").length;
        refs.statusText.textContent = doneCount
          ? `${doneCount} of ${state.images.length} ready to download`
          : "Pending compression";
      }

      state.images.forEach((image, index) => {
        const card = document.createElement("article");
        card.className = "image-card";
        card.style.animationDelay = `${Math.min(index * 40, 320)}ms`;

        const originalSize = formatBytes(image.file.size);
        const compressedSize = image.compressedBlob ? formatBytes(image.compressedSize) : "-";
        const statusClass = image.status === "done" ? "badge done" : "badge";
        const statusLabel = image.status === "done" ? "Done" : image.processing ? "Compressing" : "Pending";

        const ratioClass = getRatioClass(image.ratio);
        const ratioLabel = image.compressedBlob ? `Down ${Math.round(image.ratio)}%` : "Down 0%";

        card.innerHTML = `
          <div class="thumb-wrap">
            <img src="${image.previewUrl}" alt="Preview of ${escapeHtml(image.file.name)}" />
            <button class="remove-btn" type="button" data-remove="${image.id}" aria-label="Remove ${escapeHtml(image.file.name)}">x</button>
          </div>
          <div class="card-body">
            <p class="name" title="${escapeHtml(image.file.name)}">${escapeHtml(image.file.name)}</p>
            <div class="meta"><span>Original</span><span>${originalSize}</span></div>
            <div class="meta"><span>Compressed</span><span>${compressedSize}</span></div>
            <div class="row">
              <span class="${statusClass}">${statusLabel}</span>
              <span class="ratio ${ratioClass}">${ratioLabel}</span>
            </div>
            <div class="progress ${image.processing ? "active" : ""}"></div>
            <button class="download-btn ${image.compressedBlob ? "ready" : ""}" type="button" data-download="${image.id}" ${image.compressedBlob ? "" : "disabled"}>Download</button>
          </div>
        `;

        refs.previewGrid.appendChild(card);
      });

      refs.previewGrid.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => removeImage(btn.getAttribute("data-remove")));
      });

      refs.previewGrid.querySelectorAll("[data-download]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-download");
          const entry = state.images.find((img) => img.id === id);
          if (!entry || !entry.compressedBlob) return;
          const name = buildOutputName(entry.file.name, state.outputMime);
          downloadBlob(entry.compressedBlob, name);
        });
      });

      refs.fileCount.textContent = `${state.images.length} image${state.images.length === 1 ? "" : "s"} loaded`;
      updateStatsAnimated();
      updateButtons();
    }

    function updateButtons() {
      const hasImages = state.images.length > 0;
      const hasCompressed = state.images.some((img) => img.compressedBlob);
      refs.compressAllBtn.disabled = !hasImages || state.isCompressing;
      refs.downloadAllBtn.disabled = !hasCompressed || state.isCompressing;
      refs.clearAllBtn.disabled = !hasImages || state.isCompressing;
      refs.compressAllBtn.classList.toggle("loading", state.isCompressing);
    }

    function removeImage(id) {
      const idx = state.images.findIndex((img) => img.id === id);
      if (idx === -1) return;
      const img = state.images[idx];
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl);
      state.images.splice(idx, 1);
      render();
    }

    function clearAll() {
      state.images.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
        if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl);
      });
      state.images = [];
      render();
    }

    async function compressAll() {
      if (!state.images.length || state.isCompressing) return;
      state.isCompressing = true;
      updateButtons();

      const quality = Number(refs.qualitySlider.value) / 100;
      const maxWidth = Number(refs.maxWidthSlider.value);

      for (const item of state.images) {
        item.processing = true;
        item.status = "pending";
        render();

        try {
          const blob = await compressImage(item.file, state.outputMime, quality, maxWidth);
          if (!blob) continue;

          item.compressedBlob = blob;
          item.compressedSize = blob.size;
          item.ratio = Math.max(0, ((item.file.size - blob.size) / item.file.size) * 100);
          item.status = "done";

          if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
          item.compressedUrl = URL.createObjectURL(blob);
        } catch (error) {
          console.error("Compression failed for", item.file.name, error);
          item.status = "pending";
        } finally {
          item.processing = false;
          render();
        }
      }

      state.isCompressing = false;
      updateButtons();

      const doneCount = state.images.filter((img) => img.compressedBlob).length;
      if (doneCount) {
        showToast("All images compressed!");
      }
    }

    async function compressImage(file, outputMime, quality, maxWidth) {
      const bitmap = await createImageBitmap(file);
      const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d", { alpha: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      bitmap.close();

      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob returned null"));
              return;
            }
            resolve(blob);
          },
          outputMime,
          outputMime === "image/png" ? undefined : quality
        );
      });
    }

    async function downloadAll() {
      const ready = state.images.filter((img) => img.compressedBlob);
      if (!ready.length) return;
      if (typeof JSZip === "undefined") {
        alert("JSZip could not be loaded. Check your connection and try again.");
        return;
      }

      const zip = new JSZip();
      ready.forEach((img) => {
        const name = buildOutputName(img.file.name, state.outputMime);
        zip.file(name, img.compressedBlob);
      });

      refs.downloadAllBtn.disabled = true;
      refs.downloadAllBtn.textContent = "Zipping...";
      try {
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        downloadBlob(blob, "compressed-images.zip");
      } finally {
        refs.downloadAllBtn.textContent = "Download All";
        updateButtons();
      }
    }

    function buildOutputName(fileName, mime) {
      const ext = mimeToExt(mime);
      const base = fileName.replace(/\.[^/.]+$/, "");
      return `${base}-compressed.${ext}`;
    }

    function mimeToExt(mime) {
      if (mime === "image/png") return "png";
      if (mime === "image/webp") return "webp";
      return "jpg";
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function getRatioClass(value) {
      if (value > 60) return "good";
      if (value >= 30) return "warn";
      return "bad";
    }

    function updateStatsAnimated() {
      const totals = state.images.reduce((acc, img) => {
        acc.original += img.file.size;
        acc.compressed += img.compressedBlob ? img.compressedSize : img.file.size;
        return acc;
      }, { original: 0, compressed: 0 });

      const savedBytes = Math.max(0, totals.original - totals.compressed);
      const savedPercent = totals.original ? (savedBytes / totals.original) * 100 : 0;

      animateStats({
        original: totals.original,
        compressed: totals.compressed,
        savedBytes,
        savedPercent
      });
    }

    function animateStats(target) {
      const start = { ...state.statsDisplay };
      const startTime = performance.now();
      const duration = 360;

      function frame(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);

        const current = {
          original: lerp(start.original, target.original, eased),
          compressed: lerp(start.compressed, target.compressed, eased),
          savedBytes: lerp(start.savedBytes, target.savedBytes, eased),
          savedPercent: lerp(start.savedPercent, target.savedPercent, eased)
        };

        refs.totalOriginal.textContent = formatBytes(current.original);
        refs.totalCompressed.textContent = formatBytes(current.compressed);
        refs.totalSaved.textContent = `${formatBytes(current.savedBytes)} (${Math.round(current.savedPercent)}%)`;

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          state.statsDisplay = target;
        }
      }

      requestAnimationFrame(frame);
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
      const units = ["B", "KB", "MB", "GB"];
      const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      const value = bytes / Math.pow(1024, index);
      const precision = value >= 100 || index === 0 ? 0 : 1;
      return `${value.toFixed(precision)} ${units[index]}`;
    }

    function showToast(message) {
      refs.toast.textContent = message;
      refs.toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => refs.toast.classList.remove("show"), 2300);
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    render();
