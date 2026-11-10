// Dedicated worker. Appends recording chunks to a file in the Origin Private
// File System with a sync access handle. Data goes straight to the file and is
// flushed after each chunk, so a crash loses at most the last chunk.
// (FileSystemWritableFileStream would keep data in a swap file until close.)

let handle = null;
let offset = 0;

async function open(name) {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(name, { create: true });
  handle = await fileHandle.createSyncAccessHandle();
  offset = handle.getSize();
}

function write(buffer) {
  if (!handle) throw new Error('File is not open');
  const view = new Uint8Array(buffer);
  let written = 0;
  while (written < view.length) {
    written += handle.write(view.subarray(written), { at: offset + written });
  }
  offset += written;
  handle.flush();
}

function close() {
  if (!handle) return;
  handle.flush();
  handle.close();
  handle = null;
}

self.onmessage = async (event) => {
  const { id, op, name, buffer } = event.data;
  try {
    if (op === 'open') await open(name);
    else if (op === 'write') write(buffer);
    else if (op === 'close') close();
    else throw new Error(`Unknown op: ${op}`);
    self.postMessage({ id, ok: true, bytes: offset });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
