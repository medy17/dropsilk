// sender.worker.js

// --- CONFIGURATION ---
// Set a default chunk size, but allow it to be overridden from the main thread.
const DEFAULT_CHUNK_SIZE = 262144; // 256 KB. A good balance for speed and stability
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
        const chunk = event.target.result;
        const currentChunkSize = chunk.byteLength; // Capture size BEFORE transferring

        // Transfer ownership of the ArrayBuffer to the main thread (zero-copy)
        self.postMessage({
            type: "chunk",
            chunk: chunk
        }, [chunk]);

        // Update the offset using the captured size.
        offset += currentChunkSize;
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