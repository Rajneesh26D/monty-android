// Bundle and transpile the worker too: copying the upstream .mjs unchanged
// leaves syntax that older Android System WebViews cannot parse.
import '../polyfills';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
