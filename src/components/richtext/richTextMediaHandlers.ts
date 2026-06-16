// Extracted media reattach handlers for RichTextEditor
// Handles re-attaching event listeners to images, tables, audio players, and file attachments

import { toast } from 'sonner';
import { getMimeType, getFileCategory, downloadFile } from './richTextConstants';

type TranslationFn = (key: string, options?: Record<string, string>) => string;

// ============ Table Listeners ============

export const reattachTableListenersOnElement = (
  editorEl: HTMLElement,
  handleInput: () => void
): void => {
  const wrappers = editorEl.querySelectorAll('.resizable-table-wrapper');
  wrappers.forEach((wrapper) => {
    const wrapperEl = wrapper as HTMLElement;

    // Skip if already has resize handles
    if (wrapperEl.querySelector('.table-resize-handle')) return;

    wrapperEl.contentEditable = 'false';
    wrapperEl.style.position = 'relative';

    // Create resize handles
    const leftHandle = document.createElement('div');
    leftHandle.className = 'table-resize-handle table-resize-left';
    leftHandle.style.cssText = `
      position: absolute;
      top: 50%;
      left: -8px;
      transform: translateY(-50%);
      width: 6px;
      height: 40px;
      background: hsl(var(--primary));
      border-radius: 3px;
      cursor: ew-resize;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
    `;

    const rightHandle = document.createElement('div');
    rightHandle.className = 'table-resize-handle table-resize-right';
    rightHandle.style.cssText = `
      position: absolute;
      top: 50%;
      right: -8px;
      transform: translateY(-50%);
      width: 6px;
      height: 40px;
      background: hsl(var(--primary));
      border-radius: 3px;
      cursor: ew-resize;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
    `;

    // Width indicator
    const widthIndicator = document.createElement('div');
    widthIndicator.className = 'table-width-indicator';
    widthIndicator.style.cssText = `
      position: absolute;
      bottom: -24px;
      left: 50%;
      transform: translateX(-50%);
      background: hsl(var(--background));
      border: 1px solid hsl(var(--border));
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
      pointer-events: none;
    `;
    widthIndicator.textContent = `${wrapperEl.getAttribute('data-table-width') || 100}%`;

    // Show handles on hover
    wrapperEl.addEventListener('mouseenter', () => {
      leftHandle.style.opacity = '1';
      rightHandle.style.opacity = '1';
      widthIndicator.style.opacity = '1';
    });

    wrapperEl.addEventListener('mouseleave', () => {
      if (!wrapperEl.classList.contains('resizing')) {
        leftHandle.style.opacity = '0';
        rightHandle.style.opacity = '0';
        widthIndicator.style.opacity = '0';
      }
    });

    // Resize logic
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const startResize = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      wrapperEl.classList.add('resizing');

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      startX = clientX;
      startWidth = wrapperEl.offsetWidth;

      document.addEventListener('mousemove', onResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', onResize);
      document.addEventListener('touchend', stopResize);
    };

    const onResize = (e: MouseEvent | TouchEvent) => {
      if (!isResizing) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - startX;
      const parentWidth = wrapperEl.parentElement?.clientWidth || 800;
      const newWidthPx = Math.max(200, Math.min(parentWidth, startWidth + deltaX));
      const newWidthPercent = Math.round((newWidthPx / parentWidth) * 100);

      wrapperEl.style.width = `${newWidthPercent}%`;
      wrapperEl.setAttribute('data-table-width', String(newWidthPercent));
      widthIndicator.textContent = `${newWidthPercent}%`;
    };

    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        wrapperEl.classList.remove('resizing');
        document.removeEventListener('mousemove', onResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', onResize);
        document.removeEventListener('touchend', stopResize);
        handleInput();
      }
    };

    leftHandle.addEventListener('mousedown', startResize);
    leftHandle.addEventListener('touchstart', startResize);
    rightHandle.addEventListener('mousedown', startResize);
    rightHandle.addEventListener('touchstart', startResize);

    wrapperEl.appendChild(leftHandle);
    wrapperEl.appendChild(rightHandle);
    wrapperEl.appendChild(widthIndicator);
  });
};

// ============ Image Listeners ============

