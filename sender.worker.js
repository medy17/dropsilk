// sender.worker.js
const CHUNK_SIZE = 262144; // 256 KB. A good balance between performance and memory.

self.onmessage = function (e) {
    const file = e.data;
    if (!file) {
        console.error("Worker received no file.");
        return;
    }

    let offset = 0;
    const reader = new FileReader();
    const startTime = Date.now();

    reader.onload = function (event) {
        if (event.target.error) {
            console.error("File reading error in worker:", event.target.error);
            self.postMessage({ type: "error", message: "File reading failed." });
            return;
        }

        // Post the chunk back to the main thread.
        // The chunk is transferred, not copied, for performance.
        self.postMessage({
            type: "chunk",
            chunk: event.target.result,
        }, [event.target.result]);

        offset += event.target.result.byteLength;

        // Continue reading the next slice.
        // Using a non-blocking timeout allows the event loop to breathe.
        setTimeout(readSlice, 0);
    };

    reader.onerror = function (error) {
        console.error("FileReader error in worker:", error);
        self.postMessage({ type: "error", message: "FileReader failed." });
    };

    function readSlice() {
        if (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        } else {
            // Signal that we are done reading the file.
            self.postMessage({ type: "done", totalTime: Date.now() - startTime });
            self.close(); // Terminate the worker as its job is done.
        }
    }

    // Start the process.
    readSlice();
};