// sender.worker.js

// --- CONFIGURATION ---
// Set a default chunk size, but allow it to be overridden from the main thread.
const DEFAULT_CHUNK_SIZE = 262144; // 256 KB. A good balance for speed and stability overall
let chunkSize = DEFAULT_CHUNK_SIZE;

// --- CORE LOGIC ---
self.onmessage = function (e) {
    // The message can now be an object to pass both the file and config.
    const { file, config } = e.data;

    if (!file) {
        console.error("Worker: No file received.");
        return;
    }

    // Allow the main thread to configure the chunk size.
    if (config && config.chunkSize) {
        chunkSize = config.chunkSize;
    }

    let offset = 0;
    const reader = new FileReader();

    // This function will be called when a chunk has been read.
    reader.onload = function (event) {
        self.postMessage({
            type: "chunk",
            chunk: event.target.result
        });

        // Update the offset.
        offset += event.target.result.byteLength;
        setTimeout(readNextSlice, 0);
    };

    function readNextSlice() {
        if (offset < file.size) {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsArrayBuffer(slice);
        } else {
            self.postMessage({ type: "done" });
            self.close();
        }
    }

    // Start the process.
    readNextSlice();
};