export const reattachImageListenersOnElement = (
  editorEl: HTMLElement,
  handleInput: () => void,
  t: TranslationFn
): void => {
  const wrappers = editorEl.querySelectorAll('.resizable-image-wrapper');
  wrappers.forEach((wrapper) => {
    const wrapperEl = wrapper as HTMLElement;
    const img = wrapperEl.querySelector('img') as HTMLImageElement;
    const resizeHandle = wrapperEl.querySelector('.image-resize-handle') as HTMLElement;
    let deleteHandle = wrapperEl.querySelector('.image-delete-handle') as HTMLElement;
    let alignToolbar = wrapperEl.querySelector('.image-align-toolbar') as HTMLElement;

    if (!img || !resizeHandle) return;

    // Fix wrapper styling for normal flow
    wrapperEl.style.display = 'block';
    wrapperEl.style.position = 'relative';
    wrapperEl.style.width = 'fit-content';
    wrapperEl.style.transform = 'none';

    // Apply saved alignment
    const savedAlign = wrapperEl.getAttribute('data-image-align') || 'left';
    if (savedAlign === 'left') {
      wrapperEl.style.marginLeft = '0';
      wrapperEl.style.marginRight = 'auto';
    } else if (savedAlign === 'center') {
      wrapperEl.style.marginLeft = 'auto';
      wrapperEl.style.marginRight = 'auto';
    } else {
      wrapperEl.style.marginLeft = 'auto';
      wrapperEl.style.marginRight = '0';
    }
    wrapperEl.style.marginTop = '10px';
    wrapperEl.style.marginBottom = '10px';

    // Remove old move handle if exists
    const oldMoveHandle = wrapperEl.querySelector('.image-move-handle');
    if (oldMoveHandle) oldMoveHandle.remove();

    // Create delete handle if it doesn't exist (for old saved images)
    if (!deleteHandle) {
      deleteHandle = document.createElement('div');
      deleteHandle.className = 'image-delete-handle';
      deleteHandle.style.position = 'absolute';
      deleteHandle.style.top = '-4px';
      deleteHandle.style.right = '-4px';
      deleteHandle.style.width = '16px';
      deleteHandle.style.height = '16px';
      deleteHandle.style.backgroundColor = 'hsl(var(--destructive))';
      deleteHandle.style.borderRadius = '50%';
      deleteHandle.style.cursor = 'pointer';
      deleteHandle.style.display = 'none';
      deleteHandle.style.zIndex = '10';
      deleteHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      wrapperEl.appendChild(deleteHandle);
    }

    // Create alignment toolbar if it doesn't exist
    if (!alignToolbar) {
      alignToolbar = document.createElement('div');
      alignToolbar.className = 'image-align-toolbar';
      alignToolbar.style.position = 'absolute';
      alignToolbar.style.bottom = '-32px';
      alignToolbar.style.left = '50%';
      alignToolbar.style.transform = 'translateX(-50%)';
      alignToolbar.style.display = 'none';
      alignToolbar.style.flexDirection = 'row';
      alignToolbar.style.gap = '4px';
      alignToolbar.style.padding = '4px';
      alignToolbar.style.backgroundColor = 'hsl(var(--background))';
      alignToolbar.style.border = '1px solid hsl(var(--border))';
      alignToolbar.style.borderRadius = '6px';
      alignToolbar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      alignToolbar.style.zIndex = '20';

      const leftIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/></svg>';
      const centerIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/></svg>';
      const rightIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/></svg>';

      ['left', 'center', 'right'].forEach((align) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = align === 'left' ? leftIcon : align === 'center' ? centerIcon : rightIcon;
        btn.style.width = '28px';
        btn.style.height = '28px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.backgroundColor = 'transparent';
        btn.style.cursor = 'pointer';
        btn.style.color = 'hsl(var(--foreground))';
        alignToolbar.appendChild(btn);
      });

      wrapperEl.appendChild(alignToolbar);
    }

    // Remove old listeners by cloning elements
    const newWrapper = wrapperEl.cloneNode(true) as HTMLElement;
    wrapperEl.parentNode?.replaceChild(newWrapper, wrapperEl);

    const newImg = newWrapper.querySelector('img') as HTMLImageElement;
    const newResizeHandle = newWrapper.querySelector('.image-resize-handle') as HTMLElement;
    const newDeleteHandle = newWrapper.querySelector('.image-delete-handle') as HTMLElement;
    const newAlignToolbar = newWrapper.querySelector('.image-align-toolbar') as HTMLElement;

    // Add alignment button listeners
    if (newAlignToolbar) {
      const buttons = newAlignToolbar.querySelectorAll('button');
      const aligns = ['left', 'center', 'right'];
      buttons.forEach((btn, index) => {
        (btn as HTMLElement).onmouseenter = () => { (btn as HTMLElement).style.backgroundColor = 'hsl(var(--muted))'; };
        (btn as HTMLElement).onmouseleave = () => { (btn as HTMLElement).style.backgroundColor = 'transparent'; };
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const align = aligns[index];
          newWrapper.setAttribute('data-image-align', align);
          if (align === 'left') {
            newWrapper.style.marginLeft = '0';
            newWrapper.style.marginRight = 'auto';
          } else if (align === 'center') {
            newWrapper.style.marginLeft = 'auto';
            newWrapper.style.marginRight = 'auto';
          } else {
            newWrapper.style.marginLeft = 'auto';
            newWrapper.style.marginRight = '0';
          }
          handleInput();
          toast.success(t('richEditor.imageAligned', { align }));
        });
      });
    }

    // Delete image on click
    if (newDeleteHandle) {
      newDeleteHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        newWrapper.remove();
        handleInput();
        toast.success(t('richEditor.imageDeleted'));
      });
    }

    // Show handles on click
    newWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.resizable-image-wrapper').forEach(w => {
        const handles = w.querySelectorAll('.image-resize-handle, .image-delete-handle, .image-align-toolbar');
        handles.forEach(h => (h as HTMLElement).style.display = 'none');
        (w as HTMLElement).style.outline = 'none';
      });
      newResizeHandle.style.display = 'block';
      if (newDeleteHandle) newDeleteHandle.style.display = 'block';
      if (newAlignToolbar) newAlignToolbar.style.display = 'flex';
      newWrapper.style.outline = '2px solid hsl(var(--primary))';
      newWrapper.style.outlineOffset = '2px';
    });

    // Resize functionality
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(50, Math.min(800, startWidth + deltaX));
      newImg.style.width = `${newWidth}px`;
      newWrapper.style.width = 'fit-content';
      newWrapper.setAttribute('data-image-width', String(newWidth));
    };

    const onResizeTouchMove = (e: TouchEvent) => {
      if (!isResizing) return;
      const deltaX = e.touches[0].clientX - startX;
      const newWidth = Math.max(50, Math.min(800, startWidth + deltaX));
      newImg.style.width = `${newWidth}px`;
      newWrapper.style.width = 'fit-content';
      newWrapper.setAttribute('data-image-width', String(newWidth));
    };

    const onResizeEnd = () => {
      isResizing = false;
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeEnd);
      document.removeEventListener('touchmove', onResizeTouchMove);
      document.removeEventListener('touchend', onResizeEnd);
      handleInput();
    };

    newResizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startWidth = newImg.offsetWidth;
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
    });

    newResizeHandle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.touches[0].clientX;
      startWidth = newImg.offsetWidth;
      document.addEventListener('touchmove', onResizeTouchMove);
      document.addEventListener('touchend', onResizeEnd);
    });
  });
};

