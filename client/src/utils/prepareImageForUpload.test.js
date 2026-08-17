import assert from "node:assert/strict";
import test from "node:test";
import { prepareImageForUpload } from "./prepareImageForUpload.js";

function createFile({ size, type = "image/jpeg", name = "source.jpg" }) {
  return { size, type, name };
}

function createCanvas(blob) {
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback) => callback(blob)
  };
}

test("keeps a small image unchanged", async () => {
  const file = createFile({ size: 1000 });
  const events = [];
  const result = await prepareImageForUpload(file, {
    uploadAttemptId: "test-small",
    onDiagnostic: (event, details) => events.push({ event, details })
  });

  assert.equal(result, file);
  assert.equal(events.at(-1).event, "image_prepare_skipped_small");
  assert.equal(events.at(-1).details.originalUsed, true);
});

test("resizes a large image when the prepared file is smaller", async () => {
  const previousFile = globalThis.File;
  globalThis.File = class TestFile {
    constructor(parts, name, options) {
      this.size = parts[0].size;
      this.name = name;
      this.type = options.type;
    }
  };

  try {
    const file = createFile({ size: 2_000_000 });
    const events = [];
    const result = await prepareImageForUpload(file, {
      uploadAttemptId: "test-resize",
      onDiagnostic: (event, details) => events.push({ event, details }),
      createImageBitmapFn: async () => ({ width: 3000, height: 1500, close() {} }),
      createCanvas: () => createCanvas({ size: 900_000 })
    });

    assert.equal(result.size, 900_000);
    assert.equal(result.type, "image/jpeg");
    assert.equal(events.at(-1).event, "image_prepare_resized");
    assert.equal(events.at(-1).details.resultWidth, 2000);
  } finally {
    globalThis.File = previousFile;
  }
});

test("keeps the original image when createImageBitmap fails", async () => {
  const file = createFile({ size: 2_000_000 });
  const events = [];
  const result = await prepareImageForUpload(file, {
    uploadAttemptId: "test-bitmap-error",
    onDiagnostic: (event, details) => events.push({ event, details }),
    createImageBitmapFn: async () => { throw new Error("bitmap unavailable"); }
  });

  assert.equal(result, file);
  assert.equal(events.at(-1).event, "image_prepare_failed_original_used");
  assert.equal(events.at(-1).details.errorName, "Error");
});

test("uses the Image element fallback when createImageBitmap fails", async () => {
  const previousFile = globalThis.File;
  let fallbackClosed = false;
  globalThis.File = class TestFile {
    constructor(parts, name, options) {
      this.size = parts[0].size;
      this.name = name;
      this.type = options.type;
    }
  };

  try {
    const file = createFile({ size: 2_000_000 });
    const events = [];
    const result = await prepareImageForUpload(file, {
      onDiagnostic: (event, details) => events.push({ event, details }),
      createImageBitmapFn: async () => { throw new Error("bitmap unavailable"); },
      loadImageElementFn: async () => ({
        drawable: {},
        width: 3000,
        height: 1500,
        close: () => { fallbackClosed = true; }
      }),
      createCanvas: () => createCanvas({ size: 850_000 })
    });

    assert.equal(result.size, 850_000);
    assert.equal(fallbackClosed, true);
    assert.equal(events.at(-1).event, "image_prepare_resized");
    assert.equal(events.at(-1).details.preparationMethod, "image_element_fallback");
  } finally {
    globalThis.File = previousFile;
  }
});

test("keeps the original image when canvas returns no blob or a larger blob", async () => {
  const file = createFile({ size: 2_000_000 });
  const imageFactory = async () => ({ width: 3000, height: 1500, close() {} });
  const noBlobEvents = [];

  const noBlob = await prepareImageForUpload(file, {
    createImageBitmapFn: imageFactory,
    createCanvas: () => createCanvas(null),
    onDiagnostic: (event, details) => noBlobEvents.push({ event, details })
  });
  const largerBlob = await prepareImageForUpload(file, {
    createImageBitmapFn: imageFactory,
    createCanvas: () => createCanvas({ size: 2_000_001 })
  });

  assert.equal(noBlob, file);
  assert.equal(largerBlob, file);
  assert.equal(noBlobEvents.at(-1).event, "image_prepare_failed_original_used");
});
