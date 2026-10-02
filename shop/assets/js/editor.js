/* editor.js — lightweight rich text editor (heading, paragraph, bold, italic, lists, table, highlight, image, link).
   Output is sanitized again on the server (HtmlSanitizer) before saving. */
(function () {
  'use strict';
  const App = window.App;

  function init(root, signal) {
    const ed = root.querySelector('[data-editor]');
    if (!ed) return null;
    const area = ed.querySelector('[data-editor-area]');
    const html = ed.querySelector('[data-editor-html]');
    const file = ed.querySelector('[data-editor-file]');
    let htmlMode = false;
    let saved = null;

    const saveSel = () => { const s = window.getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restoreSel = () => { area.focus(); if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    area.addEventListener('keyup', saveSel, { signal });
    area.addEventListener('mouseup', saveSel, { signal });
    area.addEventListener('blur', saveSel, { signal });

    // Paste as clean text to avoid foreign styles.
    area.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    }, { signal });

    const insertHtml = (h) => { restoreSel(); document.execCommand('insertHTML', false, h); };

    ed.querySelector('.editor-bar').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cmd]');
      if (!b) return;
      e.preventDefault();
      const cmd = b.dataset.cmd;
      if (cmd === 'html') {
        htmlMode = !htmlMode;
        if (htmlMode) { html.value = area.innerHTML; html.hidden = false; area.hidden = true; }
        else { area.innerHTML = html.value; html.hidden = true; area.hidden = false; }
        b.classList.toggle('on', htmlMode);
        return;
      }
      if (htmlMode) return;
      restoreSel();
      if (cmd === 'formatBlock') document.execCommand('formatBlock', false, '<' + b.dataset.val + '>');
      else if (cmd === 'highlight') {
        const sel = window.getSelection();
        if (sel.rangeCount && !sel.isCollapsed) {
          const mark = document.createElement('mark');
          try { sel.getRangeAt(0).surroundContents(mark); } catch (x) { document.execCommand('hiliteColor', false, '#fef08a'); }
        }
      } else if (cmd === 'table') {
        const rows = Math.min(10, Math.max(1, parseInt(prompt('কয়টি সারি?', '3'), 10) || 3));
        const cols = Math.min(6, Math.max(1, parseInt(prompt('কয়টি কলাম?', '2'), 10) || 2));
        let t = '<table><thead><tr>' + '<th>শিরোনাম</th>'.repeat(cols) + '</tr></thead><tbody>';
        for (let r = 0; r < rows; r++) t += '<tr>' + '<td>&nbsp;</td>'.repeat(cols) + '</tr>';
        insertHtml(t + '</tbody></table><p><br></p>');
      } else if (cmd === 'link') {
        const url = prompt('লিংক URL (https://…)', 'https://');
        if (url && /^(https?:\/\/|\/)/i.test(url)) document.execCommand('createLink', false, url);
      } else if (cmd === 'image') {
        saveSel();
        file.click();
      } else {
        document.execCommand(cmd, false, null);
      }
      saveSel();
    }, { signal });

    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      const fd = new FormData();
      fd.append('image', file.files[0]);
      App.ui.toast('ছবি আপলোড হচ্ছে…', 'info');
      const r = await App.ajax.post('/admin/api/editor/upload', fd);
      file.value = '';
      if (!r.success) { App.ui.toast(r.message, 'error'); return; }
      insertHtml('<img src="' + r.data.url + '" alt="">');
    }, { signal });

    return {
      value() { return htmlMode ? html.value : area.innerHTML.trim() === '<br>' ? '' : area.innerHTML; },
    };
  }

  App.editor = { init };
})();
