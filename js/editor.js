// Monaco editor wrapper (loaded from CDN, AMD build).
const MONACO = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min";

let readyPromise = null;

export function initEditor(el, value) {
  if (!readyPromise) readyPromise = load(value);
  return readyPromise.then((api) => { api.setValue(value); api.attach(el); return api; });
}

function load(initialValue) {
  return new Promise((resolve, reject) => {
    window.MonacoEnvironment = {
      getWorkerUrl() {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
          self.MonacoEnvironment = { baseUrl: '${MONACO}/' };
          importScripts('${MONACO}/vs/base/worker/workerMain.js');
        `)}`;
      },
    };
    const s = document.createElement("script");
    s.src = `${MONACO}/vs/loader.js`;
    s.onload = () => {
      window.require.config({ paths: { vs: `${MONACO}/vs` } });
      window.require(["vs/editor/editor.main"], () => {
        monaco.editor.defineTheme("snakelab-dark", {
          base: "vs-dark", inherit: true, rules: [
            { token: "keyword", foreground: "8be9fd" },
            { token: "string", foreground: "a8e6a3" },
            { token: "number", foreground: "e5b567" },
            { token: "comment", foreground: "5c6b8a", fontStyle: "italic" },
            { token: "identifier", foreground: "dce6f7" },
          ],
          colors: {
            "editor.background": "#0d1526",
            "editor.lineHighlightBackground": "#16233f",
            "editorLineNumber.foreground": "#3d4f73",
            "editorLineNumber.activeForeground": "#8be9fd",
            "editorGutter.background": "#0d1526",
          },
        });
        resolve(makeApi(initialValue));
      }, reject);
    };
    s.onerror = () => reject(new Error("Monaco failed to load (network)"));
    document.head.appendChild(s);
  });
}

function makeApi(initialValue) {
  let editor = null;
  let runDecorations = [];
  let errorDecorations = [];
  const listeners = [];

  const api = {
    attach(el) {
      if (editor) return;
      editor = monaco.editor.create(el, {
        value: initialValue,
        language: "python",
        theme: "snakelab-dark",
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Consolas', monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        roundedSelection: true,
        automaticLayout: true,
        glyphMargin: true,
        tabSize: 4,
        insertSpaces: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "all",
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      });
      editor.onDidChangeModelContent(() => listeners.forEach(f => f(api.getValue())));
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        document.dispatchEvent(new CustomEvent("snakelab:ctrlrun"));
      });
    },
    getValue() { return editor ? editor.getValue() : initialValue; },
    setValue(v) {
      initialValue = v;
      if (editor) editor.setValue(v);
      api.clearMarks();
    },
    onChange(fn) { listeners.push(fn); },
    highlightLine(line) {
      if (!editor) return;
      runDecorations = editor.deltaDecorations(runDecorations, line > 0 ? [{
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: "exec-line",
          overviewRuler: { color: "#34d97b", position: 4 },
          glyphMarginClassName: "exec-glyph",
        },
      }] : []);
      if (line > 0) editor.revealLineInCenterIfOutsideViewport(line);
    },
    markError(line) {
      if (!editor || !line) return;
      errorDecorations = editor.deltaDecorations(errorDecorations, [{
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: "error-line",
          overviewRuler: { color: "#ff5f6d", position: 4 },
          glyphMarginClassName: "error-glyph",
        },
      }]);
      editor.revealLineInCenterIfOutsideViewport(line);
    },
    clearMarks() {
      if (!editor) return;
      runDecorations = editor.deltaDecorations(runDecorations, []);
      errorDecorations = editor.deltaDecorations(errorDecorations, []);
    },
  };
  return api;
}