// ============ Audio Listeners ============

export const reattachAudioListenersOnElement = (
  editorEl: HTMLElement
): void => {
  const audioContainers = editorEl.querySelectorAll('.audio-player-container');
  audioContainers.forEach((container) => {
    const containerEl = container as HTMLElement;
    let audioEl = containerEl.querySelector('audio') as HTMLAudioElement | null;
    const dataSrc = containerEl.getAttribute('data-audio-src');

    // If audio element is missing or has no source, try to recreate from data attributes
    if (!audioEl && dataSrc) {
      const newAudio = document.createElement('audio');
      newAudio.controls = true;
      newAudio.src = dataSrc;
      newAudio.style.width = '100%';
      newAudio.style.maxWidth = '400px';
      newAudio.style.height = '54px';
      containerEl.appendChild(newAudio);
      audioEl = newAudio;
    }

    if (audioEl) {
      // Ensure audio element has proper attributes
      audioEl.controls = true;
      audioEl.style.width = '100%';
      audioEl.style.maxWidth = '400px';
      audioEl.style.height = '54px';

      // Restore src from data attribute if missing or empty
      const currentSrc = audioEl.src || audioEl.getAttribute('src');
      if (dataSrc && (!currentSrc || currentSrc === '' || currentSrc === window.location.href)) {
        audioEl.src = dataSrc;
      }
    }

    // Ensure container styling
    containerEl.style.margin = '12px 0';
    containerEl.style.display = 'block';
    containerEl.style.textAlign = 'center';
    containerEl.style.background = 'rgba(0, 0, 0, 0.05)';
    containerEl.style.borderRadius = '12px';
    containerEl.style.padding = '12px';
    containerEl.contentEditable = 'false';
  });
};

// ============ File Listeners ============

export const reattachFileListenersOnElement = (
  editorEl: HTMLElement,
  t: TranslationFn
): void => {
  const fileWrappers = editorEl.querySelectorAll('.file-attachment-wrapper');
  fileWrappers.forEach((wrapper) => {
    const wrapperEl = wrapper as HTMLElement;
    const fileName = wrapperEl.getAttribute('data-file-name') || 'file';
    const fileType = wrapperEl.getAttribute('data-file-type') || getMimeType(fileName);
    const dataStore = wrapperEl.querySelector('.file-data-store');
    const fileUrl = dataStore?.getAttribute('data-file-url');

    // Skip if already has click handler
    if (wrapperEl.getAttribute('data-click-attached') === 'true') return;

    // Ensure styling
    wrapperEl.style.cursor = 'pointer';
    wrapperEl.contentEditable = 'false';

    // Get file category and update icon color
    const category = getFileCategory(fileName);
    const iconEl = wrapperEl.querySelector('div:first-child') as HTMLElement;
    if (iconEl) {
      if (category === 'image') iconEl.style.color = 'hsl(var(--chart-1))';
      else if (category === 'audio') iconEl.style.color = 'hsl(var(--chart-2))';
      else if (category === 'video') iconEl.style.color = 'hsl(var(--chart-3))';
      else if (category === 'document') iconEl.style.color = 'hsl(var(--chart-4))';
      else iconEl.style.color = 'hsl(var(--primary))';
    }

    // Add click handler to download file
    wrapperEl.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (fileUrl) {
        downloadFile(fileUrl, fileName);
      } else {
        toast.error(t('richEditor.fileNotFound'));
      }
    };

    wrapperEl.setAttribute('data-click-attached', 'true');
  });
};
