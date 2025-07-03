// sender.worker.js
const CHUNK_SIZE = 262144; // too small means too slow, and too large means possible memory issues

self.onmessage = function (e) {
    const file = e.data;
    let offset = 0;
    const reader = new FileReader();
    const startTime = Date.now();

    reader.onload = function (event) {
        self.postMessage({
            type: "chunk",
            chunk: event.target.result,
            offset: offset,
            timestamp: Date.now() - startTime
        });
        offset += event.target.result.byteLength;

        // Use setImmediate equivalent for better performance
        setTimeout(readSlice, 0);
    };

    function readSlice() {
        if (offset < file.size) {
            const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
            reader.readAsArrayBuffer(slice);
        } else {
            self.postMessage({ type: "done", totalTime: Date.now() - startTime });
        }
    }

    readSlice();
};// 64 KB

self.onmessage = function (e) {
    const file = e.data;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = function (event) {
        // Send the raw chunk and current offset back to the main thread
        self.postMessage({
            type: "chunk",
            chunk: event.target.result,
            offset: offset,
        });
        offset += event.target.result.byteLength;
        readSlice();
    };

    function readSlice() {
        if (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        } else {
            // Signal that we are done reading the file
            self.postMessage({ type: "done" });
        }
    }

    readSlice();
};